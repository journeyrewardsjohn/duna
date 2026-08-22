"use client";

import {
  Activity,
  Apple,
  ArrowRight,
  CalendarDays,
  Camera,
  ChevronDown,
  CircleDot,
  Crosshair,
  HeartPulse,
  MapPinned,
  Radio,
  Search,
  Sparkles,
  Trophy,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import type {
  SiteExperienceNavigation,
  SiteExperienceNavigationItem,
} from "@/lib/site-experience-navigation";

const iconByKey: Readonly<
  Record<SiteExperienceNavigationItem["icon"], LucideIcon>
> = {
  calendar: CalendarDays,
  camera: Camera,
  court: MapPinned,
  create: Sparkles,
  health: HeartPulse,
  live: Radio,
  market: Activity,
  player: UserRound,
  rating: Crosshair,
  score: CircleDot,
  search: Search,
  tour: Trophy,
  watch: Apple,
};

export function SiteExperienceMenu({
  navigation,
}: {
  readonly navigation: SiteExperienceNavigation;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeFromPointer = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (menu?.open && !menu.contains(event.target as Node)) menu.open = false;
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      const menu = menuRef.current;
      if (event.key !== "Escape" || !menu?.open) return;
      menu.open = false;
      menu.querySelector<HTMLElement>("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeFromPointer);
    document.addEventListener("keydown", closeFromKeyboard);
    return () => {
      document.removeEventListener("pointerdown", closeFromPointer);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, []);

  return (
    <details
      className="club-feature-menu site-experience-menu"
      data-experience={navigation.id}
      ref={menuRef}
    >
      <summary>
        {navigation.label} <ChevronDown aria-hidden size={14} />
      </summary>
      <div className="club-feature-menu__backdrop" />
      <div className="club-feature-menu__panel site-experience-menu__panel">
        <header>
          <div>
            <span>{navigation.eyebrow}</span>
            <strong>{navigation.title}</strong>
          </div>
          <Link href={navigation.href}>
            Overview <span aria-hidden>↗</span>
          </Link>
        </header>
        <div className="site-experience-menu__body">
          <div className="site-experience-menu__groups">
            {navigation.groups.map((group) => (
              <section key={group.label}>
                <header>
                  <strong>{group.label}</strong>
                  <small>{group.description}</small>
                </header>
                <div>
                  {group.items.map((item) => {
                    const Icon = iconByKey[item.icon];
                    return (
                      <Link href={item.href} key={item.href}>
                        <Icon aria-hidden size={19} />
                        <span>
                          <strong>{item.label}</strong>
                          <small>{item.description}</small>
                        </span>
                        <ArrowRight aria-hidden size={15} />
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          <Link
            className="site-experience-menu__featured"
            href={navigation.featured.href}
          >
            <span>{navigation.featured.label}</span>
            <strong>{navigation.featured.title}</strong>
            <p>{navigation.featured.description}</p>
            <b>
              {navigation.featured.action} <ArrowRight aria-hidden size={16} />
            </b>
          </Link>
        </div>
        <footer>
          <Link href={navigation.href}>
            {navigation.actionLabel} <span aria-hidden>→</span>
          </Link>
          <p>{navigation.description}</p>
        </footer>
      </div>
    </details>
  );
}
