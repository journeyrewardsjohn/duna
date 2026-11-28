"use client";

import {
  Button,
  CardArrival,
  CardArtPicker,
  MembershipCard,
  Wallet,
  WalletActions,
  type MembershipCardProps,
} from "@duna/ui/tideline";
import type { CardArtSource } from "@duna/tideline-core";
import { useState } from "react";
import styles from "./kit.module.css";
import { GALLERY_CARDS } from "./wallet-cards";

/** A full wallet with the four actions and a small sheet, for `count` cards. */
export function WalletDemo({ count }: { count: number }) {
  const cards = GALLERY_CARDS.slice(0, count);
  const [value, setValue] = useState(cards[0]?.id ?? "");
  const [flipped, setFlipped] = useState(false);
  const selected = cards.find((card) => card.id === value) ?? cards[0];
  return (
    <Wallet
      actions={
        <WalletActions
          items={[
            {
              key: "pass",
              label: flipped ? "Hide pass" : "Show pass",
              icon: "pass",
              pressed: flipped,
              onClick: () => setFlipped(!flipped),
            },
            { key: "book", label: "Book", icon: "calendar", href: "#wallet" },
            {
              key: "benefits",
              label: "Benefits",
              icon: "verified",
              href: "#wallet",
            },
            {
              key: "activity",
              label: "Activity",
              icon: "timer",
              href: "#wallet",
            },
          ]}
        />
      }
      cards={cards}
      flipped={flipped}
      label={`Example wallet, ${count} card${count === 1 ? "" : "s"}`}
      layout="compact"
      onChange={(id) => {
        setValue(id);
        setFlipped(false);
      }}
      onFlip={setFlipped}
      rememberPresentation={false}
      title={<h4 className="td-title">Wallet</h4>}
      value={value}
    >
      {selected ? (
        <div className={styles.stack}>
          <strong>{selected.club.name}</strong>
          <span className="td-meta">{selected.plan}</span>
        </div>
      ) : null}
    </Wallet>
  );
}

/** One card that turns over on tap, Enter or Space. */
export function FlipDemo({ card }: { card: MembershipCardProps }) {
  const [flipped, setFlipped] = useState(false);
  return <MembershipCard {...card} flipped={flipped} onFlip={setFlipped} />;
}

/** The designer-style picker with a live preview card and its measured scrim. */
export function ArtPickerDemo() {
  const [art, setArt] = useState<CardArtSource>({
    source: "set",
    key: "ocean-teal",
  });
  return (
    <div className={styles.stack}>
      <MembershipCard
        {...GALLERY_CARDS[0]!}
        art={art}
        club={{ name: "Saltline Beach Club", color: "#1F4E5A" }}
      />
      <CardArtPicker clubColor="#1F4E5A" onChange={setArt} value={art} />
    </div>
  );
}

/** The purchase moment, with a replay. */
export function ArrivalDemo() {
  const [play, setPlay] = useState(0);
  return (
    <CardArrival
      actions={
        <Button onClick={() => setPlay(play + 1)} size="sm">
          Replay
        </Button>
      }
      card={{
        ...GALLERY_CARDS[0]!,
        number: "0413",
        since: "Nov 2026",
        fact: null,
      }}
      playKey={play}
      text="Your annual card is in your wallet. Your pass works from today."
      title="Welcome to Saltline"
    />
  );
}
