"use client";

/**
 * One result (`/app/matches/[id]`, boards P-Match-Awaiting, P-Match-Confirmed,
 * P-Match-Disputed): the NetScore card, its state in the app's words, who can
 * still confirm (only the other side, by name), confirm or "Something's
 * wrong" with a reason, "Ask them to confirm" as a message the person edits
 * and sends themselves, change or remove before it is confirmed, what this
 * result would do, and after confirmation the Sand Rating ring with the move.
 */
import type { MatchSummary, PersonSummary } from "@duna/core";
import { report } from "@duna/observability";
import { formatSetList } from "@duna/tideline-core";
import {
  Button,
  Card,
  ConfirmSlot,
  Dialog,
  DialogActions,
  DialogContent,
  Field,
  NetScore,
  Notice,
  RatingRing,
  Rise,
  Segmented,
  Textarea,
  successToast,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AppLink } from "@/components/app-shell/navigation";
import { unwrap } from "../action-result";
import {
  CONFIRM_OUTCOME,
  confirmationMessage,
  resultModel,
  ringProps,
  type ResultScoring,
} from "../result-copy";
import { OfflineNotice } from "../states";
import {
  answerResultAction,
  flagResultAction,
  removeResultAction,
} from "./actions";

const FLAG_REASONS = [
  { value: "wrong-score", label: "Wrong score" },
  { value: "wrong-opponents", label: "Wrong players" },
  { value: "not-me", label: "Not me" },
  { value: "duplicate", label: "Duplicate" },
  { value: "other", label: "Other" },
] as const;

type FlagReason = (typeof FLAG_REASONS)[number]["value"];

function percent(value: number | undefined): string | undefined {
  return typeof value === "number" ? `${Math.round(value * 100)}%` : undefined;
}

function ratingText(person: PersonSummary): string {
  return person.rating.confidence === "Provisional"
    ? "—"
    : person.rating.display.toFixed(2);
}

export interface MatchViewProps {
  readonly match: MatchSummary;
  readonly scoring?: ResultScoring;
  readonly me: PersonSummary;
  readonly viewerId: string;
  /** The address the other side opens to confirm. */
  readonly origin: string;
  readonly timeZone: string;
}

