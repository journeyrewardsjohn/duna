import { Badge, DunaMark } from "@duna/ui";
import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { ThemeToggle } from "@duna/ui/theme-toggle";
import { Bell, Search, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { adminModules, type AdminModule } from "./navigation";
import { AuthControls } from "./auth-controls";
import { DunaActionCenter } from "./duna-action-center";
import { getServerCaller, getServerContext } from "@/lib/api";

export async function AdminShell({
  active,
  children,
}: {
  readonly active: AdminModule;
  readonly children: ReactNode;
}) {
  const { actor } = await getServerContext();
  const workspace = actor?.organizationId
    ? await (await getServerCaller()).operator.workspace().catch(() => null)
    : null;
  return (
    <div className="hq-shell hq-shell--focused admin-shell">
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
            const index = adminModules.indexOf(item);
            const startsGroup = adminModules[index - 1]?.group !== item.group;
            return (
              <Fragment key={item.slug}>
                {startsGroup && (
                  <span className="hq-sidebar__section">{item.group}</span>
                )}
                <Link
                  className={active === item.slug ? "active" : undefined}
                  href={
                    item.slug === "overview" ? "/admin" : `/admin/${item.slug}`
                  }
                >
                  <Icon aria-hidden size={18} />
                  <span>{item.label}</span>
                  {item.slug === "trust" && <i>3</i>}
                </Link>
              </Fragment>
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
          <form action="/admin/people" className="hq-search" method="get">
            <Search aria-hidden size={17} />
            <input
              aria-label="Search Duna Admin"
              name="q"
              placeholder="Search people across Duna…"
            />
            <kbd>↵</kbd>
          </form>
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
      {actor && (
        <DunaActionCenter
          scopeKey={`${actor.personId}:${actor.organizationId ?? "no-organization"}`}
          organizationName={
            workspace?.organization.name ?? "Choose an organization"
          }
          pageLabel={`Admin · ${adminModules.find((item) => item.slug === active)?.label ?? "Overview"}`}
          canAsk={Boolean(workspace)}
          admin
        />
      )}
    </div>
  );
}
