"use client";

import {
  Fragment,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type DunaActionCenterSurface = "hq" | "player";

export interface DunaQuickAction {
  readonly label: string;
  readonly detail: string;
  readonly href: string;
  readonly kind?:
    "calendar" | "create" | "message" | "money" | "person" | "play" | "score";
}

export interface DunaSearchResult {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string;
  readonly href: string;
  readonly category: string;
  readonly kind:
    | "coach"
    | "event"
    | "money"
    | "navigation"
    | "person"
    | "product"
    | "session"
    | "venue";
  readonly badge?: string;
  readonly imageUrl?: string;
}

type ApprovalCard = {
  readonly kind: "approval";
  readonly title: string;
  readonly detail: string;
  readonly changes: readonly string[];
  readonly draft: {
    readonly id: string;
    readonly riskTier: "read" | "propose" | "confirm-always";
    readonly confirmationNonce?: string;
  };
};

type DunaCard =
  | ApprovalCard
  | {
      readonly kind: "link" | "notice";
      readonly title: string;
      readonly detail: string;
      readonly href?: string;
      readonly tone?: "default" | "positive" | "warning" | "danger";
    }
  | {
      readonly kind: "event";
      readonly title: string;
      readonly detail: string;
      readonly href: string;
      readonly imageUrl?: string;
      readonly startsAt?: string;
      readonly venue?: string;
      readonly price?: string;
      readonly spotsRemaining?: number;
    }
  | {
      readonly kind: "map";
      readonly title: string;
      readonly detail: string;
      readonly points: readonly {
        readonly id: string;
        readonly title: string;
        readonly subtitle: string;
        readonly href: string;
      }[];
    }
  | {
      readonly kind: "metric";
      readonly title: string;
      readonly detail: string;
      readonly metrics: readonly {
        readonly label: string;
        readonly value: string;
        readonly change?: string;
        readonly tone?: string;
      }[];
    };

type Message = {
  readonly role: "assistant" | "user";
  readonly body: string;
  readonly attachmentNames?: readonly string[];
  readonly cards?: readonly DunaCard[];
};

type AttachmentDraft = {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly data: string;
  readonly kind: "file" | "image";
  readonly size: number;
};

type Panel = "actions" | "chat" | "search" | null;

const actionEvent = "duna:action-center";
const maximumAttachmentBytes = 4 * 1024 * 1024;
const maximumAttachments = 3;

function dispatchAction(panel: Exclude<Panel, null>) {
  window.dispatchEvent(new CustomEvent(actionEvent, { detail: panel }));
}

export function DunaActionTrigger({
  children,
  className,
  panel,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly panel: Exclude<Panel, null>;
}) {
  return (
    <button
      className={className}
      onClick={() => dispatchAction(panel)}
      type="button"
    >
      {children}
    </button>
  );
}

function Icon({
  name,
  size = 18,
}: {
  readonly name: string;
  readonly size?: number;
}) {
  const shared = {
    "aria-hidden": true,
    fill: "none",
    height: size,
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.9,
    viewBox: "0 0 24 24",
    width: size,
  };
  if (name === "plus")
    return (
      <svg {...shared}>
        <path d="M12 5v14M5 12h14" />
      </svg>
    );
  if (name === "close")
    return (
      <svg {...shared}>
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    );
  if (name === "send")
    return (
      <svg {...shared}>
        <path d="m4 4 16 8-16 8 3-8-3-8Z" />
        <path d="M7 12h13" />
      </svg>
    );
  if (name === "paperclip")
    return (
      <svg {...shared}>
        <path d="m20 11.5-8.2 8.2a5 5 0 0 1-7.1-7.1l9.2-9.2a3.5 3.5 0 1 1 5 5l-9.2 9.2a2 2 0 1 1-2.8-2.8l8.5-8.5" />
      </svg>
    );
  if (name === "mic")
    return (
      <svg {...shared}>
        <rect height="11" rx="3.5" width="7" x="8.5" y="2.5" />
        <path d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v4M8.5 21h7" />
      </svg>
    );
  if (name === "globe")
    return (
      <svg {...shared}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.3 2.5 3.5 5.5 3.5 9S14.3 18.5 12 21c-2.3-2.5-3.5-5.5-3.5-9S9.7 5.5 12 3Z" />
      </svg>
    );
  if (name === "sparkle")
    return (
      <svg {...shared}>
        <path d="M12 2.8c.7 4.1 3.1 6.5 7.2 7.2-4.1.7-6.5 3.1-7.2 7.2-.7-4.1-3.1-6.5-7.2-7.2 4.1-.7 6.5-3.1 7.2-7.2Z" />
        <path d="M19 16.5c.25 1.5 1 2.25 2.5 2.5-1.5.25-2.25 1-2.5 2.5-.25-1.5-1-2.25-2.5-2.5 1.5-.25 2.25-1 2.5-2.5Z" />
      </svg>
    );
  if (name === "arrow")
    return (
      <svg {...shared}>
        <path d="M5 12h14M14 7l5 5-5 5" />
      </svg>
    );
  if (name === "check")
    return (
      <svg {...shared}>
        <path d="m5 12 4 4L19 6" />
      </svg>
    );
  if (name === "file")
    return (
      <svg {...shared}>
        <path d="M6 2.5h8l4 4V21H6z" />
        <path d="M14 2.5v4h4" />
      </svg>
    );
  if (name === "history")
    return (
      <svg {...shared}>
        <path d="M4 6v5h5M4.8 15.5A8 8 0 1 0 5 7" />
      </svg>
    );
  return (
    <svg {...shared}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("The file could not be read."));
    reader.onerror = () =>
      reject(reader.error ?? new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
}

function secondsLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function contextFor(pathname: string, surface: DunaActionCenterSurface) {
  const key = `duna-action-center-paths-${surface}`;
  let recentPaths = [pathname];
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? "[]") as unknown;
    if (Array.isArray(stored))
      recentPaths = [
        pathname,
        ...stored.filter(
          (item): item is string =>
            typeof item === "string" && item !== pathname,
        ),
      ].slice(0, 8);
    localStorage.setItem(key, JSON.stringify(recentPaths));
  } catch {
    // Page history improves relevance but is never an authorization source.
  }
  return {
    pathname,
    pageTitle: document.title,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: navigator.language,
    localTime: new Date().toISOString(),
    recentPaths,
    interactionSignals: [`Opened the Duna action center from ${pathname}`],
  };
}

