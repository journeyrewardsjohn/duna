import type { ConversationMessage } from "../contracts";
import type {
  DeliveryConversationState,
  DeliveryEngine,
  DeliveryInboxItem,
  DeliveryPage,
  DeliverySyncObserver,
  Unsubscribe,
  WakeUpHint,
} from "./engine";

interface EventSourceLike {
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent<string>) => void) | null;
  onerror: ((event: Event) => void) | null;
  close(): void;
}

export interface CursorSyncEngineOptions extends DeliverySyncObserver {
  readonly baseUrl?: string;
  readonly asPrincipal?: "user" | "organization";
  readonly fetchClient?: typeof globalThis.fetch;
  readonly eventSourceFactory?: (url: string) => EventSourceLike;
  readonly pollIntervalMs?: number;
  readonly reconnectBaseMs?: number;
  readonly reconnectMaxMs?: number;
  readonly random?: () => number;
}

const PAGE_LIMIT = 100;
const STATE_EPOCH = "1970-01-01T00:00:00.000Z";

function cleanBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

function fingerprint(value: unknown): string {
  return JSON.stringify(value);
}

function wakeUpHint(value: unknown): WakeUpHint | undefined {
  if (!value || typeof value !== "object") return undefined;
  if ("inboxDirty" in value) {
    return (value as { inboxDirty?: unknown }).inboxDirty === true
      ? { inboxDirty: true }
      : undefined;
  }
  const candidate = value as {
    c?: unknown;
    conversationId?: unknown;
    s?: unknown;
    seq?: unknown;
  };
  const conversationId = candidate.conversationId ?? candidate.c;
  const seq = candidate.seq ?? candidate.s;
  return typeof conversationId === "string" &&
    typeof seq === "number" &&
    Number.isInteger(seq) &&
    seq >= 0
    ? { conversationId, seq }
    : undefined;
}

/** Accepts Duna payloads and Upstash REST SUBSCRIBE SSE payloads. */
export function parseWakeUpEvent(data: string): WakeUpHint | undefined {
  const candidates: unknown[] = [];
  try {
    candidates.push(JSON.parse(data));
  } catch {
    candidates.push(data);
  }
  for (const candidate of candidates) {
    const direct = wakeUpHint(candidate);
    if (direct) return direct;
    if (typeof candidate === "string") {
      const firstSeparator = candidate.indexOf(",");
      const secondSeparator = candidate.indexOf(",", firstSeparator + 1);
      if (
        firstSeparator > 0 &&
        secondSeparator > firstSeparator &&
        candidate.slice(0, firstSeparator) === "message"
      ) {
        const payload = candidate.slice(secondSeparator + 1);
        try {
          const parsedHint = wakeUpHint(JSON.parse(payload));
          if (parsedHint) return parsedHint;
        } catch {
          // Ignore malformed Upstash REST Pub/Sub message frames.
        }
      }
    }
    if (Array.isArray(candidate) && candidate[0] === "message") {
      const payload = candidate.at(-1);
      const nested = wakeUpHint(payload);
      if (nested) return nested;
      if (typeof payload === "string") {
        try {
          const parsed = JSON.parse(payload);
          const parsedHint = wakeUpHint(parsed);
          if (parsedHint) return parsedHint;
        } catch {
          // Ignore Redis control frames and malformed hints.
        }
      }
    }
  }
  return undefined;
}

async function responsePage<T>(response: Response): Promise<DeliveryPage<T>> {
  const body = (await response.json()) as
    DeliveryPage<T> | { readonly error?: string };
  if (!response.ok || !("items" in body)) {
    throw new Error(
      "error" in body && body.error
        ? body.error
        : `Messaging sync failed (${response.status}).`,
    );
  }
  return body;
}

