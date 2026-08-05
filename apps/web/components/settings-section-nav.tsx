"use client";

import {
  Bell,
  CreditCard,
  Images,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const baseSections = [
  { id: "membership", label: "Membership", icon: CreditCard },
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "playing-profile", label: "Player details", icon: Sparkles },
  { id: "player-media", label: "Player artwork", icon: Images },
  { id: "household", label: "Household", icon: Users },
] as const;

const endingSections = [
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "privacy", label: "Privacy + safety", icon: ShieldCheck },
] as const;

export function SettingsSectionNav({
  showFamilyWallets,
}: {
  readonly showFamilyWallets: boolean;
}) {
  const sections = useMemo(
    () => [
      ...baseSections,
      ...(showFamilyWallets
        ? [
            {
              id: "family-wallets",
              label: "Family wallets",
              icon: WalletCards,
            },
          ]
        : []),
      ...endingSections,
    ],
    [showFamilyWallets],
  );
  const [activeSection, setActiveSection] = useState("membership");

  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    if (sections.some((section) => section.id === fromHash)) {
      setActiveSection(fromHash);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) => right.intersectionRatio - left.intersectionRatio,
          );
        if (visible[0]?.target.id) setActiveSection(visible[0].target.id);
      },
      {
        rootMargin: "-16% 0px -68%",
        threshold: [0.05, 0.25, 0.6],
      },
    );
    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label="Settings sections">
      {sections.map((section) => {
        const Icon = section.icon;
        return (
          <a
            aria-current={activeSection === section.id ? "location" : undefined}
            className={activeSection === section.id ? "active" : undefined}
            href={`#${section.id}`}
            key={section.id}
            onClick={() => setActiveSection(section.id)}
          >
            <Icon aria-hidden size={17} /> {section.label}
          </a>
        );
      })}
    </nav>
  );
}