function resultIcon(kind: DunaSearchResult["kind"]) {
  if (kind === "money") return "$";
  if (kind === "person") return "P";
  if (kind === "coach") return "C";
  if (kind === "event") return "E";
  if (kind === "session") return "S";
  if (kind === "venue") return "V";
  if (kind === "product") return "O";
  return "→";
}

function linkedMessageText(value: string): readonly ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern =
    /\[([^\]]{1,160})\]\((https?:\/\/[^)\s]+)\)|\*\*([^*]{1,200})\*\*|(https?:\/\/[^\s<]+)/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(value.slice(cursor, index));
    const href = match[2] ?? match[4];
    const label = match[1] ?? href;
    if (href) {
      nodes.push(
        <a
          href={href}
          key={`${href}-${index}`}
          rel="noreferrer noopener"
          target="_blank"
        >
          {label}
        </a>,
      );
    } else if (match[3]) {
      nodes.push(<strong key={`strong-${index}`}>{match[3]}</strong>);
    }
    cursor = index + match[0].length;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

function MessageBody({ body }: { readonly body: string }) {
  return (
    <div className="duna-action-center__message-body">
      {body.split(/\n{2,}/).map((paragraph, paragraphIndex) => (
        <p key={`${paragraph.slice(0, 32)}-${paragraphIndex}`}>
          {paragraph.split("\n").map((line, lineIndex) => (
            <Fragment key={`${line.slice(0, 24)}-${lineIndex}`}>
              {lineIndex > 0 && <br />}
              {linkedMessageText(line)}
            </Fragment>
          ))}
        </p>
      ))}
    </div>
  );
}

