"use client";

import type { OperatorActivityDetail } from "@duna/api";
import { formatMoney, formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CircleAlert,
  Link2,
  MapPin,
  QrCode,
  UserCheck,
  UserRoundX,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import {
  recordActivityAttendanceAction,
  type OperatorActionState,
} from "@/app/actions";

const initialState: OperatorActionState = { status: "idle", message: "" };

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function reliabilityLabel(
  reliability:
    OperatorActivityDetail["participants"][number]["reliability"] | undefined,
) {
  if (!reliability || reliability.label === "new") return "New history";
  if (reliability.label === "building") return "Building history";
  if (reliability.label === "needs-context") return "Review context";
  if (reliability.label === "highly-reliable") return "Highly reliable";
  return "Reliable";
}

function AttendanceControl({
  detail,
  participant,
}: {
  readonly detail: OperatorActivityDetail;
  readonly participant: OperatorActivityDetail["participants"][number];
}) {
  const [state, action, pending] = useActionState(
    recordActivityAttendanceAction,
    initialState,
  );
  const eligible =
    Boolean(participant.personId) &&
    ["organizer", "accepted", "paid", "confirmed", "checked-in"].includes(
      participant.status,
    );
  const hasStarted = Date.now() >= Date.parse(detail.activity.startsAt);
  return (
    <form action={action} className="event-attendance-control">
      <input name="activityId" type="hidden" value={detail.activity.id} />
      <input name="activityType" type="hidden" value={detail.activity.type} />
      <input name="participantId" type="hidden" value={participant.id} />
      <button
        className={
          participant.attendanceStatus === "attended" ? "active" : undefined
        }
        disabled={pending || !eligible}
        name="status"
        type="submit"
        value="attended"
      >
        <UserCheck aria-hidden size={15} /> Here
      </button>
      <button
        className={
          participant.attendanceStatus === "no-show"
            ? "active danger"
            : undefined
        }
        disabled={pending || !eligible || !hasStarted}
        name="status"
        type="submit"
        value="no-show"
      >
        <UserRoundX aria-hidden size={15} /> No-show
      </button>
      {state.status !== "idle" && (
        <small data-state={state.status}>
          {state.status === "success" ? (
            <Check aria-hidden size={12} />
          ) : (
            <CircleAlert aria-hidden size={12} />
          )}
          {state.message}
        </small>
      )}
    </form>
  );
}

export function ActivityOperationsWorkspace({
  detail,
}: {
  readonly detail: OperatorActivityDetail;
}) {
  const activity = detail.activity;
  const checkedIn = detail.participants.filter(
    (participant) => participant.attendanceStatus === "attended",
  ).length;
  const expected = detail.participants.filter((participant) =>
    ["organizer", "accepted", "paid", "confirmed", "checked-in"].includes(
      participant.status,
    ),
  ).length;
  const typeLabel =
    activity.type === "pickup" ? "Player-hosted match" : "Court reservation";
  const linkedHref = detail.linkedActivity
    ? detail.linkedActivity.type === "pickup"
      ? `/events/matches/${detail.linkedActivity.id}`
      : `/events/court-bookings/${detail.linkedActivity.id}`
    : undefined;
  return (
    <main className="hq-page event-operations-page activity-operations-page">
      <section className="event-operations-hero">
        <div>
          <Link className="hq-back-link" href="/events">
            <ArrowLeft aria-hidden size={15} /> Back to all activity
          </Link>
          <span className="hq-eyebrow">{typeLabel} operations</span>
          <h1>{activity.title}</h1>
          <p>
            <CalendarClock aria-hidden size={15} />
            {formatVenueTime(activity.startsAt, activity.timezone, "en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            <MapPin aria-hidden size={15} /> {activity.venueName}
            {activity.courtName ? ` · ${activity.courtName}` : ""}
          </p>
          <div className="event-operations-hero__badges">
            <Badge
              tone={activity.status === "cancelled" ? "warning" : "neutral"}
            >
              {activity.status.replaceAll("-", " ")}
            </Badge>
            <Badge>{activity.organizerName} · organizer</Badge>
          </div>
        </div>
      </section>

      <section className="event-operations-metrics">
        <article>
          <small>Expected players</small>
          <Numeric>{expected}</Numeric>
          <span>{Math.max(0, activity.capacity - expected)} spots open</span>
        </article>
        <article>
          <small>Checked in</small>
          <Numeric>{checkedIn}</Numeric>
          <span>{Math.max(0, expected - checkedIn)} still expected</span>
        </article>
        <article>
          <small>Booked value</small>
          <strong>
            {formatMoney(activity.totalAmountMinor, activity.currency)}
          </strong>
          <span>
            {formatMoney(activity.fundedAmountMinor, activity.currency)} funded
          </span>
        </article>
        <article>
          <small>Universal check-in</small>
          <strong>Duna Membership</strong>
          <span>QR or 6-character Member ID</span>
        </article>
      </section>

      {detail.linkedActivity && linkedHref && (
        <Link className="activity-linked-record" href={linkedHref}>
          <Link2 aria-hidden size={18} />
          <span>
            <small>Linked record</small>
            <strong>{detail.linkedActivity.title}</strong>
          </span>
          <Badge>{detail.linkedActivity.status}</Badge>
        </Link>
      )}

      <section className="hq-card activity-roster">
        <header>
          <span>
            <span className="hq-eyebrow">Arrival desk</span>
            <h2>Players & check-in</h2>
          </span>
          <span className="activity-roster__scan-note">
            <QrCode aria-hidden size={18} />
            Scan any player’s Duna Membership in Duna Pro
          </span>
        </header>
        <div className="activity-roster__list">
          {detail.participants.map((participant) => (
            <article key={participant.id}>
              <span
                className={`schedule-person-avatar ${
                  participant.avatarUrl ? "schedule-person-avatar--image" : ""
                }`}
                style={
                  participant.avatarUrl
                    ? {
                        backgroundImage: `url("${participant.avatarUrl}")`,
                      }
                    : undefined
                }
              >
                {!participant.avatarUrl && initials(participant.displayName)}
              </span>
              <span className="activity-roster__identity">
                <strong>{participant.displayName}</strong>
                <small>
                  {participant.role} · {participant.status.replaceAll("-", " ")}
                </small>
              </span>
              <span className="activity-roster__reliability">
                <strong>{reliabilityLabel(participant.reliability)}</strong>
                <small>
                  {participant.reliability?.score !== undefined
                    ? `${participant.reliability.score}% · ${participant.reliability.tracked} recorded outcomes`
                    : `${participant.reliability?.tracked ?? 0} recorded outcomes · score shown after 3`}
                </small>
              </span>
              <AttendanceControl detail={detail} participant={participant} />
            </article>
          ))}
          {detail.participants.length === 0 && (
            <div className="hq-empty">
              <UsersRound aria-hidden size={22} />
              <strong>No players have been added.</strong>
              <span>
                Add players from the reservation or match booking flow.
              </span>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
