import { buttonClassName, OfflineBanner } from "@duna/ui/tideline";
import Link from "next/link";
import type { ReactNode } from "react";
import { AccessDeniedState } from "@/lib/access-state";
import { getHqSession, hasScope } from "../shell/hq-session";
import { PageHeader } from "../shell/page-header";
import { ShellPage } from "../shell/shell-context";
import type { ShellSession } from "../shell/session-types";
import { SetupNav, type SetupTab } from "./setup-nav";

/** The permission every Club setup change needs (operator.setup.* writes). */
export const SETUP_SCOPE = "sessions:write";

export interface SetupContext {
  readonly session: ShellSession;
  readonly organization: string;
  readonly timeZone: string;
}

export async function setupContext(): Promise<SetupContext> {
  const session = await getHqSession();
  return {
    session,
    organization: session.organization?.name ?? "your club",
    timeZone: session.organization?.timezone ?? "UTC",
  };
}

/** "You need access" for Club setup: a coach sees this, never a crash. */
export function SetupDenied({
  organization,
}: {
  readonly organization: string;
}) {
  return (
    <div className="setup">
      <ShellPage askLabel="Club setup" askStarters={[]} />
      <PageHeader title="Club setup" />
      <div className="hqs-state">
        <AccessDeniedState
          action={
            <Link
              className={buttonClassName({ variant: "secondary" })}
              href="/"
            >
              Back to Today
            </Link>
          }
          area="Club setup"
          grantedBy={`an owner or manager of ${organization}`}
        />
      </div>
    </div>
  );
}

/**
 * A Club setup screen: the one title, its line, the area's tabs, Ask Duna's
 * page context, the offline banner, and "You need access" for anyone who
 * cannot change the club's setup.
 */
export async function SetupScreen({
  tab,
  title,
  description,
  actions,
  askLabel,
  askStarters,
  crumb,
  parentHref,
  header,
  pending,
  children,
}: {
  readonly tab: SetupTab;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly askLabel: string;
  readonly askStarters: readonly string[];
  readonly crumb?: string;
  readonly parentHref?: string;
  /** An open object's own header (ObjectHeader) instead of the page header. */
  readonly header?: ReactNode;
  readonly pending?: number;
  readonly children: ReactNode;
}) {
  const { session, organization } = await setupContext();
  if (session.access !== "operator") return null; // the shell says why
  if (!hasScope(session, SETUP_SCOPE)) {
    return <SetupDenied organization={organization} />;
  }
  return (
    <div className="setup">
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
          subnav={<SetupNav current={tab} pending={pending} />}
          title={title}
        />
      )}
      <OfflineBanner writes="refused" />
      {children}
    </div>
  );
}
