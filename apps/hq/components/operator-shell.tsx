import type { OrganizationSummary } from "@duna/core";
import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { DunaMark } from "@duna/ui";
import { ThemeToggle } from "@duna/ui/theme-toggle";
import { Bell, ChevronDown, Search, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { operatorModules, type OperatorModule } from "./navigation";
import { AuthControls } from "./auth-controls";

export function OperatorShell({
  active,
  children,
  organization,
  messageDraftCount = 0,
}: {
  readonly active: OperatorModule;
  readonly children: ReactNode;
  readonly organization: OrganizationSummary;
  readonly messageDraftCount?: number;
}) {
  const initials = organization.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <div className="hq-shell">
      <aside className="hq-sidebar">
        <Link aria-label="Duna HQ home" className="hq-sidebar__brand" href="/">
          <DunaMark />
          <small>HQ</small>
        </Link>
        <nav aria-label="Operator modules">
          {operatorModules.map((item) => {
            const Icon = item.icon;
            const index = operatorModules.indexOf(item);
            const startsGroup =
              operatorModules[index - 1]?.group !== item.group;
            return (
              <Fragment key={item.slug}>
                {startsGroup && (
                  <span className="hq-sidebar__section">{item.group}</span>
                )}
                <Link
                  className={active === item.slug ? "active" : undefined}
                  href={item.slug === "overview" ? "/" : `/${item.slug}`}
                  title={item.label}
                >
                  <Icon aria-hidden size={18} />
                  <span>{item.label}</span>
                  {item.slug === "messages" && messageDraftCount > 0 && (
                    <i>{messageDraftCount}</i>
                  )}
                </Link>
              </Fragment>
            );
          })}
        </nav>
        <div className="hq-sidebar__meta">
          <Link aria-label="Open Duna Admin" href="/admin" title="Duna Admin">
            <ShieldCheck aria-hidden size={18} />
            <span>Admin</span>
          </Link>
        </div>
      </aside>
      <div className="hq-workspace">
        <header className="hq-topbar">
          <Link className="organization-switcher" href="/settings">
            <span>{initials}</span>
            <span>
              <strong>{organization.name}</strong>
              <small>{organization.plan.replaceAll("-", " ")} plan</small>
            </span>
            <ChevronDown aria-hidden size={15} />
          </Link>
          <label className="hq-search">
            <Search aria-hidden size={17} />
            <input
              aria-label="Search Duna HQ"
              placeholder="Search people, events, payments…"
            />
            <kbd>⌘ K</kbd>
          </label>
          <div>
            <ThemeToggle />
            <Link className="hq-ai-button" href="/ai">
              <Sparkles aria-hidden size={16} /> Duna AI
            </Link>
            <button aria-label="Notifications" className="icon-button">
              <Bell aria-hidden size={18} />
              <i />
            </button>
            <AuthControls configured={isWorkOSAuthKitConfigured()} />
          </div>
        </header>
        <div className="hq-content">{children}</div>
      </div>
    </div>
  );
}