export class CursorSyncEngine implements DeliveryEngine {
  readonly #baseUrl: string;
  readonly #mode: "user" | "organization";
  readonly #fetch: typeof globalThis.fetch;
  readonly #eventSourceFactory?: (url: string) => EventSourceLike;
  readonly #observer: DeliverySyncObserver;
  readonly #pollIntervalMs: number;
  readonly #reconnectBaseMs: number;
  readonly #reconnectMaxMs: number;
  readonly #random: () => number;
  readonly #listeners = new Set<(hint: WakeUpHint) => void>();
  readonly #highestSeq = new Map<string, number>();
  readonly #messageVersions = new Map<string, string>();
  readonly #stateVersions = new Map<string, string>();
  readonly #stateCursor = new Map<string, string>();
  readonly #trackedConversations = new Set<string>();
  readonly #watermarks = new Map<
    string,
    { seq: number; timer: ReturnType<typeof setTimeout> }
  >();
  #inboxFingerprint = "";
  #stateFingerprints = new Map<string, string>();
  #connected = false;
  #eventSource?: EventSourceLike;
  #pollTimer?: ReturnType<typeof setInterval>;
  #reconnectTimer?: ReturnType<typeof setTimeout>;
  #reconnectAttempts = 0;
  #syncAllPromise?: Promise<void>;

  constructor(options: CursorSyncEngineOptions = {}) {
    this.#baseUrl = cleanBaseUrl(options.baseUrl ?? "/api/messaging");
    this.#mode = options.asPrincipal ?? "user";
    this.#fetch = options.fetchClient ?? globalThis.fetch.bind(globalThis);
    this.#eventSourceFactory =
      options.eventSourceFactory ??
      (typeof globalThis.EventSource === "function"
        ? (url) => new globalThis.EventSource(url)
        : undefined);
    this.#observer = options;
    this.#pollIntervalMs = options.pollIntervalMs ?? 15_000;
    this.#reconnectBaseMs = options.reconnectBaseMs ?? 1_000;
    this.#reconnectMaxMs = options.reconnectMaxMs ?? 30_000;
    this.#random = options.random ?? Math.random;
  }

  onWakeUp(callback: (hint: WakeUpHint) => void): Unsubscribe {
    this.#listeners.add(callback);
    return () => this.#listeners.delete(callback);
  }

  #emit(hint: WakeUpHint): void {
    for (const listener of this.#listeners) listener(hint);
  }

