"use client";

import { Wallet, type WalletCard } from "@duna/ui/tideline";

/** Two demo clubs' cards (labelled "Example" on the page, never a real club). */
const CARDS: ReadonlyArray<WalletCard> = [
  {
    id: "harbor-line",
    club: { name: "Harbor Line Beach Club", color: "#2E5E4E" },
    art: { source: "set", key: "golden-dune" },
    member: "Kai Arden",
    plan: "Annual member",
    chip: "Annual",
    status: "active",
    since: "2026",
    fact: { kind: "next", text: "Thu 6:00 PM" },
  },
  {
    id: "northside",
    club: { name: "Northside Indoor", color: "#3A4C8F" },
    art: { source: "set", key: "ocean-teal" },
    member: "Kai Arden",
    plan: "10-session pack",
    chip: "Pack",
    kind: "pack",
    status: "active",
    fact: { kind: "credits", text: "6 sessions" },
  },
];

/**
 * The wallet (spec: the real `Wallet` and `MembershipCard`): every club card
 * a player holds, swiped side to side; tap the card to turn it over. Works by
 * keyboard (arrows, Enter).
 */
export function ConceptWallet({ className }: { readonly className?: string }) {
  return (
    <div
      className={
        className ? `site-concept-wallet ${className}` : "site-concept-wallet"
      }
    >
      <span className="site-example">Example · demo clubs</span>
      <Wallet
        cards={CARDS}
        label="Example membership cards"
        layout="compact"
        rememberPresentation={false}
      />
    </div>
  );
}
