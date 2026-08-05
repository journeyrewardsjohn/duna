"use client";

import type { OperatorSessionDetail, OperatorWorkspace } from "@duna/api";
import { formatMoney, formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
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
  ReceiptText,
  ShieldCheck,
  UserCheck,
  UserRoundX,
  UsersRound,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import {
  createSessionNoteAction,
  publishSessionNoteAction,
  recordSessionAttendanceAction,
  type OperatorActionState,
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
          <small>Registered</small>
          <Numeric>{detail.attendees.length}</Numeric>
          <span>{session.capacity - detail.attendees.length} open spots</span>
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
              <div className="event-team-operations__list">
                {detail.teams.map((team) => (
                  <article
                    className={
                      team.needsAttention ? "needs-attention" : undefined
                    }
                    key={team.id}
                  >
                    <header>
                      <span>
                        <strong>{team.captainName}&apos;s team</strong>
                        <small>
                          {team.divisionName} ·{" "}
                          {team.paymentMode === "team"
                            ? "captain pays"
                            : "players pay separately"}
                        </small>
                      </span>
                      <Badge
                        tone={team.needsAttention ? "warning" : "positive"}
                      >
                        {team.needsAttention ? "Partial" : team.status}
                      </Badge>
                    </header>
                    <div className="event-team-operations__progress">
                      <span>
                        <small>Added</small>
                        <strong>
                          {team.playersAdded}/{team.expectedTeamSize}
                        </strong>
                      </span>
                      <span>
                        <small>Claimed</small>
                        <strong>
                          {team.claimedPlayers}/{team.expectedTeamSize}
                        </strong>
                      </span>
                      <span>
                        <small>Paid</small>
                        <strong>
                          {team.paidPlayers}/{team.expectedTeamSize}
                        </strong>
                      </span>
                    </div>
                    <div className="event-team-operations__roster">
                      {team.roster.map((member, index) => (
                        <span key={`${team.id}:${index}`}>
                          <i>{initials(member.displayName)}</i>
                          <span>
                            <strong>{member.displayName}</strong>
                            <small>
                              {member.status}
                              {member.deliveryStatus
                                ? ` · invite ${member.deliveryStatus}`
                                : ""}
                              {member.paid ? " · paid" : " · unpaid"}
                            </small>
                          </span>
                        </span>
                      ))}
                    </div>
                  </article>
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
                <h2>{weather?.condition ?? "Not captured"}</h2>
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
              <p>
                Historical weather snapshots begin once session operations
                capture is enabled for this venue. Duna will not substitute
                today&apos;s forecast.
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
