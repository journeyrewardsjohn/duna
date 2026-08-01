import type { OrganizationSummary } from "@duna/core";
import { Badge, DunaMark } from "@duna/ui";
import { ThemeToggle } from "@duna/ui/theme-toggle";
import { Bell, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
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
        <Link className="hq-sidebar__brand" href="/">
          <DunaMark />
          <Badge>HQ</Badge>
        </Link>
        <div className="organization-switcher">
          <span>{initials}</span>
          <span>
            <strong>{organization.name}</strong>
            <small>{organization.plan.replaceAll("-", " ")} plan</small>
          </span>
          <Badge>{organization.stripeStatus}</Badge>
        </div>
        <nav aria-label="Operator modules">
          {operatorModules.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                className={active === item.slug ? "active" : undefined}
                href={item.slug === "overview" ? "/" : `/${item.slug}`}
                key={item.slug}
              >
                <Icon aria-hidden size={18} />
                <span>{item.label}</span>
                {item.slug === "messages" && messageDraftCount > 0 && (
                  <i>{messageDraftCount}</i>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="hq-sidebar__meta">
          <Link href="/admin">Open Duna Admin</Link>
          <span>{organization.legalName}</span>
          <small>Duna HQ · Connected workspace</small>
        </div>
      </aside>
      <div className="hq-workspace">
        <header className="hq-topbar">
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
              <Sparkles aria-hidden size={16} /> Ask Duna
            </Link>
            <button aria-label="Notifications" className="icon-button">
              <Bell aria-hidden size={18} />
              <i />
            </button>
            <AuthControls
              configured={Boolean(
                process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
              )}
            />
          </div>
        </header>
        <div className="hq-content">{children}</div>
      </div>
    </div>
  );
}
