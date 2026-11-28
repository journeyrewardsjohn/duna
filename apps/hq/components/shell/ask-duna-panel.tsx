"use client";

import type { AskDunaEffort } from "@duna/api/ask-duna-contracts";
import { hqHref } from "@duna/core/hq-routes";
import { DunaMark } from "@duna/ui";
import { Icon } from "@duna/ui/icons";
import {
  Button,
  Chip,
  IconButton,
  NotConfigured,
  riseClassName,
  useConfirm,
} from "@duna/ui/tideline";
import type { UserContent } from "ai";
import { AccessDeniedState } from "@/lib/access-state";
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
} from "../ask-duna-client";
import { AskDunaComposer, AskDunaThread } from "../ask-duna-workspace";
import { AskDunaProposal } from "./ask-duna-proposal";
import type { ShellSession } from "./session-types";

export interface AskRequest {
  readonly id: number;
  readonly prompt?: string;
}

/** Prompts offered on every page when the page names none of its own. */
export const defaultAskStarters = [
  "What needs my attention today?",
  "What is missing from our club setup?",
  "How is the business doing this week?",
] as const;

function AskUnavailable({ session }: { readonly session: ShellSession }) {
  switch (session.askDuna) {
    case "demo":
      return (
        <NotConfigured
          compact
          feature="Ask Duna"
          needs="a signed-in club account, and this is demo data"
          owner="the club's owner"
        />
      );
    case "not-configured":
      return (
        <NotConfigured
          canSetUp={session.roles.includes("super-admin")}
          compact
          feature="Ask Duna"
          needs="the Duna AI service"
          owner="Duna support"
          setup={
            <Button href={hqHref("adminAskDuna")} size="sm" variant="secondary">
              Open Ask Duna settings
            </Button>
          }
        />
      );
    case "no-access":
      return (
        <AccessDeniedState
          area="Ask Duna"
          compact
          grantedBy="an owner of this club"
        />
      );
    default:
      return (
        <div className="hqs-ask__signin">
          <p className="td-body">Sign in to ask Duna about your club.</p>
          <Button href="/sign-in" size="sm" variant="primary">
            Sign in
          </Button>
        </div>
      );
  }
}

/**
 * Ask Duna, docked on the right of the shell (Tideline 4.1.1 `AskDunaButton`
 * panel; replaces the floating bubble). It reuses the existing conversation
 * and review logic (`AskDunaThread`, `AskDunaComposer`): Duna proposes, a
 * person approves every change. Stays mounted while closed, so a draft or a
 * running answer survives closing it and moving between pages.
 */
