"use client";

import type { PersonSummary } from "@duna/core";
import { DunaMark, Numeric } from "@duna/ui";
import { ThemeToggle } from "@duna/ui/theme-toggle";
import {
  CalendarDays,
  Compass,
  House,
  Menu,
  MessageCircle,
  Plus,
  Trophy,
  UserRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AskDuna } from "./ask-duna";

const navigation = [
  { label: "Home", href: "/app", icon: House },
  { label: "Discover", href: "/app/discover", icon: Compass },
  { label: "Play", href: "/app/play", icon: CalendarDays },
  { label: "Matches", href: "/app/matches", icon: Trophy },
  { label: "Wallet", href: "/app/wallet", icon: WalletCards },
] as const;

export function PlayerShell({
  children,
  player,
}: {
  readonly children: ReactNode;
  readonly player: PersonSummary;
}) {
  const pathname = usePathname();
  const focusedFlow = pathname === "/app/onboarding";

  return (
    <div
      className={
        focusedFlow ? "player-shell player-shell--focused-flow" : "player-shell"
      }
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
              <span>DUNA+</span>
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
            <Numeric>{player.rating.display.toFixed(2)}</Numeric>
          </Link>
        </aside>
      )}

      <div className="player-main">
        {!focusedFlow && (
          <header className="player-topbar">
            <button
              aria-label="Open navigation"
              className="player-topbar__menu"
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
            <div className="player-topbar__market">
              <span>Playing in</span>
              <strong>{player.homeMarket}</strong>
            </div>
            <div className="player-topbar__actions">
              <ThemeToggle />
              <button aria-label="Messages">
                <MessageCircle aria-hidden size={19} />
              </button>
              <Link href="/app/profile">
                <span className="avatar">{player.initials}</span>
                <Numeric>{player.rating.display.toFixed(2)}</Numeric>
              </Link>
            </div>
          </header>
        )}
        <div className="player-content">{children}</div>
      </div>

      {!focusedFlow && (
        <>
          <nav
            aria-label="Mobile player navigation"
            className="player-bottom-nav"
          >
            {navigation.slice(0, 4).map(({ label, href, icon: Icon }) => {
              const active =
                href === "/app" ? pathname === href : pathname.startsWith(href);
              return (
                <Link
                  className={active ? "active" : undefined}
                  href={href}
                  key={href}
                >
                  <Icon aria-hidden size={20} />
                  <span>{label}</span>
                </Link>
              );
            })}
            <Link
              className={
                pathname.startsWith("/app/profile") ? "active" : undefined
              }
              href="/app/profile"
            >
              <UserRound aria-hidden size={20} />
              <span>Profile</span>
            </Link>
          </nav>
          <AskDuna />
        </>
      )}
    </div>
  );
}
