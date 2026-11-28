import { hqHref } from "@duna/core/hq-routes";
import {
  Avatar,
  buttonClassName,
  ErrorState,
  NotConfigured,
  ObjectHeader,
  OfflineBanner,
  Skeleton,
  SkeletonListRow,
  type SubNavItem,
} from "@duna/ui/tideline";
import Link from "next/link";
import type { ReactNode } from "react";
import { AccessDeniedState } from "@/lib/access-state";
import { renderLink } from "../money/money-link";
import { PageHeader } from "../shell/page-header";
import { ShellPage } from "../shell/shell-context";
import {
  type Loaded,
  loadPerson,
  type PeopleContext,
  peopleContext,
  type PersonRecord,
} from "./people-data";
import { monthYear, shortDate } from "./people-model";
import { PeopleSubNav } from "./people-subnav";

export type PersonTab =
  | "overview"
  | "memberships"
  | "bookings"
  | "payments"
  | "family"
  | "documents"
  | "notes"
  | "health";

/** The honest states a People block can be in. A block in one shows no data. */
export function PeopleBlockState({
  loaded,
  what,
  organization,
}: {
  readonly loaded: Exclude<Loaded<unknown>, { state: "ok" }>;
  /** "the people list", "Maya's bookings" */
  readonly what: string;
  readonly organization: string;
}) {
  switch (loaded.state) {
    case "denied":
      return (
        <AccessDeniedState
          area={what}
          compact
          grantedBy={`an owner or manager of ${organization}`}
        />
      );
    case "not-configured":
      return (
        <NotConfigured
          compact
          feature={what.replace(/^\w/, (c) => c.toUpperCase())}
          needs="Duna Database"
          owner={`an owner of ${organization}`}
        />
      );
    case "not-found":
      return (
        <p className="people-quiet">{`Duna has no record of ${what} for ${organization}.`}</p>
      );
    case "error":
      return (
        <ErrorState
          compact
          message="Something went wrong on our side. Reload to try again; the rest of People still works."
          reference={loaded.reference}
          title={`Could not load ${what}`}
        />
      );
  }
}

/** Rows while a list loads, shaped like its rows. */
export function PeopleRowsSkeleton({
  label,
  rows = 6,
}: {
  readonly label: string;
  readonly rows?: number;
}) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="people-skeleton"
      role="status"
    >
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonListRow key={index} lines={2} />
      ))}
    </div>
  );
}

/** A whole People screen while it loads (route `loading.tsx`). */
export function PeopleLoading() {
  return (
    <div aria-busy="true" className="people">
      <div className="hqs-page-head">
        <div className="hqs-page-head__row">
          <div className="hqs-page-head__text">
            <Skeleton kind="lines" label="Loading People" lines={2} />
          </div>
        </div>
      </div>
      <div className="hqs-section">
        <PeopleRowsSkeleton label="Loading" rows={6} />
      </div>
    </div>
  );
}

function denied(context: PeopleContext, area: string) {
  return (
    <div className="people">
      <ShellPage askLabel="People" askStarters={[]} />
      <PageHeader title="People" />
      <div className="hqs-state">
        <AccessDeniedState
          action={
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/"
            >
              Back to HQ
            </Link>
          }
          area={area}
          grantedBy={`an owner or manager of ${context.organization}`}
        />
      </div>
    </div>
  );
}

/**
 * A People area screen: the one title, its line, actions, Ask Duna's page
 * context and the offline banner. Someone who can't see the club's people
 * (or, for `needsWrite`, change them) gets "You need access", never a crash.
 */
export async function PeopleScreen({
  title,
  description,
  actions,
  askLabel,
  askStarters,
  crumb,
  parentHref,
  back,
  needsWrite = false,
  area = "People",
  children,
}: {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly askLabel: string;
  readonly askStarters: readonly string[];
  readonly crumb?: string;
  readonly parentHref?: string;
  readonly back?: { readonly href: string; readonly label: string };
  /** Adding, importing and merging: members:write. */
  readonly needsWrite?: boolean;
  /** What the access state names: "Adding people". */
  readonly area?: string;
  readonly children: ReactNode;
}) {
  const context = await peopleContext();
  if (context.session.access !== "operator") return null; // the shell says why
  if (!context.canSeePeople) return denied(context, "People");
  if (needsWrite && !context.canWrite) return denied(context, area);
  return (
    <div className="people">
      <ShellPage
        askLabel={askLabel}
        askStarters={askStarters}
        crumb={crumb}
        parentHref={parentHref}
      />
      <PageHeader
        actions={actions}
        back={back}
        description={description}
        title={title}
      />
      <OfflineBanner writes="refused" />
      {children}
    </div>
  );
}

export interface PersonPage {
  readonly context: PeopleContext;
  readonly record: PersonRecord;
}

/** Finds the person for a page, or the state to show instead. */
export async function personPage(
  personId: string,
): Promise<
  | { readonly kind: "ok"; readonly page: PersonPage }
  | { readonly kind: "state"; readonly node: ReactNode }
  | { readonly kind: "missing" }
