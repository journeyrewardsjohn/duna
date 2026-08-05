"use client";

import type { OperatorMemberProfile, OperatorWorkspace } from "@duna/api";
import { formatMoney, formatVenueTime } from "@duna/core";
import { Badge, Numeric } from "@duna/ui";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Camera,
  Check,
  CircleAlert,
  Coins,
  CreditCard,
  Dumbbell,
  FileText,
  HeartPulse,
  MessageCircle,
  Pencil,
  Plus,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import Link from "next/link";
import { useActionState, useMemo, useState, type ReactNode } from "react";
import {
  addCalendarParticipantAction,
  issueOrganizationCreditsAction,
  refundOrganizationOrderAction,
  updateMemberProfileAction,
  type OperatorActionState,
} from "@/app/actions";

const initialState: OperatorActionState = { status: "idle", message: "" };
type ActionPanel = "credits" | "register" | "refund" | "profile";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

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

function ActionButton({
  icon,
  label,
  detail,
  onClick,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly detail: string;
  readonly onClick: () => void;
}) {
  return (
    <button onClick={onClick} type="button">
      <span>{icon}</span>
      <span>
        <strong>{label}</strong>
        <small>{detail}</small>
      </span>
      <ArrowRight aria-hidden size={16} />
    </button>
  );
}

function metricValue(value: number | undefined, suffix = ""): string {
  return value === undefined ? "—" : `${Math.round(value)}${suffix}`;
}

