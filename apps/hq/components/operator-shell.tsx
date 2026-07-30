import { Badge, DunaMark } from "@duna/ui";
import { Bell, ChevronDown, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { operatorModules, type OperatorModule } from "./navigation";

export function OperatorShell({
  active,
  children,
}: {
  readonly active: OperatorModule;
  readonly children: ReactNode;
}) {
  return (
    <div className="hq-shell">
      <aside className="hq-sidebar">
        <Link className="hq-sidebar__brand" href="/">
          <DunaMark />
          <Badge>HQ</Badge>
        </Link>
        <button className="organization-switcher">
          <span>SB</span>
          <span>
            <strong>South Bay Volleyball</strong>
            <small>Club plan</small>
          </span>
          <ChevronDown aria-hidden size={15} />
        </button>
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
                {item.slug === "messages" && <i>4</i>}
              </Link>
            );
          })}
        </nav>
        <div className="hq-sidebar__meta">
          <Link href="/admin">Open Duna Admin</Link>
          <span>Beach Elite LLC</span>
          <small>Duna HQ · Preview environment</small>
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
            <Link className="hq-ai-button" href="/ai">
              <Sparkles aria-hidden size={16} /> Ask Duna
            </Link>
            <button aria-label="Notifications" className="icon-button">
              <Bell aria-hidden size={18} />
              <i />
            </button>
            <button className="user-menu">
              <span>SR</span>
              <ChevronDown aria-hidden size={14} />
            </button>
          </div>
        </header>
        <div className="hq-content">{children}</div>
      </div>
    </div>
  );
}