> {
  const context = await peopleContext();
  if (context.session.access !== "operator") {
    return { kind: "state", node: null };
  }
  if (!context.canSeePeople) {
    return { kind: "state", node: denied(context, "People") };
  }
  const loaded = await loadPerson(personId);
  if (loaded.state === "not-found") return { kind: "missing" };
  if (loaded.state !== "ok") {
    return {
      kind: "state",
      node: (
        <div className="people">
          <ShellPage askLabel="A person" askStarters={[]} />
          <PageHeader
            back={{ href: hqHref("people"), label: "People" }}
            title="Person"
          />
          <PeopleBlockState
            loaded={loaded}
            organization={context.organization}
            what="this person"
          />
        </div>
      ),
    };
  }
  return { kind: "ok", page: { context, record: loaded.data } };
}

/** The tabs an open person has for this viewer: no Payments or Health tab
 * exists for a role without the permission (not a disabled tab). */
export function personTabs(page: PersonPage): SubNavItem[] {
  const { row, profile, canSeeHealth } = page.record;
  const params = { personId: row.id };
  return [
    { id: "overview", label: "Overview", href: hqHref("member", params) },
    {
      id: "memberships",
      label: "Memberships and credits",
      href: hqHref("memberMemberships", params),
    },
    {
      id: "bookings",
      label: "Bookings",
      href: hqHref("memberBookings", params),
      count: row.upcoming > 0 ? row.upcoming : undefined,
    },
    ...(page.context.canSeePayments
      ? [
          {
            id: "payments",
            label: "Payments",
            href: hqHref("memberPayments", params),
          },
        ]
      : []),
    { id: "family", label: "Family", href: hqHref("memberFamily", params) },
    {
      id: "documents",
      label: "Documents",
      href: hqHref("memberDocuments", params),
    },
    {
      id: "notes",
      label: "Notes",
      href: hqHref("memberNotes", params),
      count: profile.notes.length > 0 ? profile.notes.length : undefined,
    },
    ...(canSeeHealth
      ? [
          {
            id: "health",
            label: "Health",
            href: hqHref("memberHealth", params),
          },
        ]
      : []),
  ];
}

function personStatus(record: PersonRecord) {
  const { row } = record;
  if (row.status === "pending")
    return { label: "Invited", tone: "info" as const };
  if (row.status === "inactive")
    return { label: "Inactive", tone: "neutral" as const };
  if (row.isJunior) return { label: "Junior", tone: "neutral" as const };
  if (row.attention.length > 0)
    return { label: "Needs attention", tone: "attention" as const };
  return { label: "Active", tone: "positive" as const };
}

/**
 * An open person (S3): ObjectHeader with the one title, the status in words,
 * key facts and the person's SubNav. A junior's page says who the guardian
 * is at the top and never shows a direct contact for the child.
 */
export function PersonScreen({
  page,
  tab,
  actions,
  askStarters,
  children,
}: {
  readonly page: PersonPage;
  readonly tab: PersonTab;
  readonly actions?: ReactNode;
  readonly askStarters: readonly string[];
  readonly children: ReactNode;
}) {
  const { record, context } = page;
  const { row } = record;
  const now = new Date(context.now);
  const guardianLine = row.isJunior
    ? row.guardianName
      ? `Junior. Guardian: ${row.guardianName}. Messages and bookings go through the guardian.`
      : row.guardianState === "verified"
        ? "Junior. A guardian is confirmed; messages and bookings go through them."
        : "Junior. No guardian has confirmed yet; the club can't contact this junior directly."
    : undefined;
  const contact = row.isJunior
    ? undefined
    : [row.email, row.phone].filter(Boolean).join(" · ") || undefined;
  const tabWords: Record<PersonTab, string> = {
    overview: "",
    memberships: " memberships and credits",
    bookings: " bookings",
    payments: " payments",
    family: " family",
    documents: " documents",
    notes: " notes",
    health: " health summary",
  };
  return (
    <div className="people">
      <ShellPage
        askLabel={`${row.name}${tabWords[tab]} (person ${row.id})`}
        askStarters={askStarters}
        crumb={row.name}
        parentHref={hqHref("people")}
      />
      <ObjectHeader
        actions={actions}
        back={{ href: hqHref("people"), label: "People" }}
        className="people-objhead"
        description={
          guardianLine ? (
            <span className="people-guardian-line" data-junior="true">
              {guardianLine}
            </span>
          ) : (
            <>
              {row.relation}
              {contact ? (
                <span className="people-contact">{contact}</span>
              ) : null}
            </>
          )
        }
        facts={[
          {
            label: "Joined",
            value: monthYear(row.memberSince, context.timeZone),
          },
          { label: "Plan", value: row.plan ?? "No plan" },
          { label: "Credits", value: String(row.credits), numeric: true },
          {
            label: "Last seen",
            value: row.lastSeenAt
              ? shortDate(row.lastSeenAt, context.timeZone, now)
              : "Not yet",
          },
        ]}
        mark={<Avatar name={row.name} size="lg" src={row.avatarUrl} />}
        renderLink={renderLink}
        status={personStatus(record)}
        subnav={
          <PeopleSubNav
            current={tab}
            items={personTabs(page)}
            label={row.name}
          />
        }
        title={row.name}
      />
      <OfflineBanner writes="refused" />
      {children}
    </div>
  );
}
