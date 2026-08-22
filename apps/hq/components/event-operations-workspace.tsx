"use client";

import type {
  OperatorDivisionDetail,
  OperatorSessionDetail,
  OperatorWorkspace,
} from "@duna/api";
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
  Copy,
  Eye,
  FileLock2,
  FileText,
  Gift,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  Mic,
  Pencil,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  WalletCards,
  X,
  UserCheck,
  UserPlus,
  UserRoundX,
  UsersRound,
  Trophy,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  addEventPlayerEntryAction,
  cancelCalendarSessionAction,
  closeEventRegistrationAction,
  createSessionNoteAction,
  publishSessionNoteAction,
  publishTournamentLiveAction,
  recordSessionAttendanceAction,
  refundEventRegistrationAction,
  setTeamSelectionAction,
  type OperatorActionState,
  updateEventSessionAction,
} from "@/app/actions";
import { SessionNoteRecorder } from "./session-note-recorder";
import { PlayerCombobox } from "./player-combobox";

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

function EventPlayerEntryForm({
  detail,
  onClose,
}: {
  readonly detail: OperatorSessionDetail;
  readonly onClose: () => void;
}) {
  const [state, action, pending] = useActionState(
    addEventPlayerEntryAction,
    initialState,
  );
  const [identityKind, setIdentityKind] = useState<"duna" | "guest">("duna");
  const [paymentTreatment, setPaymentTreatment] = useState<
    "complimentary" | "to-be-paid" | undefined
  >();
  const [copied, setCopied] = useState(false);
  const defaultDivision = detail.entryDivisions[0];

  if (state.status === "success") {
    return (
      <div className="event-player-sheet__success">
        <span>
          <Check aria-hidden size={24} />
        </span>
        <small>Player added</small>
        <h3>{state.personName ?? "The player"} is in the field.</h3>
        <p>{state.message}</p>
        {state.invitationUrl && (
          <div className="event-player-sheet__claim-link">
            <Link2 aria-hidden size={18} />
            <span>
              <strong>
                {state.entryPaymentTreatment === "complimentary"
                  ? "Claim entry link"
                  : "Claim and payment link"}
              </strong>
              <small>
                {state.deliveryStatus === "sent"
                  ? "Sent. You can also copy it here."
                  : "Share this private link with the player."}
              </small>
            </span>
            <button
              onClick={() => {
                void navigator.clipboard.writeText(state.invitationUrl!);
                setCopied(true);
              }}
              type="button"
            >
              <Copy aria-hidden size={16} /> {copied ? "Copied" : "Copy"}
            </button>
          </div>
        )}
        <button
          className="hq-button hq-button--primary"
          onClick={onClose}
          type="button"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="event-player-sheet__form">
      <input name="sessionId" type="hidden" value={detail.session.id} />
      <input name="identityKind" type="hidden" value={identityKind} />
      <input
        name="reason"
        type="hidden"
        value="Organizer added a player from the event roster sheet and verified the entry treatment."
      />
      <div
        aria-label="Choose player identity"
        className="event-player-sheet__identity-tabs"
        role="tablist"
      >
        <button
          aria-selected={identityKind === "duna"}
          onClick={() => setIdentityKind("duna")}
          role="tab"
          type="button"
        >
          Search Duna
          <small>Find an existing player profile</small>
        </button>
        <button
          aria-selected={identityKind === "guest"}
          onClick={() => setIdentityKind("guest")}
          role="tab"
          type="button"
        >
          Guest player
          <small>Create a claimable tournament spot</small>
        </button>
      </div>

      {identityKind === "duna" ? (
        <section className="event-player-sheet__identity-panel" role="tabpanel">
          <PlayerCombobox
            initialOptions={[]}
            label="Search every eligible Duna player"
            placeholder="Search by name or @handle…"
            remoteSearchPath={`/api/events/player-search?sessionId=${encodeURIComponent(detail.session.id)}&q=`}
          />
          <p>
            Duna shows public adult profiles plus players already connected to
            your organization. Contact details remain private.
          </p>
        </section>
      ) : (
        <section className="event-player-sheet__identity-panel" role="tabpanel">
          <div className="event-player-sheet__name-grid">
            <label>
              <span>First name</span>
              <input autoComplete="given-name" name="givenName" required />
            </label>
            <label>
              <span>Last name</span>
              <input autoComplete="family-name" name="familyName" required />
            </label>
          </div>
          <div className="event-player-sheet__name-grid">
            <label>
              <span>
                Email <small>Optional</small>
              </span>
              <input autoComplete="email" name="email" type="email" />
            </label>
            <label>
              <span>
                Mobile <small>Optional</small>
              </span>
              <input
                autoComplete="tel"
                inputMode="tel"
                name="phoneE164"
                pattern="^\+[0-9 ()-]{7,20}$"
                placeholder="+1 310 555 0123"
                title="Use an international number beginning with +"
              />
            </label>
          </div>
          <p>
            Add email or mobile to send the invitation now. Without either, Duna
            still creates a private claim link you can copy. Direct guest
            invitations are for players 18 or older; add minors through People
            so a guardian can accept.
          </p>
        </section>
      )}

      <section className="event-player-sheet__entry">
        <header>
          <small>Entry details</small>
          <strong>Where should this player compete?</strong>
        </header>
        {detail.entryDivisions.length ? (
          <label>
            <span>Division</span>
            <select
              defaultValue={defaultDivision?.id}
              name="divisionId"
              required
            >
              {detail.entryDivisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {division.name} ·{" "}
                  {division.teamSize === 1
                    ? "Individual"
                    : `${division.teamSize}-player team`}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p role="alert">This event has no division available for entry.</p>
        )}
        <fieldset>
          <legend>Payment treatment</legend>
          <label data-selected={paymentTreatment === "complimentary"}>
            <input
              checked={paymentTreatment === "complimentary"}
              name="paymentTreatment"
              onChange={() => setPaymentTreatment("complimentary")}
              type="radio"
              value="complimentary"
            />
            <Gift aria-hidden size={20} />
            <span>
              <strong>Comp entry</strong>
              <small>Registered and covered by the organizer.</small>
            </span>
          </label>
          <label data-selected={paymentTreatment === "to-be-paid"}>
            <input
              checked={paymentTreatment === "to-be-paid"}
              name="paymentTreatment"
              onChange={() => setPaymentTreatment("to-be-paid")}
              type="radio"
              value="to-be-paid"
            />
            <WalletCards aria-hidden size={20} />
            <span>
              <strong>To be paid</strong>
              <small>The spot is held. The player pays after claiming.</small>
            </span>
          </label>
        </fieldset>
      </section>

      <label className="event-player-sheet__confirm">
        <input name="confirmed" required type="checkbox" value="true" />
        <span>
          <strong>
            I verified this player, division, and entry treatment.
          </strong>
          {identityKind === "guest" &&
            " I also confirm this guest is 18 or older."}
        </span>
      </label>
      <ActionNotice state={state} />
      <button
        className="hq-button hq-button--primary"
        disabled={pending || !detail.entryDivisions.length || !paymentTreatment}
        type="submit"
      >
        <UserPlus aria-hidden size={17} />
        {pending
          ? "Registering player…"
          : !paymentTreatment
            ? "Choose entry payment"
            : paymentTreatment === "complimentary"
              ? "Add with comp entry"
              : "Reserve spot with payment due"}
      </button>
    </form>
  );
}

function RosterAddControl({
  detail,
}: {
  readonly detail: OperatorSessionDetail;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusFrame = window.requestAnimationFrame(() => {
      sheetRef.current
        ?.querySelector<HTMLInputElement>('input:not([type="hidden"])')
        ?.focus();
    });
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !sheetRef.current) return;
      const focusable = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), a[href]',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", close);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", close);
      triggerRef.current?.focus();
    };
  }, [open]);
  const close = () => {
    setOpen(false);
    setFormKey((value) => value + 1);
  };
  return (
    <>
      <button
        className="hq-button hq-button--secondary"
        onClick={() => setOpen(true)}
        ref={triggerRef}
        type="button"
      >
        <UserPlus aria-hidden size={16} /> Add player
      </button>
      {open && (
        <div
          className="event-player-sheet-backdrop"
          onClick={close}
          role="presentation"
        >
          <section
            aria-labelledby="event-player-sheet-title"
            aria-modal="true"
            className="event-player-sheet"
            onClick={(event) => event.stopPropagation()}
            ref={sheetRef}
            role="dialog"
          >
            <header>
              <span>
                <small>Add to the field</small>
                <h2 id="event-player-sheet-title">Register a player.</h2>
                <p>
                  Find a Duna profile or create a guest spot they can claim.
                </p>
              </span>
              <button
                aria-label="Close add player sheet"
                onClick={close}
                type="button"
              >
                <X aria-hidden size={20} />
              </button>
            </header>
            <EventPlayerEntryForm
              detail={detail}
              key={formKey}
              onClose={close}
            />
          </section>
        </div>
      )}
    </>
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

function CopyClaimLink({ claimUrl }: { readonly claimUrl: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");
  return (
    <button
      className="event-roster-list__open"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(claimUrl);
          setStatus("copied");
        } catch {
          setStatus("error");
        }
      }}
      type="button"
    >
      <span aria-live="polite">
        {status === "copied"
          ? "Claim link copied"
          : status === "error"
            ? "Copy failed"
            : "Copy claim link"}
      </span>
      <Copy aria-hidden size={14} />
    </button>
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
  const supportsFullEventStudio =
    session.kind === "tournament" || session.kind === "league";
  const canRetryRefunds =
    session.status === "cancelled" &&
    detail.operations.refundStatus === "attention";
  if (!canChange && !canRetryRefunds) return null;
  return (
    <div className="event-management-controls">
      {canChange && supportsFullEventStudio && (
        <Link
          className="hq-button hq-button--secondary"
          href={`/events/create?draft=${session.id}`}
        >
          <Pencil aria-hidden size={16} /> Edit event
        </Link>
      )}
      {canChange && !supportsFullEventStudio && (
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
        aria-label="Override note"
        name="reason"
        placeholder="Required override note"
        required
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

function TournamentLifecyclePanel({
  detail,
  divisions,
}: {
  readonly detail: OperatorSessionDetail;
  readonly divisions: readonly OperatorDivisionDetail[];
}) {
  const [closeState, closeAction, closePending] = useActionState(
    closeEventRegistrationAction,
    initialState,
  );
  const [publishState, publishAction, publishPending] = useActionState(
    publishTournamentLiveAction,
    initialState,
  );
  const session = detail.session;
  const registrationClosed = Boolean(
    session.status === "live" ||
    (session.registrationClosesAt &&
      new Date(session.registrationClosesAt).getTime() <= Date.now()),
  );
  const divisionStates = divisions.map((division) => {
    const bracketCurrent = Boolean(
      division.division.seedingFinalizedAt &&
      division.bracket &&
      new Date(division.bracket.createdAt).getTime() >=
        new Date(division.division.seedingFinalizedAt).getTime(),
    );
    const scheduledMatches = division.matches.filter(
      (match) => match.scheduledAt,
    ).length;
    return {
      detail: division,
      seedsReady: Boolean(division.division.seedingFinalizedAt),
      drawReady: bracketCurrent && Boolean(division.bracket?.drawFinalizedAt),
      scheduleReady:
        division.matches.length > 0 &&
        scheduledMatches === division.matches.length,
      scheduledMatches,
    };
  });
  const readyToPublish =
    registrationClosed &&
    divisionStates.length > 0 &&
    divisionStates.every(
      (state) => state.seedsReady && state.drawReady && state.scheduleReady,
    );
  const live =
    session.status === "live" &&
    divisionStates.length > 0 &&
    divisionStates.every((state) => Boolean(state.detail.bracket?.liveAt));
  return (
    <section
      className={`event-tournament-lifecycle${live ? " is-live" : ""}`}
      aria-label="Tournament launch workflow"
    >
      <header>
        <span>
          <small>{live ? "Live tournament" : "Director launch sequence"}</small>
          <h2>
            {live
              ? "Pools and schedules are published."
              : "Close, review, finalize, then publish."}
          </h2>
          <p>
            {live
              ? "Duna Pro can run the courts while players follow the same official field on web and mobile."
              : "Each gate preserves a clear source of truth and an audit note before participants are alerted."}
          </p>
        </span>
        <Badge tone={live ? "live" : readyToPublish ? "positive" : "warning"}>
          {live
            ? "Live"
            : readyToPublish
              ? "Ready to publish"
              : "Setup in progress"}
        </Badge>
      </header>

      <ol className="event-tournament-lifecycle__steps">
        <li data-complete={registrationClosed}>
          <b>{registrationClosed ? <Check aria-hidden size={16} /> : "1"}</b>
          <span>
            <strong>Close registration</strong>
            <small>Stops checkout and roster changes immediately.</small>
          </span>
          {!registrationClosed && !live ? (
            <details>
              <summary>Close now</summary>
              <form action={closeAction}>
                <input name="sessionId" type="hidden" value={session.id} />
                <label>
                  <span>Director note</span>
                  <textarea
                    defaultValue="Director closed registration to begin final seeding."
                    name="reason"
                    required
                    rows={2}
                  />
                </label>
                <label>
                  <input
                    name="confirmed"
                    required
                    type="checkbox"
                    value="true"
                  />
                  Stop new registrations and roster edits now
                </label>
                <button disabled={closePending} type="submit">
                  {closePending ? "Closing…" : "Close registration"}
                </button>
                <ActionNotice state={closeState} />
              </form>
            </details>
          ) : null}
        </li>
        {divisionStates.map((state, index) => (
          <li
            data-complete={
              state.seedsReady && state.drawReady && state.scheduleReady
            }
            key={state.detail.division.id}
          >
            <b>
              {state.seedsReady && state.drawReady && state.scheduleReady ? (
                <Check aria-hidden size={16} />
              ) : (
                index + 2
              )}
            </b>
            <span>
              <strong>{state.detail.division.name}</strong>
              <small>
                Seeds {state.seedsReady ? "final" : "open"} · draw{" "}
                {state.drawReady ? "final" : "open"} · schedule{" "}
                {state.scheduledMatches}/{state.detail.matches.length}
              </small>
            </span>
            <Link
              href={`/events/${session.id}/divisions/${state.detail.division.id}`}
            >
              Open division <ArrowRight aria-hidden size={14} />
            </Link>
          </li>
        ))}
      </ol>

      {!live ? (
        <form
          action={publishAction}
          className="event-tournament-lifecycle__publish"
        >
          <input name="sessionId" type="hidden" value={session.id} />
          <input
            name="reason"
            type="hidden"
            value="Director reviewed every division and published the official tournament field."
          />
          <span>
            <small>Final gate</small>
            <strong>Publish &amp; Set Live</strong>
            <p>
              Alerts the registered field and reveals the official pools, draw,
              courts, and match times across Duna.
            </p>
          </span>
          <label>
            <span>Message to participants</span>
            <textarea
              defaultValue="The official pools and match schedule are live. Check your first match and court assignment before play begins."
              name="participantMessage"
              required
              rows={3}
            />
          </label>
          <label>
            <input name="confirmed" required type="checkbox" value="true" />I
            reviewed every finalized division and schedule
          </label>
          <button disabled={!readyToPublish || publishPending} type="submit">
            {publishPending ? "Publishing…" : "Publish & Set Live"}
          </button>
          {!readyToPublish ? (
            <small>
              Complete each unfinished gate above before participants can be
              alerted.
            </small>
          ) : null}
          <ActionNotice state={publishState} />
        </form>
      ) : (
        <a
          className="event-tournament-lifecycle__public-link"
          href={`https://duna.coach/events/${session.slug}`}
          rel="noreferrer"
          target="_blank"
        >
          View the live player event <ArrowRight aria-hidden size={15} />
        </a>
      )}
    </section>
  );
}

export function EventOperationsWorkspace({
  competitionDivisions,
  detail,
  workspace,
  liveKitConfigured,
}: {
  readonly competitionDivisions: readonly OperatorDivisionDetail[];
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
  const [noteMode, setNoteMode] = useState<"voice" | "written">();
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
  const isLeague = session.kind === "league";
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

      {(session.kind === "tournament" || session.kind === "league") && (
        <TournamentLifecyclePanel
          detail={detail}
          divisions={competitionDivisions}
        />
      )}

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
          {isLeague && (
            <section className="hq-card league-session-overview">
              <header className="member-section-heading">
                <span>
                  <small>League control center</small>
                  <h2>Run this league session with the roster in view.</h2>
                </span>
                <Badge
                  tone={session.status === "completed" ? "neutral" : "positive"}
                >
                  {session.status === "completed"
                    ? "Past session"
                    : "Roster open"}
                </Badge>
              </header>
              <div>
                <span>
                  <strong>{detail.attendees.length}</strong>
                  <small>on the session roster</small>
                </span>
                <span>
                  <strong>
                    {Math.max(0, session.capacity - detail.attendees.length)}
                  </strong>
                  <small>spots remaining</small>
                </span>
                <span>
                  <strong>{detail.teams.length}</strong>
                  <small>teams in play</small>
                </span>
              </div>
              <p>
                Directors, managers, and assigned coaches can add a connected
                player below. Duna records the change and sends the player their
                session update.
              </p>
            </section>
          )}
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
              <span className="event-roster-card__tools">
                <Badge>{detail.attendees.length} people</Badge>
                <RosterAddControl detail={detail} />
              </span>
            </header>
            <div className="event-roster-list">
              {detail.attendees.map((attendee) => (
                <article key={attendee.id}>
                  {attendee.identityStatus === "guest-invited" ? (
                    <span className="event-roster-list__person">
                      <span className="event-roster-list__avatar">
                        {initials(attendee.displayName)}
                      </span>
                      <span>
                        <strong>{attendee.displayName}</strong>
                        <small>
                          {attendee.email ??
                            attendee.phoneE164 ??
                            "Claim link ready"}
                        </small>
                      </span>
                    </span>
                  ) : (
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
                            "Duna player"}
                        </small>
                      </span>
                    </Link>
                  )}
                  <span className="event-roster-list__states">
                    <Badge
                      tone={
                        attendee.identityStatus === "guest-invited"
                          ? "warning"
                          : "positive"
                      }
                    >
                      {attendee.identityStatus === "guest-invited"
                        ? attendee.invitation?.deliveryStatus === "sent"
                          ? "Invite sent"
                          : "Guest · unclaimed"
                        : attendee.identityStatus === "guest-claimed"
                          ? "Guest claimed"
                          : "Duna player"}
                    </Badge>
                    <Badge
                      tone={
                        attendee.paymentStatus === "payment-due"
                          ? "warning"
                          : "positive"
                      }
                    >
                      {attendee.paymentStatus === "complimentary"
                        ? "Comped"
                        : attendee.paymentStatus === "payment-due"
                          ? "Payment due"
                          : attendee.paymentStatus === "free"
                            ? "Free entry"
                            : "Paid"}
                    </Badge>
                  </span>
                  <span className="event-roster-list__money">
                    <strong>
                      {attendee.paymentStatus === "complimentary"
                        ? "Comped"
                        : attendee.paymentStatus === "payment-due"
                          ? "Due"
                          : formatMoney(
                              attendee.paidMinor,
                              detail.finance.currency,
                            )}
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
                  {attendee.identityStatus === "guest-invited" &&
                  attendee.invitation ? (
                    <CopyClaimLink claimUrl={attendee.invitation.claimUrl} />
                  ) : (
                    <Link
                      className="event-roster-list__open"
                      href={`/members/${attendee.personId}`}
                    >
                      Open <ArrowRight aria-hidden size={14} />
                    </Link>
                  )}
                </article>
              ))}
              {detail.attendees.length === 0 && (
                <div className="hq-empty">
                  <UsersRound aria-hidden size={22} />
                  <strong>No one is registered yet.</strong>
                  <span>
                    Add a Duna player or create a guest spot from the action
                    above.
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
              {!noteMode ? (
                <div
                  className="event-note-choice"
                  role="group"
                  aria-label="Choose how to create a note"
                >
                  <button onClick={() => setNoteMode("voice")} type="button">
                    <Mic aria-hidden size={20} />
                    <span>
                      <strong>Record a voice note</strong>
                      <small>
                        Talk it through. Duna turns it into an editable draft.
                      </small>
                    </span>
                  </button>
                  <button onClick={() => setNoteMode("written")} type="button">
                    <FileText aria-hidden size={20} />
                    <span>
                      <strong>Write a note</strong>
                      <small>
                        Capture a clear thought without extra setup.
                      </small>
                    </span>
                  </button>
                </div>
              ) : noteMode === "voice" ? (
                <>
                  <button
                    className="event-note-change-mode"
                    onClick={() => {
                      setNoteMode(undefined);
                      setUsedVoice(false);
                      setTranscript("");
                    }}
                    type="button"
                  >
                    Choose a different note type
                  </button>
                  <SessionNoteRecorder
                    configured={liveKitConfigured}
                    onChange={setTranscript}
                    onVoiceStarted={() => setUsedVoice(true)}
                    sessionId={session.id}
                    transcript={transcript}
                  />
                </>
              ) : (
                <div className="event-note-written">
                  <div>
                    <span aria-hidden>
                      <FileText size={20} />
                    </span>
                    <span>
                      <strong>Write it while it is fresh.</strong>
                      <small>
                        Save privately first. You can refine recipients and
                        sharing after review.
                      </small>
                    </span>
                    <button
                      onClick={() => {
                        setNoteMode(undefined);
                        setTranscript("");
                      }}
                      type="button"
                    >
                      Change type
                    </button>
                  </div>
                  <label>
                    <span>Your note</span>
                    <textarea
                      name="transcript"
                      onChange={(event) => setTranscript(event.target.value)}
                      placeholder="What changed, what should be repeated, and what needs attention next time?"
                      rows={7}
                      value={transcript}
                    />
                  </label>
                </div>
              )}
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
