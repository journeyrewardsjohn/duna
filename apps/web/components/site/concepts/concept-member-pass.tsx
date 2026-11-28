"use client";

import { MembershipCard } from "@duna/ui/tideline";
import { usePlayOnce } from "../use-play-once";

/**
 * The membership card, the kit's MembershipCard (demo club, labelled). The
 * kit's card has no pass side yet, so the concept shows the front with
 * tonight's class as the club's line; it Rises once when it comes into view.
 * When the card gains its pass side, this flips to it (spec 2.4).
 */
export function ConceptMemberPass({
  className,
}: {
  readonly className?: string;
}) {
  const { ref, phase } = usePlayOnce<HTMLDivElement>();
  return (
    <div
      className={
        className ? `site-concept-pass ${className}` : "site-concept-pass"
      }
      ref={ref}
    >
      <span className="site-example site-concept-pass__example">
        Example · demo club
      </span>
      <MembershipCard
        club={{ name: "Harbor Line Beach Club", color: "#2E5E4E" }}
        key={phase === "play" ? "play" : "rest"}
        kind="Club member"
        line="Tonight: Thursday clinic · Court 3 · 6:00 PM"
        member="Kai Arden"
        plan="Annual member"
        rise={phase === "play"}
        since="Member since 2026"
        status="active"
      />
    </div>
  );
}
