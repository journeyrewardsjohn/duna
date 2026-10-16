"use client";

import {
  ASK_DUNA_EFFORTS,
  ASK_DUNA_MAX_ATTACHMENT_BYTES,
  ASK_DUNA_MAX_TURN_BYTES,
  type AskDunaEffort,
} from "@duna/api/ask-duna-contracts";
import { DunaMark } from "@duna/ui";
import { openConversationInputs, useEveAgent } from "eve/react";
import type { UserContent } from "ai";
import {
  ArrowUp,
  ArrowUpRight,
  Archive,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  FileText,
  History,
  LoaderCircle,
  MessageCircle,
  Plus,
  Search,
  SlidersHorizontal,
  Square,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import {
  askDunaFetch,
  notifyAskDunaHistory,
  type AskAction,
  type AskConversation,
} from "./ask-duna-client";

type Reference = { id: string; label: string; kind: "members" | "events" };
type Attachment = {
  id: string;
  name: string;
  mediaType: string;
  data: string;
  size: number;
};
const suggestions = [
  {
    icon: CalendarDays,
    title: "Make room for what’s next",
    text: "Help me plan next week around our coaches, courts, and existing events.",
  },
  {
    icon: Users,
    title: "Keep your community close",
    text: "Review our members and help me prepare an update for the right audience.",
  },
  {
    icon: SlidersHorizontal,
    title: "Take care of the details",
    text: "What needs my attention today across our schedule, events, and business?",
  },
];

function operatorMessageLabel(text: string) {
  const review =
    /^I (approved|declined) proposal [0-9a-f-]{36}\. Check its saved outcome with change_results and continue my request\. Do not repeat the reviewed action\.$/i.exec(
      text,
    );
  if (review)
    return review[1] === "approved"
      ? "Approved this change."
      : "Declined this change.";
  const page = /^Current Duna page: \/[^\n]*\nPage label: (.+)$/.exec(text);
  return page ? `From ${page[1]}` : text;
}

export function AskDunaWorkspace({
  conversationId,
  history = false,
  operatorName,
  organizationName,
  scopeKey,
}: {
  conversationId?: string;
  history?: boolean;
  operatorName: string;
  organizationName: string;
  scopeKey: string;
}) {
  const [conversation, setConversation] = useState<AskConversation | null>(
    null,
  );
  const [recents, setRecents] = useState<AskConversation[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const requestSequence = useRef(0);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(Boolean(conversationId));
  const [draft, setDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [effort, setEffort] = useState<AskDunaEffort>("medium");
  const [pendingMessage, setPendingMessage] = useState<UserContent | null>(
    null,
  );
  const [sourcePage, setSourcePage] = useState("/ask");
  const newDraftKey = `ask-duna:draft:${scopeKey}`;

  const refresh = useCallback(() => {
    const sequence = ++requestSequence.current;
    return askDunaFetch<{
      conversations: AskConversation[];
      nextOffset: number | null;
    }>(`conversations?q=${encodeURIComponent(search)}&archived=${showArchived}`)
      .then((result) => {
        if (sequence === requestSequence.current) {
          setRecents(result.conversations);
          setNextOffset(result.nextOffset);
        }
      })
      .catch((failure: Error) => {
        if (sequence === requestSequence.current) setError(failure.message);
      });
  }, [search, showArchived]);
  async function loadMore() {
    const sequence = ++requestSequence.current;
    try {
      const result = await askDunaFetch<{
        conversations: AskConversation[];
        nextOffset: number | null;
      }>(
        `conversations?q=${encodeURIComponent(search)}&archived=${showArchived}&offset=${nextOffset ?? 0}`,
      );
      if (sequence === requestSequence.current) {
        setRecents((current) => [
          ...new Map(
            [...current, ...result.conversations].map((row) => [row.id, row]),
          ).values(),
        ]);
        setNextOffset(result.nextOffset);
      }
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  useEffect(() => {
    const reset = () => {
      setConversation(null);
      setPendingMessage(null);
      setDraft("");
      setError("");
      consumeDraft();
    };
    window.addEventListener("ask-duna:new", reset);
    return () => window.removeEventListener("ask-duna:new", reset);
  }, [newDraftKey]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 180);
    return () => clearTimeout(timer);
  }, [refresh]);
  useEffect(() => {
    if (!conversationId) {
      if (!history) consumeDraft();
      return;
    }
    const abort = new AbortController();
    void askDunaFetch<{ conversation: AskConversation }>(
      `conversations/${conversationId}`,
      { signal: abort.signal },
    )
      .then((result) => {
        setConversation(result.conversation);
        setEffort(result.conversation.effort);
      })
      .catch((failure: Error) => {
        if (!abort.signal.aborted) setError(failure.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [conversationId, newDraftKey]);

  function consumeDraft() {
    try {
      const saved = sessionStorage.getItem(newDraftKey);
      if (!saved) return;
      sessionStorage.removeItem(newDraftKey);
      const handoff = JSON.parse(saved) as {
        prompt?: string;
        page?: string;
        submit?: boolean;
      };
      if (typeof handoff.prompt !== "string") return;
      const page =
        typeof handoff.page === "string" && /^\/(?!\/)/.test(handoff.page)
          ? handoff.page
          : "/ask";
      setDraft(handoff.prompt);
      setSourcePage(page);
      if (handoff.submit)
        void start(
          [{ type: "text", text: handoff.prompt }],
          handoff.prompt,
          page,
        ).catch(() => {});
    } catch {
      /* Optional handoff; the composer remains usable. */
    }
  }

  async function start(message: UserContent, text: string, page = sourcePage) {
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      const result = await askDunaFetch<{ conversation: AskConversation }>(
        "conversations",
        {
          method: "POST",
          body: JSON.stringify({
            title: text.slice(0, 100) || "Attached files",
            effort,
            page,
          }),
        },
      );
      setConversation(result.conversation);
      setPendingMessage(message);
      // Keep this component mounted while the first durable turn starts.
      window.history.replaceState(
        window.history.state,
        "",
        `/ask/${result.conversation.id}`,
      );
      notifyAskDunaHistory();
    } catch (failure) {
      setError((failure as Error).message);
      throw failure;
    } finally {
      setCreating(false);
    }
  }

  if (loading)
    return (
      <div className="ask-duna-loading" role="status">
        <LoaderCircle className="ask-duna-spin" size={22} /> Opening your
        conversation…
      </div>
    );
  if (conversation)
    return (
      <AskDunaThread
        key={conversation.id}
        conversation={conversation}
        initialMessage={pendingMessage}
        organizationName={organizationName}
        recents={recents}
        onChanged={() => {
          void refresh();
          notifyAskDunaHistory();
        }}
      />
    );

  return (
    <section
      className={`ask-duna ${history ? "ask-duna--history" : "ask-duna--new"}`}
      data-zone="editorial"
    >
      <header className="ask-duna-header">
        <span>
          <MessageCircle size={18} aria-hidden />
          {history ? "All conversations" : "New conversation"}
        </span>
        {history && (
          <Link href="/ask">
            <Plus size={16} aria-hidden /> New conversation
          </Link>
        )}
      </header>
      {history ? (
        <>
          <div className="ask-duna-history-title">
            <h1>Conversations</h1>
            <p>
              Your conversations in {organizationName}. Pick up where you left
              off.
            </p>
          </div>
          <div className="ask-duna-history-controls">
            <label className="ask-duna-search">
              <Search size={18} aria-hidden />
              <input
                aria-label="Search conversations"
                placeholder="Search your conversations…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <button
              type="button"
              aria-pressed={showArchived}
              onClick={() => setShowArchived(!showArchived)}
            >
              <Archive size={16} aria-hidden />
              {showArchived ? "Including archived" : "Show archived"}
            </button>
          </div>
          <ConversationList
            conversations={recents}
            empty={
              search
                ? "No conversations match your search."
                : "Your conversations will appear here."
            }
          />
          {nextOffset !== null && (
            <button
              className="ask-duna-load-more"
              type="button"
              onClick={() => void loadMore()}
            >
              Load more conversations
            </button>
          )}
        </>
      ) : (
        <>
          <div className="ask-duna-hero">
            <div className="ask-duna-emblem">
              <DunaMark compact />
            </div>
            <p className="ask-duna-eyebrow">
              A little less work. A little more play.
            </p>
            <h1>
              What can I take off your plate
              {operatorName ? `, ${operatorName.split(" ")[0]}` : ""}?
            </h1>
            <p>
              Your people, your schedule, your business.
              <br /> Ask naturally. We’ll work through it together.
            </p>
          </div>
          <div className="ask-duna-suggestions">
            {suggestions.map(({ icon: Icon, title, text }) => (
              <button type="button" key={title} onClick={() => setDraft(text)}>
                <span>
                  <Icon size={20} aria-hidden />
                  <ArrowUpRight size={16} aria-hidden />
                </span>
                <strong>{title}</strong>
                <small>{text}</small>
              </button>
            ))}
          </div>
          <div className="ask-duna-recents">
            <header>
              <h2>Recent conversations</h2>
              <Link href="/ask/history">
                View all <span aria-hidden>→</span>
              </Link>
            </header>
            <ConversationList
              conversations={recents.slice(0, 5)}
              empty="Start a conversation. It will be saved here for next time."
            />
          </div>
          <AskDunaComposer
            text={draft}
            onText={setDraft}
            effort={effort}
            onEffort={setEffort}
            organizationName={organizationName}
            busy={creating}
            onSend={start}
            recents={recents}
          />
        </>
      )}
      {error && (
        <p className="ask-duna-error" role="alert">
          {error}
          <button
            type="button"
            onClick={() => {
              setError("");
              void refresh();
            }}
          >
            Try again
          </button>
        </p>
      )}
    </section>
  );
}

function ConversationList({
  conversations,
  empty,
}: {
  conversations: AskConversation[];
  empty: string;
}) {
  return (
    <div className="ask-duna-conversation-list">
      {conversations.length === 0 ? (
        <p className="ask-duna-empty">{empty}</p>
      ) : (
        conversations.map((item) => (
          <Link href={`/ask/${item.id}`} key={item.id}>
            <MessageCircle size={18} aria-hidden />
            <span>
              <strong>{item.title}</strong>
              {item.preview && <small>{item.preview}</small>}
            </span>
            <time dateTime={item.updatedAt}>
              {new Date(item.updatedAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </time>
            {item.archivedAt && <Archive size={14} aria-label="Archived" />}
          </Link>
        ))
      )}
    </div>
  );
}

export function AskDunaThread({
  conversation,
  initialMessage,
  organizationName,
  onChanged,
  recents,
  floating = false,
  pageContext,
  pageLabel,
  visible = true,
  onBusy,
}: {
  conversation: AskConversation;
  initialMessage: UserContent | null;
  organizationName: string;
  onChanged: () => void;
  recents: AskConversation[];
  floating?: boolean;
  pageContext?: string;
  pageLabel?: string;
  visible?: boolean;
  onBusy?: (busy: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState(conversation.title);
  const [effort, setEffort] = useState<AskDunaEffort>(conversation.effort);
  const [actions, setActions] = useState<AskAction[]>([]);
  const [error, setError] = useState("");
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [archived, setArchived] = useState(Boolean(conversation.archivedAt));
  const sentInitial = useRef(false);
  const end = useRef<HTMLDivElement>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const wasVisible = useRef(visible);
  const agent = useEveAgent({
    initialSession: conversation.sessionId
      ? { sessionId: conversation.sessionId, streamIndex: 0 }
      : undefined,
    resume: Boolean(conversation.sessionId) && !initialMessage,
    followIdle: false,
    auth: {
      bearer: async () =>
        (
          await askDunaFetch<{ token: string }>(
            `conversations/${conversation.id}/token`,
            { method: "POST", body: "{}" },
          )
        ).token,
    },
    onFinish() {
      void loadActions();
      onChanged();
    },
    onEvent(event) {
      if (event.type === "action.result") void loadActions();
    },
  });
  const busy = agent.status === "submitted" || agent.status === "streaming";
  const resuming = agent.status === "resuming";
  useEffect(() => {
    onBusy?.(busy || resuming || reviewing !== null);
  }, [busy, resuming, reviewing, onBusy]);
  useEffect(() => {
    // The full workspace can update this same conversation while the floating
    // surface is hidden. Reconnect on return without resending a user turn.
    const abort = new AbortController();
    if (visible && !wasVisible.current && !busy) {
      void loadActions();
      void askDunaFetch<{ conversation: AskConversation }>(
        `conversations/${conversation.id}`,
        { signal: abort.signal },
      )
        .then(async ({ conversation: saved }) => {
          if (abort.signal.aborted) return;
          setArchived(Boolean(saved.archivedAt));
          setTitle(saved.title);
          setEffort(saved.effort);
          if (!saved.archivedAt) await agent.resume();
        })
        .catch((failure: Error) => {
          if (!abort.signal.aborted) setError(failure.message);
        });
    }
    wasVisible.current = visible;
    return () => abort.abort();
  }, [visible]);
  async function loadActions() {
    try {
      setActions(
        (
          await askDunaFetch<{ actions: AskAction[] }>(
            `conversations/${conversation.id}/actions`,
          )
        ).actions,
      );
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  useEffect(() => {
    void loadActions();
  }, []);
  useEffect(() => {
    if (initialMessage && !sentInitial.current) {
      sentInitial.current = true;
      void agent
        .send(initialMessage)
        .catch((failure: Error) => setError(failure.message));
    }
  }, [initialMessage, agent]);
  useEffect(() => {
    if (!visible) return;
    if (floating && transcript.current) {
      transcript.current.scrollTop = transcript.current.scrollHeight;
    } else end.current?.scrollIntoView({ behavior: "instant", block: "end" });
  }, [agent.data.messages.length, floating, visible]);
  async function update(input: {
    effort?: AskDunaEffort;
    title?: string;
    archived?: boolean;
  }) {
    try {
      await askDunaFetch(`conversations/${conversation.id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      if (input.effort) setEffort(input.effort);
      if (input.archived !== undefined) setArchived(input.archived);
      onChanged();
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  async function review(action: AskAction, decision: "approve" | "decline") {
    setReviewing(action.id);
    setError("");
    try {
      await askDunaFetch(`conversations/${conversation.id}/review`, {
        method: "POST",
        body: JSON.stringify({ actionId: action.id, decision }),
      });
      await loadActions();
      onChanged();
      try {
        await agent.send(
          `I ${decision === "approve" ? "approved" : "declined"} proposal ${action.id}. Check its saved outcome with change_results and continue my request. Do not repeat the reviewed action.`,
        );
      } catch {
        setError(
          "Your review was saved. Reconnect to continue the conversation; the action receipt is available above.",
        );
      }
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setReviewing(null);
    }
  }
  return (
    <section className="ask-duna ask-duna--thread" data-zone="editorial">
      {!floating && (
        <header className="ask-duna-header">
          <details className="ask-duna-title-editor">
            <summary>{title}</summary>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void update({ title });
              }}
            >
              <input
                aria-label="Conversation title"
                value={title}
                maxLength={120}
                onChange={(event) => setTitle(event.target.value)}
              />
              <button type="submit">Save title</button>
            </form>
          </details>
          <div>
            <button
              type="button"
              onClick={() => void update({ archived: !archived })}
              disabled={busy}
              aria-label={
                archived ? "Restore conversation" : "Archive conversation"
              }
            >
              <Archive size={17} aria-hidden />
              {archived ? "Restore" : "Archive"}
            </button>
            <Link
              href="/ask"
              onClick={() => window.dispatchEvent(new Event("ask-duna:new"))}
            >
              <Plus size={17} aria-hidden />
              New conversation
            </Link>
          </div>
        </header>
      )}
      <div
        ref={transcript}
        className="ask-duna-transcript"
        role="log"
        aria-label="Conversation messages"
      >
        {agent.data.messages.map((message) => (
          <article
            key={message.id}
            className={`ask-duna-message ask-duna-message--${message.role}`}
          >
            {message.role === "assistant" && (
              <header>
                <DunaMark compact />
                <strong>Duna</strong>
              </header>
            )}
            {message.parts.map((part, index) => {
              if (part.type === "text")
                return (
                  <div className="ask-duna-message-text" key={part.id ?? index}>
                    {message.role === "assistant" ? (
                      <Streamdown
                        skipHtml
                        disallowedElements={["img"]}
                        controls={false}
                      >
                        {part.text}
                      </Streamdown>
                    ) : (
                      operatorMessageLabel(part.text)
                    )}
                  </div>
                );
              if (part.type === "file")
                return (
                  <span className="ask-duna-file" key={index}>
                    <FileText size={16} aria-hidden />
                    {part.filename ?? "Attachment"}
                  </span>
                );
              if (part.type === "dynamic-tool")
                return (
                  <div key={part.toolCallId} className="ask-duna-activity">
                    <span aria-hidden>
                      {part.state === "output-available" ? (
                        <Check size={15} />
                      ) : (
                        <SlidersHorizontal size={15} />
                      )}
                    </span>
                    {part.toolMetadata?.eve?.label ??
                      "Working with your Duna tools"}
                    {part.state === "output-error" && (
                      <span> · Needs attention</span>
                    )}
                  </div>
                );
              return null;
            })}
            {message.role === "assistant" && (
              <button
                className="ask-duna-copy"
                type="button"
                aria-label="Copy Duna response"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(
                      message.parts
                        .filter((part) => part.type === "text")
                        .map((part) => part.text)
                        .join("\n"),
                    )
                    .catch(() =>
                      setError("Copy is unavailable in this browser."),
                    );
                }}
              >
                <Copy size={15} aria-hidden />
              </button>
            )}
          </article>
        ))}
        {resuming && (
          <p className="ask-duna-working" role="status">
            Opening saved messages…
          </p>
        )}
        {busy && (
          <p className="ask-duna-working" role="status">
            <LoaderCircle size={16} className="ask-duna-spin" aria-hidden />
            Duna is working with your workspace…
          </p>
        )}
        {openConversationInputs(agent.data).map(({ request }) => (
          <fieldset
            className="ask-duna-review"
            disabled={resuming}
            key={request.requestId}
          >
            <legend>Continue this conversation</legend>
            <p>{request.prompt}</p>
            {request.options?.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  void agent
                    .respond([
                      { requestId: request.requestId, optionId: option.id },
                    ])
                    .catch((failure: Error) => setError(failure.message));
                }}
              >
                {option.label}
              </button>
            ))}
          </fieldset>
        ))}
        {actions.map((action) => (
          <article className="ask-duna-review" key={action.id}>
            <header>
              <SlidersHorizontal size={18} aria-hidden />
              <strong>
                {action.status === "pending"
                  ? "Ready for your review"
                  : action.status === "succeeded"
                    ? "Action receipt"
                    : action.status === "uncertain"
                      ? "Check the outcome"
                      : action.status === "declined"
                        ? "Change declined"
                        : action.status === "executing"
                          ? "Action in progress"
                          : "Action needs attention"}
              </strong>
              <span>{action.status}</span>
            </header>
            <p>{action.summary}</p>
            <details>
              <summary>View exact change</summary>
              <strong>
                {action.operation
                  .replace("operator.", "")
                  .replace(/([a-z])([A-Z])/g, "$1 $2")}
              </strong>
              <pre>
                {JSON.stringify(
                  Object.fromEntries(
                    Object.entries(action.input).filter(
                      ([key]) => key !== "idempotencyKey",
                    ),
                  ),
                  null,
                  2,
                )}
              </pre>
            </details>
            {action.result && (
              <details>
                <summary>View saved result</summary>
                <pre>{JSON.stringify(action.result, null, 2)}</pre>
              </details>
            )}
            {action.status === "pending" && (
              <footer>
                <small>
                  Review expires{" "}
                  {new Date(action.expiresAt).toLocaleTimeString(undefined, {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </small>
                <button
                  type="button"
                  disabled={reviewing !== null || archived || busy || resuming}
                  onClick={() => void review(action, "decline")}
                >
                  Decline
                </button>
                <button
                  className="ask-duna-primary"
                  type="button"
                  disabled={reviewing !== null || archived || busy || resuming}
                  onClick={() => void review(action, "approve")}
                >
                  {reviewing === action.id ? "Saving…" : "Approve change"}
                </button>
              </footer>
            )}
          </article>
        ))}
        <div ref={end} />
      </div>
      {(error || agent.error) && (
        <p className="ask-duna-error" role="alert">
          {error ||
            "Duna could not finish this response. Your saved conversation is still here."}
          <button
            type="button"
            onClick={() => {
              setError("");
              void agent
                .resume()
                .catch((failure: Error) => setError(failure.message));
            }}
          >
            Reconnect
          </button>
        </p>
      )}
      {archived ? (
        <p className="ask-duna-archived">
          This conversation is archived. Restore it to continue.
        </p>
      ) : (
        <AskDunaComposer
          text={text}
          onText={setText}
          effort={effort}
          onEffort={(value) => {
            void update({ effort: value });
          }}
          organizationName={organizationName}
          pageLabel={pageLabel}
          busy={busy}
          disabled={resuming || !conversation.sessionId}
          recents={recents}
          onStop={() => {
            void agent
              .cancel()
              .catch((failure: Error) => setError(failure.message));
          }}
          onSend={async (message) => {
            setError("");
            await agent.send(
              pageContext
                ? [
                    {
                      type: "text",
                      text: `Current Duna page: ${pageContext}\nPage label: ${pageLabel ?? "your workspace"}`,
                    },
                    ...(typeof message === "string"
                      ? [{ type: "text" as const, text: message }]
                      : message),
                  ]
                : message,
            );
          }}
        />
      )}
    </section>
  );
}

export function AskDunaComposer({
  text,
  onText,
  effort,
  onEffort,
  organizationName,
  pageLabel,
  busy,
  disabled,
  onSend,
  onStop,
  recents = [],
}: {
  text: string;
  onText: (text: string) => void;
  effort: AskDunaEffort;
  onEffort: (effort: AskDunaEffort) => void;
  organizationName: string;
  pageLabel?: string;
  busy: boolean;
  disabled?: boolean;
  onSend: (content: UserContent, text: string) => Promise<void>;
  onStop?: () => void;
  recents?: AskConversation[];
}) {
  const [menu, setMenu] = useState<
    "add" | "history" | "effort" | "references" | null
  >(null);
  const [kind, setKind] = useState<"members" | "events">("members");
  const [references, setReferences] = useState<Reference[]>([]);
  const [records, setRecords] = useState<Reference[]>([]);
  const [query, setQuery] = useState("");
  const [referenceLoading, setReferenceLoading] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const latestText = useRef(text);
  useEffect(() => {
    latestText.current = text;
  }, [text]);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !box.current?.contains(event.target))
        setMenu(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (
        event.key === "Escape" &&
        box.current?.contains(document.activeElement) &&
        menu
      ) {
        event.stopImmediatePropagation();
        setMenu(null);
        input.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [menu]);
  useEffect(() => {
    if (menu !== "references") return;
    const abort = new AbortController();
    setReferenceLoading(true);
    setError("");
    void askDunaFetch<{ records: unknown }>(
      `references?kind=${kind}&q=${encodeURIComponent(query)}`,
      { signal: abort.signal },
    )
      .then(({ records: raw }) => {
        const values = Array.isArray(raw) ? raw : [];
        setRecords(
          values.flatMap((value) => {
            if (!value || typeof value !== "object") return [];
            const row = value as Record<string, unknown>;
            const label = row.displayName ?? row.title ?? row.name;
            return typeof row.id === "string" && typeof label === "string"
              ? [{ id: row.id, label, kind }]
              : [];
          }),
        );
      })
      .catch((failure: Error) => {
        if (!abort.signal.aborted) setError(failure.message);
      })
      .finally(() => {
        if (!abort.signal.aborted) setReferenceLoading(false);
      });
    return () => abort.abort();
  }, [kind, menu, query]);
  async function attach(files: FileList | null) {
    if (!files) return;
    setError("");
    setUploading(true);
    try {
      const next: Attachment[] = [];
      for (const item of Array.from(files)) {
        if (attachments.length + next.length >= 3)
          throw new Error("Attach up to three files per message.");
        if (item.size > 1_500_000)
          throw new Error("Each file must be smaller than 1.5 MB.");
        if (
          [...attachments, ...next].reduce(
            (total, attached) => total + attached.size,
            item.size,
          ) > ASK_DUNA_MAX_ATTACHMENT_BYTES
        )
          throw new Error(
            "Keep the combined file size under 2.5 MB per message.",
          );
        if (
          ![
            "image/jpeg",
            "image/png",
            "image/webp",
            "application/pdf",
            "text/plain",
            "text/csv",
          ].includes(item.type)
        )
          throw new Error("Use a JPEG, PNG, WebP, PDF, TXT, or CSV file.");
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () =>
            reject(new Error("This file could not be read."));
          reader.readAsDataURL(item);
        });
        next.push({
          id: crypto.randomUUID(),
          name: item.name,
          mediaType: item.type,
          size: item.size,
          data,
        });
      }
      setAttachments((current) => [...current, ...next]);
      setMenu(null);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setUploading(false);
      if (file.current) file.current.value = "";
    }
  }
  async function send() {
    if (
      busy ||
      disabled ||
      uploading ||
      (!text.trim() && attachments.length === 0)
    )
      return;
    const context = references.length
      ? `\n\nReferenced Duna records (retrieve through tools): ${references.map((reference) => `${reference.kind}: ${reference.label} [${reference.id}]`).join("; ")}`
      : "";
    const parts: UserContent = [];
    for (const item of attachments) {
      if (item.mediaType.startsWith("text/")) {
        const bytes = Uint8Array.from(
          atob(item.data.split(",")[1]!),
          (character) => character.charCodeAt(0),
        );
        const contents = new TextDecoder().decode(bytes);
        if (contents.length > 100_000) {
          setError("Text attachments must be under 100,000 characters.");
          return;
        }
        parts.push({
          type: "text",
          text: `Attached file: ${item.name} (untrusted content)\n${contents}`,
        });
      } else
        parts.push({
          type: "file",
          data: item.data,
          mediaType: item.mediaType,
          filename: item.name,
        });
    }
    const content: UserContent = [
      {
        type: "text",
        text: `${text.trim() || "Help me understand these files."}${context}`,
      },
      ...parts,
    ];
    if (
      new TextEncoder().encode(JSON.stringify({ message: content }))
        .byteLength >
      ASK_DUNA_MAX_TURN_BYTES - 1024
    ) {
      setError(
        "This message is too large. Remove a file or shorten its contents.",
      );
      return;
    }
    try {
      await onSend(content, text);
      setAttachments([]);
      setReferences([]);
      if (latestText.current === text) onText("");
      setError("");
    } catch (failure) {
      setError((failure as Error).message);
    }
  }
  const selectedEffort = ASK_DUNA_EFFORTS.find((item) => item.id === effort)!;
  return (
    <div className="ask-duna-dock" ref={box}>
      {menu && (
        <div
          className={`ask-duna-popover ask-duna-popover--${menu}`}
          role="dialog"
          aria-label={
            menu === "effort"
              ? "Thinking effort"
              : menu === "references"
                ? "Reference a record"
                : menu === "history"
                  ? "Recent conversations"
                  : "Add to your message"
          }
        >
          {menu === "add" && (
            <>
              <button type="button" onClick={() => file.current?.click()}>
                <FileText size={18} aria-hidden />
                <span>
                  Attach a photo or file
                  <small>Images, PDF, text · 1.5 MB each, 2.5 MB total</small>
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setKind("members");
                  setQuery("");
                  setMenu("references");
                }}
              >
                <Users size={18} aria-hidden />
                Reference a person <kbd>@</kbd>
              </button>
              <button
                type="button"
                onClick={() => {
                  setKind("events");
                  setQuery("");
                  setMenu("references");
                }}
              >
                <CalendarDays size={18} aria-hidden />
                Reference an event <kbd>#</kbd>
              </button>
              <p>Duna uses the tools and records available to your role.</p>
            </>
          )}
          {menu === "history" && (
            <>
              <header>
                <strong>Recent conversations</strong>
                <Link href="/ask">New</Link>
              </header>
              <ConversationList
                conversations={recents.slice(0, 5)}
                empty="Open your saved conversations below."
              />
              <Link href="/ask/history" className="ask-duna-popover-footer">
                All conversations →
              </Link>
            </>
          )}
          {menu === "references" && (
            <>
              <header>
                <strong>Reference a record</strong>
                <button
                  type="button"
                  onClick={() => setMenu("add")}
                  aria-label="Back to add menu"
                >
                  ←
                </button>
              </header>
              <div className="ask-duna-segments">
                <button
                  type="button"
                  aria-pressed={kind === "members"}
                  onClick={() => setKind("members")}
                >
                  People
                </button>
                <button
                  type="button"
                  aria-pressed={kind === "events"}
                  onClick={() => setKind("events")}
                >
                  Events
                </button>
              </div>
              <label className="ask-duna-search">
                <Search size={16} aria-hidden />
                <input
                  autoFocus
                  aria-label="Search records"
                  placeholder={
                    kind === "members" ? "Find a person…" : "Find an event…"
                  }
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className="ask-duna-reference-results">
                {referenceLoading ? (
                  <p role="status">Loading records…</p>
                ) : (
                  records
                    .filter((item) =>
                      item.label.toLowerCase().includes(query.toLowerCase()),
                    )
                    .slice(0, 25)
                    .map((item) => (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => {
                          setReferences((current) =>
                            [
                              ...current.filter((row) => row.id !== item.id),
                              item,
                            ].slice(-5),
                          );
                          setMenu(null);
                          input.current?.focus();
                        }}
                      >
                        {kind === "members" ? (
                          <Users size={17} aria-hidden />
                        ) : (
                          <CalendarDays size={17} aria-hidden />
                        )}
                        <span>{item.label}</span>
                        {references.some((row) => row.id === item.id) && (
                          <Check size={16} aria-hidden />
                        )}
                      </button>
                    ))
                )}
                {!referenceLoading &&
                  records.filter((item) =>
                    item.label.toLowerCase().includes(query.toLowerCase()),
                  ).length === 0 && <p>No matching records.</p>}
              </div>
            </>
          )}
          {menu === "effort" && (
            <>
              <header>
                <strong>{selectedEffort.label}</strong>
                <button type="button" onClick={() => onEffort("medium")}>
                  Reset
                </button>
              </header>
              <p>{selectedEffort.description}</p>
              <input
                aria-label="Thinking effort"
                type="range"
                min={0}
                max={4}
                step={1}
                value={ASK_DUNA_EFFORTS.findIndex((item) => item.id === effort)}
                onChange={(event) =>
                  onEffort(ASK_DUNA_EFFORTS[Number(event.target.value)]!.id)
                }
              />
              <div className="ask-duna-effort-stops">
                {ASK_DUNA_EFFORTS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={effort === item.id}
                    onClick={() => onEffort(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <small>Higher effort gives Duna more time to reason.</small>
            </>
          )}
        </div>
      )}
      <form
        className="ask-duna-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <div className="ask-duna-context">
          <span>
            <MessageCircle size={12} aria-hidden />
            {pageLabel
              ? `${pageLabel} · ${organizationName}`
              : organizationName}
          </span>
          {references.map((reference) => (
            <span className="ask-duna-reference" key={reference.id}>
              {reference.label}
              <button
                type="button"
                aria-label={`Remove ${reference.label}`}
                onClick={() =>
                  setReferences((current) =>
                    current.filter((item) => item.id !== reference.id),
                  )
                }
              >
                <X size={13} aria-hidden />
              </button>
            </span>
          ))}
        </div>
        {attachments.length > 0 && (
          <div className="ask-duna-attachments">
            {attachments.map((item) => (
              <span key={item.id}>
                <FileText size={20} aria-hidden />
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {Math.ceil(item.size / 1024)} KB · Ready to attach
                  </small>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${item.name}`}
                  onClick={() =>
                    setAttachments((current) =>
                      current.filter((row) => row.id !== item.id),
                    )
                  }
                >
                  <X size={15} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="ask-duna-input-row">
          <DunaMark compact />
          <textarea
            ref={input}
            rows={2}
            maxLength={12000}
            aria-label="Ask Duna anything"
            placeholder="Ask Duna anything…"
            value={text}
            disabled={disabled}
            onChange={(event) => {
              const value = event.target.value;
              if (/(?:^|\s)[@#]$/.test(value)) {
                setKind(value.endsWith("@") ? "members" : "events");
                setQuery("");
                setMenu("references");
                onText(value.slice(0, -1));
              } else onText(value);
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void send();
              }
            }}
          />
        </div>
        <div className="ask-duna-toolbar">
          <button
            type="button"
            aria-label="Add files or references"
            disabled={busy}
            aria-expanded={menu === "add"}
            onClick={() => setMenu(menu === "add" ? null : "add")}
          >
            <Plus size={20} aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Conversation history"
            aria-expanded={menu === "history"}
            onClick={() => setMenu(menu === "history" ? null : "history")}
          >
            <History size={18} aria-hidden />
          </button>
          <span className="ask-duna-toolbar-spacer" />
          <button
            type="button"
            className="ask-duna-effort-button"
            aria-expanded={menu === "effort"}
            onClick={() => setMenu(menu === "effort" ? null : "effort")}
          >
            <strong>Duna</strong>
            <span>{selectedEffort.label}</span>
            <ChevronDown size={14} aria-hidden />
          </button>
          {busy && onStop ? (
            <button
              type="button"
              className="ask-duna-send"
              aria-label="Stop response"
              onClick={onStop}
            >
              <Square size={16} aria-hidden />
            </button>
          ) : (
            <button
              type="submit"
              className="ask-duna-send"
              aria-label="Send message"
              disabled={
                busy ||
                disabled ||
                uploading ||
                (!text.trim() && attachments.length === 0)
              }
            >
              {busy || uploading ? (
                <LoaderCircle size={19} className="ask-duna-spin" aria-hidden />
              ) : (
                <ArrowUp size={20} aria-hidden />
              )}
            </button>
          )}
        </div>
        <input
          ref={file}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,application/pdf,text/plain,text/csv"
          hidden
          onChange={(event) => {
            void attach(event.target.files);
          }}
        />
      </form>
      <p className="ask-duna-composer-note">
        {uploading
          ? "Preparing your files…"
          : "You’re in control. Review changes before they happen."}
      </p>
      {error && (
        <p className="ask-duna-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