export function MemberProfileWorkspace({
  profile,
  workspace,
}: {
  readonly profile: OperatorMemberProfile;
  readonly workspace: OperatorWorkspace;
}) {
  const [panel, setPanel] = useState<ActionPanel>();
  const [creditState, creditAction, creditPending] = useActionState(
    issueOrganizationCreditsAction,
    initialState,
  );
  const [registrationState, registrationAction, registrationPending] =
    useActionState(addCalendarParticipantAction, initialState);
  const [refundState, refundAction, refundPending] = useActionState(
    refundOrganizationOrderAction,
    initialState,
  );
  const [profileState, profileAction, profilePending] = useActionState(
    updateMemberProfileAction,
    initialState,
  );
  const person = profile.relationship;
  const now = new Date();
  const upcomingSessions = profile.sessions.filter(
    (session) =>
      new Date(session.startsAt) > now &&
      !["cancelled", "refunded"].includes(session.registrationStatus),
  );
  const availableSessions = workspace.sessions.filter(
    (session) =>
      new Date(session.startsAt) > now &&
      !["cancelled", "completed", "draft"].includes(session.status) &&
      !profile.sessions.some((existing) => existing.id === session.id),
  );
  const refundablePurchases = profile.purchases.filter(
    (purchase) =>
      ["paid", "partially-refunded"].includes(purchase.status) &&
      purchase.amountMinor > purchase.refundedMinor,
  );
  const nextSession = upcomingSessions.toSorted((left, right) =>
    left.startsAt.localeCompare(right.startsAt),
  )[0];
  const reminderHref = person.phoneE164
    ? `sms:${person.phoneE164}?body=${encodeURIComponent(
        `Hi ${person.displayName.split(" ")[0]}, a quick reminder from ${workspace.organization.name}.`,
      )}`
    : person.email
      ? `mailto:${person.email}?subject=${encodeURIComponent(
          `A reminder from ${workspace.organization.name}`,
        )}`
      : undefined;
  const sharedNotes = profile.notes.filter(
    (note) => note.status === "published",
  );
  const privateNotes = profile.notes.filter(
    (note) => note.visibility === "private",
  );
  const tabs = useMemo(
    () => [
      { href: "#overview", label: "Overview" },
      { href: "#sessions", label: `Sessions ${profile.sessions.length}` },
      { href: "#money", label: "Plans + money" },
      { href: "#coaching", label: "Notes + video" },
      { href: "#health", label: "Health" },
    ],
    [profile.sessions.length],
  );

  return (
    <main className="hq-page member-profile-page">
      <Link className="member-profile-back" href="/members">
        <ArrowLeft aria-hidden size={16} /> All people
      </Link>
      <header className="member-profile-hero">
        <div className="member-profile-hero__identity">
          <span className="member-profile-hero__avatar">
            {person.avatarUrl ? (
              <img alt="" src={person.avatarUrl} />
            ) : (
              initials(person.displayName)
            )}
          </span>
          <span>
            <span className="hq-eyebrow">Customer + player profile</span>
            <h1>{person.displayName}</h1>
            <p>
              @{profile.profile.handle} ·{" "}
              {person.email ?? person.phoneE164 ?? "Contact details missing"}
            </p>
            <span className="member-profile-hero__badges">
              {person.roles.map((role) => (
                <Badge key={role}>{role.replaceAll("-", " ")}</Badge>
              ))}
              {person.isMinor && <Badge tone="warning">minor</Badge>}
              <Badge tone={person.status === "active" ? "positive" : "neutral"}>
                {person.status}
              </Badge>
            </span>
          </span>
        </div>
        <div className="member-profile-hero__actions">
          {reminderHref ? (
            <a className="hq-button hq-button--secondary" href={reminderHref}>
              <MessageCircle aria-hidden size={16} /> Send reminder
            </a>
          ) : (
            <button className="hq-button hq-button--secondary" disabled>
              <MessageCircle aria-hidden size={16} /> No contact method
            </button>
          )}
          <button
            className="hq-button hq-button--primary"
            onClick={() => setPanel("register")}
            type="button"
          >
            <Plus aria-hidden size={16} /> Add to a session
          </button>
        </div>
      </header>

      <nav className="member-profile-tabs" aria-label="Member profile sections">
        {tabs.map((tab) => (
          <a href={tab.href} key={tab.href}>
            {tab.label}
          </a>
        ))}
      </nav>

      <section
        className="member-profile-metrics"
        aria-label="Relationship overview"
      >
        <article>
          <small>Organization credits</small>
          <Numeric>{person.creditBalance}</Numeric>
          <span>{profile.creditGrants.length} historical grants</span>
        </article>
        <article>
          <small>Lifetime spend</small>
          <strong>
            {formatMoney(
              person.lifetimeSpendMinor,
              workspace.organization.currency,
            )}
          </strong>
          <span>{person.purchaseCount} organization purchases</span>
        </article>
        <article>
          <small>Upcoming</small>
          <Numeric>{upcomingSessions.length}</Numeric>
          <span>{nextSession ? nextSession.title : "Nothing scheduled"}</span>
        </article>
        <article data-tone={person.churnRisk.level}>
          <small>Duna relationship signal</small>
          <Numeric>{person.churnRisk.score}</Numeric>
          <span>{person.churnRisk.reasons[0] ?? "Healthy relationship"}</span>
        </article>
      </section>

      <section className="member-profile-layout" id="overview">
        <div className="member-profile-main">
          <section className="hq-card member-next-card">
            <header>
              <span className="member-section-icon">
                <Sparkles aria-hidden size={18} />
              </span>
              <span>
                <small>Most useful next step</small>
                <h2>
                  {nextSession
                    ? `Prepare for ${nextSession.title}`
                    : "Keep the relationship moving"}
                </h2>
              </span>
            </header>
            {nextSession ? (
              <div className="member-next-card__body">
                <span>
                  <CalendarDays aria-hidden size={20} />
                  <span>
                    <strong>
                      {formatVenueTime(
                        nextSession.startsAt,
                        nextSession.timezone,
                        "en-US",
                        {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        },
                      )}
                    </strong>
                    <small>{nextSession.venueName ?? "Location pending"}</small>
                  </span>
                </span>
                <Link href={`/events/${nextSession.id}`}>
                  Open session <ArrowRight aria-hidden size={15} />
                </Link>
              </div>
            ) : (
              <div className="member-next-card__body">
                <p>
                  No future session is scheduled. Add one now or send a personal
                  reminder while this profile is in front of you.
                </p>
                <button onClick={() => setPanel("register")} type="button">
                  Add to a session <ArrowRight aria-hidden size={15} />
                </button>
              </div>
            )}
          </section>

          <section className="hq-card member-timeline-card">
            <header className="member-section-heading">
              <span>
                <small>Full relationship history</small>
                <h2>Timeline</h2>
              </span>
              <Badge>{profile.timeline.length} signals</Badge>
            </header>
            <div className="member-timeline">
              {profile.timeline.map((item) => {
                const icon =
                  item.kind === "session" ? (
                    <CalendarDays size={16} />
                  ) : item.kind === "purchase" || item.kind === "refund" ? (
                    <ReceiptText size={16} />
                  ) : item.kind === "note" ? (
                    <FileText size={16} />
                  ) : item.kind === "video" ? (
                    <Camera size={16} />
                  ) : (
                    <Coins size={16} />
                  );
                const content = (
                  <>
                    <span className="member-timeline__icon">{icon}</span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <time>
                      {formatVenueTime(
                        item.occurredAt,
                        workspace.organization.timezone,
                        "en-US",
                        { month: "short", day: "numeric", year: "numeric" },
                      )}
                    </time>
                  </>
                );
                return item.href ? (
                  <Link href={item.href} key={item.id}>
                    {content}
                  </Link>
                ) : (
                  <article key={item.id}>{content}</article>
                );
              })}
              {profile.timeline.length === 0 && (
                <div className="hq-empty">
                  <strong>This relationship is just getting started.</strong>
                  <span>
                    Sessions, notes, purchases, and videos will collect here.
                  </span>
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="member-profile-rail">
          <section className="hq-card member-jobs-card">
            <header>
              <small>Take care of them</small>
              <h2>Quick actions</h2>
            </header>
            <div>
              <ActionButton
                detail="Post to their organization wallet"
                icon={<WalletCards size={18} />}
                label="Add credits"
                onClick={() => setPanel("credits")}
              />
              <ActionButton
                detail="Register without leaving this profile"
                icon={<TicketCheck size={18} />}
                label="Add to session"
                onClick={() => setPanel("register")}
              />
              <ActionButton
                detail="Original payment or organization credit"
                icon={<ReceiptText size={18} />}
                label="Handle a refund"
                onClick={() => setPanel("refund")}
              />
              <ActionButton
                detail="Contact, market, and playing context"
                icon={<Pencil size={18} />}
                label="Edit profile"
                onClick={() => setPanel("profile")}
              />
            </div>
          </section>
          <section className="hq-card member-plan-card">
            <header>
              <small>Current relationship</small>
              <h2>{person.membershipName ?? "No active plan"}</h2>
            </header>
            <dl>
              <div>
                <dt>Status</dt>
                <dd>{person.membershipStatus ?? "Not enrolled"}</dd>
              </div>
              <div>
                <dt>Credits</dt>
                <dd>{person.creditBalance}</dd>
              </div>
              <div>
                <dt>Joined</dt>
                <dd>
                  {formatVenueTime(
                    person.joinedAt,
                    workspace.organization.timezone,
                    "en-US",
                    { month: "short", day: "numeric", year: "numeric" },
                  )}
                </dd>
              </div>
            </dl>
            <Link href="/products?type=plan">
              View available plans <ArrowRight aria-hidden size={15} />
            </Link>
          </section>
        </aside>
      </section>

      <section className="hq-card member-history-section" id="sessions">
        <header className="member-section-heading">
          <span>
            <small>Services, clinics, events + lessons</small>
            <h2>Session history</h2>
          </span>
          <button
            className="hq-button hq-button--secondary"
            onClick={() => setPanel("register")}
            type="button"
          >
            <Plus size={15} /> Add to session
          </button>
        </header>
        <div className="member-session-list">
          {profile.sessions.map((session) => (
            <Link href={`/events/${session.id}`} key={session.registrationId}>
              <time>
                <strong>
                  {formatVenueTime(
                    session.startsAt,
                    session.timezone,
                    "en-US",
                    {
                      month: "short",
                      day: "numeric",
                    },
                  )}
                </strong>
                <small>
                  {formatVenueTime(
                    session.startsAt,
                    session.timezone,
                    "en-US",
                    {
                      hour: "numeric",
                      minute: "2-digit",
                    },
                  )}
                </small>
              </time>
              <span>
                <strong>{session.title}</strong>
                <small>
                  {session.kind.replaceAll("-", " ")} ·{" "}
                  {session.venueName ?? "Location pending"}
                </small>
              </span>
              <Badge
                tone={
                  session.attendanceStatus === "no-show"
                    ? "warning"
                    : session.attendanceStatus === "attended"
                      ? "positive"
                      : "neutral"
                }
              >
                {(
                  session.attendanceStatus ?? session.registrationStatus
                ).replaceAll("-", " ")}
              </Badge>
              <span>
                <strong>{session.noteCount}</strong>
                <small>notes</small>
              </span>
              <ArrowRight aria-hidden size={16} />
            </Link>
          ))}
          {profile.sessions.length === 0 && (
            <div className="hq-empty">
              <strong>No session history yet.</strong>
              <span>
                Add this person to their first event, service, or lesson.
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="member-profile-two-up" id="money">
        <section className="hq-card member-detail-card">
          <header className="member-section-heading">
            <span>
              <small>Memberships + packages</small>
              <h2>Plans</h2>
            </span>
            <CreditCard aria-hidden size={20} />
          </header>
          <div className="member-plan-list">
            {profile.plans.map((plan) => (
              <article key={plan.id}>
                <span>
                  <strong>{plan.name}</strong>
                  <small>
                    {formatMoney(plan.priceMinor, plan.currency)} /{" "}
                    {plan.interval}
                  </small>
                </span>
                <Badge tone={plan.status === "active" ? "positive" : "neutral"}>
                  {plan.status.replaceAll("-", " ")}
                </Badge>
              </article>
            ))}
            {profile.plans.length === 0 && (
              <p>No organization plan history yet.</p>
            )}
          </div>
        </section>
        <section className="hq-card member-detail-card">
          <header className="member-section-heading">
            <span>
              <small>Orders + ledger-backed returns</small>
              <h2>Purchases</h2>
            </span>
            <ReceiptText aria-hidden size={20} />
          </header>
          <div className="member-purchase-list">
            {profile.purchases.slice(0, 8).map((purchase) => (
              <article key={purchase.orderId}>
                <span>
                  <strong>{purchase.description}</strong>
                  <small>
                    {formatVenueTime(
                      purchase.purchasedAt,
                      workspace.organization.timezone,
                      "en-US",
                      { month: "short", day: "numeric", year: "numeric" },
                    )}
                  </small>
                </span>
                <span>
                  <strong>
                    {formatMoney(purchase.amountMinor, purchase.currency)}
                  </strong>
                  <small>
                    {purchase.refundedMinor
                      ? `${formatMoney(purchase.refundedMinor, purchase.currency)} refunded`
                      : purchase.status.replaceAll("-", " ")}
                  </small>
                </span>
              </article>
            ))}
            {profile.purchases.length === 0 && <p>No paid purchases yet.</p>}
          </div>
        </section>
      </section>

      <section className="member-profile-two-up" id="coaching">
        <section className="hq-card member-detail-card member-note-list">
          <header className="member-section-heading">
            <span>
              <small>Coach context</small>
              <h2>Session notes</h2>
            </span>
            <Badge>{privateNotes.length} private</Badge>
          </header>
          <div>
            {profile.notes.slice(0, 8).map((note) => (
              <Link href={`/events/${note.sessionId}`} key={note.id}>
                <span className="member-section-icon">
                  {note.visibility === "private" ? (
                    <ShieldCheck size={17} />
                  ) : (
                    <MessageCircle size={17} />
                  )}
                </span>
                <span>
                  <strong>{note.subject ?? note.sessionTitle}</strong>
                  <small>{note.summary}</small>
                  <em>
                    {note.visibility === "private"
                      ? "Private to your team"
                      : note.status === "published"
                        ? "Shared with player"
                        : "Shareable draft"}
                  </em>
                </span>
              </Link>
            ))}
            {profile.notes.length === 0 && <p>No coaching notes yet.</p>}
          </div>
          {sharedNotes.length > 0 && (
            <small className="member-card-footnote">
              {sharedNotes.length} reviewed note
              {sharedNotes.length === 1 ? " has" : "s have"} been shared.
            </small>
          )}
        </section>
        <section className="hq-card member-detail-card member-video-list">
          <header className="member-section-heading">
            <span>
              <small>Recent film</small>
              <h2>Videos</h2>
            </span>
            <Camera aria-hidden size={20} />
          </header>
          <div>
            {profile.videos.slice(0, 6).map((video) => (
              <article key={video.id}>
                <span
                  className="member-video-list__thumb"
                  style={
                    video.thumbnailUrl
                      ? { backgroundImage: `url("${video.thumbnailUrl}")` }
                      : undefined
                  }
                >
                  {!video.thumbnailUrl && <Camera aria-hidden size={20} />}
                </span>
                <span>
                  <strong>{video.title}</strong>
                  <small>
                    {video.sessionTitle ?? video.category} · {video.status}
                  </small>
                </span>
              </article>
            ))}
            {profile.videos.length === 0 && (
              <p>No organization-linked videos yet.</p>
            )}
          </div>
        </section>
      </section>

      <section className="hq-card member-health-card" id="health">
        <header className="member-section-heading">
          <span>
            <small>Player-controlled wellness context</small>
            <h2>HealthKit summary</h2>
          </span>
          <Badge tone={profile.health ? "positive" : "neutral"}>
            {profile.health ? "shared by player" : "not shared"}
          </Badge>
        </header>
        {profile.health ? (
          <>
            <div className="member-health-metrics">
              <article>
                <ShieldCheck aria-hidden size={19} />
                <strong>
                  {profile.health.metrics?.readinessScore?.toFixed(1) ?? "—"} /
                  10
                </strong>
                <small>Duna readiness</small>
              </article>
              <article>
                <Dumbbell aria-hidden size={19} />
                <strong>
                  {profile.health.metrics?.strainScore?.toFixed(1) ?? "—"} / 10
                </strong>
                <small>Duna strain</small>
              </article>
              <article>
                <HeartPulse aria-hidden size={19} />
                <strong>
                  {metricValue(profile.health.metrics?.restingHeartRate)}
                </strong>
                <small>resting bpm</small>
              </article>
              <article>
                <Activity aria-hidden size={19} />
                <strong>
                  {metricValue(
                    profile.health.metrics?.heartRateVariabilityMs,
                    " ms",
                  )}
                </strong>
                <small>heart rate variability</small>
              </article>
              <article>
                <Dumbbell aria-hidden size={19} />
                <strong>
                  {metricValue(profile.health.metrics?.exerciseMinutes, " min")}
                </strong>
                <small>exercise</small>
              </article>
              <article>
                <UserRound aria-hidden size={19} />
                <strong>{metricValue(profile.health.metrics?.steps)}</strong>
                <small>steps</small>
              </article>
            </div>
            {profile.health.metrics?.readinessSummary && (
              <p className="member-health-consent">
                <Activity aria-hidden size={18} />
                {profile.health.metrics.readinessSummary} Confidence:{" "}
                {profile.health.metrics.readinessConfidence ?? "low"}.
              </p>
            )}
            <p className="member-health-consent">
              <ShieldCheck aria-hidden size={18} />
              The player chose {profile.health.scopes.join(", ")} for this
              organization. Last observed{" "}
              {profile.health.observedAt
                ? formatVenueTime(
                    profile.health.observedAt,
                    workspace.organization.timezone,
                  )
                : "not yet synced"}
              .
            </p>
          </>
        ) : (
          <div className="member-health-empty">
            <span className="member-section-icon">
              <HeartPulse aria-hidden size={22} />
            </span>
            <span>
              <strong>No health data is visible.</strong>
              <p>
                This is expected until the player explicitly shares selected
                HealthKit summary categories with {workspace.organization.name}.
              </p>
            </span>
          </div>
        )}
      </section>

      {panel && (
        <div className="member-action-overlay" role="presentation">
          <button
            aria-label="Close action panel"
            className="member-action-overlay__backdrop"
            onClick={() => setPanel(undefined)}
            type="button"
          />
          <aside aria-label="Member action" className="member-action-panel">
            <header>
              <span>
                <small>Take care of {person.displayName}</small>
                <h2>
                  {panel === "credits"
                    ? "Add organization credits"
                    : panel === "register"
                      ? "Add to a session"
                      : panel === "refund"
                        ? "Handle a refund"
                        : "Edit profile details"}
                </h2>
              </span>
              <button
                aria-label="Close"
                onClick={() => setPanel(undefined)}
                type="button"
              >
                <X size={19} />
              </button>
            </header>

            {panel === "credits" && (
              <form action={creditAction} className="operator-form">
                <input name="personId" type="hidden" value={person.personId} />
                <label>
                  <span>Credits</span>
                  <input min="1" name="credits" required type="number" />
                </label>
                <label>
                  <span>Expires · optional</span>
                  <input name="expiresAt" type="datetime-local" />
                </label>
                <label>
                  <span>Reason</span>
                  <textarea
                    name="reason"
                    placeholder="Service recovery, package adjustment, or refund…"
                    required
                    rows={3}
                  />
                </label>
                <label className="operator-confirmation">
                  <input
                    name="confirmed"
                    required
                    type="checkbox"
                    value="true"
                  />
                  <span>
                    <strong>Post an auditable credit entry.</strong>
                    This updates their organization wallet and the balanced
                    ledger.
                  </span>
                </label>
                <ActionNotice state={creditState} />
                <button
                  className="hq-button hq-button--primary"
                  disabled={creditPending}
                >
                  {creditPending ? "Posting…" : "Add credits"}
                </button>
              </form>
            )}

            {panel === "register" && (
              <form action={registrationAction} className="operator-form">
                <input name="personId" type="hidden" value={person.personId} />
                <label>
                  <span>Upcoming session</span>
                  <select
                    disabled={availableSessions.length === 0}
                    name="sessionId"
                    required
                  >
                    {availableSessions.map((session) => (
                      <option key={session.id} value={session.id}>
                        {session.title} ·{" "}
                        {formatVenueTime(
                          session.startsAt,
                          session.timezone,
                          "en-US",
                          { month: "short", day: "numeric", hour: "numeric" },
                        )}
                      </option>
                    ))}
                  </select>
                </label>
                <input
                  name="reason"
                  type="hidden"
                  value="Registered from the member profile by an organization operator."
                />
                <ActionNotice state={registrationState} />
                <button
                  className="hq-button hq-button--primary"
                  disabled={
                    registrationPending || availableSessions.length === 0
                  }
                >
                  {registrationPending ? "Adding…" : "Add to session"}
                </button>
                {availableSessions.length === 0 && (
                  <p className="hq-empty">
                    No eligible future sessions are available.
                  </p>
                )}
              </form>
            )}

            {panel === "refund" && (
              <form action={refundAction} className="operator-form">
                <label>
                  <span>Purchase</span>
                  <select
                    disabled={refundablePurchases.length === 0}
                    name="orderId"
                    required
                  >
                    {refundablePurchases.map((purchase) => (
                      <option key={purchase.orderId} value={purchase.orderId}>
                        {purchase.description} ·{" "}
                        {formatMoney(
                          purchase.amountMinor - purchase.refundedMinor,
                          purchase.currency,
                        )}{" "}
                        remaining
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Refund amount</span>
                  <input
                    min="0.01"
                    name="amount"
                    required
                    step="0.01"
                    type="number"
                  />
                </label>
                <label>
                  <span>Return as</span>
                  <select name="disposition">
                    <option value="original-payment">Original payment</option>
                    <option value="organization-credit">
                      Organization credits
                    </option>
                  </select>
                </label>
                <label>
                  <span>Credits · only for a credit refund</span>
                  <input min="1" name="credits" type="number" />
                </label>
                <label>
                  <span>Reason</span>
                  <textarea minLength={5} name="reason" required rows={3} />
                </label>
                <label className="operator-confirmation">
                  <input
                    name="confirmed"
                    required
                    type="checkbox"
                    value="true"
                  />
                  <span>
                    <strong>Review this irreversible money action.</strong>
                    Duna will record the refund and its ledger journal together.
                  </span>
                </label>
                <ActionNotice state={refundState} />
                <button
                  className="hq-button hq-button--primary"
                  disabled={refundPending || refundablePurchases.length === 0}
                >
                  {refundPending ? "Submitting…" : "Submit refund"}
                </button>
              </form>
            )}

            {panel === "profile" && (
              <form action={profileAction} className="operator-form">
                <input name="personId" type="hidden" value={person.personId} />
                <label>
                  <span>Display name</span>
                  <input
                    defaultValue={person.displayName}
                    name="displayName"
                    required
                  />
                </label>
                <label>
                  <span>Email</span>
                  <input
                    defaultValue={person.email}
                    name="email"
                    type="email"
                  />
                </label>
                <label>
                  <span>Mobile · E.164</span>
                  <input
                    defaultValue={person.phoneE164}
                    name="phoneE164"
                    placeholder="+15551234567"
                  />
                </label>
                <label>
                  <span>Home market</span>
                  <input
                    defaultValue={profile.profile.homeMarket}
                    name="homeMarket"
                  />
                </label>
                <label>
                  <span>Playing context</span>
                  <textarea
                    defaultValue={profile.profile.experienceSummary}
                    name="experienceSummary"
                    rows={4}
                  />
                </label>
                <label>
                  <span>Why is this being updated?</span>
                  <input
                    defaultValue="Updated with the customer by an operator."
                    name="reason"
                    required
                  />
                </label>
                <ActionNotice state={profileState} />
                <button
                  className="hq-button hq-button--primary"
                  disabled={profilePending}
                >
                  {profilePending ? "Saving…" : "Save profile"}
                </button>
              </form>
            )}
          </aside>
        </div>
      )}
    </main>
  );
}
