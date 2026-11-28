import type { OrganizationSummary } from "@duna/core";
import { HqPagePrompt } from "./hq-work-prompt";
import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { DunaActionTrigger, DunaLogo } from "@duna/ui";
import { ThemeToggle } from "@duna/ui/theme-toggle";
import {
  Bell,
  History,
  Menu,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import { loadWorkspaceOptions } from "@/lib/workspace-options";
import {
  operatorModuleHref,
  operatorModules,
  operatorNavigationItems,
  type OperatorModule,
} from "./navigation";
import { AuthControls } from "./auth-controls";
import { DunaActionCenter } from "./duna-action-center";
import { OrganizationSwitcher } from "./organization-switcher";
import { AskDunaSidebar } from "./ask-duna-sidebar";
import { getServerContext } from "@/lib/api";

/** The four areas kept in the phone tab bar; the rest open from "More". */
const mobilePrimaryModules = ["today", "schedule", "inbox", "people"] as const;

export async function OperatorShell({
  active,
  children,
  immersive = false,
  immersiveScrollable = false,
  organization,
  messageDraftCount = 0,
  messageUnreadCount = 0,
}: {
  readonly active: OperatorModule;
  readonly children: ReactNode;
  readonly immersive?: boolean;
  /** Keeps immersive chrome while allowing the document to extend beyond the viewport. */
  readonly immersiveScrollable?: boolean;
  readonly organization: Pick<OrganizationSummary, "id" | "name" | "plan">;
  readonly messageDraftCount?: number;
  readonly messageUnreadCount?: number;
}) {
  const workspaces = await loadWorkspaceOptions();
  const { actor } = await getServerContext();
  const askScopeKey = `${actor?.personId ?? "anonymous"}:${organization.id}`;
  const navigableModules = operatorNavigationItems;
  return (
    <div
      className={`hq-shell hq-shell--focused${active === "ask" ? " hq-shell--ask" : ""}${active === "today" ? " hq-shell--home" : ""}${immersive ? " hq-shell--immersive" : ""}${immersiveScrollable ? " hq-shell--immersive-scrollable" : ""}`}
    >
      <aside className="hq-sidebar">
        <Link aria-label="Duna HQ home" className="hq-sidebar__brand" href="/">
          <DunaLogo decorative size={24} />
          <small>HQ</small>
        </Link>
        <nav aria-label="Operator modules">
          {navigableModules.map((item, index) => {
            const startsGroup =
              navigableModules[index - 1]?.group !== item.group;
            return (
              <Fragment key={item.slug}>
                {startsGroup && (
                  <span className="hq-sidebar__section">{item.group}</span>
                )}
                <div
                  className="hq-sidebar__module"
                  data-mobile-primary={
                    (mobilePrimaryModules as readonly string[]).includes(
                      item.slug,
                    )
                      ? "true"
                      : undefined
                  }
                  data-nav-id={item.slug}
                >
                  <Link
                    className={active === item.slug ? "active" : undefined}
                    href={item.href}
                    aria-current={active === item.slug ? "page" : undefined}
                    title={item.label}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                    {item.slug === "inbox" && messageUnreadCount > 0 && (
                      <i>{messageUnreadCount}</i>
                    )}
                    {item.slug === "marketing" && messageDraftCount > 0 && (
                      <i>{messageDraftCount}</i>
                    )}
                  </Link>
                </div>
              </Fragment>
            );
          })}
          <AskDunaSidebar key={askScopeKey} scopeKey={askScopeKey} />
          <details
            className={`hq-mobile-navigation-more${
              (mobilePrimaryModules as readonly string[]).includes(active)
                ? ""
                : " has-active-module"
            }`}
          >
            <summary>
              <Menu aria-hidden size={18} />
              <span>More</span>
            </summary>
            <div>
              <header>
                <strong>All HQ tools</strong>
                <small>Choose where you want to work.</small>
              </header>
              <Link
                href={operatorModuleHref("ask")}
                className={active === "ask" ? "active" : undefined}
              >
                <MessageCircle aria-hidden size={18} />
                <span>Ask Duna</span>
              </Link>
              <Link href={hqHref("ask", { conversation: "history" })}>
                <History aria-hidden size={18} />
                <span>Conversation history</span>
              </Link>
              {navigableModules
                .filter(
                  (item) =>
                    !(mobilePrimaryModules as readonly string[]).includes(
                      item.slug,
                    ),
                )
                .map((item) => (
                  <Link
                    className={active === item.slug ? "active" : undefined}
                    href={item.href}
                    key={item.slug}
                  >
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                ))}
            </div>
          </details>
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
          <DunaActionTrigger
            className="hq-search hq-search--trigger"
            panel="search"
          >
            <Search aria-hidden size={17} />
            <span>Search people, events, payments…</span>
            <kbd>⌘ K</kbd>
          </DunaActionTrigger>
          <div>
            <DunaActionTrigger
              className="icon-button hq-compact-search"
              panel="search"
            >
              <Search aria-hidden size={18} />
              <span className="sr-only">Search HQ</span>
            </DunaActionTrigger>
            <ThemeToggle />
            <DunaActionTrigger className="hq-ai-button" panel="chat">
              <Sparkles aria-hidden size={16} /> Duna AI
            </DunaActionTrigger>
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
        <div className="hq-content">
          {children}
          {active !== "today" &&
            active !== "ask" &&
            active !== "website" &&
            !immersive && (
              <details className="hq-context-assistant">
                <summary>Ask Duna about this page</summary>
                <HqPagePrompt
                  label={
                    operatorModules.find((item) => item.slug === active)
                      ?.label ?? "your workspace"
                  }
                />
              </details>
            )}
        </div>
      </div>
      <DunaActionCenter
        scopeKey={askScopeKey}
        organizationName={organization.name}
        pageLabel={
          operatorModules.find((item) => item.slug === active)?.label ??
          "Workspace"
        }
      />
    </div>
  );
}
