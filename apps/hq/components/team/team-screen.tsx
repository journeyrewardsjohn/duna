import { hqHref } from "@duna/core/hq-routes";
import {
  Avatar,
  Button,
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
  loadTeamWorkspace,
  type TeamContext,
  teamContext,
} from "./team-data";
import {
  classificationLabel,
  memberStateCopy,
  roleLabel,
  type StaffMember,
} from "./team-model";
import { TeamSubNav } from "./team-subnav";

export type TeamTab = "members" | "coverage" | "pay";
export type MemberTab =
  "overview" | "availability" | "sessions" | "pay" | "access";

/** The honest states a Team block can be in. A block in one shows no figure. */
export function TeamBlockState({
  loaded,
  what,
  organization,
}: {
  readonly loaded: Exclude<Loaded<unknown>, { state: "ok" }>;
  /** "the team", "Theo's pay" */
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
        <p className="team-quiet">{`Duna has no record of ${what} for ${organization}.`}</p>
      );
    case "error":
      return (
        <ErrorState
          compact
          message="Something went wrong on our side. Reload to try again; the rest of Team still works."
          reference={loaded.reference}
          title={`Could not load ${what}`}
        />
      );
  }
}

/** Rows while a list loads, shaped like its rows. */
export function TeamRowsSkeleton({
  label,
  rows = 4,
}: {
  readonly label: string;
  readonly rows?: number;
}) {
  return (
    <div
      aria-busy="true"
      aria-label={label}
      className="team-skeleton"
      role="status"
    >
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonListRow key={index} lines={2} />
      ))}
    </div>
  );
}

/** A whole Team screen while it loads (route `loading.tsx`). */
export function TeamLoading() {
  return (
    <div aria-busy="true" className="team">
      <div className="hqs-page-head">
        <div className="hqs-page-head__row">
          <div className="hqs-page-head__text">
            <Skeleton kind="lines" label="Loading Team" lines={2} />
          </div>
        </div>
      </div>
      <div className="hqs-section">
        <TeamRowsSkeleton label="Loading" rows={5} />
      </div>
    </div>
  );
}

function denied(context: TeamContext, area: string, action?: ReactNode) {
  return (
    <div className="team">
      <ShellPage askLabel="Team" askStarters={[]} />
      <PageHeader title="Team" />
      <div className="hqs-state">
        <AccessDeniedState
          action={
            action ?? (
              <Link
                className={buttonClassName({ variant: "secondary" })}
                href="/"
              >
                Back to HQ
              </Link>
            )
          }
          area={area}
          grantedBy={`an owner or manager of ${context.organization}`}
        />
      </div>
    </div>
  );
}

/** The viewer's own line on the team, when they are on it. */
export async function ownMember(): Promise<StaffMember | undefined> {
  const context = await teamContext();
  const workspace = await loadTeamWorkspace();
  if (workspace.state !== "ok" || !context.personId) return undefined;
  return workspace.data.staff.find((row) => row.personId === context.personId);
}

async function teamTabs(context: TeamContext): Promise<SubNavItem[]> {
  const own = await ownMember();
  return [
    { id: "members", label: "Members", href: hqHref("team") },
    { id: "coverage", label: "Coverage", href: hqHref("teamCoverage") },
    ...(context.canSeePay
      ? [{ id: "pay", label: "Pay", href: hqHref("teamPay") }]
      : own
        ? [
            {
              id: "pay",
              label: "Your pay",
              href: hqHref("teamMemberPay", { personId: own.personId }),
            },
          ]
        : []),
  ];
}

/**
 * A Team area screen: the one title, its line, the Team tabs, Ask Duna's
 * page context and the offline banner. Someone who can't see the team (or,
 * for Pay, everyone's pay) gets "You need access", never a crash.
 */
export async function TeamScreen({
  tab,
  title,
  description,
  actions,
  askLabel,
  askStarters,
  crumb,
  parentHref,
  header,
  needsPay = false,
  children,
}: {
  readonly tab: TeamTab;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly askLabel: string;
  readonly askStarters: readonly string[];
  readonly crumb?: string;
  readonly parentHref?: string;
  readonly header?: ReactNode;
  /** Everyone's pay: members:read plus members:write or payments:read. */
  readonly needsPay?: boolean;
  readonly children: ReactNode;
}) {
  const context = await teamContext();
  if (context.session.access !== "operator") return null; // the shell says why
  if (!context.canSeeTeam) return denied(context, "Team");
  if (needsPay && !context.canSeePay) {
    const own = await ownMember();
    return denied(
      context,
      "the team's pay",
      own ? (
        <Button
          href={hqHref("teamMemberPay", { personId: own.personId })}
          variant="secondary"
        >
          See your own pay
        </Button>
      ) : undefined,
    );
  }
  const tabs = await teamTabs(context);
  return (
    <div className="team">
      <ShellPage
        askLabel={askLabel}
        askStarters={askStarters}
        crumb={crumb}
        parentHref={parentHref}
      />
      {header ?? (
        <PageHeader
          actions={actions}
          description={description}
          subnav={<TeamSubNav current={tab} items={tabs} label="Team" />}
          title={title}
        />
      )}
      <OfflineBanner writes="refused" />
      {children}
    </div>
  );
}

