"use client";

import { WalletStack, type WalletCard } from "@duna/ui/tideline";

/** Two demo clubs' cards (labelled "Example" on the page, never a real club). */
const CARDS: ReadonlyArray<WalletCard> = [
  {
    id: "harbor-line",
    club: { name: "Harbor Line Beach Club", color: "#2E5E4E" },
    member: "Kai Arden",
    plan: "Annual member",
    kind: "Club member",
    status: "active",
    line: "Tonight: Thursday clinic · Court 3 · 6:00 PM",
    since: "Member since 2026",
  },
  {
    id: "northside",
    club: { name: "Northside Indoor", color: "#3A4C8F" },
    member: "Kai Arden",
    plan: "10-session pack",
    kind: "Pack holder",
    status: "active",
    line: "6 sessions left",
  },
];

/**
 * The wallet (spec: real `WalletStack` and `MembershipCard`): every club
 * card a player holds, the open one on top and the others as strips that
 * open it. Works by keyboard; the open card Rises.
 */
export function ConceptWallet({ className }: { readonly className?: string }) {
  return (
    <div
      className={
        className ? `site-concept-wallet ${className}` : "site-concept-wallet"
      }
    >
      <span className="site-example">Example · demo clubs</span>
      <WalletStack cards={CARDS} label="Example membership cards" />
    </div>
  );
}