  #url(path: string, query?: Readonly<Record<string, string>>): string {
    const absolute = /^https?:\/\//.test(this.#baseUrl);
    const url = new URL(
      `${this.#baseUrl}${path}`,
      absolute
        ? undefined
        : typeof window === "undefined"
          ? "http://localhost"
          : window.location.origin,
    );
    if (this.#mode === "organization") {
      url.searchParams.set("asPrincipal", "organization");
    }
    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }
    return absolute ? url.toString() : `${url.pathname}${url.search}`;
  }

  async #getPage<T>(
    path: string,
    query?: Readonly<Record<string, string>>,
  ): Promise<DeliveryPage<T>> {
    return responsePage<T>(
      await this.#fetch(this.#url(path, query), {
        cache: "no-store",
        credentials: "include",
      }),
    );
  }

  async syncAll(): Promise<void> {
    this.#syncAllPromise ??= this.#performSyncAll().finally(() => {
      this.#syncAllPromise = undefined;
    });
    return this.#syncAllPromise;
  }

  async #performSyncAll(): Promise<void> {
    try {
      const items: DeliveryInboxItem[] = [];
      let cursor: string | null = null;
      let serverTime = new Date().toISOString();
      do {
        const page: DeliveryPage<DeliveryInboxItem> =
          await this.#getPage<DeliveryInboxItem>("/inbox", {
            limit: String(PAGE_LIMIT),
            ...(cursor ? { cursor } : {}),
          });
        items.push(...page.items);
        cursor = page.nextCursor;
        serverTime = page.serverTime;
      } while (cursor && items.length < 10_000);

      const nextFingerprint = fingerprint(
        items.map((item) => [
          item.id,
          item.latestSeq,
          item.lastReadSeq,
          item.lastDeliveredSeq,
          item.updatedAt,
          item.leftAt,
        ]),
      );
      if (nextFingerprint !== this.#inboxFingerprint) {
        this.#inboxFingerprint = nextFingerprint;
        await this.#observer.onInbox?.(items, serverTime);
        this.#emit({ inboxDirty: true });
      }

      const deltas = items.filter((item) => {
        const messageChanged =
          item.messageUpdatedAt !== this.#messageVersions.get(item.id);
        const stateChanged =
          item.stateUpdatedAt !== this.#stateVersions.get(item.id);
        return (
          this.#trackedConversations.has(item.id) ||
          item.latestSeq > (this.#highestSeq.get(item.id) ?? 0) ||
          messageChanged ||
          stateChanged
        );
      });
      for (const item of deltas) {
        const messageChanged =
          item.messageUpdatedAt !== this.#messageVersions.get(item.id);
        const hasForwardDelta =
          item.latestSeq > (this.#highestSeq.get(item.id) ?? 0);
        await this.#syncConversation(
          item.id,
          messageChanged && !hasForwardDelta,
        );
        this.#messageVersions.set(item.id, item.messageUpdatedAt);
        this.#stateVersions.set(item.id, item.stateUpdatedAt);
      }
    } catch (error) {
      this.#observer.onError?.(error);
      throw error;
    }
  }

  async syncConversation(conversationId: string): Promise<void> {
    return this.#syncConversation(conversationId, false);
  }

  async #syncConversation(
    conversationId: string,
    reconcileAllMessages: boolean,
  ): Promise<void> {
    this.#trackedConversations.add(conversationId);
    try {
      const messages: ConversationMessage[] = [];
      const previousHigh = this.#highestSeq.get(conversationId) ?? 0;
      let afterSeq = reconcileAllMessages ? 0 : previousHigh;
      let messageServerTime = new Date().toISOString();
      let nextCursor: string | null;
      do {
        const page = await this.#getPage<ConversationMessage>(
          `/conversations/${encodeURIComponent(conversationId)}/messages`,
          { after_seq: String(afterSeq), limit: String(PAGE_LIMIT) },
        );
        messages.push(...page.items);
        messageServerTime = page.serverTime;
        nextCursor = page.nextCursor;
        const pageHigh = page.items.reduce(
          (highest, message) => Math.max(highest, message.seq),
          afterSeq,
        );
        if (pageHigh === afterSeq) break;
        afterSeq = pageHigh;
      } while (nextCursor && messages.length < 10_000);

      if (messages.length > 0) {
        this.#highestSeq.set(conversationId, Math.max(previousHigh, afterSeq));
        await this.#observer.onMessages?.(
          conversationId,
          messages,
          messageServerTime,
        );
      }

      const highestSeq = this.#highestSeq.get(conversationId) ?? 0;
      let recentChanged = false;
      if (highestSeq > 0) {
        const recent = await this.#getPage<ConversationMessage>(
          `/conversations/${encodeURIComponent(conversationId)}/messages`,
          { before_seq: String(highestSeq + 1), limit: String(PAGE_LIMIT) },
        );
        const recentFingerprint = fingerprint(
          recent.items.map((message) => [
            message.id,
            message.seq,
            message.status,
            message.moderationState,
            message.body,
            message.widgets,
            message.editedAt,
            message.removedAt,
          ]),
        );
        recentChanged =
          recentFingerprint !==
          this.#stateFingerprints.get(`messages:${conversationId}`);
        if (recentChanged) {
          this.#stateFingerprints.set(
            `messages:${conversationId}`,
            recentFingerprint,
          );
          await this.#observer.onMessages?.(
            conversationId,
            recent.items,
            recent.serverTime,
          );
        }
      }
      if (messages.length > 0 || recentChanged) {
        this.#emit({ conversationId, seq: highestSeq });
        this.queueDelivered(conversationId, highestSeq);
      }

      let since = this.#stateCursor.get(conversationId) ?? STATE_EPOCH;
      let stateServerTime = new Date().toISOString();
      const stateItems: DeliveryConversationState[] = [];
      let stateCursor: string | null;
      do {
        const state: DeliveryPage<DeliveryConversationState> =
          await this.#getPage<DeliveryConversationState>(
            `/conversations/${encodeURIComponent(conversationId)}/state`,
            { since, limit: "500" },
          );
        stateItems.push(...state.items);
        stateServerTime = state.serverTime;
        stateCursor = state.nextCursor;
        since = state.nextCursor ?? state.serverTime;
      } while (stateCursor && stateItems.length < 10_000);
      this.#stateCursor.set(conversationId, since);
      const nextStateFingerprint = fingerprint(stateItems);
      if (
        stateItems.length > 0 &&
        nextStateFingerprint !== this.#stateFingerprints.get(conversationId)
      ) {
        this.#stateFingerprints.set(conversationId, nextStateFingerprint);
        await this.#observer.onState?.(
          conversationId,
          stateItems,
          stateServerTime,
        );
        this.#emit({
          conversationId,
          seq: this.#highestSeq.get(conversationId) ?? 0,
        });
      }
    } catch (error) {
      this.#observer.onError?.(error);
      throw error;
    }
  }

  connect(): void {
    if (this.#connected) return;
    this.#connected = true;
    void this.syncAll().catch(() => undefined);
    this.#pollTimer = setInterval(
      () => void this.syncAll().catch(() => undefined),
      this.#pollIntervalMs,
    );
    this.#openEventSource();
  }

  #openEventSource(): void {
    if (!this.#connected || !this.#eventSourceFactory) return;
    const source = this.#eventSourceFactory(this.#url("/updates"));
    this.#eventSource = source;
    source.onopen = () => {
      this.#reconnectAttempts = 0;
      void this.syncAll().catch(() => undefined);
    };
    source.onmessage = (event) => {
      const hint = parseWakeUpEvent(event.data);
      if (!hint) return;
      void this.syncAll().catch(() => this.#emit(hint));
    };
    source.onerror = () => {
      source.close();
      if (this.#eventSource === source) this.#eventSource = undefined;
      this.#scheduleReconnect();
    };
  }

  #scheduleReconnect(): void {
    if (!this.#connected || !this.#eventSourceFactory) return;
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    const exponential = Math.min(
      this.#reconnectMaxMs,
      this.#reconnectBaseMs * 2 ** this.#reconnectAttempts,
    );
    this.#reconnectAttempts += 1;
    const delay = Math.min(
      this.#reconnectMaxMs,
      Math.max(
        this.#reconnectBaseMs,
        Math.round(exponential * (0.75 + this.#random() * 0.5)),
      ),
    );
    this.#reconnectTimer = setTimeout(() => {
      this.#reconnectTimer = undefined;
      void this.syncAll().catch(() => undefined);
      this.#openEventSource();
    }, delay);
  }

  disconnect(): void {
    this.#connected = false;
    this.#eventSource?.close();
    this.#eventSource = undefined;
    if (this.#pollTimer) clearInterval(this.#pollTimer);
    if (this.#reconnectTimer) clearTimeout(this.#reconnectTimer);
    this.#pollTimer = undefined;
    this.#reconnectTimer = undefined;
    for (const watermark of this.#watermarks.values()) {
      clearTimeout(watermark.timer);
    }
    this.#watermarks.clear();
  }

  queueDelivered(conversationId: string, seq: number): void {
    this.#queueWatermark("delivered", conversationId, seq, 2_000);
  }

  queueRead(conversationId: string, seq: number): void {
    this.#queueWatermark("read", conversationId, seq, 1_000);
  }

  #queueWatermark(
    kind: "delivered" | "read",
    conversationId: string,
    seq: number,
    delay: number,
  ): void {
    if (!Number.isInteger(seq) || seq < 0) return;
    const key = `${kind}:${conversationId}`;
    const existing = this.#watermarks.get(key);
    if (existing) clearTimeout(existing.timer);
    const highest = Math.max(seq, existing?.seq ?? 0);
    const timer = setTimeout(() => {
      this.#watermarks.delete(key);
      void this.#fetch(
        this.#url(
          `/conversations/${encodeURIComponent(conversationId)}/${kind}`,
        ),
        {
          body: JSON.stringify({ seq: highest }),
          cache: "no-store",
          credentials: "include",
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      ).catch((error) => this.#observer.onError?.(error));
    }, delay);
    this.#watermarks.set(key, { seq: highest, timer });
  }
}

export function createCursorSyncEngine(
  options: CursorSyncEngineOptions = {},
): DeliveryEngine {
  return new CursorSyncEngine(options);
}