export interface MemberPage {
  readonly context: TeamContext;
  readonly member: StaffMember;
  readonly isSelf: boolean;
  readonly currency: StaffMember["currency"];
}

/** Finds the member for a page, or the state to show instead. */
export async function memberPage(
  personId: string,
): Promise<
  | { readonly kind: "ok"; readonly page: MemberPage }
  | { readonly kind: "state"; readonly node: ReactNode }
  | { readonly kind: "missing" }
> {
  const context = await teamContext();
  if (context.session.access !== "operator") {
    return { kind: "state", node: null };
  }
  if (!context.canSeeTeam) {
    return { kind: "state", node: denied(context, "Team") };
  }
  const workspace = await loadTeamWorkspace();
  if (workspace.state !== "ok") {
    return {
      kind: "state",
      node: (
        <div className="team">
          <ShellPage askLabel="Team member" askStarters={[]} />
          <PageHeader title="Team member" />
          <TeamBlockState
            loaded={workspace}
            organization={context.organization}
            what="this team member"
          />
        </div>
      ),
    };
  }
  const member = workspace.data.staff.find((row) => row.personId === personId);
  if (!member) return { kind: "missing" };
  return {
    kind: "ok",
    page: {
      context,
      member,
      isSelf: member.personId === context.personId,
      currency: workspace.data.currency,
    },
  };
}

/**
 * An open team member (S3): ObjectHeader with the one title, status, key
 * facts and the member's SubNav (Overview, Availability, Sessions, Pay,
 * Access).
 */
export function MemberScreen({
  page,
  tab,
  summary,
  actions,
  askStarters,
  children,
}: {
  readonly page: MemberPage;
  readonly tab: MemberTab;
  /** The shared rule's verdict in words, under the name. */
  readonly summary?: string;
  readonly actions?: ReactNode;
  readonly askStarters: readonly string[];
  readonly children: ReactNode;
}) {
  const { member, context, isSelf } = page;
  const state = memberStateCopy(member.active ? "active" : "paused");
  const params = { personId: member.personId };
  const canSeePay = isSelf || context.canSeePay;
  const items: SubNavItem[] = [
    { id: "overview", label: "Overview", href: hqHref("teamMember", params) },
    {
      id: "availability",
      label: "Availability",
      href: hqHref("teamMemberAvailability", params),
    },
    {
      id: "sessions",
      label: "Sessions",
      href: hqHref("teamMemberSessions", params),
      count: member.upcomingSessions > 0 ? member.upcomingSessions : undefined,
    },
    ...(canSeePay
      ? [{ id: "pay", label: "Pay", href: hqHref("teamMemberPay", params) }]
      : []),
    { id: "access", label: "Access", href: hqHref("teamMemberAccess", params) },
  ];
  const tabWords: Record<MemberTab, string> = {
    overview: "",
    availability: " availability",
    sessions: " sessions",
    pay: " pay",
    access: " access",
  };
  return (
    <div className="team">
      <ShellPage
        askLabel={`${member.displayName}${tabWords[tab]} (team member)`}
        askStarters={askStarters}
        crumb={member.displayName}
        parentHref={hqHref("team")}
      />
      <ObjectHeader
        actions={actions}
        back={{ href: hqHref("team"), label: "Team" }}
        description={summary}
        facts={[
          { label: "Role", value: roleLabel(member.role, member.isOwner) },
          {
            label: "Classification",
            value: classificationLabel(member.workerClassification),
          },
          {
            label: "Sessions, last 30 days",
            value: String(member.sessionsRun30d),
            numeric: true,
          },
          ...(isSelf ? [{ label: "You", value: "This is you" }] : []),
        ]}
        mark={
          <Avatar name={member.displayName} size="lg" src={member.avatarUrl} />
        }
        renderLink={renderLink}
        status={state}
        subnav={
          <TeamSubNav current={tab} items={items} label={member.displayName} />
        }
        title={member.displayName}
      />
      <OfflineBanner writes="refused" />
      {children}
    </div>
  );
}
