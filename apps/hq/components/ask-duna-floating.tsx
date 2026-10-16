"use client";

import type { AskDunaEffort } from "@duna/api/ask-duna-contracts";
import { DunaMark } from "@duna/ui";
import type { UserContent } from "ai";
import { ArrowUpRight, MessageCircle, Minus, Plus } from "lucide-react";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";
import {
  askDunaFetch,
  notifyAskDunaHistory,
  type AskConversation,
} from "./ask-duna-client";
import { AskDunaComposer, AskDunaThread } from "./ask-duna-workspace";
import type {
  AskDunaRequest,
  AskDunaSurface,
} from "./ask-duna-floating-provider";

export function AskDunaFloating({
  surface,
  pathname,
  visible,
  request,
  onRequestHandled,
}: {
  surface: AskDunaSurface;
  pathname: string;
  visible: boolean;
  request?: AskDunaRequest;
  onRequestHandled: (id: number) => void;
}) {
  const [minimized, setMinimized] = useState(false);
  const [conversation, setConversation] = useState<AskConversation | null>(
    null,
  );
  const [initialMessage, setInitialMessage] = useState<UserContent | null>(
    null,
  );
  const [text, setText] = useState("");
  const [effort, setEffort] = useState<AskDunaEffort>("medium");
  const [recents, setRecents] = useState<AskConversation[]>([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [focusTarget, setFocusTarget] = useState<
    "composer" | "launcher" | null
  >(null);
  const creatingRef = useRef(false);
  const handledRequest = useRef<number | null>(null);
  const panel = useRef<HTMLElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const canAsk = surface.canAsk !== false;

  const refresh = useCallback(() => {
    if (!canAsk) return;
    void askDunaFetch<{ conversations: AskConversation[] }>("conversations")
      .then((result) => setRecents(result.conversations))
      .catch(() => {});
  }, [canAsk]);
  useEffect(() => {
    refresh();
    window.addEventListener("ask-duna:history", refresh);
    return () => window.removeEventListener("ask-duna:history", refresh);
  }, [refresh]);

  // Reserve scrolling room for the compact composer, not the open transcript.
  useEffect(() => {
    if (!visible) return;
    const measure = () => {
      const dock = panel.current?.querySelector(".ask-duna-dock");
      const height = minimized
        ? 72
        : (dock?.getBoundingClientRect().height ?? 220) + 68;
      document.body.style.setProperty("--ask-duna-clearance", `${height}px`);
    };
    document.body.classList.add("ask-duna-floating-visible");
    const observer = new ResizeObserver(measure);
    if (container.current) observer.observe(container.current);
    measure();
    return () => {
      observer.disconnect();
      document.body.classList.remove("ask-duna-floating-visible");
      document.body.style.removeProperty("--ask-duna-clearance");
    };
  }, [visible, minimized, conversation?.id]);

  function focusComposer() {
    setFocusTarget("composer");
  }
  function minimize() {
    setMinimized(true);
    setFocusTarget("launcher");
  }
  useEffect(() => {
    if (!visible || !focusTarget) return;
    const target =
      focusTarget === "launcher"
        ? launcher.current
        : panel.current?.querySelector<HTMLTextAreaElement>("textarea");
    target?.focus({ preventScroll: true });
    setFocusTarget(null);
  }, [focusTarget, minimized, visible]);
  async function start(message: UserContent, title: string) {
    if (creatingRef.current || !canAsk) return;
    creatingRef.current = true;
    setCreating(true);
    setError("");
    try {
      const result = await askDunaFetch<{ conversation: AskConversation }>(
        "conversations",
        {
          method: "POST",
          body: JSON.stringify({
            title: title.slice(0, 100) || "Attached files",
            effort,
            page: pathname.slice(0, 240),
          }),
        },
      );
      setConversation(result.conversation);
      setInitialMessage(message);
      notifyAskDunaHistory();
    } catch (failure) {
      setError((failure as Error).message);
      throw failure;
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }
  const receiveRequest = useEffectEvent((incoming: AskDunaRequest) => {
    setMinimized(false);
    if (incoming.prompt) {
      // A page's task prompt explicitly starts a new task. Existing conversations
      // remain in history, and an in-flight turn cannot be silently replaced.
      if (busy || creatingRef.current) {
        setError(
          "Finish or stop the current response before starting another task.",
        );
      } else {
        setConversation(null);
        setInitialMessage(null);
        setText(incoming.prompt);
        void start(
          [{ type: "text", text: incoming.prompt }],
          incoming.prompt,
        ).catch(() => {});
      }
    }
    focusComposer();
  });
  useEffect(() => {
    if (!request || request.id === handledRequest.current) return;
    handledRequest.current = request.id;
    receiveRequest(request);
    onRequestHandled(request.id);
  }, [request, onRequestHandled]);

  return (
    <div
      ref={container}
      className={`ask-duna-floating${surface.admin ? " ask-duna-floating--admin" : ""}`}
      hidden={!visible}
    >
      <button
        ref={launcher}
        className="ask-duna-floating-launcher"
        type="button"
        hidden={!minimized}
        aria-label="Open Ask Duna"
        aria-expanded={!minimized}
        aria-controls="ask-duna-floating-panel"
        onClick={() => {
          setMinimized(false);
          focusComposer();
        }}
      >
        <DunaMark compact />
        <span>Ask Duna</span>
        {busy && <small>Working…</small>}
      </button>
      <section
        ref={panel}
        id="ask-duna-floating-panel"
        className="ask-duna-floating-panel"
        role="region"
        aria-label="Floating Ask Duna"
        hidden={minimized}
        data-zone="editorial"
        onKeyDown={(event) => {
          if (
            event.key === "Escape" &&
            !panel.current?.querySelector('[role="dialog"]')
          ) {
            event.stopPropagation();
            minimize();
          }
        }}
      >
        <header className="ask-duna-floating-header">
          <span>
            <MessageCircle size={17} aria-hidden />
            <strong>Ask Duna</strong>
          </span>
          <div>
            {conversation && (
              <button
                type="button"
                aria-label="New floating conversation"
                disabled={busy || creating}
                onClick={() => {
                  setConversation(null);
                  setInitialMessage(null);
                  setText("");
                  setError("");
                  focusComposer();
                }}
              >
                <Plus size={18} aria-hidden />
              </button>
            )}
            <Link
              href={conversation ? `/ask/${conversation.id}` : "/ask/history"}
              aria-label={
                conversation ? "Expand conversation" : "All conversations"
              }
            >
              <ArrowUpRight size={18} aria-hidden />
            </Link>
            <button
              type="button"
              aria-label="Minimize Ask Duna"
              onClick={minimize}
            >
              <Minus size={18} aria-hidden />
            </button>
          </div>
        </header>
        {!canAsk ? (
          <p className="ask-duna-floating-unavailable">
            Choose your organization in <Link href="/">club HQ</Link> to work
            with Duna.
          </p>
        ) : conversation ? (
          <AskDunaThread
            key={conversation.id}
            conversation={conversation}
            initialMessage={initialMessage}
            organizationName={surface.organizationName}
            recents={recents}
            floating
            pageContext={pathname}
            pageLabel={surface.pageLabel}
            visible={visible && !minimized}
            onBusy={setBusy}
            onChanged={notifyAskDunaHistory}
          />
        ) : (
          <div className="ask-duna ask-duna-floating-new">
            <AskDunaComposer
              text={text}
              onText={setText}
              effort={effort}
              onEffort={setEffort}
              organizationName={surface.organizationName}
              pageLabel={surface.pageLabel}
              busy={creating}
              onSend={start}
              recents={recents}
            />
          </div>
        )}
        {error && (
          <p className="ask-duna-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}
