"use client";

import { report } from "@duna/observability";
import {
  Button,
  Card,
  CrestMark,
  ErrorState,
  NotConfigured,
  Sheet,
  SheetContent,
  Spinner,
  Textarea,
} from "@duna/ui/tideline";
import { useEffect, useState, type FormEvent } from "react";

/** What `/api/duna-ai` answers (the Player and Pro surface). */
interface AskCard {
  readonly kind: string;
  readonly title: string;
  readonly detail: string;
  readonly href?: string;
}

interface AskResponse {
  readonly reply?: string;
  readonly cards?: readonly AskCard[];
  readonly suggestions?: readonly string[];
  readonly providerAvailable?: boolean;
  readonly error?: string;
}

interface Turn {
  readonly role: "user" | "assistant";
  readonly body: string;
  readonly cards?: readonly AskCard[];
}

/** Starters from the Player app's Ask Duna, in the same words. */
export const askDunaStarters = [
  "Find a game that fits my level this week",
  "What should I know before my next booking?",
  "Why did my rating move?",
] as const;

function clientContext(pathname: string) {
  return {
    pathname,
    pageTitle: document.title.slice(0, 160),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: navigator.language,
    localTime: new Date().toISOString(),
  };
}

/**
 * Ask Duna for players: the existing Player path (`POST /api/duna-ai`,
 * surface "player") in a sheet from the right. Duna reads and proposes;
 * anything that would change something links to the page where the person
 * confirms it. Signed out, not configured and failed requests each say so.
 */
export function AskDunaSheet({
  open,
  onOpenChange,
  pathname,
  request,
  onRequestHandled,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly pathname: string;
  /** A question to send as soon as the sheet opens (from a page or the palette). */
  readonly request?: { readonly id: number; readonly prompt: string };
  readonly onRequestHandled: (id: number) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  async function send(message: string) {
    const text = message.trim();
    if (!text || pending) return;
    setPending(true);
    setFailure(null);
    const history = turns
      .slice(-10)
      .map((turn) => ({ role: turn.role, body: turn.body.slice(0, 2_000) }));
    setTurns((current) => [...current, { role: "user", body: text }]);
    setDraft("");
    try {
      const response = await fetch("/api/duna-ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "ask",
          message: text.slice(0, 2_000),
          surface: "player",
          page: pathname,
          context: clientContext(pathname),
          history,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as AskResponse;
      if (!response.ok || body.error) {
        throw new Error(body.error ?? `Ask Duna answered ${response.status}`);
      }
      if (body.providerAvailable === false) setUnavailable(true);
      setTurns((current) => [
        ...current,
        {
          role: "assistant",
          body: body.reply ?? "",
          ...(body.cards?.length ? { cards: body.cards } : {}),
        },
      ]);
    } catch (error) {
      setFailure(report(error, { event: "web.app_shell.ask_duna_failed" }));
      // Put the question back so the person can send it again.
      setTurns((current) => current.slice(0, -1));
      setDraft(text);
    } finally {
      setPending(false);
    }
  }

  // A question handed over by a page or the palette is sent once.
  useEffect(() => {
    if (!open || !request) return;
    onRequestHandled(request.id);
    void send(request.prompt);
  }, [open, request]);

  function submit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  return (
    <Sheet onOpenChange={onOpenChange} open={open} side="right">
      <SheetContent
        className="aps-ask"
        description="Ask about your games, bookings and clubs. Duna suggests; you confirm anything that changes."
        title={
          <span className="aps-ask__title">
            <CrestMark className="aps-ask__mark" micro />
            Ask Duna
          </span>
        }
      >
        <div aria-live="polite" className="aps-ask__thread">
          {turns.length === 0 && !failure ? (
            <div className="aps-ask__starters">
              <p className="td-meta">Try one of these</p>
              {askDunaStarters.map((starter) => (
                <Button
                  block
                  key={starter}
                  onClick={() => void send(starter)}
                  size="sm"
                  variant="secondary"
                >
                  {starter}
                </Button>
              ))}
            </div>
          ) : null}
          {turns.map((turn, index) => (
            <div className="aps-ask__turn" data-role={turn.role} key={index}>
              <p className="aps-ask__bubble">{turn.body}</p>
              {turn.cards?.map((card) =>
                card.href ? (
                  <Card compact href={card.href} key={card.title}>
                    <strong>{card.title}</strong>
                    <span className="td-meta">{card.detail}</span>
                  </Card>
                ) : (
                  <Card compact key={card.title}>
                    <strong>{card.title}</strong>
                    <span className="td-meta">{card.detail}</span>
                  </Card>
                ),
              )}
            </div>
          ))}
          {pending ? (
            <p className="aps-ask__pending td-meta">
              <Spinner size="sm" /> Duna is thinking…
            </p>
          ) : null}
          {unavailable ? (
            <NotConfigured
              compact
              feature="Ask Duna's answers"
              needs="The AI service for Duna isn't switched on for this site yet."
            />
          ) : null}
          {failure ? (
            <ErrorState
              message="Your question wasn't sent. Try again."
              onRetry={() => void send(draft)}
              reference={failure}
              title="Ask Duna didn't answer"
            />
          ) : null}
        </div>
        <form className="aps-ask__composer" onSubmit={submit}>
          <label className="td-sr" htmlFor="aps-ask-input">
            Ask Duna
          </label>
          <Textarea
            className="aps-ask__input"
            id="aps-ask-input"
            maxLength={2_000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(draft);
              }
            }}
            placeholder="Ask about your games, bookings and clubs"
            rows={2}
            value={draft}
          />
          <Button
            disabled={!draft.trim()}
            loading={pending}
            type="submit"
            variant="primary"
          >
            Send
          </Button>
        </form>
        <p className="td-meta aps-ask__foot">
          Duna never books, pays or sends for you.{" "}
          <a href="/app/settings#privacy">Your privacy settings</a>
        </p>
      </SheetContent>
    </Sheet>
  );
}
