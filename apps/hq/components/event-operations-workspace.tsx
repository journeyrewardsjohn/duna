"use client";

import type { OperatorSessionDetail, OperatorWorkspace } from "@duna/api";
import { formatMoney, formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CalendarX2,
  Check,
  CircleAlert,
  CloudSun,
  Coins,
  Eye,
  FileLock2,
  FileText,
  Mail,
  MapPin,
  MessageCircle,
  Mic,
  Pencil,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  UserCheck,
  UserRoundX,
  UsersRound,
  Trophy,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import {
  cancelCalendarSessionAction,
  createSessionNoteAction,
  publishSessionNoteAction,
  recordSessionAttendanceAction,
  refundEventRegistrationAction,
  setTeamSelectionAction,
  type OperatorActionState,
  updateEventSessionAction,
} from "@/app/actions";
import { SessionNoteRecorder } from "./session-note-recorder";

const initialState: OperatorActionState = { status: "idle", message: "" };

function ActionNotice({ state }: { readonly state: OperatorActionState }) {
  if (state.status === "idle") return null;
  return (
    <p
      className={`operator-action-notice operator-action-notice--${state.status}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.status === "success" ? (
        <Check aria-hidden size={15} />
      ) : (
        <CircleAlert aria-hidden size={15} />
      )}
      {state.message}
    </p>
  );
}

function AttendanceControl({
  attendee,
}: {
  readonly attendee: OperatorSessionDetail["attendees"][number];
}) {
  const [state, action, pending] = useActionState(
    recordSessionAttendanceAction,
    initialState,
  );
  return (
    <form action={action} className="event-attendance-control">
      <input name="registrationId" type="hidden" value={attendee.id} />
      <button
        className={
          attendee.attendanceStatus === "attended" ? "active" : undefined
        }
        disabled={pending}
        name="status"
        title="Mark attended"
        type="submit"
        value="attended"
      >
        <UserCheck aria-hidden size={15} /> Attended
      </button>
      <button
        className={
          attendee.attendanceStatus === "no-show" ? "active danger" : undefined
        }
        disabled={pending}
        name="status"
        title="Mark no-show"
        type="submit"
        value="no-show"
      >
        <UserRoundX aria-hidden size={15} /> No-show
      </button>
      {state.status !== "idle" && (
        <small data-state={state.status}>{state.message}</small>
      )}
    </form>
  );
}

function PublishNoteControl({ noteId }: { readonly noteId: string }) {
  const [state, action, pending] = useActionState(
    publishSessionNoteAction,
    initialState,
  );
  return (
    <form action={action} className="event-note-publish">
      <input name="noteId" type="hidden" value={noteId} />
      <input name="confirmed" type="hidden" value="true" />
      <button disabled={pending} type="submit">
        {pending ? "Sharing…" : "Review complete · share"}
        <ArrowRight aria-hidden size={14} />
      </button>
      {state.status !== "idle" && (
        <small data-state={state.status}>{state.message}</small>
      )}
    </form>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function arrivalDistance(meters: number): string {
  if (meters < 160) return "At the venue";
  const miles = meters / 1609.344;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi away`;
}

function arrivalEta(seconds: number, status: string): string {
  if (status === "arrived") return "Here";
  return `${Math.max(1, Math.ceil(seconds / 60))} min`;
}

function venueLocalInput(instant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function EventManagementControls({
  detail,
}: {
  readonly detail: OperatorSessionDetail;
}) {
  const [editState, editAction, editPending] = useActionState(
    updateEventSessionAction,
    initialState,
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelCalendarSessionAction,
    initialState,
  );
  const session = detail.session;
  const preview = detail.cancellationPreview;
  const canChange =
    session.status !== "cancelled" && session.status !== "completed";
  const canRetryRefunds =
    session.status === "cancelled" &&
    detail.operations.refundStatus === "attention";
  if (!canChange && !canRetryRefunds) return null;
  return (
    <div className="event-management-controls">
      {canChange && (
        <details>
          <summary className="hq-button hq-button--secondary">
            <Pencil aria-hidden size={16} /> Edit event
          </summary>
          <form action={editAction} className="event-management-panel">
            <header>
              <span>
                <small>Event operations</small>
                <strong>Edit live event details</strong>
              </span>
            </header>
            <input name="sessionId" type="hidden" value={session.id} />
            <input name="confirmed" type="hidden" value="true" />
            <label>
              <span>Event name</span>
              <input defaultValue={session.title} name="title" required />
            </label>
            <div className="event-management-panel__grid">
              <label>
                <span>Starts</span>
                <input
                  defaultValue={venueLocalInput(
                    session.startsAt,
                    session.timezone,
                  )}
                  name="localStartsAt"
                  required
                  type="datetime-local"
                />
              </label>
              <label>
                <span>Ends</span>
                <input
                  defaultValue={venueLocalInput(
                    session.endsAt,
                    session.timezone,
                  )}
                  name="localEndsAt"
                  required
                  type="datetime-local"
                />
              </label>
              <label>
                <span>Registration closes</span>
                <input
                  defaultValue={
                    session.registrationClosesAt
                      ? venueLocalInput(
                          session.registrationClosesAt,
                          session.timezone,
                        )
                      : undefined
                  }
                  name="localRegistrationClosesAt"
                  type="datetime-local"
                />
              </label>
              <label>
                <span>Player capacity</span>
                <input
                  defaultValue={session.capacity}
                  min={1}
                  name="capacity"
                  required
                  type="number"
                />
              </label>
            </div>
            <label>
              <span>Timezone</span>
              <input defaultValue={session.timezone} name="timezone" required />
            </label>
            <label>
              <span>Reason for the change</span>
              <input
                defaultValue="Updated by the event organizer."
                name="reason"
                required
              />
            </label>
            <ActionNotice state={editState} />
            <button
              className="hq-button hq-button--primary"
              disabled={editPending}
              type="submit"
            >
              {editPending ? "Saving…" : "Save event changes"}
            </button>
          </form>
        </details>
      )}
      <details>
        <summary className="hq-button hq-button--danger">
          <CalendarX2 aria-hidden size={16} />{" "}
          {canRetryRefunds ? "Retry refunds" : "Cancel event"}
        </summary>
        <form
          action={cancelAction}
          className="event-management-panel event-management-panel--danger"
        >
          <header>
            <span>
              <small>Cancellation preview</small>
              <strong>
                {canRetryRefunds
                  ? "Only outstanding refunds will be retried"
                  : "This action includes every eligible refund"}
              </strong>
            </span>
          </header>
          <input name="sessionId" type="hidden" value={session.id} />
          <div className="event-cancellation-preview">
            <span>
              <strong>{preview.registrationCount}</strong>
              <small>registrations affected</small>
            </span>
            <span>
              <strong>
                {formatMoney(preview.cashRefundMinor, preview.currency)}
              </strong>
              <small>
                {canRetryRefunds
                  ? "cash still awaiting Stripe"
                  : "cash submitted to Stripe"}
              </small>
            </span>
            <span>
              <strong>{preview.creditsToRestore}</strong>
              <small>organization credits restored</small>
            </span>
          </div>
          <p>
            Successful refunds are never repeated. Destination transfers and
            application fees are reversed with each Stripe refund. Credit
            redemptions return to their original wallet grants and the ledger
            receives matching reversal journals.
          </p>
          <label>
            <span>Reason players will receive</span>
            <textarea
              defaultValue={
                canRetryRefunds
                  ? "Retry outstanding refunds after event cancellation."
                  : undefined
              }
              name="reason"
              required
              rows={3}
            />
          </label>
          <label className="event-destructive-confirmation">
            <input name="confirmed" required type="checkbox" value="true" />
            <span>
              {canRetryRefunds
                ? "I confirm Duna should retry only the outstanding refunds."
                : "I confirm this event should be cancelled and the previewed cash and credit refunds should be processed."}
            </span>
          </label>
          <ActionNotice state={cancelState} />
          <button
            className="hq-button hq-button--danger"
            disabled={cancelPending}
            type="submit"
          >
            {cancelPending
              ? canRetryRefunds
                ? "Retrying refunds…"
                : "Cancelling and refunding…"
              : canRetryRefunds
                ? "Retry outstanding refunds"
                : "Cancel and refund"}
          </button>
        </form>
      </details>
    </div>
  );
}

function RefundPaymentControl({
  registrationId,
  payerName,
  preview,
  currency,
  compact = false,
}: {
  readonly registrationId: string;
  readonly payerName: string;
  readonly preview?: OperatorSessionDetail["cancellationPreview"]["orders"][number];
  readonly currency: OperatorSessionDetail["finance"]["currency"];
  readonly compact?: boolean;
}) {
  const [state, action, pending] = useActionState(
    refundEventRegistrationAction,
    initialState,
  );
  if (!preview) return null;
  return (
    <details
      className={`event-roster-refund${compact ? " event-roster-refund--compact" : ""}`}
    >
      <summary title="Refund registration">
        <RotateCcw aria-hidden size={14} /> Refund
      </summary>
      <form action={action}>
        <input name="registrationId" type="hidden" value={registrationId} />
        <input name="orderId" type="hidden" value={preview.orderId} />
        <strong>Refund {payerName}</strong>
        <small>
          {preview.cashRefundMinor > 0
            ? `${formatMoney(preview.cashRefundMinor, currency)} to the original payment`
            : `${preview.creditsToRestore} organization credits to their wallet`}
        </small>
        <textarea
          name="reason"
          placeholder="Reason for refund"
          required
          rows={2}
        />
        <label>
          <input name="confirmed" required type="checkbox" value="true" />
          Confirm refund and re-evaluate this entry
        </label>
        {state.status !== "idle" && (
          <small data-state={state.status}>{state.message}</small>
        )}
        <button disabled={pending} type="submit">
          {pending ? "Processing…" : "Issue refund"}
        </button>
      </form>
    </details>
  );
}

function TeamSelectionControl({
  team,
}: {
  readonly team: OperatorSessionDetail["teams"][number];
}) {
  const [state, action, pending] = useActionState(
    setTeamSelectionAction,
    initialState,
  );
  const nextStatus =
    team.selectionStatus === "confirmed" ? "waitlisted" : "confirmed";
  return (
    <form action={action} className="event-team-quick-action">
      <input name="teamEntryId" type="hidden" value={team.id} />
      <input name="selectionStatus" type="hidden" value={nextStatus} />
      <input name="confirmed" type="hidden" value="true" />
      <input
        aria-label="Seed"
        defaultValue={team.seed}
        min={1}
        name="seed"
        placeholder="Seed"
        type="number"
      />
      <input
        name="reason"
        type="hidden"
        value={`Organizer moved team to ${nextStatus}.`}
      />
      <button disabled={pending} type="submit">
        {pending
          ? "Moving…"
          : nextStatus === "confirmed"
            ? "Move up"
            : "Move to waitlist"}
      </button>
      {state.status !== "idle" && (
        <small data-state={state.status}>{state.message}</small>
      )}
    </form>
  );
}

export function EventOperationsWorkspace({
  detail,
  workspace,
  liveKitConfigured,
}: {
  readonly detail: OperatorSessionDetail;
  readonly workspace: OperatorWorkspace;
  readonly liveKitConfigured: boolean;
}) {
  const [noteState, noteAction, notePending] = useActionState(
    createSessionNoteAction,
    initialState,
  );
  const [transcript, setTranscript] = useState("");
  const [visibility, setVisibility] = useState<"private" | "player">("private");
  const [usedVoice, setUsedVoice] = useState(false);
  const session = detail.session;
  const attended = detail.attendees.filter(
    (attendee) => attendee.attendanceStatus === "attended",
  ).length;
  const noShows = detail.attendees.filter(
    (attendee) => attendee.attendanceStatus === "no-show",
  ).length;
  const cancelled = detail.attendees.filter(
    (attendee) => attendee.attendanceStatus === "cancelled",
  ).length;
  const partialTeams = detail.teams.filter((team) => team.needsAttention);
  const divisionGroups = [
    ...new Map(
      detail.teams.map((team) => [
        team.divisionId,
        { id: team.divisionId, name: team.divisionName },
      ]),
    ).values(),
  ]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((division) => {
      const teams = detail.teams.filter(
        (team) => team.divisionId === division.id,
      );
      return {
        divisionId: division.id,
        divisionName: division.name,
        teams,
        readyTeams: teams.filter((team) => !team.needsAttention).length,
        paidTeams: teams.filter(
          (team) => team.paidPlayers >= team.expectedTeamSize,
        ).length,
        confirmedTeams: teams.filter(
          (team) => team.selectionStatus === "confirmed",
        ).length,
        waitlistedTeams: teams.filter(
          (team) => team.selectionStatus === "waitlisted",
        ).length,
      };
    });
  const arrivalSignals = detail.arrivalBoard.signals.filter(
    (signal) => signal.role === "player",
  );
  const arrivedPlayers = arrivalSignals.filter(
    (signal) => signal.status === "arrived",
  ).length;
  const latePlayers = arrivalSignals.filter(
    (signal) => signal.status === "running-late",
  ).length;
  const recipientPhones = [
    ...new Set(
      detail.attendees.flatMap((attendee) =>
        attendee.phoneE164 ? [attendee.phoneE164] : [],
      ),
    ),
  ];
  const recipientEmails = [
    ...new Set(
      detail.attendees.flatMap((attendee) =>
        attendee.email ? [attendee.email] : [],
      ),
    ),
  ];
  const groupMessageBody = encodeURIComponent(
    `Hi everyone — a quick update about ${session.title} from ${workspace.organization.name}.`,
  );
  const groupMessageHref = recipientPhones.length
    ? `sms:${recipientPhones.join(",")}?body=${groupMessageBody}`
    : recipientEmails.length
      ? `mailto:${recipientEmails.join(",")}?subject=${encodeURIComponent(session.title)}`
      : undefined;
  const weather = detail.operations.weather;
  const isTeamSession = detail.teams.length > 0;
  const weatherHeading = weather
    ? weather.condition
    : detail.operations.weatherStatus === "forecast-pending"
      ? "Forecast opens soon"
      : detail.operations.weatherStatus === "location-required"
        ? "Location needs coordinates"
        : detail.operations.weatherStatus === "provider-required"
          ? "Weather setup needed"
          : detail.operations.weatherStatus === "temporarily-unavailable"
            ? "Forecast unavailable"
            : "Not captured";
  const weatherEmptyCopy =
    detail.operations.weatherStatus === "forecast-pending" &&
    detail.operations.forecastAvailableAt
      ? `Tomorrow.io releases this forecast window on ${formatVenueTime(
          detail.operations.forecastAvailableAt,
          session.timezone,
          "en-US",
          { month: "long", day: "numeric", year: "numeric" },
        )}. Duna will load it automatically.`
      : detail.operations.weatherStatus === "location-required"
        ? "This venue has no saved coordinates and could not be geocoded. Add a Google Place or latitude and longitude to enable weather."
        : detail.operations.weatherStatus === "provider-required"
          ? "The venue is located, but Tomorrow.io is not connected in this environment."
          : detail.operations.weatherStatus === "temporarily-unavailable"
            ? "The venue and provider are configured, but no hourly forecast was returned. Duna will retry without substituting today’s conditions."
            : "No historical conditions were captured while this session was active. Duna never substitutes today’s forecast for a past session.";

  return (
    <main className="hq-page event-operations-page">
      <Link className="member-profile-back" href="/events">
        <ArrowLeft aria-hidden size={16} /> Event history
      </Link>
      <header className="event-operations-hero">
        <div>
          <span className="hq-eyebrow">
            {session.kind.replaceAll("-", " ")} · session operations
          </span>
          <h1>{session.title}</h1>
          <p>
            <CalendarClock aria-hidden size={16} />
            {formatVenueTime(session.startsAt, session.timezone, "en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            <span>·</span>
            <MapPin aria-hidden size={16} />
            {session.venueName ?? "Location pending"}
          </p>
          <span className="event-operations-hero__badges">
            <Badge
              tone={
                session.status === "cancelled"
                  ? "warning"
                  : session.status === "completed"
                    ? "positive"
                    : session.status === "live"
                      ? "live"
                      : "neutral"
              }
            >
              {session.status.replaceAll("-", " ")}
            </Badge>
            <Badge>{session.timezone}</Badge>
            {detail.coaches.map((coach) => (
              <Badge key={coach.personId}>Coach · {coach.displayName}</Badge>
            ))}
          </span>
        </div>
        <div className="event-operations-hero__actions">
          <EventManagementControls detail={detail} />
          {groupMessageHref ? (
            <a
              className="hq-button hq-button--secondary"
              href={groupMessageHref}
            >
              <MessageCircle aria-hidden size={16} /> Message players
            </a>
          ) : (
            <button className="hq-button hq-button--secondary" disabled>
              <Mail aria-hidden size={16} /> No contacts available
            </button>
          )}
          <a className="hq-button hq-button--primary" href="#session-notes">
            <Mic aria-hidden size={16} /> Record session notes
          </a>
        </div>
      </header>

      <section
        className="event-operations-metrics"
        aria-label="Session results"
      >
        <article>
          <small>{isTeamSession ? "Teams" : "Registered"}</small>
          <Numeric>
            {isTeamSession ? detail.teams.length : detail.attendees.length}
          </Numeric>
          <span>
            {isTeamSession
              ? `${divisionGroups.length} division${divisionGroups.length === 1 ? "" : "s"} · ${detail.attendees.length} players`
              : `${session.capacity - detail.attendees.length} open spots`}
          </span>
        </article>
        <article>
          <small>Attended</small>
          <Numeric>{attended}</Numeric>
          <span>
            {noShows} no-shows · {cancelled} cancelled
          </span>
        </article>
        <article>
          <small>Gross collected</small>
          <strong>
            {formatMoney(detail.finance.grossMinor, detail.finance.currency)}
          </strong>
          <span>{detail.finance.paidOrders} paid orders</span>
        </article>
        <article>
          <small>Net after refunds</small>
          <strong>
            {formatMoney(detail.finance.netMinor, detail.finance.currency)}
          </strong>
          <span>
            {formatMoney(detail.finance.refundedMinor, detail.finance.currency)}{" "}
            returned
          </span>
        </article>
      </section>

      <section
        className="event-live-arrivals"
        aria-label="Live player arrivals"
      >
        <header>
          <span className="event-live-arrivals__pulse" aria-hidden />
          <span>
            <small>Live arrivals · private window</small>
            <h2 className="event-live-arrivals__heading">
              {latePlayers
                ? `${latePlayers} player${latePlayers === 1 ? " is" : "s are"} running late`
                : "Know who is on the way."}
            </h2>
          </span>
          <span className="event-live-arrivals__summary">
            <strong>{arrivedPlayers}</strong> arrived
            <i aria-hidden>·</i>
            <strong>{arrivalSignals.length}</strong>/
            {detail.arrivalBoard.expectedPlayers} sharing
          </span>
        </header>
        {arrivalSignals.length ? (
          <div className="event-live-arrivals__grid">
            {arrivalSignals.slice(0, 8).map((signal) => (
              <article data-status={signal.status} key={signal.personId}>
                <span className="event-live-arrivals__avatar">
                  {signal.avatarUrl ? (
                    <img alt="" src={signal.avatarUrl} />
                  ) : (
                    initials(signal.displayName)
                  )}
                </span>
                <span>
                  <strong>{signal.displayName}</strong>
                  <small>
                    {signal.status.replaceAll("-", " ")} ·{" "}
                    {arrivalDistance(signal.distanceMeters)}
                  </small>
                </span>
                <span className="event-live-arrivals__eta">
                  <strong>
                    {arrivalEta(signal.travelDurationSeconds, signal.status)}
                  </strong>
                  <small>ETA</small>
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p className="event-live-arrivals__empty">
            Player ETAs appear here after each player opts in from their Duna
            session card.
          </p>
        )}
        <footer>
          <ShieldCheck aria-hidden size={15} /> Raw coordinates are never shown
          or stored. Arrival signals exist only from 60 minutes before to 30
          minutes after the session starts.
        </footer>
      </section>

      {partialTeams.length > 0 && (
        <section
          className="event-team-alert"
          aria-label="Teams needing attention"
        >
          <CircleAlert aria-hidden size={21} />
          <span>
            <strong>
              {partialTeams.length} partial{" "}
              {partialTeams.length === 1 ? "team" : "teams"} need attention
            </strong>
            <small>
              Players are still missing, invitations are unclaimed, or
              individual payments are incomplete.
            </small>
          </span>
          <a href="#partial-teams">
            Review teams <ArrowRight aria-hidden size={15} />
          </a>
        </section>
      )}

      {detail.operations.cancelledAt && (
        <section className="event-cancellation-banner">
          <CircleAlert aria-hidden size={20} />
          <span>
            <strong>
              {detail.operations.cancellationKind === "coach"
                ? "Coach cancelled this session"
                : `${detail.operations.cancellationKind ?? "Operator"} cancellation`}
            </strong>
            <small>
              {detail.operations.cancellationReason} · recorded by{" "}
              {detail.operations.cancelledByName ?? "Duna operator"} on{" "}
              {formatVenueTime(detail.operations.cancelledAt, session.timezone)}
            </small>
            {detail.operations.refundSummary && (
              <small>
                {formatMoney(
                  detail.operations.refundSummary.cashRefundMinor,
                  detail.finance.currency,
                )}{" "}
                submitted · {detail.operations.refundSummary.creditsRestored}{" "}
                credits restored · refund status{" "}
                {detail.operations.refundStatus}
              </small>
            )}
          </span>
        </section>
      )}

      <section className="event-operations-layout">
        <div className="event-operations-main">
          {detail.teams.length > 0 && (
            <section
              className="hq-card event-team-operations"
              id="partial-teams"
            >
              <header className="member-section-heading">
                <span>
                  <small>Roster + payment readiness</small>
                  <h2>Teams</h2>
                </span>
                <Badge tone={partialTeams.length > 0 ? "warning" : "positive"}>
                  {partialTeams.length > 0
                    ? `${partialTeams.length} partial`
                    : "All ready"}
                </Badge>
              </header>
              <div className="event-division-overview">
                {divisionGroups.map((division) => (
                  <article key={division.divisionId}>
                    <Link
                      href={`/events/${session.id}/divisions/${division.divisionId}`}
                    >
                      <small>Division</small>
                      <strong>
                        {division.divisionName}{" "}
                        <ArrowRight aria-hidden size={15} />
                      </strong>
                    </Link>
                    <dl>
                      <div>
                        <dt>Teams</dt>
                        <dd>{division.teams.length}</dd>
                      </div>
                      <div>
                        <dt>Confirmed</dt>
                        <dd>{division.confirmedTeams}</dd>
                      </div>
                      <div>
                        <dt>Waitlist</dt>
                        <dd>{division.waitlistedTeams}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
              <div className="event-team-operations__divisions">
                {divisionGroups.map((division) => (
                  <section key={division.divisionId}>
                    <header>
                      <span>
                        <small>Division</small>
                        <h3>{division.divisionName}</h3>
                      </span>
                      <Link
                        className="event-division-open"
                        href={`/events/${session.id}/divisions/${division.divisionId}`}
                      >
                        Pools, bracket + schedule{" "}
                        <Trophy aria-hidden size={15} />
                      </Link>
                    </header>
                    <div className="event-team-operations__list">
                      {division.teams.map((team) => (
                        <article
                          className={
                            team.needsAttention ? "needs-attention" : undefined
                          }
                          key={team.id}
                        >
                          <header className="event-team-card__identity">
                            <span className="event-team-avatar-stack">
                              {team.roster.slice(0, 3).map((member, index) => (
                                <i key={`${team.id}:avatar:${index}`}>
                                  {member.avatarUrl ? (
                                    <img alt="" src={member.avatarUrl} />
                                  ) : (
                                    initials(member.displayName)
                                  )}
                                </i>
                              ))}
                            </span>
                            <span>
                              <strong>{team.name}</strong>
                              <small>
                                {team.roster
                                  .map((member) => member.displayName)
                                  .join(" · ")}
                              </small>
                            </span>
                            <span className="event-team-card__badges">
                              {team.seed && <Badge>Seed {team.seed}</Badge>}
                              <Badge
                                tone={
                                  team.selectionStatus === "confirmed"
                                    ? "positive"
                                    : team.selectionStatus === "waitlisted"
                                      ? "warning"
                                      : "neutral"
                                }
                              >
                                {team.selectionStatus}
                              </Badge>
                            </span>
                          </header>
                          <dl className="event-team-card__facts">
                            <div>
                              <dt>Registered</dt>
                              <dd>
                                {formatVenueTime(
                                  team.registeredAt,
                                  session.timezone,
                                  "en-US",
                                  { month: "short", day: "numeric" },
                                )}
                              </dd>
                            </div>
                            <div>
                              <dt>Avg Sand Rating</dt>
                              <dd>
                                {team.averageRating?.toFixed(2) ?? "Not rated"}
                              </dd>
                            </div>
                            <div>
                              <dt>Payment</dt>
                              <dd>
                                {team.paidPlayers >= team.expectedTeamSize
                                  ? "Fully paid"
                                  : `${team.paidPlayers}/${team.expectedTeamSize} paid`}
                              </dd>
                            </div>
                            <div>
                              <dt>Entry</dt>
                              <dd>
                                {team.paymentMode === "team"
                                  ? "Captain paid"
                                  : "Split payment"}
                              </dd>
                            </div>
                          </dl>
                          <div className="event-team-card__payments">
                            {team.roster.map((member, index) => {
                              const paymentPreview = member.orderId
                                ? detail.cancellationPreview.orders.find(
                                    (order) => order.orderId === member.orderId,
                                  )
                                : undefined;
                              return (
                                <span
                                  key={`${team.id}:payment:${member.personId ?? index}`}
                                >
                                  <i>
                                    <strong>{member.displayName}</strong>
                                    <small>
                                      {member.paid ? "Paid" : "Not paid"}
                                    </small>
                                  </i>
                                  {member.orderId && (
                                    <RefundPaymentControl
                                      compact
                                      currency={detail.finance.currency}
                                      payerName={member.displayName}
                                      preview={paymentPreview}
                                      registrationId={team.registrationId}
                                    />
                                  )}
                                </span>
                              );
                            })}
                          </div>
                          <footer className="event-team-card__footer">
                            <span>
                              {team.fullyPaidAt
                                ? `Fully paid ${formatVenueTime(team.fullyPaidAt, session.timezone, "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
                                : "Waiting for roster/payment completion"}
                            </span>
                            <TeamSelectionControl team={team} />
                          </footer>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </section>
          )}
          <section className="hq-card event-roster-card">
            <header className="member-section-heading">
              <span>
                <small>Attendance + customer care</small>
                <h2>Roster</h2>
              </span>
              <Badge>{detail.attendees.length} people</Badge>
            </header>
            <div className="event-roster-list">
              {detail.attendees.map((attendee) => (
                <article key={attendee.id}>
                  <Link
                    className="event-roster-list__person"
                    href={`/members/${attendee.personId}`}
                  >
                    <span className="event-roster-list__avatar">
                      {attendee.avatarUrl ? (
                        <img alt="" src={attendee.avatarUrl} />
                      ) : (
                        initials(attendee.displayName)
                      )}
                    </span>
                    <span>
                      <strong>{attendee.displayName}</strong>
                      <small>
                        {attendee.email ??
                          attendee.phoneE164 ??
                          "No contact method"}
                      </small>
                    </span>
                  </Link>
                  <span className="event-roster-list__money">
                    <strong>
                      {formatMoney(attendee.paidMinor, detail.finance.currency)}
                    </strong>
                    <small>
                      {attendee.refundedMinor
                        ? `${formatMoney(attendee.refundedMinor, detail.finance.currency)} refunded`
                        : attendee.status.replaceAll("-", " ")}
                    </small>
                  </span>
                  <AttendanceControl attendee={attendee} />
                  <RefundPaymentControl
                    currency={detail.finance.currency}
                    payerName={attendee.displayName}
                    preview={detail.cancellationPreview.orders.find(
                      (order) => order.orderId === attendee.orderId,
                    )}
                    registrationId={attendee.id}
                  />
                  <Link
                    className="event-roster-list__open"
                    href={`/members/${attendee.personId}`}
                  >
                    Open <ArrowRight aria-hidden size={14} />
                  </Link>
                </article>
              ))}
              {detail.attendees.length === 0 && (
                <div className="hq-empty">
                  <UsersRound aria-hidden size={22} />
                  <strong>No one is registered yet.</strong>
                  <span>
                    Add players from their People profile or the calendar.
                  </span>
                </div>
              )}
            </div>
          </section>

          <section className="hq-card event-note-composer" id="session-notes">
            <header className="member-section-heading">
              <span>
                <small>Voice or typed · always reviewable</small>
                <h2>Record what happened</h2>
              </span>
              <span className="event-note-composer__privacy">
                <ShieldCheck aria-hidden size={16} /> Private by default
              </span>
            </header>
            <form action={noteAction}>
              <input name="sessionId" type="hidden" value={session.id} />
              <input
                name="source"
                type="hidden"
                value={usedVoice ? "livekit-voice" : "typed"}
              />
              <SessionNoteRecorder
                configured={liveKitConfigured}
                onChange={setTranscript}
                onVoiceStarted={() => setUsedVoice(true)}
                sessionId={session.id}
                transcript={transcript}
              />
              <div className="event-note-form-grid">
                <label>
                  <span>Short title · optional</span>
                  <input name="subject" placeholder="Serve-receive focus" />
                </label>
                <label>
                  <span>Editable recap · optional</span>
                  <textarea
                    name="summary"
                    placeholder="Leave blank and Duna will draft this from the transcript."
                    rows={3}
                  />
                </label>
              </div>
              <fieldset className="event-note-visibility">
                <legend>Who should ever be able to see this?</legend>
                <label
                  className={visibility === "private" ? "active" : undefined}
                >
                  <input
                    checked={visibility === "private"}
                    name="visibility"
                    onChange={() => setVisibility("private")}
                    type="radio"
                    value="private"
                  />
                  <FileLock2 aria-hidden size={20} />
                  <span>
                    <strong>Private coach note</strong>
                    <small>
                      Only authorized organization operators. Never sent to
                      players.
                    </small>
                  </span>
                </label>
                <label
                  className={visibility === "player" ? "active" : undefined}
                >
                  <input
                    checked={visibility === "player"}
                    name="visibility"
                    onChange={() => setVisibility("player")}
                    type="radio"
                    value="player"
                  />
                  <MessageCircle aria-hidden size={20} />
                  <span>
                    <strong>Player-shareable draft</strong>
                    <small>
                      Saved privately first. A second review publishes it.
                    </small>
                  </span>
                </label>
              </fieldset>
              <fieldset className="event-note-recipients">
                <legend>
                  {visibility === "private"
                    ? "Attach to player profiles · optional"
                    : "Players who may receive this"}
                </legend>
                <p>
                  Duna also detects unambiguous roster names in the transcript.
                  You can review every detected player on the saved draft.
                </p>
                <div>
                  {detail.attendees.map((attendee) => (
                    <label key={attendee.personId}>
                      <input
                        name="recipientPersonIds"
                        type="checkbox"
                        value={attendee.personId}
                      />
                      <span>{initials(attendee.displayName)}</span>
                      <strong>{attendee.displayName}</strong>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="event-note-composer__footer">
                <ActionNotice state={noteState} />
                <span>
                  <ShieldCheck aria-hidden size={16} />
                  Saving never sends a note.
                </span>
                <button
                  className="hq-button hq-button--primary"
                  disabled={notePending || !transcript.trim()}
                  type="submit"
                >
                  {notePending ? "Saving draft…" : "Save note draft"}
                </button>
              </div>
            </form>
          </section>

          <section className="hq-card event-notes-history">
            <header className="member-section-heading">
              <span>
                <small>Session memory</small>
                <h2>Notes from this session</h2>
              </span>
              <Badge>{detail.notes.length} notes</Badge>
            </header>
            <div>
              {detail.notes.map((note) => (
                <article key={note.id}>
                  <header>
                    <span className="member-section-icon">
                      {note.visibility === "private" ? (
                        <FileLock2 aria-hidden size={17} />
                      ) : note.status === "published" ? (
                        <Eye aria-hidden size={17} />
                      ) : (
                        <FileText aria-hidden size={17} />
                      )}
                    </span>
                    <span>
                      <strong>{note.subject ?? "Session note"}</strong>
                      <small>
                        {note.authorName} ·{" "}
                        {formatVenueTime(note.createdAt, session.timezone)}
                      </small>
                    </span>
                    <Badge
                      tone={
                        note.visibility === "private"
                          ? "neutral"
                          : note.status === "published"
                            ? "positive"
                            : "warning"
                      }
                    >
                      {note.visibility === "private"
                        ? "private"
                        : note.status === "published"
                          ? "shared"
                          : "shareable draft"}
                    </Badge>
                  </header>
                  <p>{note.summary}</p>
                  {note.recipients.length > 0 && (
                    <div className="event-note-people">
                      {note.recipients.map((recipient) => (
                        <span key={recipient.personId}>
                          {recipient.displayName}
                          {recipient.detected ? " · detected" : ""}
                        </span>
                      ))}
                    </div>
                  )}
                  {note.visibility === "player" && note.status === "draft" && (
                    <PublishNoteControl noteId={note.id} />
                  )}
                </article>
              ))}
              {detail.notes.length === 0 && (
                <div className="hq-empty">
                  <Mic aria-hidden size={22} />
                  <strong>No session notes yet.</strong>
                  <span>
                    Record the first note while the session is still fresh.
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="event-operations-rail">
          <section className="hq-card event-weather-card">
            <header>
              <CloudSun aria-hidden size={20} />
              <span>
                <small>Conditions at session time</small>
                <h2>{weatherHeading}</h2>
              </span>
            </header>
            {weather ? (
              <dl>
                <div>
                  <dt>Temperature</dt>
                  <dd>
                    {weather.temperatureC === undefined
                      ? "—"
                      : `${Math.round((weather.temperatureC * 9) / 5 + 32)}°F`}
                  </dd>
                </div>
                <div>
                  <dt>Rain chance</dt>
                  <dd>
                    {weather.precipitationProbability === undefined
                      ? "—"
                      : `${weather.precipitationProbability}%`}
                  </dd>
                </div>
                <div>
                  <dt>Wind</dt>
                  <dd>
                    {weather.windSpeedKph === undefined
                      ? "—"
                      : `${Math.round(weather.windSpeedKph / 1.609)} mph`}
                  </dd>
                </div>
              </dl>
            ) : (
              <p>{weatherEmptyCopy}</p>
            )}
            {weather && (
              <p className="event-weather-card__source">
                {detail.operations.weatherKind === "forecast"
                  ? "Live forecast"
                  : "Captured conditions"}{" "}
                · {weather.source}
              </p>
            )}
          </section>

          <section className="hq-card event-finance-card">
            <header>
              <Coins aria-hidden size={20} />
              <span>
                <small>Clear money trail</small>
                <h2>Session ledger</h2>
              </span>
            </header>
            <dl>
              <div>
                <dt>Gross</dt>
                <dd>
                  {formatMoney(
                    detail.finance.grossMinor,
                    detail.finance.currency,
                  )}
                </dd>
              </div>
              <div>
                <dt>Refunds</dt>
                <dd>
                  −{" "}
                  {formatMoney(
                    detail.finance.refundedMinor,
                    detail.finance.currency,
                  )}
                </dd>
              </div>
              <div>
                <dt>Net</dt>
                <dd>
                  {formatMoney(
                    detail.finance.netMinor,
                    detail.finance.currency,
                  )}
                </dd>
              </div>
            </dl>
            <p>
              <ReceiptText aria-hidden size={16} />
              Refunds are initiated from the player profile and remain linked to
              the original order and reversal journal.
            </p>
          </section>

          <section className="hq-card event-video-card">
            <header>
              <Video aria-hidden size={20} />
              <span>
                <small>Session film</small>
                <h2>{detail.videos.length} videos</h2>
              </span>
            </header>
            <div>
              {detail.videos.slice(0, 5).map((video) => (
                <article key={video.id}>
                  <span
                    style={
                      video.thumbnailUrl
                        ? { backgroundImage: `url("${video.thumbnailUrl}")` }
                        : undefined
                    }
                  >
                    {!video.thumbnailUrl && <Video aria-hidden size={18} />}
                  </span>
                  <span>
                    <strong>{video.title}</strong>
                    <small>
                      {video.ownerName} · {video.status}
                    </small>
                  </span>
                </article>
              ))}
              {detail.videos.length === 0 && (
                <p>No videos linked to this session.</p>
              )}
            </div>
          </section>

          <section className="event-native-message-note">
            <MessageCircle aria-hidden size={19} />
            <span>
              <strong>Uses the coach&apos;s native messenger</strong>
              Duna prepares the recipient line and draft. The coach reviews and
              sends it from their own device.
            </span>
          </section>
        </aside>
      </section>
    </main>
  );
}
