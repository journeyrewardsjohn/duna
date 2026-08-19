import type { OrganizationSummary } from "@duna/core";
import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { DunaMark } from "@duna/ui";
import { ThemeToggle } from "@duna/ui/theme-toggle";
import { Bell, Search, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { loadWorkspaceOptions } from "@/lib/workspace-options";
import {
  operatorModules,
  operatorNavigationChildren,
  type EventNavigationSlug,
  type OperatorModule,
  type ProductNavigationSlug,
} from "./navigation";
import { AuthControls } from "./auth-controls";
import { OrganizationSwitcher } from "./organization-switcher";

export async function OperatorShell({
  active,
  children,
  immersive = false,
  organization,
  messageDraftCount = 0,
  messageUnreadCount = 0,
  activeChild,
}: {
  readonly active: OperatorModule;
  readonly children: ReactNode;
  readonly immersive?: boolean;
  readonly organization: OrganizationSummary;
  readonly messageDraftCount?: number;
  readonly messageUnreadCount?: number;
  readonly activeChild?: ProductNavigationSlug | EventNavigationSlug;
}) {
  const workspaces = await loadWorkspaceOptions();
  const navigableModules = operatorModules.filter(
    (item) => !("hiddenFromNavigation" in item && item.hiddenFromNavigation),
  );
  return (
    <div className={`hq-shell${immersive ? " hq-shell--immersive" : ""}`}>
      <aside className="hq-sidebar">
        <Link aria-label="Duna HQ home" className="hq-sidebar__brand" href="/">
          <DunaMark />
          <small>HQ</small>
        </Link>
        <nav aria-label="Operator modules">
          {navigableModules.map((item) => {
            const Icon = item.icon;
            const index = navigableModules.indexOf(item);
            const startsGroup =
              navigableModules[index - 1]?.group !== item.group;
            const children = operatorNavigationChildren[item.slug] ?? [];
            return (
              <Fragment key={item.slug}>
                {startsGroup && (
                  <span className="hq-sidebar__section">{item.group}</span>
                )}
                <div className="hq-sidebar__module">
                  <Link
                    className={active === item.slug ? "active" : undefined}
                    href={item.slug === "overview" ? "/" : `/${item.slug}`}
                    title={item.label}
                  >
                    <Icon aria-hidden size={18} />
                    <span>{item.label}</span>
                    {item.slug === "messages" && messageUnreadCount > 0 && (
                      <i>{messageUnreadCount}</i>
                    )}
                    {item.slug === "marketing" && messageDraftCount > 0 && (
                      <i>{messageDraftCount}</i>
                    )}
                  </Link>
                  {children.length > 0 && (
                    <div className="hq-sidebar__subnav">
                      {children.map((child) => (
                        <Link
                          className={
                            activeChild === child.slug ? "active" : undefined
                          }
                          href={child.href}
                          key={child.slug}
                        >
                          <em aria-hidden />
                          <span>{child.label}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
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
          <OrganizationSwitcher
            currentOrganizationId={workspaces.currentOrganizationId}
            name={organization.name}
            plan={organization.plan}
            workspaces={workspaces.organizations}
          />
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
            <AuthControls
              configured={isWorkOSAuthKitConfigured()}
              organizationName={organization.name}
              showOrganization={false}
            />
          </div>
        </header>
        <div className="hq-content">{children}</div>
      </div>
    </div>
  );
}
