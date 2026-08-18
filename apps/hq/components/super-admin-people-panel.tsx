"use client";

import type {
  SuperAdminPeopleOverview,
  SuperAdminPersonProfile,
} from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import {
  ArrowUpRight,
  BadgeCheck,
  Building2,
  CalendarPlus,
  Check,
  CircleAlert,
  CreditCard,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import {
  assignPersonToEventAction,
  confirmSuperAdminRefundAction,
  grantPersonOrganizationRoleAction,
  prepareSuperAdminRefundAction,
  setPersonSuperAdminAction,
  type PeopleAdminActionState,
} from "@/app/admin/actions";

const initialState: PeopleAdminActionState = { status: "idle", message: "" };

function ActionNotice({ state }: { readonly state: PeopleAdminActionState }) {
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

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(value / 100);
}

function when(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function roleLabel(role: string): string {
  return role === "owner" ? "Director" : role.replaceAll("-", " ");
}

function MetricCards({
  overview,
}: {
  readonly overview: SuperAdminPeopleOverview;
}) {
  const metrics = [
    {
      label: "Duna accounts",
      value: overview.totals.accounts,
      icon: UsersRound,
    },
    {
      label: "Super Admins",
      value: overview.totals.superAdmins,
      icon: ShieldCheck,
    },
    {
      label: "Active organizations",
      value: overview.totals.activeOrganizations,
      icon: Building2,
    },
    {
      label: "Upcoming events",
      value: overview.totals.upcomingEvents,
      icon: CalendarPlus,
    },
  ] as const;
  return (
    <section className="people-metric-grid" aria-label="People platform totals">
      {metrics.map(({ icon: Icon, label, value }) => (
        <article key={label}>
          <span>
            <small>{label}</small>
            <Icon aria-hidden size={17} />
          </span>
          <Numeric>{value.toLocaleString()}</Numeric>
        </article>
      ))}
    </section>
  );
}

function OrganizationRoleForm({
  personId,
  organizations,
}: {
  readonly personId: string;
  readonly organizations: SuperAdminPeopleOverview["organizations"];
}) {
  const [state, action, pending] = useActionState(
    grantPersonOrganizationRoleAction,
    initialState,
  );
  return (
    <form action={action} className="operator-form people-action-form">
      <input name="personId" type="hidden" value={personId} />
      <header>
        <Building2 aria-hidden size={18} />
        <div>
          <h3>Organization access</h3>
          <p>
            Assign a scoped staff role. The hidden Duna platform workspace is
            never listed here.
          </p>
        </div>
      </header>
      <div className="operator-form-grid operator-form-grid--two">
        <label>
          <span>Organization</span>
          <select name="organizationId" required>
            <option value="">Choose an organization</option>
            {organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name} · {organization.plan}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Role</span>
          <select defaultValue="coach" name="role">
            <option value="director">Director</option>
            <option value="manager">Manager</option>
            <option value="coach">Coach</option>
            <option value="front-desk">Front desk</option>
            <option value="accountant">Accountant</option>
          </select>
        </label>
        <label className="operator-field--full">
          <span>Worker classification</span>
          <select defaultValue="1099-contractor" name="workerClassification">
            <option value="1099-contractor">1099 contractor</option>
            <option value="w2-employee">W-2 employee</option>
          </select>
        </label>
      </div>
      <footer>
        <ActionNotice state={state} />
        <button
          className="hq-button hq-button--secondary"
          disabled={pending}
          type="submit"
        >
          {pending ? "Assigning…" : "Grant organization role"}
        </button>
      </footer>
    </form>
  );
}

function EventAssignmentForm({
  personId,
  events,
}: {
  readonly personId: string;
  readonly events: SuperAdminPeopleOverview["events"];
}) {
  const [state, action, pending] = useActionState(
    assignPersonToEventAction,
    initialState,
  );
  return (
    <form action={action} className="operator-form people-action-form">
      <input name="personId" type="hidden" value={personId} />
      <header>
        <CalendarPlus aria-hidden size={18} />
        <div>
          <h3>Event assignment</h3>
          <p>
            Add this person to an event anywhere on Duna. Capacity and
            event-status checks still apply.
          </p>
        </div>
      </header>
      <label>
        <span>Upcoming event</span>
        <select name="sessionId" required>
          <option value="">Choose an event</option>
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title} · {event.organizationName} · {when(event.startsAt)}{" "}
              · {event.confirmedCount}/{event.capacity}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Assignment reason</span>
        <textarea
          minLength={10}
          name="reason"
          placeholder="Why Duna is placing this person in this event"
          required
        />
      </label>
      <footer>
        <ActionNotice state={state} />
        <button
          className="hq-button hq-button--secondary"
          disabled={pending}
          type="submit"
        >
          {pending ? "Assigning…" : "Assign to event"}
        </button>
      </footer>
    </form>
  );
}

function PlatformWorkspaceSyncForm({
  personId,
}: {
  readonly personId: string;
}) {
  const [state, action, pending] = useActionState(
    setPersonSuperAdminAction,
    initialState,
  );
  return (
    <form action={action} className="operator-form people-platform-access">
      <input name="personId" type="hidden" value={personId} />
      <input name="enabled" type="hidden" value="true" />
      <input name="mode" type="hidden" value="sync" />
      <header>
        <ShieldCheck aria-hidden size={19} />
        <div>
          <span className="hq-eyebrow">Identity workspace</span>
          <h3>Synchronize Duna workspace</h3>
          <p>
            Repairs this Super Admin&apos;s hidden Duna WorkOS membership. It
            does not change platform authority or expose Duna as a tenant.
          </p>
        </div>
        <Badge tone="neutral">Private workspace</Badge>
      </header>
      <label>
        <span>Audit reason</span>
        <textarea
          defaultValue="Synchronize hidden Duna platform workspace membership."
          minLength={12}
          name="reason"
          required
        />
      </label>
      <label className="operator-confirmation">
        <input name="confirmed" required type="checkbox" value="true" />
        <span>
          <strong>I understand this synchronizes provider access.</strong>
          The Duna workspace remains hidden from organization selectors and
          cannot become an operating context.
        </span>
      </label>
      <footer>
        <ActionNotice state={state} />
        <button
          className="hq-button hq-button--secondary"
          disabled={pending}
          type="submit"
        >
          {pending ? "Synchronizing…" : "Synchronize Duna workspace"}
        </button>
      </footer>
    </form>
  );
}

function PlatformAccessForm({
  personId,
  enabled,
}: {
  readonly personId: string;
  readonly enabled: boolean;
}) {
  const [state, action, pending] = useActionState(
    setPersonSuperAdminAction,
    initialState,
  );
  return (
    <>
      {enabled && <PlatformWorkspaceSyncForm personId={personId} />}
      <form action={action} className="operator-form people-platform-access">
        <input name="personId" type="hidden" value={personId} />
        <input
          name="enabled"
          type="hidden"
          value={enabled ? "false" : "true"}
        />
        <header>
          <ShieldCheck aria-hidden size={19} />
          <div>
            <span className="hq-eyebrow">Platform authority</span>
            <h3>{enabled ? "Super Admin active" : "Make Super Admin"}</h3>
            <p>
              {enabled
                ? "This removes platform-wide authority, not organization access."
                : "Creates an audited Duna platform grant and links the person to the hidden Duna WorkOS workspace when available."}
            </p>
          </div>
          <Badge tone={enabled ? "warning" : "neutral"}>
            {enabled ? "Elevated access" : "No platform access"}
          </Badge>
        </header>
        <label>
          <span>Audit reason</span>
          <textarea
            minLength={12}
            name="reason"
            placeholder={
              enabled
                ? "Why this platform access is being removed"
                : "Why this person needs platform-wide authority"
            }
            required
          />
        </label>
        <label className="operator-confirmation">
          <input name="confirmed" required type="checkbox" value="true" />
          <span>
            <strong>I understand this changes platform-wide authority.</strong>
            This access is audited and the Duna system organization remains
            invisible in tenant selectors.
          </span>
        </label>
        <footer>
          <ActionNotice state={state} />
          <button
            className={
              enabled
                ? "hq-button hq-button--secondary"
                : "hq-button hq-button--primary"
            }
            disabled={pending}
            type="submit"
          >
            {pending
              ? "Saving…"
              : enabled
                ? "Revoke Super Admin"
                : "Grant Super Admin"}
          </button>
        </footer>
      </form>
    </>
  );
}

function RefundControls({
  personId,
  purchase,
}: {
  readonly personId: string;
  readonly purchase: SuperAdminPersonProfile["purchases"][number];
}) {
  const [reviewState, prepare, preparing] = useActionState(
    prepareSuperAdminRefundAction,
    initialState,
  );
  const [confirmState, confirm, confirming] = useActionState(
    confirmSuperAdminRefundAction,
    initialState,
  );
  if (purchase.refundableMinor <= 0) return null;
  return (
    <div className="people-refund-controls">
      <form action={prepare}>
        <input name="personId" type="hidden" value={personId} />
        <input name="orderId" type="hidden" value={purchase.id} />
        <div className="people-refund-fields">
          <label>
            <span>Refund amount</span>
            <input
              defaultValue={(purchase.refundableMinor / 100).toFixed(2)}
              max={(purchase.refundableMinor / 100).toFixed(2)}
              min="0.01"
              name="amount"
              required
              step="0.01"
              type="number"
            />
          </label>
          <label>
            <span>Return to</span>
            <select defaultValue="original-payment" name="disposition">
              <option value="original-payment">Original payment</option>
              <option value="organization-credit">Organization credit</option>
            </select>
          </label>
          <label>
            <span>Credits · only if applicable</span>
            <input
              min="1"
              name="credits"
              placeholder="Optional"
              type="number"
            />
          </label>
        </div>
        <label>
          <span>Refund reason</span>
          <textarea
            minLength={12}
            name="reason"
            placeholder="Why this money movement is warranted"
            required
          />
        </label>
        <footer>
          <ActionNotice state={reviewState} />
          <button
            className="hq-button hq-button--secondary"
            disabled={preparing}
            type="submit"
          >
            {preparing ? "Creating review…" : "Review refund"}
          </button>
        </footer>
      </form>
      {reviewState.reviewId && reviewState.confirmationCode && (
        <form action={confirm} className="people-refund-confirm">
          <input name="reviewId" type="hidden" value={reviewState.reviewId} />
          <strong>Second validation required</strong>
          <p>
            Type <code>{reviewState.confirmationCode}</code> exactly. This
            review expires{" "}
            {reviewState.expiresAt ? when(reviewState.expiresAt) : "soon"}.
          </p>
          <label>
            <span>Confirmation code</span>
            <input autoComplete="off" name="confirmationCode" required />
          </label>
          <footer>
            <ActionNotice state={confirmState} />
            <button
              className="hq-button hq-button--primary"
              disabled={confirming}
              type="submit"
            >
              {confirming ? "Sending…" : "Confirm refund"}
            </button>
          </footer>
        </form>
      )}
    </div>
  );
}

function PersonProfile({
  overview,
  profile,
}: {
  readonly overview: SuperAdminPeopleOverview;
  readonly profile: SuperAdminPersonProfile;
}) {
  return (
    <section className="people-profile-workspace">
      <header className="people-profile-heading">
        <div className="people-avatar" aria-hidden>
          {profile.person.avatarUrl ? (
            <img alt="" src={profile.person.avatarUrl} />
          ) : (
            profile.person.displayName.slice(0, 2).toUpperCase()
          )}
        </div>
        <div>
          <span className="hq-eyebrow">
            Duna account · {profile.person.dunaMemberId}
          </span>
          <h2>{profile.person.displayName}</h2>
          <p>
            {profile.person.email ?? "No email linked"} ·{" "}
            {profile.person.status} ·{" "}
            {profile.person.ageBand.replaceAll("-", " ")}
          </p>
        </div>
        <div className="people-role-badges">
          {profile.person.accountRoles.map((role) => (
            <Badge
              key={role}
              tone={role === "super-admin" ? "warning" : "neutral"}
            >
              {roleLabel(role)}
            </Badge>
          ))}
        </div>
      </header>

      <div className="people-action-grid">
        <OrganizationRoleForm
          organizations={overview.organizations}
          personId={profile.person.id}
        />
        <EventAssignmentForm
          events={overview.events}
          personId={profile.person.id}
        />
      </div>

      <PlatformAccessForm
        personId={profile.person.id}
        enabled={profile.person.isSuperAdmin}
      />

      <div className="people-detail-grid">
        <section className="hq-card people-detail-card">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Organization relationships</span>
              <h3>Roles and access</h3>
            </div>
            <Badge>{profile.organizationRoles.length}</Badge>
          </header>
          {profile.organizationRoles.length ? (
            profile.organizationRoles.map((membership) => (
              <article key={`${membership.organizationId}-${membership.role}`}>
                <div>
                  <strong>{membership.organizationName}</strong>
                  <small>{roleLabel(membership.role)}</small>
                </div>
                <Badge tone={membership.active ? "positive" : "neutral"}>
                  {membership.active ? "Active" : "Inactive"}
                </Badge>
              </article>
            ))
          ) : (
            <p className="people-empty">No organization staff roles yet.</p>
          )}
        </section>
        <section className="hq-card people-detail-card">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Event record</span>
              <h3>Assignments</h3>
            </div>
            <Badge>{profile.eventAssignments.length}</Badge>
          </header>
          {profile.eventAssignments.length ? (
            profile.eventAssignments.map((assignment) => (
              <article key={assignment.id}>
                <div>
                  <strong>{assignment.title}</strong>
                  <small>
                    {assignment.organizationName ?? "Organization unavailable"}{" "}
                    · {when(assignment.startsAt)}
                  </small>
                </div>
                <Badge>{assignment.status}</Badge>
              </article>
            ))
          ) : (
            <p className="people-empty">No event assignments yet.</p>
          )}
        </section>
      </div>

      <section className="hq-card people-purchases">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Commerce record</span>
            <h3>Purchase history</h3>
            <p>
              Every amount comes from the original order and refund ledger.
              Refunds require a server-issued second validation code.
            </p>
          </div>
          <CreditCard aria-hidden size={22} />
        </header>
        {profile.purchases.length ? (
          profile.purchases.map((purchase) => (
            <article key={purchase.id}>
              <div className="people-purchase-summary">
                <span>
                  <strong>
                    {money(purchase.totalMinor, purchase.currency)}
                  </strong>
                  <small>
                    {purchase.organizationName ?? "Platform purchase"} ·{" "}
                    {when(purchase.createdAt)}
                  </small>
                </span>
                <Badge
                  tone={purchase.refundableMinor > 0 ? "warning" : "neutral"}
                >
                  {purchase.status}
                </Badge>
                <small>
                  Remaining refundable:{" "}
                  {money(purchase.refundableMinor, purchase.currency)}
                </small>
              </div>
              <RefundControls
                personId={profile.person.id}
                purchase={purchase}
              />
            </article>
          ))
        ) : (
          <p className="people-empty">
            No purchases are attached to this account.
          </p>
        )}
      </section>
    </section>
  );
}

export function SuperAdminPeoplePanel({
  overview,
  personProfile,
  query,
}: {
  readonly overview: SuperAdminPeopleOverview;
  readonly personProfile?: SuperAdminPersonProfile | null;
  readonly query?: string;
}) {
  const queryString = query ? `&q=${encodeURIComponent(query)}` : "";
  const directoryHref = (page: number) =>
    `/admin/people?page=${page}${queryString}`;
  return (
    <div className="super-admin-people">
      <MetricCards overview={overview} />
      <section className="people-directory-layout">
        <aside className="hq-card people-directory">
          <header className="hq-card-heading">
            <div>
              <span className="hq-eyebrow">Platform directory</span>
              <h2>Every Duna account</h2>
            </div>
            <Badge>Page {overview.page}</Badge>
          </header>
          <form action="/admin/people" className="people-search" method="get">
            <input
              defaultValue={query}
              name="q"
              placeholder="Name, email, handle, member ID"
            />
            <button className="hq-button hq-button--secondary" type="submit">
              Search
            </button>
          </form>
          <div className="people-directory-list">
            {overview.people.map((person) => (
              <Link
                href={`/admin/people?person=${person.id}&page=${overview.page}${queryString}`}
                key={person.id}
              >
                <span className="people-avatar" aria-hidden>
                  {person.avatarUrl ? (
                    <img alt="" src={person.avatarUrl} />
                  ) : (
                    person.displayName.slice(0, 2).toUpperCase()
                  )}
                </span>
                <span>
                  <strong>{person.displayName}</strong>
                  <small>{person.email ?? person.dunaMemberId}</small>
                  <em>{person.accountRoles.map(roleLabel).join(" · ")}</em>
                </span>
                {person.isSuperAdmin ? (
                  <ShieldCheck aria-label="Super Admin" size={17} />
                ) : (
                  <ArrowUpRight aria-hidden size={16} />
                )}
              </Link>
            ))}
            {overview.people.length === 0 && (
              <p className="people-empty">
                No Duna accounts match this search.
              </p>
            )}
          </div>
          {(overview.page > 1 || overview.hasNextPage) && (
            <nav
              aria-label="People directory pages"
              className="people-directory-pagination"
            >
              {overview.page > 1 ? (
                <Link
                  className="hq-button hq-button--secondary"
                  href={directoryHref(overview.page - 1)}
                >
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <small>{overview.people.length} accounts on this page</small>
              {overview.hasNextPage ? (
                <Link
                  className="hq-button hq-button--secondary"
                  href={directoryHref(overview.page + 1)}
                >
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </aside>
        <div>
          {personProfile ? (
            <PersonProfile overview={overview} profile={personProfile} />
          ) : (
            <section className="hq-card people-profile-placeholder">
              <BadgeCheck aria-hidden size={28} />
              <h2>Choose a person</h2>
              <p>
                Open an account to see its roles, event assignments, purchase
                history, refund controls, and platform authority.
              </p>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}
