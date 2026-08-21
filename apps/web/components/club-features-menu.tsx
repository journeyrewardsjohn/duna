"use client";

import {
  Boxes,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  Dumbbell,
  Film,
  HandCoins,
  Layers3,
  MapPinned,
  Megaphone,
  MessageCircleMore,
  PackageOpen,
  ShieldCheck,
  ShoppingBag,
  Store,
  Trophy,
  UserRoundCheck,
  UsersRound,
  Watch,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { clubFeatureByKey, clubFeatureGroups } from "@/lib/club-features";

const iconByKey: Readonly<Record<string, LucideIcon>> = {
  products: Store,
  "products/services": HandCoins,
  "products/plans": Layers3,
  "products/goods-equipment": ShoppingBag,
  "team-management": UserRoundCheck,
  people: UsersRound,
  events: Trophy,
  leagues: ClipboardCheck,
  venues: MapPinned,
  training: Dumbbell,
  money: CircleDollarSign,
  marketing: Megaphone,
  messaging: MessageCircleMore,
  "safety-privacy": ShieldCheck,
  "coach-video": Film,
  "duna-pro-watch": Watch,
};

export function ClubFeaturesMenu() {
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
    <details className="club-feature-menu" ref={menuRef}>
      <summary>
        For clubs + coaches <ChevronDown aria-hidden size={14} />
      </summary>
      <div className="club-feature-menu__backdrop" />
      <div className="club-feature-menu__panel">
        <header>
          <div>
            <span>Run your club</span>
            <strong>One operation. Every court.</strong>
          </div>
          <Link href="/run-your-club">
            Overview <span aria-hidden>↗</span>
          </Link>
        </header>
        <div className="club-feature-menu__grid">
          {clubFeatureGroups.map((group, index) => (
            <section
              className={
                index === 2 ? "club-feature-menu__group--featured" : undefined
              }
              key={group.label}
            >
              <div className="club-feature-menu__group-heading">
                {index === 0 ? <PackageOpen aria-hidden size={18} /> : null}
                {index === 1 ? <Boxes aria-hidden size={18} /> : null}
                {index === 2 ? <ShieldCheck aria-hidden size={18} /> : null}
                <span>
                  <strong>{group.label}</strong>
                  <small>{group.description}</small>
                </span>
              </div>
              <div>
                {group.keys.map((key) => {
                  const item = clubFeatureByKey.get(key);
                  if (!item) return null;
                  const Icon = iconByKey[key] ?? Boxes;
                  return (
                    <Link href={item.href} key={item.key}>
                      <Icon aria-hidden size={18} />
                      <span>
                        <strong>{item.navLabel}</strong>
                        <small>{item.navDescription}</small>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <footer>
          <Link href="/run-your-club/features">
            Explore every feature <span aria-hidden>→</span>
          </Link>
          <p>Built for beach, indoor, and combined volleyball organizations.</p>
        </footer>
      </div>
    </details>
  );
}
