"use client";

import type { PlayerOrganizationAccess } from "@duna/api";
import type { PersonSummary } from "@duna/core";
import { DunaMark, Numeric } from "@duna/ui";
import { ThemeToggle } from "@duna/ui/theme-toggle";
import {
  CalendarDays,
  Compass,
  Clapperboard,
  House,
  HeartPulse,
  Menu,
  MessageCircle,
  Plus,
  Trophy,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { AskDuna } from "./ask-duna";
import { PlayerAccountMenu } from "./player-account-menu";
import { PlayerOrganizationSwitcher } from "./player-organization-switcher";

const navigation = [
  { label: "Home", href: "/app", icon: House },
  { label: "Messages", href: "/app/messages", icon: MessageCircle },
  { label: "Discover", href: "/discover", icon: Compass },
  { label: "Play", href: "/app/play", icon: CalendarDays },
  { label: "Matches", href: "/app/matches", icon: Trophy },
  { label: "Video", href: "/app/video", icon: Clapperboard },
  { label: "Health", href: "/app/health", icon: HeartPulse },
  { label: "Wallet", href: "/app/wallet", icon: WalletCards },
] as const;

export function PlayerShell({
  authConfigured,
  children,
  organizationAccess,
  player,
}: {
  readonly authConfigured: boolean;
  readonly children: ReactNode;
  readonly organizationAccess: PlayerOrganizationAccess;
  readonly player: PersonSummary;
}) {
  const pathname = usePathname();
  const focusedFlow = pathname === "/app/onboarding";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div
      className={
        focusedFlow ? "player-shell player-shell--focused-flow" : "player-shell"
      }
      data-zone="athletic"
    >
      {!focusedFlow && (
        <aside className="player-sidebar">
          <Link
            aria-label="Duna home"
            className="player-sidebar__brand"
            href="/"
          >
            <DunaMark />
          </Link>
          <nav aria-label="Duna player navigation">
            {navigation.map(({ label, href, icon: Icon }) => {
              const active =
                href === "/app" ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={active ? "active" : undefined}
                  href={href}
                  key={href}
                >
                  <Icon
                    aria-hidden
                    size={19}
                    strokeWidth={active ? 2.3 : 1.8}
                  />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
          <Link className="player-sidebar__record" href="/app/score">
            <Plus aria-hidden size={18} />
            Record a match
          </Link>
          <div className="player-sidebar__plus">
            <div>
              <span>PREMIUM</span>
              <small>No fees · deeper stats</small>
            </div>
            <Link href="/app/settings">View plan</Link>
          </div>
          <Link className="player-sidebar__profile" href="/app/profile">
            <span className="avatar">{player.initials}</span>
            <span>
              <strong>{player.displayName}</strong>
              <small>@{player.handle}</small>
            </span>
            <Numeric tier="chip">{player.rating.display.toFixed(2)}</Numeric>
          </Link>
        </aside>
      )}

      <div className="player-main">
        {!focusedFlow && (
          <header className="player-topbar">
            <button
              aria-controls="player-mobile-menu"
              aria-expanded={mobileMenuOpen}
              aria-label="Open navigation"
              className="player-topbar__menu"
              onClick={() => setMobileMenuOpen((open) => !open)}
              type="button"
            >
              <Menu aria-hidden size={21} />
            </button>
            <Link
              aria-label="Duna home"
              className="player-topbar__brand"
              href="/app"
            >
              <DunaMark compact />
            </Link>
            <PlayerOrganizationSwitcher
              access={organizationAccess}
              homeMarket={player.homeMarket}
            />
            <div className="player-topbar__actions">
              <ThemeToggle />
              <Link aria-label="Messages" href="/app/messages">
                <MessageCircle aria-hidden size={19} />
              </Link>
              <PlayerAccountMenu
                configured={authConfigured}
                trigger={
                  <>
                    <span className="avatar">{player.initials}</span>
                    <Numeric tier="chip">
                      {player.rating.display.toFixed(2)}
                    </Numeric>
                  </>
                }
              />
            </div>
          </header>
        )}
        {!focusedFlow && mobileMenuOpen ? (
          <nav
            aria-label="Player menu"
            className="player-mobile-menu"
            id="player-mobile-menu"
          >
            {navigation.map(({ label, href, icon: Icon }) => {
              const active =
                href === "/app" ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={active ? "active" : undefined}
                  href={href}
                  key={href}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon aria-hidden size={19} />
                  <span>{label}</span>
                </Link>
              );
            })}
            <Link href="/app/score" onClick={() => setMobileMenuOpen(false)}>
              <Plus aria-hidden size={19} />
              <span>Record a match</span>
            </Link>
            <Link href="/app/settings" onClick={() => setMobileMenuOpen(false)}>
              <span className="avatar">{player.initials}</span>
              <span>Account + settings</span>
            </Link>
          </nav>
        ) : null}
        <div className="player-content">{children}</div>
      </div>

      {!focusedFlow && (
        <>
          <nav
            aria-label="Mobile player navigation"
            className="player-bottom-nav"
          >
            {navigation.slice(0, 5).map(({ label, href, icon: Icon }) => {
              const active =
                href === "/app" ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={active ? "active" : undefined}
                  href={href}
                  key={href}
                >
                  <Icon aria-hidden size={20} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
          <AskDuna />
        </>
      )}
    </div>
  );
}
