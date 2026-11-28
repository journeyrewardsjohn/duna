"use client";

import type { CSSProperties } from "react";
import { GlassCard } from "../glass-card";
import { usePlayOnce } from "../use-play-once";

/** What a read of a club's website proposes (demo club, in build). */
const FOUND = [
  { field: "Name", value: "Harbor Line Beach Club" },
  { field: "Hours", value: "Mon–Sun · 7 AM to sunset" },
  { field: "Places", value: "6 sand courts · Pier Courts" },
  { field: "Offerings", value: "Clinics, open play, court rental" },
] as const;

/**
 * Starting from a website address (the AI-forward setup; the reading itself
 * is in build). Duna proposes what it found; each line waits for Keep, Edit
 * or Skip, and nothing reaches the club until a person applies it. The
 * proposals Rally in once when the card is seen.
 */
export function ConceptSetupRead({
  className,
}: {
  readonly className?: string;
}) {
  const { ref, phase } = usePlayOnce<HTMLDivElement>();
  return (
    <div ref={ref}>
      <GlassCard
        className={
          className ? `site-concept-setup ${className}` : "site-concept-setup"
        }
        data-phase={phase}
        example
        label="Your club’s website"
        status="Preview · in build"
      >
        <p className="site-setup__url">
          <span className="site-label">Read from</span>
          <span>harborline.club</span>
        </p>
        <ul className="site-setup">
          {FOUND.map((item, index) => (
            <li
              data-secondary={index === 3 ? "" : undefined}
              key={item.field}
              style={{ "--i": index } as CSSProperties}
            >
              <span className="site-setup__field">{item.field}</span>
              <span className="site-setup__value">{item.value}</span>
              <span aria-hidden="true" className="site-setup__choices">
                <span data-choice="keep">Keep</span>
                <span>Edit</span>
                <span>Skip</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="site-meta">
          From your website, until you confirm it. Nothing is applied until you
          say so.
        </p>
      </GlassCard>
    </div>
  );
}
