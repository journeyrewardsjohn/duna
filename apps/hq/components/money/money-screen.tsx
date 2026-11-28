import { buttonClassName, OfflineBanner } from "@duna/ui/tideline";
import Link from "next/link";
import type { ReactNode } from "react";
import { AccessDeniedState } from "@/lib/access-state";
import { getHqSession, hasScope } from "../shell/hq-session";
import { PageHeader } from "../shell/page-header";
import { ShellPage } from "../shell/shell-context";
import type { ShellSession } from "../shell/session-types";
import { MoneyNav, type MoneyTab } from "./money-nav";

/** What every Money screen needs to know about who is here. */
export interface MoneyContext {
  readonly session: ShellSession;
  readonly organization: string;
  readonly timeZone: string;
  /** May refund, answer disputes, change payout settings (owner). */
  readonly canWrite: boolean;
}

export async function moneyContext(): Promise<MoneyContext> {
  const session = await getHqSession();
  return {
    session,
    organization: session.organization?.name ?? "your club",
    timeZone: session.organization?.timezone ?? "UTC",
    canWrite: hasScope(session, "payments:write"),
  };
}

/**
 * A Money screen: the one title, its line, the Money tabs, Ask Duna's page
 * context, the offline banner, and "You need access" for anyone without the
 * payments permission (a coach sees the access state, never a crash).
 */
export async function MoneyScreen({
  tab,
  title,
  description,
  actions,
  askLabel,
  askStarters,
  crumb,
  parentHref,
  header,
  children,
}: {
  readonly tab: MoneyTab;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly askLabel: string;
  readonly askStarters: readonly string[];
  readonly crumb?: string;
  readonly parentHref?: string;
  /** An open object's own header (ObjectHeader) instead of the page header. */
  readonly header?: ReactNode;
  readonly children: ReactNode;
}) {
  const { session, organization } = await moneyContext();
  if (session.access !== "operator") return null; // the shell says why
  if (!hasScope(session, "payments:read")) {
    return (
      <div className="money">
        <ShellPage askLabel="Money" askStarters={[]} />
        <PageHeader title="Money" />
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
            area="Money"
            grantedBy={`an owner of ${organization}`}
          />
        </div>
      </div>
    );
  }
  return (
    <div className="money">
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
          subnav={<MoneyNav current={tab} />}
          title={title}
        />
      )}
      <OfflineBanner writes="refused" />
      {children}
    </div>
  );
}
