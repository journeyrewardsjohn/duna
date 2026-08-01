import { Badge, DunaMark } from "@duna/ui";
import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { ThemeToggle } from "@duna/ui/theme-toggle";
import { Bell, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { adminModules, type AdminModule } from "./navigation";
import { AuthControls } from "./auth-controls";

export function AdminShell({
  active,
  children,
}: {
  readonly active: AdminModule;
  readonly children: ReactNode;
}) {
  return (
    <div className="hq-shell admin-shell">
      <aside className="hq-sidebar">
        <Link className="hq-sidebar__brand" href="/admin">
          <DunaMark />
          <Badge tone="warning">Admin</Badge>
        </Link>
        <div className="admin-identity">
          <ShieldCheck aria-hidden size={19} />
          <span>
            <strong>Duna control plane</strong>
            <small>Super administrator</small>
          </span>
        </div>
        <nav aria-label="Duna administration">
          {adminModules.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                className={active === item.slug ? "active" : undefined}
                href={
                  item.slug === "overview" ? "/admin" : `/admin/${item.slug}`
                }
                key={item.slug}
              >
                <Icon aria-hidden size={18} />
                <span>{item.label}</span>
                {item.slug === "trust" && <i>3</i>}
              </Link>
            );
          })}
        </nav>
        <div className="hq-sidebar__meta">
          <Link href="/">Return to club HQ</Link>
          <span>Production controls</span>
          <small>Every mutation is audited</small>
        </div>
      </aside>
      <div className="hq-workspace">
        <header className="hq-topbar">
          <label className="hq-search">
            <Search aria-hidden size={17} />
            <input
              aria-label="Search Duna Admin"
              placeholder="Search network entities…"
            />
            <kbd>⌘ K</kbd>
          </label>
          <div>
            <ThemeToggle />
            <Badge tone="positive">All systems operational</Badge>
            <button aria-label="Notifications" className="icon-button">
              <Bell aria-hidden size={18} />
            </button>
            <AuthControls configured={isWorkOSAuthKitConfigured()} />
          </div>
        </header>
        <div className="hq-content">{children}</div>
      </div>
    </div>
  );
}