export function DunaActionCenter({
  aiEndpoint = "/api/duna-ai",
  pathname,
  quickActions,
  searchEndpoint = "/api/search",
  starters,
  surface,
  transcriptionEndpoint = "/api/duna-ai/transcribe",
}: {
  readonly aiEndpoint?: string;
  readonly pathname: string;
  readonly quickActions: readonly DunaQuickAction[];
  readonly searchEndpoint?: string;
  readonly starters: readonly string[];
  readonly surface: DunaActionCenterSurface;
  readonly transcriptionEndpoint?: string;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [research, setResearch] = useState(false);
  const [suggestions, setSuggestions] = useState<readonly string[]>(starters);
  const [messages, setMessages] = useState<readonly Message[]>([
    {
      role: "assistant",
      body:
        surface === "hq"
          ? "I’m Duna AI. Ask about this page or your organization. I’ll show the exact change before consequential work."
          : "I’m Duna AI. Ask about this page, your schedule, ratings, or where to play next.",
    },
  ]);
  const [attachments, setAttachments] = useState<readonly AttachmentDraft[]>(
    [],
  );
  const [notice, setNotice] = useState<string>();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    readonly DunaSearchResult[]
  >([]);
  const [searchPending, setSearchPending] = useState(false);
  const [selectedResult, setSelectedResult] = useState(0);
  const [recentResults, setRecentResults] = useState<
    readonly DunaSearchResult[]
  >([]);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const loadedSuggestions = useRef(false);
  const searchInput = useRef<HTMLInputElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const recordingStream = useRef<MediaStream | undefined>(undefined);
  const recordingChunks = useRef<Blob[]>([]);

  const userTurnCount = messages.filter(({ role }) => role === "user").length;
  const groupedResults = useMemo(() => {
    const groups = new Map<string, DunaSearchResult[]>();
    for (const result of searchResults) {
      const group = groups.get(result.category) ?? [];
      group.push(result);
      groups.set(result.category, group);
    }
    return [...groups.entries()];
  }, [searchResults]);

  useEffect(() => {
    const receive = (event: Event) => {
      const requested = (event as CustomEvent<Exclude<Panel, null>>).detail;
      setPanel((current) => (current === requested ? null : requested));
    };
    const keyboard = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPanel("search");
      } else if (event.key === "Escape") {
        setPanel(null);
      }
    };
    window.addEventListener(actionEvent, receive);
    window.addEventListener("keydown", keyboard);
    return () => {
      window.removeEventListener(actionEvent, receive);
      window.removeEventListener("keydown", keyboard);
    };
  }, []);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("duna");
    if (requested === "ask") setPanel("chat");
    if (requested === "search") setPanel("search");
    if (requested === "actions") setPanel("actions");
  }, []);

  useEffect(() => {
    if (panel === "search") {
      window.setTimeout(() => searchInput.current?.focus(), 50);
      try {
        const stored = JSON.parse(
          localStorage.getItem(`duna-search-recents-${surface}`) ?? "[]",
        ) as unknown;
        if (Array.isArray(stored))
          setRecentResults(stored.slice(0, 4) as DunaSearchResult[]);
      } catch {
        setRecentResults([]);
      }
    }
    if (panel === "chat")
      window.setTimeout(() => composer.current?.focus(), 80);
  }, [panel, surface]);

  useEffect(() => {
    if (panel !== "chat" || loadedSuggestions.current) return;
    loadedSuggestions.current = true;
    const load = async () => {
      try {
        const response = await fetch(aiEndpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            mode: "suggestions",
            surface,
            page: pathname,
            context: contextFor(pathname, surface),
          }),
        });
        const result = (await response.json()) as {
          readonly reply?: string;
          readonly cards?: readonly DunaCard[];
          readonly suggestions?: readonly string[];
        };
        if (result.suggestions?.length) setSuggestions(result.suggestions);
        if (result.cards?.length)
          setMessages([
            {
              role: "assistant",
              body: result.reply ?? "Here’s what looks relevant right now.",
              cards: result.cards,
            },
          ]);
      } catch {
        // The product-specific starters remain useful without a proactive read.
      }
    };
    void load();
  }, [aiEndpoint, panel, pathname, surface]);

  useEffect(() => {
    if (panel !== "search" || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearchPending(false);
      return;
    }
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setSearchPending(true);
      try {
        const url = new URL(searchEndpoint, window.location.origin);
        url.searchParams.set("q", searchQuery.trim());
        const response = await fetch(url, { signal: controller.signal });
        const payload = (await response.json()) as {
          readonly results?: readonly DunaSearchResult[];
        };
        setSearchResults(payload.results ?? []);
        setSelectedResult(0);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError"))
          setSearchResults([]);
      } finally {
        if (!controller.signal.aborted) setSearchPending(false);
      }
    }, 140);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [panel, searchEndpoint, searchQuery]);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, pending, panel]);

  useEffect(() => {
    if (!recording) return;
    const interval = window.setInterval(
      () => setRecordingSeconds((current) => current + 1),
      1_000,
    );
    return () => window.clearInterval(interval);
  }, [recording]);

  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      recordingStream.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  function rememberResult(result: DunaSearchResult) {
    const next = [
      result,
      ...recentResults.filter((item) => item.href !== result.href),
    ].slice(0, 4);
    setRecentResults(next);
    try {
      localStorage.setItem(
        `duna-search-recents-${surface}`,
        JSON.stringify(next),
      );
    } catch {
      // Recents are optional.
    }
  }

  function chooseResult(result: DunaSearchResult) {
    rememberResult(result);
    window.location.assign(result.href);
  }

  function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedResult((current) =>
        Math.min(current + 1, Math.max(0, searchResults.length - 1)),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedResult((current) => Math.max(0, current - 1));
    } else if (event.key === "Enter") {
      const selected = searchResults[selectedResult];
      if (selected) {
        event.preventDefault();
        chooseResult(selected);
      }
    }
  }

  async function addAttachments(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!files.length) return;
    if (attachments.length + files.length > maximumAttachments) {
      setNotice(`Attach up to ${maximumAttachments} files at a time.`);
      return;
    }
    const oversized = files.find((file) => file.size > maximumAttachmentBytes);
    if (oversized) {
      setNotice(`${oversized.name} is larger than 4 MB.`);
      return;
    }
    try {
      const next = await Promise.all(
        files.map(async (file) => ({
          id: crypto.randomUUID(),
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          data: await readFile(file),
          kind: file.type.startsWith("image/")
            ? ("image" as const)
            : ("file" as const),
          size: file.size,
        })),
      );
      setAttachments((current) => [...current, ...next]);
      setNotice(undefined);
    } catch {
      setNotice("That attachment could not be read.");
    }
  }

  async function transcribeAudio(blob: Blob) {
    const form = new FormData();
    const extension = blob.type.includes("mp4") ? "m4a" : "webm";
    form.append("audio", blob, `duna-voice.${extension}`);
    const response = await fetch(transcriptionEndpoint, {
      method: "POST",
      body: form,
    });
    const result = (await response.json()) as {
      readonly text?: string;
      readonly error?: string;
    };
    if (!response.ok || !result.text)
      throw new Error(result.error ?? "Transcription failed.");
    setQuery(
      (current) => `${current}${current.trim() ? " " : ""}${result.text}`,
    );
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      setNotice("Voice input is not available in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const nextRecorder = new MediaRecorder(stream);
      recordingStream.current = stream;
      recordingChunks.current = [];
      recorder.current = nextRecorder;
      nextRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunks.current.push(event.data);
      };
      nextRecorder.onstop = () => {
        const blob = new Blob(recordingChunks.current, {
          type: nextRecorder.mimeType || "audio/webm",
        });
        stream.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setPending(true);
        void transcribeAudio(blob)
          .then(() => setNotice(undefined))
          .catch((error: unknown) =>
            setNotice(
              error instanceof Error
                ? error.message
                : "Voice transcription failed.",
            ),
          )
          .finally(() => setPending(false));
      };
      nextRecorder.start();
      setRecordingSeconds(0);
      setRecording(true);
      setNotice(undefined);
    } catch {
      setNotice("Allow microphone access to talk to Duna AI.");
    }
  }

  async function submit(value = query) {
    const trimmed = value.trim();
    if ((!trimmed && attachments.length === 0) || pending) return;
    const effectiveMessage = trimmed || "Please review the attached file.";
    const previous = messages
      .slice(-8)
      .map(({ role, body }) => ({ role, body }));
    const sentAttachments = attachments;
    setMessages((current) => [
      ...current,
      {
        role: "user",
        body: effectiveMessage,
        attachmentNames: sentAttachments.map(({ name }) => name),
      },
    ]);
    setQuery("");
    setAttachments([]);
    setNotice(undefined);
    setPending(true);
    try {
      const response = await fetch(aiEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "ask",
          message: effectiveMessage,
          attachments: sentAttachments.map(
            ({ data, kind, mimeType, name }) => ({
              data,
              kind,
              mimeType,
              name,
            }),
          ),
          surface,
          page: pathname,
          context: contextFor(pathname, surface),
          history: previous,
          researchMode: research ? "on" : "off",
        }),
      });
      const result = (await response.json()) as {
        readonly reply?: string;
        readonly cards?: readonly DunaCard[];
        readonly suggestions?: readonly string[];
        readonly error?: string;
      };
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          body:
            result.reply ??
            result.error ??
            "I couldn’t complete that safely. Please try again.",
          cards: result.cards,
        },
      ]);
      if (result.suggestions?.length) setSuggestions(result.suggestions);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          body:
            surface === "hq"
              ? "Duna AI is unavailable right now. Nothing in your organization changed."
              : "I can’t reach Duna AI right now. Your Duna account has not changed.",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  async function approve(card: ApprovalCard) {
    setPending(true);
    try {
      const response = await fetch(aiEndpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "confirm",
          draftId: card.draft.id,
          confirmationNonce: card.draft.confirmationNonce,
        }),
      });
      const payload = (await response.json()) as {
        readonly result?: {
          readonly status: "applied" | "approved-plan" | "failed";
          readonly reply: string;
          readonly changes: readonly string[];
          readonly href?: string;
        };
        readonly error?: string;
      };
      const result = payload.result;
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          body:
            result?.reply ??
            payload.error ??
            "That approval could not be completed. Nothing changed.",
          cards: result
            ? [
                {
                  kind: result.href ? "link" : "notice",
                  title:
                    result.status === "applied"
                      ? "Changes applied"
                      : result.status === "approved-plan"
                        ? "Plan approved"
                        : "Action needs attention",
                  detail: result.changes.join(" · "),
                  href: result.href,
                  tone:
                    result.status === "applied"
                      ? "positive"
                      : result.status === "failed"
                        ? "danger"
                        : "default",
                },
              ]
            : undefined,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          body: "That approval could not be completed. Nothing changed.",
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  function renderCard(card: DunaCard, index: number) {
    const key = `${card.kind}-${card.title}-${index}`;
    if (card.kind === "approval")
      return (
        <section
          className="duna-action-center__card duna-action-center__card--approval"
          key={key}
        >
          <span>Review required</span>
          <strong>{card.title}</strong>
          <p>{card.detail}</p>
          <ul>
            {card.changes.map((change) => (
              <li key={change}>{change}</li>
            ))}
          </ul>
          <button
            disabled={pending}
            onClick={() => approve(card)}
            type="button"
          >
            <Icon name="check" size={15} />
            {card.draft.riskTier === "confirm-always"
              ? "Approve changes"
              : "Approve plan"}
          </button>
        </section>
      );
    if (card.kind === "metric")
      return (
        <section className="duna-action-center__metric-card" key={key}>
          <span>Live Duna data</span>
          <strong>{card.title}</strong>
          <p>{card.detail}</p>
          <dl>
            {card.metrics.map((metric) => (
              <div data-tone={metric.tone} key={metric.label}>
                <dt>{metric.label}</dt>
                <dd>{metric.value}</dd>
                {metric.change && <small>{metric.change}</small>}
              </div>
            ))}
          </dl>
        </section>
      );
    if (card.kind === "map")
      return (
        <section className="duna-action-center__card" key={key}>
          <span>Places that fit</span>
          <strong>{card.title}</strong>
          <p>{card.detail}</p>
          <div className="duna-action-center__card-links">
            {card.points.slice(0, 5).map((point) => (
              <a href={point.href} key={point.id}>
                <span>
                  <b>{point.title}</b>
                  <small>{point.subtitle}</small>
                </span>
                <Icon name="arrow" size={14} />
              </a>
            ))}
          </div>
        </section>
      );
    if (card.kind === "event")
      return (
        <a
          className="duna-action-center__event-card"
          href={card.href}
          key={key}
        >
          {card.imageUrl && <img alt="" src={card.imageUrl} />}
          <span>
            <small>Relevant event</small>
            <strong>{card.title}</strong>
            <p>
              {card.startsAt
                ? new Date(card.startsAt).toLocaleString()
                : card.detail}
              {card.venue ? ` · ${card.venue}` : ""}
            </p>
          </span>
          <Icon name="arrow" size={16} />
        </a>
      );
    const content = (
      <>
        <span>{card.kind === "notice" ? "Duna signal" : "Open in Duna"}</span>
        <strong>{card.title}</strong>
        <p>{card.detail}</p>
        {card.href && <Icon name="arrow" size={16} />}
      </>
    );
    return card.href ? (
      <a
        className={`duna-action-center__card duna-action-center__card--${card.tone ?? "default"}`}
        href={card.href}
        key={key}
      >
        {content}
      </a>
    ) : (
      <section
        className={`duna-action-center__card duna-action-center__card--${card.tone ?? "default"}`}
        key={key}
      >
        {content}
      </section>
    );
  }

  return (
    <div className="duna-action-center" data-surface={surface}>
      {panel === "search" && (
        <div
          className="duna-action-center__backdrop"
          onMouseDown={() => setPanel(null)}
        >
          <section
            aria-label={`Search Duna ${surface === "hq" ? "HQ" : "Player"}`}
            aria-modal="true"
            className="duna-command"
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="duna-command__search">
              <Icon name="search" size={21} />
              <input
                aria-label="Search all of Duna"
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder={
                  surface === "hq"
                    ? "Search people, coaches, sessions, products, money…"
                    : "Search players, coaches, events, and venues…"
                }
                ref={searchInput}
                value={searchQuery}
              />
              {searchPending ? <i aria-label="Searching" /> : <kbd>ESC</kbd>}
            </header>
            <div className="duna-command__body">
              {searchQuery.trim().length < 2 ? (
                <>
                  {recentResults.length > 0 && (
                    <section className="duna-command__group">
                      <h3>
                        <Icon name="history" size={14} /> Recent
                      </h3>
                      {recentResults.map((result) => (
                        <button
                          key={result.href}
                          onClick={() => chooseResult(result)}
                          type="button"
                        >
                          <span
                            className="duna-command__result-icon"
                            data-kind={result.kind}
                          >
                            {resultIcon(result.kind)}
                          </span>
                          <span>
                            <strong>{result.title}</strong>
                            <small>{result.subtitle}</small>
                          </span>
                          <Icon name="arrow" size={15} />
                        </button>
                      ))}
                    </section>
                  )}
                  <section className="duna-command__group">
                    <h3>Go anywhere</h3>
                    {quickActions.map((action) => (
                      <a href={action.href} key={action.href}>
                        <span
                          className="duna-command__result-icon"
                          data-kind="navigation"
                        >
                          →
                        </span>
                        <span>
                          <strong>{action.label}</strong>
                          <small>{action.detail}</small>
                        </span>
                        <Icon name="arrow" size={15} />
                      </a>
                    ))}
                  </section>
                </>
              ) : groupedResults.length > 0 ? (
                groupedResults.map(([category, results]) => (
                  <section className="duna-command__group" key={category}>
                    <h3>{category}</h3>
                    {results.map((result) => {
                      const flatIndex = searchResults.indexOf(result);
                      return (
                        <button
                          aria-selected={selectedResult === flatIndex}
                          className={
                            selectedResult === flatIndex
                              ? "is-selected"
                              : undefined
                          }
                          key={result.id}
                          onClick={() => chooseResult(result)}
                          onMouseEnter={() => setSelectedResult(flatIndex)}
                          role="option"
                          type="button"
                        >
                          {result.imageUrl ? (
                            <img alt="" src={result.imageUrl} />
                          ) : (
                            <span
                              className="duna-command__result-icon"
                              data-kind={result.kind}
                            >
                              {resultIcon(result.kind)}
                            </span>
                          )}
                          <span>
                            <strong>{result.title}</strong>
                            <small>{result.subtitle}</small>
                          </span>
                          {result.badge && <em>{result.badge}</em>}
                          <Icon name="arrow" size={15} />
                        </button>
                      );
                    })}
                  </section>
                ))
              ) : searchPending ? (
                <div className="duna-command__loading">
                  <span />
                  <span />
                  <span />
                </div>
              ) : (
                <div className="duna-command__empty">
                  <Icon name="search" size={25} />
                  <strong>No exact result yet.</strong>
                  <span>
                    Try a name, event, venue, product, or transaction.
                  </span>
                </div>
              )}
            </div>
            <footer>
              <span>
                <kbd>↑</kbd>
                <kbd>↓</kbd> navigate
              </span>
              <span>
                <kbd>↵</kbd> open
              </span>
              <button onClick={() => dispatchAction("chat")} type="button">
                Ask Duna instead <Icon name="sparkle" size={14} />
              </button>
            </footer>
          </section>
        </div>
      )}

      {panel === "actions" && (
        <section
          aria-label="Quick actions"
          className="duna-action-center__actions"
        >
          <header>
            <span>
              <small>Quick actions</small>
              <strong>What do you want to do?</strong>
            </span>
            <button
              aria-label="Close quick actions"
              onClick={() => setPanel(null)}
              type="button"
            >
              <Icon name="close" size={17} />
            </button>
          </header>
          <div>
            {quickActions.map((action, index) => (
              <a href={action.href} key={action.href}>
                <span>{index + 1}</span>
                <span>
                  <strong>{action.label}</strong>
                  <small>{action.detail}</small>
                </span>
                <Icon name="arrow" size={16} />
              </a>
            ))}
          </div>
        </section>
      )}

      {panel === "chat" && (
        <section
          aria-label="Duna AI assistant"
          className={`duna-action-center__chat${userTurnCount > 0 ? " duna-action-center__chat--expanded" : ""}`}
        >
          <header className="duna-action-center__chat-header">
            <span className="duna-action-center__avatar">
              <img alt="" src="/brand/duna-icon.png" />
            </span>
            <span>
              <strong>Duna AI</strong>
              <small>
                <i /> {research ? "Duna context + web" : "Your Duna context"}
              </small>
            </span>
            <button
              aria-label="Close Duna AI"
              onClick={() => setPanel(null)}
              type="button"
            >
              <Icon name="close" size={18} />
            </button>
          </header>
          <div className="duna-action-center__messages" role="log">
            {messages.map((message, index) => (
              <article
                className={`duna-action-center__message duna-action-center__message--${message.role}`}
                key={`${message.role}-${index}`}
              >
                <MessageBody body={message.body} />
                {message.attachmentNames?.length ? (
                  <div className="duna-action-center__sent-files">
                    {message.attachmentNames.map((name) => (
                      <span key={name}>
                        <Icon name="file" size={13} /> {name}
                      </span>
                    ))}
                  </div>
                ) : null}
                {message.cards?.map(renderCard)}
              </article>
            ))}
            {pending && (
              <div className="duna-action-center__thinking" role="status">
                <span />
                <span />
                <span />
                <small>
                  {recording ? "Listening…" : "Checking Duna context…"}
                </small>
              </div>
            )}
            <div ref={messagesEnd} />
          </div>

          {userTurnCount === 0 && (
            <div className="duna-action-center__starters">
              {suggestions.slice(0, 3).map((suggestion) => (
                <button
                  disabled={pending}
                  key={suggestion}
                  onClick={() => submit(suggestion)}
                  type="button"
                >
                  <Icon name="sparkle" size={14} /> {suggestion}
                </button>
              ))}
            </div>
          )}

          <form
            className="duna-action-center__composer"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void submit();
            }}
          >
            {attachments.length > 0 && (
              <div className="duna-action-center__attachments">
                {attachments.map((attachment) => (
                  <span key={attachment.id}>
                    {attachment.kind === "image" ? (
                      <img alt="" src={attachment.data} />
                    ) : (
                      <Icon name="file" size={16} />
                    )}
                    <small>{attachment.name}</small>
                    <button
                      aria-label={`Remove ${attachment.name}`}
                      onClick={() =>
                        setAttachments((current) =>
                          current.filter(({ id }) => id !== attachment.id),
                        )
                      }
                      type="button"
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {notice && <p className="duna-action-center__notice">{notice}</p>}
            <textarea
              aria-label="Ask Duna AI a question"
              disabled={pending || recording}
              onChange={(event) => {
                setQuery(event.target.value);
                event.target.style.height = "auto";
                event.target.style.height = `${Math.min(event.target.scrollHeight, 116)}px`;
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void submit();
                }
              }}
              placeholder={
                recording
                  ? `Listening ${secondsLabel(recordingSeconds)}…`
                  : "Ask anything about Duna…"
              }
              ref={composer}
              rows={1}
              value={query}
            />
            <div className="duna-action-center__composer-tools">
              <span>
                <input
                  accept="image/*,.pdf,.txt,.csv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  aria-label="Attach an image or file"
                  multiple
                  onChange={addAttachments}
                  ref={fileInput}
                  type="file"
                />
                <button
                  aria-label="Attach an image or file"
                  disabled={pending}
                  onClick={() => fileInput.current?.click()}
                  type="button"
                >
                  <Icon name="paperclip" size={18} />
                </button>
                <button
                  aria-label={recording ? "Stop recording" : "Talk to Duna AI"}
                  aria-pressed={recording}
                  className={recording ? "is-recording" : undefined}
                  disabled={pending && !recording}
                  onClick={() => void toggleRecording()}
                  type="button"
                >
                  <Icon name="mic" size={18} />
                  {recording && <i />}
                </button>
                <button
                  aria-label={`Web research ${research ? "on" : "off"}`}
                  aria-pressed={research}
                  className={research ? "is-active" : undefined}
                  onClick={() => setResearch((current) => !current)}
                  type="button"
                >
                  <Icon name="globe" size={18} />
                </button>
              </span>
              <button
                aria-label="Send to Duna AI"
                className="duna-action-center__send"
                disabled={
                  pending || (!query.trim() && attachments.length === 0)
                }
                type="submit"
              >
                <Icon name="send" size={17} />
              </button>
            </div>
          </form>
          <small className="duna-action-center__safety">
            Duna AI can prepare work. Sensitive changes always require your
            review.
          </small>
        </section>
      )}

      <nav
        aria-label="Duna action center"
        className="duna-action-center__launcher"
      >
        <button
          aria-label="Search Duna"
          aria-pressed={panel === "search"}
          className="duna-action-center__search-button"
          onClick={() =>
            setPanel((current) => (current === "search" ? null : "search"))
          }
          type="button"
        >
          <Icon name="search" size={21} />
          <kbd>⌘K</kbd>
        </button>
        <button
          aria-label={panel === "chat" ? "Close Duna AI" : "Open Duna AI"}
          aria-pressed={panel === "chat"}
          className="duna-action-center__duna-button"
          onClick={() =>
            setPanel((current) => (current === "chat" ? null : "chat"))
          }
          type="button"
        >
          <img alt="" src="/brand/duna-icon.png" />
        </button>
        <button
          aria-label="Open quick actions"
          aria-pressed={panel === "actions"}
          onClick={() =>
            setPanel((current) => (current === "actions" ? null : "actions"))
          }
          type="button"
        >
          <Icon name="plus" size={22} />
        </button>
      </nav>
    </div>
  );
}