export function AskDunaPanel({
  session,
  open,
  pathname,
  pageLabel,
  starters,
  request,
  onRequestHandled,
  onClose,
}: {
  readonly session: ShellSession;
  readonly open: boolean;
  readonly pathname: string;
  readonly pageLabel: string;
  readonly starters: readonly string[];
  readonly request?: AskRequest;
  readonly onRequestHandled: (id: number) => void;
  readonly onClose: () => void;
}) {
  const ready = session.askDuna === "ready";
  const organizationName = session.organization?.name ?? "your club";
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
  const creatingRef = useRef(false);
  const handled = useRef<number | null>(null);
  const panel = useRef<HTMLElement>(null);
  const confirm = useConfirm();

  const refresh = useCallback(() => {
    // Never ask the server when Ask Duna cannot run: no failing request.
    if (!ready) return;
    void askDunaFetch<{ conversations: AskConversation[] }>("conversations")
      .then((result) => setRecents(result.conversations))
      .catch(() => {});
  }, [ready]);
  useEffect(() => {
    if (!open) return;
    refresh();
    window.addEventListener("ask-duna:history", refresh);
    return () => window.removeEventListener("ask-duna:history", refresh);
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const target =
      panel.current?.querySelector<HTMLElement>("textarea:not([disabled])") ??
      panel.current?.querySelector<HTMLElement>(
        'button[aria-label="Close Ask Duna"]',
      );
    target?.focus({ preventScroll: true });
  }, [open, conversation?.id]);

  async function start(message: UserContent, title: string) {
    if (creatingRef.current || !ready) return;
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

  const receive = useEffectEvent((incoming: AskRequest) => {
    if (!incoming.prompt || !ready) return;
    if (busy || creatingRef.current) {
      setError(
        "Finish or stop the current answer before starting another task.",
      );
      return;
    }
    setConversation(null);
    setInitialMessage(null);
    setText(incoming.prompt);
    void start(
      [{ type: "text", text: incoming.prompt }],
      incoming.prompt,
    ).catch(() => {});
  });
  useEffect(() => {
    if (!request || request.id === handled.current) return;
    handled.current = request.id;
    receive(request);
    onRequestHandled(request.id);
  }, [request, onRequestHandled]);

  return (
    <aside
      aria-label="Ask Duna"
      className={riseClassName({ from: "end" }, "hqs-ask")}
      data-open={open || undefined}
      hidden={!open}
      id="hqs-ask"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // A menu, popover or confirmation inside answers Escape first.
        const target = event.target as HTMLElement;
        if (
          target.closest('[role="dialog"], [role="menu"], [role="listbox"]') ||
          document.querySelector('[role="alertdialog"]')
        ) {
          return;
        }
        event.stopPropagation();
        onClose();
      }}
      ref={panel}
    >
      <header className="hqs-ask__head">
        <DunaMark className="hqs-ask__mark" decorative size={20} />
        <h2 className="hqs-ask__title">Ask Duna</h2>
        <div className="hqs-ask__tools">
          {conversation ? (
            <IconButton
              disabled={busy || creating}
              label="New conversation"
              onClick={() => {
                setConversation(null);
                setInitialMessage(null);
                setText("");
                setError("");
              }}
              size="sm"
            >
              <Icon name="plus" size="inline" />
            </IconButton>
          ) : null}
          {ready ? (
            <a
              aria-label={
                conversation
                  ? "Open this conversation full screen"
                  : "All conversations"
              }
              className="td-iconbtn td-iconbtn--sm"
              href={hqHref("ask", {
                conversation: conversation ? conversation.id : "history",
              })}
            >
              <Icon name="layout" size="inline" />
            </a>
          ) : null}
          <IconButton label="Close Ask Duna" onClick={onClose} size="sm">
            <Icon name="close" size="inline" />
          </IconButton>
        </div>
      </header>
      <p className="hqs-ask__context">
        <span className="td-meta">About this page</span>
        <Chip kind="taxonomy">{pageLabel}</Chip>
      </p>
      <div className="hqs-ask__body">
        {!ready ? (
          <AskUnavailable session={session} />
        ) : conversation ? (
          <AskDunaThread
            conversation={conversation}
            floating
            initialMessage={initialMessage}
            key={conversation.id}
            onBusy={setBusy}
            onChanged={notifyAskDunaHistory}
            organizationName={organizationName}
            pageContext={pathname}
            pageLabel={pageLabel}
            recents={recents}
            renderAction={(action, controls) => (
              <AskDunaProposal
                action={action}
                confirm={confirm}
                controls={controls}
              />
            )}
            visible={open}
          />
        ) : (
          <div className="hqs-ask__new">
            <ul aria-label="Suggested questions" className="hqs-ask__starters">
              {starters.map((starter) => (
                <li key={starter}>
                  <button
                    className="hqs-ask__starter"
                    disabled={creating}
                    onClick={() =>
                      void start(
                        [{ type: "text", text: starter }],
                        starter,
                      ).catch(() => {})
                    }
                    type="button"
                  >
                    <Icon name="find" size="inline" />
                    <span>{starter}</span>
                  </button>
                </li>
              ))}
            </ul>
            <div className="ask-duna">
              <AskDunaComposer
                busy={creating}
                effort={effort}
                onEffort={setEffort}
                onSend={start}
                onText={setText}
                organizationName={organizationName}
                pageLabel={pageLabel}
                recents={recents}
                text={text}
              />
            </div>
          </div>
        )}
        {!ready ? (
          <ul aria-label="What you can ask" className="hqs-ask__starters">
            {starters.map((starter) => (
              <li key={starter}>
                <span className="hqs-ask__starter" data-disabled>
                  <Icon name="find" size="inline" />
                  <span>{starter}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        {error ? (
          <p className="hqs-ask__error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <p className="hqs-ask__foot td-meta">
        Duna proposes. You approve every change.
      </p>
      {confirm.dialog}
    </aside>
  );
}
