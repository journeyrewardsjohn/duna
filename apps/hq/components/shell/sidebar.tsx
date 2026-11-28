"use client";

import { DunaLogo, DunaMark } from "@duna/ui";
import { Icon } from "@duna/ui/icons";
import Link from "next/link";
import type { OperatorModule } from "../navigation";
import { AccountMenu } from "./account-menu";
import { navigationGroups } from "./nav-state";
import { OrgSwitcher } from "./org-switcher";
import type { ShellSession } from "./session-types";

/** Counts beside items, where the data exists (Inbox unread, for example). */
export type NavCounts = Partial<Record<OperatorModule, number>>;

/**
 * The HQ sidebar (Tideline 4.1.1 `HQSidebar`): white, a hairline on its
 * trailing edge, the 56 px brand row aligned to the nav icons, the club
 * switcher, the owner's four groups, and the account row at the foot.
 */
export function Sidebar({
  session,
  active,
  collapsed,
  counts = {},
  onNavigate,
}: {
  readonly session: ShellSession;
  readonly active: OperatorModule | undefined;
  readonly collapsed: boolean;
  readonly counts?: NavCounts;
  /** Called after a link is chosen (closes the phone sheet). */
  readonly onNavigate?: () => void;
}) {
  return (
    <div className="hqs-side__inner">
      <div className="hqs-brand">
        <Link
          aria-label="Duna HQ, go to Today"
          className="hqs-brand__link"
          href="/"
          onClick={onNavigate}
        >
          {/* The shell's CSS shows the lockup expanded, the mark collapsed. */}
          <DunaLogo className="hqs-brand__logo" decorative size={20} />
          <DunaMark className="hqs-brand__mark" decorative size={20} />
          <span aria-hidden="true" className="hqs-brand__hq">
            HQ
          </span>
        </Link>
      </div>
      <OrgSwitcher collapsed={collapsed} session={session} />
      <div className="hqs-nav">
        {navigationGroups().map((group) => (
          <div
            aria-label={group.name}
            className="hqs-nav__group"
            key={group.name}
            role="group"
          >
            {group.items.map((item) => {
              const current = item.slug === active;
              const count = counts[item.slug];
              return (
                <Link
                  // Named even when collapsed hides the label.
                  aria-label={
                    count ? `${item.label}, ${count} new` : item.label
                  }
                  aria-current={current ? "page" : undefined}
                  className="hqs-nav__item"
                  data-nav-id={item.slug}
                  href={item.href}
                  key={item.slug}
                  onClick={onNavigate}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon name={item.icon} size="control" />
                  <span className="hqs-nav__label">{item.label}</span>
                  {count ? (
                    <span className="hqs-nav__count td-num">
                      {count}
                      <span className="td-sr"> new</span>
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
      <div className="hqs-foot">
        <AccountMenu collapsed={collapsed} session={session} />
      </div>
    </div>
  );
}
