"use client";

import { MembershipCard, riseClassName } from "@duna/ui/tideline";
import { useState } from "react";
import { usePlayOnce } from "../use-play-once";

/**
 * The membership card, the kit's MembershipCard (demo club, labelled). It
 * Rises once when it comes into view; tap it (or Enter) to turn it over to
 * the pass (an example code, labelled as one).
 */
export function ConceptMemberPass({
  className,
}: {
  readonly className?: string;
}) {
  const { ref, phase } = usePlayOnce<HTMLDivElement>();
  const [flipped, setFlipped] = useState(false);
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
      <div
        className={phase === "play" ? riseClassName() : undefined}
        key={phase === "play" ? "play" : "rest"}
        style={{ width: "100%" }}
      >
        <MembershipCard
          art={{ source: "set", key: "golden-dune" }}
          chip="Annual"
          club={{ name: "Harbor Line Beach Club", color: "#2E5E4E" }}
          fact={{ kind: "next", text: "Tonight 6:00 PM" }}
          flipped={flipped}
          member="Kai Arden"
          onFlip={setFlipped}
          pass={{
            code: "duna:example:harbor-line",
            rotation: "static",
            label: "Example pass",
          }}
          plan="Annual member"
          since="2026"
          status="active"
        />
      </div>
    </div>
  );
}
