import { describe, expect, it, vi } from "vitest";
import { CursorSyncEngine, parseWakeUpEvent } from "./cursor-sync";

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}

describe("CursorSyncEngine", () => {
  it("understands direct and Upstash wake-up payloads", () => {
    expect(parseWakeUpEvent('{"c":"c1","s":1}')).toEqual({
      conversationId: "c1",
      seq: 1,
    });
    expect(
      parseWakeUpEvent(
        '["message","wake:user:1","{\\"c\\":\\"c1\\",\\"s\\":4}"]',
      ),
    ).toEqual({ conversationId: "c1", seq: 4 });
    expect(parseWakeUpEvent('message,wake:user:1,{"c":"c1","s":5}')).toEqual({
      conversationId: "c1",
      seq: 5,
    });
    expect(parseWakeUpEvent("subscribe,wake:user:1,1")).toBeUndefined();
    expect(parseWakeUpEvent('{"inboxDirty":true}')).toEqual({
      inboxDirty: true,
    });
  });

  it("converges through polling when EventSource is unavailable", async () => {
    vi.useFakeTimers();
    const fetchClient = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/inbox")) {
        return jsonResponse({
          items: [
            {
              id: "10000000-0000-4000-8000-000000000001",
              type: "dm",
              title: "Test",
              participants: [],
              unreadCount: 1,
              announcementOnly: false,
              muted: false,
              safety: {
                minorPresent: false,
                guardianPresent: true,
                screeningRequired: false,
              },
              updatedAt: "2026-08-11T10:00:00.000Z",
              latestSeq: 1,
              lastReadSeq: 0,
              lastDeliveredSeq: 0,
              messageUpdatedAt: "2026-08-11T10:00:00.000Z",
              stateUpdatedAt: "2026-08-11T10:00:00.000Z",
            },
          ],
          nextCursor: null,
          serverTime: "2026-08-11T10:00:01.000Z",
        });
      }
      if (url.includes("/messages")) {
        return jsonResponse({
          items: [
            {
              id: "20000000-0000-4000-8000-000000000001",
              conversationId: "10000000-0000-4000-8000-000000000001",
              clientMessageId: "30000000-0000-4000-8000-000000000001",
              seq: 1,
              sender: { type: "user", id: "p1", displayName: "Player" },
              kind: "text",
              body: "Hello",
              widgets: [],
              attachments: [],
              status: "published",
              moderationState: "not-required",
              createdAt: "2026-08-11T10:00:00.000Z",
            },
          ],
          nextCursor: null,
          serverTime: "2026-08-11T10:00:01.000Z",
        });
      }
      if (url.includes("/state")) {
        return jsonResponse({
          items: [],
          nextCursor: null,
          serverTime: "2026-08-11T10:00:01.000Z",
        });
      }
      return jsonResponse({ ok: true });
    });
    const hints: unknown[] = [];
    const engine = new CursorSyncEngine({
      baseUrl: "https://duna.test/api/messaging",
      eventSourceFactory: undefined,
      fetchClient: fetchClient as typeof fetch,
      pollIntervalMs: 10_000,
    });
    engine.onWakeUp((hint) => hints.push(hint));
    engine.connect();
    await vi.runAllTicks();
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchClient).toHaveBeenCalled();
    expect(hints).toContainEqual({ inboxDirty: true });
    expect(hints).toContainEqual({
      conversationId: "10000000-0000-4000-8000-000000000001",
      seq: 1,
    });
    engine.disconnect();
    vi.useRealTimers();
  });

  it("keeps SSE reconnect jitter inside the configured bounds", async () => {
    vi.useFakeTimers();
    const sources: Array<{
      onopen: ((event: Event) => void) | null;
      onmessage: ((event: MessageEvent<string>) => void) | null;
      onerror: ((event: Event) => void) | null;
      close: () => void;
    }> = [];
    const engine = new CursorSyncEngine({
      baseUrl: "https://duna.test/api/messaging",
      eventSourceFactory: () => {
        const source = {
          onopen: null,
          onmessage: null,
          onerror: null,
          close: () => undefined,
        } satisfies (typeof sources)[number];
        sources.push(source);
        return source;
      },
      fetchClient: vi.fn(async () =>
        jsonResponse({
          items: [],
          nextCursor: null,
          serverTime: "2026-08-11T10:00:01.000Z",
        }),
      ) as typeof fetch,
      pollIntervalMs: 100_000,
      random: () => 1,
      reconnectBaseMs: 30_000,
      reconnectMaxMs: 30_000,
    });
    engine.connect();
    expect(sources).toHaveLength(1);
    sources[0]!.onerror?.(new Event("error"));
    await vi.advanceTimersByTimeAsync(29_999);
    expect(sources).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sources).toHaveLength(2);
    engine.disconnect();
    vi.useRealTimers();
  });

  it("reconciles a same-sequence tombstone without an SSE hint", async () => {
    const conversationId = "10000000-0000-4000-8000-000000000001";
    let messageUpdatedAt = "2026-08-11T10:00:00.000Z";
    let status: "published" | "removed" = "published";
    const observed: string[] = [];
    const fetchClient = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/inbox")) {
        return jsonResponse({
          items: [
            {
              id: conversationId,
              type: "dm",
              title: "Test",
              participants: [],
              unreadCount: 0,
              announcementOnly: false,
              muted: false,
              safety: {
                minorPresent: false,
                guardianPresent: true,
                screeningRequired: false,
              },
              updatedAt: messageUpdatedAt,
              latestSeq: 1,
              lastReadSeq: 1,
              lastDeliveredSeq: 1,
              messageUpdatedAt,
              stateUpdatedAt: "2026-08-11T10:00:00.000Z",
            },
          ],
          nextCursor: null,
          serverTime: messageUpdatedAt,
        });
      }
      if (url.pathname.endsWith("/messages")) {
        const after = Number(url.searchParams.get("after_seq") ?? -1);
        const include = url.searchParams.has("before_seq") || after < 1;
        return jsonResponse({
          items: include
            ? [
                {
                  id: "20000000-0000-4000-8000-000000000001",
                  conversationId,
                  clientMessageId: "30000000-0000-4000-8000-000000000001",
                  seq: 1,
                  sender: {
                    type: "user",
                    id: "p1",
                    displayName: "Player",
                  },
                  kind: "text",
                  widgets: [],
                  attachments: [],
                  status,
                  moderationState:
                    status === "removed" ? "blocked" : "not-required",
                  createdAt: "2026-08-11T10:00:00.000Z",
                  ...(status === "removed"
                    ? { removedAt: messageUpdatedAt }
                    : { body: "Hello" }),
                },
              ]
            : [],
          nextCursor: null,
          serverTime: messageUpdatedAt,
        });
      }
      return jsonResponse({
        items: [],
        nextCursor: null,
        serverTime: messageUpdatedAt,
      });
    });
    const engine = new CursorSyncEngine({
      baseUrl: "https://duna.test/api/messaging",
      fetchClient: fetchClient as typeof fetch,
      onMessages: (_id, messages) => {
        observed.push(...messages.map((message) => message.status));
      },
    });
    await engine.syncAll();
    status = "removed";
    messageUpdatedAt = "2026-08-11T10:01:00.000Z";
    await engine.syncAll();
    expect(observed).toContain("removed");
    engine.disconnect();
  });
});