export function MatchView({
  match,
  scoring,
  me,
  viewerId,
  origin,
  timeZone,
}: MatchViewProps) {
  const router = useRouter();
  const confirm = useConfirm();
  const inline = useConfirm({ presentation: "inline" });
  const [sheet, setSheet] = useState<"ask" | "dispute" | "flag" | null>(null);
  const [reason, setReason] = useState("");
  const [flagReason, setFlagReason] = useState<FlagReason>("wrong-score");
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [justMoved, setJustMoved] = useState(false);
  const model = useMemo(
    () =>
      resultModel({ summary: match, scoring, myId: viewerId, now: new Date() }),
    [match, scoring, viewerId],
  );
  const link = model.shareUrl ?? `${origin}/matches/${match.id}`;
  const when = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  }).format(new Date(match.playedAt));
  const ring = ringProps({
    rating: me.rating,
    ...(model.rating?.after !== undefined ? { after: model.rating.after } : {}),
    ...(model.rating ? { delta: model.rating.delta } : {}),
  });
  const live = match.recordingMode === "live" && scoring?.status === "live";

  const confirmResult = () =>
    void confirm
      .run({
        tier: "confirm",
        title: "Confirm this result?",
        description: `${model.names.home} v ${model.names.away}: ${formatSetList(model.net.rows)}. Once both sides confirm, it counts toward Sand Ratings.`,
        verb: "Confirm result",
        cancelLabel: "Not yet",
        agentConfirm: `Confirms the ${model.names.home} v ${model.names.away} result`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await answerResultAction({
              matchId: match.id,
              decision: "confirmed",
              idempotencyKey,
            }),
          ),
        success: (result) =>
          result.status === "verified"
            ? CONFIRM_OUTCOME.verified
            : CONFIRM_OUTCOME.waiting,
        report: (error) => report(error, { event: "web.match.confirm_failed" }),
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          setJustMoved(outcome.result.ratingApplied);
          router.refresh();
        }
      });

  const sendDispute = () =>
    void inline
      .run({
        tier: "confirm",
        title: "Send this to the other side?",
        description:
          "The result stays out of everyone’s Sand Rating until you agree.",
        verb: "Send",
        cancelLabel: "Not yet",
        agentConfirm: `Disputes the ${model.names.home} v ${model.names.away} result`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await answerResultAction({
              matchId: match.id,
              decision: "disputed",
              reason,
              idempotencyKey,
            }),
          ),
        success: CONFIRM_OUTCOME.disputed,
        report: (error) => report(error, { event: "web.match.dispute_failed" }),
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          setSheet(null);
          router.refresh();
        }
      });

  const sendFlag = () =>
    void inline
      .run({
        tier: "confirm",
        title: "Send this to Duna?",
        description:
          "Duna reviews it. While it does, the result doesn’t count toward a Sand Rating.",
        verb: "Send to Duna",
        cancelLabel: "Not yet",
        agentConfirm: "Flags this result to Duna for review",
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await flagResultAction({
              matchId: match.id,
              reasonCode: flagReason,
              details: reason,
              idempotencyKey,
            }),
          ),
        success: CONFIRM_OUTCOME.flagged,
        report: (error) => report(error, { event: "web.match.flag_failed" }),
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          setSheet(null);
          router.refresh();
        }
      });

  const remove = (andChange: boolean) =>
    void confirm
      .run({
        tier: "confirm",
        destructive: true,
        title: andChange ? "Change this result?" : "Remove this result?",
        description: andChange
          ? "It is removed and opened to change. Everyone is asked to confirm the new one."
          : "It is removed from everyone’s history. This can’t be undone.",
        verb: andChange ? "Change it" : "Remove result",
        cancelLabel: "Keep it",
        agentConfirm: andChange
          ? "Removes this result so it can be added again"
          : "Removes this result from everyone's history",
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await removeResultAction({ matchId: match.id, idempotencyKey }),
          ),
        success: andChange ? "Removed. Add it again below." : "Result removed",
        report: (error) => report(error, { event: "web.match.remove_failed" }),
      })
      .then((outcome) => {
        if (outcome.status !== "done") return;
        if (andChange) {
          const params = new URLSearchParams({
            sets: match.score.map(([a, b]) => `${a}-${b}`).join(","),
            ...(match.matchType ? { type: match.matchType } : {}),
          });
          router.push(`/app/score?${params.toString()}`);
        } else {
          router.push("/app/matches");
        }
      });

  const share = async () => {
    const text = `${model.title} ${formatSetList(model.net.rows)} · ${match.venueName} ${link}`;
    if (typeof navigator.share === "function") {
      await navigator.share({ text }).catch(() => undefined);
      return;
    }
    await navigator.clipboard?.writeText(text).catch(() => undefined);
    successToast("Result copied");
  };

  return (
    <>
      <OfflineNotice />
      <p className="pp-back">
        <AppLink href="/app/matches">Results</AppLink>
      </p>
      <header className="pp-head">
        <div className="pp-head__text">
          <p className="pp-eyebrow">{when}</p>
          <h1 className="td-display pp-title">{model.title}</h1>
          <p className="td-meta" data-state={model.state}>
            {model.line}
          </p>
        </div>
      </header>

      <div className="pp-match">
        <div className="pp-match__main">
          <Rise>
            <NetScore
              announce={live}
              court={match.venueName}
              layout="net"
              sets={match.score}
              status={
                live ? "live" : (scoring?.status ?? match.status ?? "complete")
              }
              teams={[
                { players: match.teamA.map((person) => person.displayName) },
                { players: match.teamB.map((person) => person.displayName) },
              ]}
              winner={match.winner === "A" ? "home" : "away"}
            />
          </Rise>

          {live ? (
            <div className="pp-row-actions">
              <Button href={`/live/${match.id}`} variant="primary">
                Watch it live
              </Button>
              <Button
                href={`/app/score/live?match=${match.id}`}
                variant="secondary"
              >
                Keep score
              </Button>
            </div>
          ) : null}

          {model.state === "awaiting" && model.needsMe ? (
            <div className="pp-stack">
              <Notice title={model.waiting ?? undefined} tone="warning">
                Is this right? Sand Ratings move once your side confirms.
              </Notice>
              <div className="pp-row-actions">
                <Button onClick={confirmResult} variant="primary">
                  Confirm result
                </Button>
                <Button
                  onClick={() => {
                    setReason("");
                    setSheet("dispute");
                  }}
                  variant="secondary"
                >
                  Something’s wrong
                </Button>
              </div>
            </div>
          ) : null}

          {model.state === "awaiting" && !model.needsMe ? (
            <div className="pp-stack">
              {model.waitingFor === "them" && model.waiting ? (
                <Notice title={model.waiting} tone="warning">
                  Sand Ratings stay as they are until one of them confirms.
                  {model.confirmers.length > 0
                    ? ` Only ${model.confirmers.join(" or ")} can confirm it.`
                    : ""}
                </Notice>
              ) : null}
              {model.waitingFor === "no-profile" && model.waiting ? (
                <Notice title={model.waiting} tone="warning">
                  Share the claim link: once one of them joins Duna they can
                  confirm it.
                </Notice>
              ) : null}
              {model.waitingFor === null && model.mySide ? (
                <Notice tone="warning" title="Waiting on the other side">
                  Only someone on the other side can confirm it.
                </Notice>
              ) : null}
              {model.pendingClaims.length > 0 ? (
                <Notice title="Played with someone not on Duna?" tone="info">
                  {`Share the claim link. ${model.pendingClaims.join(", ")} keep${model.pendingClaims.length === 1 ? "s" : ""} a place until they join and confirm.`}
                </Notice>
              ) : null}
              {model.mySide ? (
                <div className="pp-row-actions">
                  <Button
                    onClick={() => {
                      setMessage(
                        confirmationMessage({
                          opponents: model.opponents,
                          link,
                        }),
                      );
                      setCopied(false);
                      setSheet("ask");
                    }}
                    variant="primary"
                  >
                    Ask them to confirm
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {model.state === "expired" ? (
            <Notice title="Claim links expired" tone="warning">
              {model.line}
            </Notice>
          ) : null}
          {model.state === "disputed" ? (
            <Notice title="Disputed" tone="danger">
              {match.dispute
                ? "Someone on court sees this result differently. It doesn’t count until you agree."
                : model.line}
            </Notice>
          ) : null}

          {model.rating ? (
            <Rise>
              <Card className="pp-rating">
                <RatingRing
                  animate
                  label="Sand Rating"
                  reliability={ring.reliability}
                  size="card"
                  value={ring.value}
                  {...(ring.delta !== undefined ? { delta: ring.delta } : {})}
                />
                <div className="pp-rating__text">
                  <h2 className="pp-h2">Sand Rating</h2>
                  <p className="td-meta">
                    {justMoved
                      ? "Moved with this match."
                      : "What this match did to your Sand Rating."}
                  </p>
                  {model.rating.before !== undefined &&
                  model.rating.after !== undefined &&
                  ring.value !== null ? (
                    <p className="pp-move td-num">
                      {model.rating.before.toFixed(2)} →{" "}
                      {model.rating.after.toFixed(2)}
                    </p>
                  ) : null}
                </div>
              </Card>
            </Rise>
          ) : model.state !== "history" ? (
            <Card className="pp-would">
              <p className="pp-eyebrow">What this result would do</p>
              <p>{model.whatItWouldDo}</p>
            </Card>
          ) : null}

          {match.ratingExplanation && model.state === "confirmed" ? (
            <section aria-labelledby="pp-why" className="pp-section">
              <h2 className="pp-h2" id="pp-why">
                Why it moved
              </h2>
              <dl className="pp-facts">
                <div>
                  <dt>Pre-match chance</dt>
                  <dd className="td-num">
                    {percent(match.ratingExplanation.expectedWinProbability) ??
                      "Not available"}
                  </dd>
                </div>
                <div>
                  <dt>Point share</dt>
                  <dd className="td-num">
                    {percent(match.ratingExplanation.pointShare) ??
                      "Not available"}
                  </dd>
                </div>
                <div>
                  <dt>Your weighting</dt>
                  <dd className="td-num">
                    {percent(match.ratingExplanation.responsibilityWeight) ??
                      "Not available"}
                  </dd>
                </div>
              </dl>
            </section>
          ) : null}
        </div>

        <aside className="pp-match__side">
          <section aria-labelledby="pp-players" className="pp-section">
            <h2 className="pp-h2" id="pp-players">
              Players
            </h2>
            {(
              [
                ["A", match.teamA],
                ["B", match.teamB],
              ] as const
            ).map(([side, people]) => (
              <div className="pp-stack" key={side}>
                <p className="pp-label">
                  {model.mySide === null
                    ? `Team ${side}`
                    : side === model.mySide
                      ? "Your side"
                      : "The other side"}
                </p>
                <ul className="pp-team">
                  {people.map((person) => (
                    <li className="pp-team__row" key={person.id}>
                      <span>
                        {person.displayName}
                        {person.id === viewerId ? " (you)" : ""}
                      </span>
                      <span className="td-num td-meta">
                        {ratingText(person)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <p className="td-meta">
              {[
                match.eventName,
                match.roundLabel,
                match.formatSummary,
                match.venueName,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </section>

          <ul className="pp-links">
            {model.state === "confirmed" ? (
              <li>
                <button
                  className="pp-linkrow"
                  onClick={() => void share()}
                  type="button"
                >
                  <span>Share the result</span>
                  <span className="td-meta">Through your apps</span>
                </button>
              </li>
            ) : null}
            <li>
              <a className="pp-linkrow" href={`/matches/${match.id}`}>
                <span>Match details</span>
                <span className="td-meta">
                  Film, private notes and the conversation
                </span>
              </a>
            </li>
            {model.canRemove && model.state !== "confirmed" ? (
              <>
                <li>
                  <button
                    className="pp-linkrow"
                    onClick={() => remove(true)}
                    type="button"
                  >
                    <span>Change this result</span>
                    <span className="td-meta">
                      Change the score or the players
                    </span>
                  </button>
                </li>
                <li>
                  <button
                    className="pp-linkrow"
                    onClick={() => remove(false)}
                    type="button"
                  >
                    <span>Remove this result</span>
                    <span className="td-meta">Only before it is confirmed</span>
                  </button>
                </li>
              </>
            ) : null}
            {model.state === "confirmed" && model.mySide ? (
              <li>
                <button
                  className="pp-linkrow"
                  onClick={() => {
                    setReason("");
                    setSheet("flag");
                  }}
                  type="button"
                >
                  <span>Something wrong with this result?</span>
                  <span className="td-meta">Tell Duna what is wrong</span>
                </button>
              </li>
            ) : null}
            {match.sourceUrl ? (
              <li>
                <a
                  className="pp-linkrow"
                  href={match.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span>Official source</span>
                  <span className="td-meta">Opens the organiser’s results</span>
                </a>
              </li>
            ) : null}
          </ul>
        </aside>
      </div>

      <Dialog
        onOpenChange={(open) => {
          if (!open) setSheet(null);
        }}
        open={sheet !== null}
        {...inline.hostProps}
      >
        <DialogContent
          description={
            sheet === "ask"
              ? "Read it, change it if you like, then copy it or share it yourself. Duna doesn’t send anything for you."
              : sheet === "dispute"
                ? "Say what the score should be. The result won’t count toward anyone’s Sand Rating until you agree."
                : "Duna reviews results people tell us are wrong."
          }
          title={
            sheet === "ask"
              ? "Your message"
              : sheet === "dispute"
                ? "What’s wrong?"
                : "Tell Duna"
          }
        >
          <ConfirmSlot confirm={inline}>
            {sheet === "ask" ? (
              <div className="pp-stack">
                <Field label="Message">
                  <Textarea
                    onChange={(event) => setMessage(event.currentTarget.value)}
                    rows={4}
                    value={message}
                  />
                </Field>
                <p aria-live="polite" className="td-meta">
                  {copied
                    ? "Message copied. Paste it wherever you talk to them."
                    : ""}
                </p>
                <DialogActions>
                  {typeof navigator !== "undefined" &&
                  typeof navigator.share === "function" ? (
                    <Button
                      disabled={!message.trim()}
                      onClick={() =>
                        void navigator
                          .share({ text: message.trim() })
                          .then(() => setSheet(null))
                          .catch(() => undefined)
                      }
                      variant="secondary"
                    >
                      Choose how to send
                    </Button>
                  ) : null}
                  <Button
                    disabled={!message.trim()}
                    onClick={() =>
                      void navigator.clipboard
                        ?.writeText(message.trim())
                        .then(() => setCopied(true))
                        .catch(() => setCopied(false))
                    }
                    variant="primary"
                  >
                    Copy message
                  </Button>
                </DialogActions>
              </div>
            ) : null}
            {sheet === "dispute" ? (
              <div className="pp-stack">
                <Field
                  error={
                    reason.trim().length > 0 && reason.trim().length < 5
                      ? "A few more words, please."
                      : undefined
                  }
                  label="What happened"
                >
                  <Textarea
                    onChange={(event) => setReason(event.currentTarget.value)}
                    placeholder="Set 3 ended 15–13."
                    rows={3}
                    value={reason}
                  />
                </Field>
                <DialogActions>
                  <Button
                    disabled={reason.trim().length < 5}
                    onClick={sendDispute}
                    variant="primary"
                  >
                    Send to the other side
                  </Button>
                </DialogActions>
              </div>
            ) : null}
            {sheet === "flag" ? (
              <div className="pp-stack">
                <p className="pp-label" id="pp-flag-reason">
                  What is wrong
                </p>
                <Segmented
                  aria-labelledby="pp-flag-reason"
                  onValueChange={(value) =>
                    value && setFlagReason(value as FlagReason)
                  }
                  options={FLAG_REASONS}
                  value={flagReason}
                />
                <Field label="Anything else" optional>
                  <Textarea
                    onChange={(event) => setReason(event.currentTarget.value)}
                    rows={3}
                    value={reason}
                  />
                </Field>
                <DialogActions>
                  <Button onClick={sendFlag} variant="primary">
                    Tell Duna
                  </Button>
                </DialogActions>
              </div>
            ) : null}
          </ConfirmSlot>
        </DialogContent>
      </Dialog>
      {confirm.dialog}
    </>
  );
}
