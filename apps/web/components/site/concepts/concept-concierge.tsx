"use client";

import { Avatar } from "@duna/ui/tideline";
import type { CSSProperties } from "react";
import { GlassCard } from "../glass-card";
import { usePlayOnce } from "../use-play-once";

/** One person's thread across channels (demo; the Concierge is in build). */
const THREAD = [
  {
    channel: "Text",
    from: "them",
    body: "Is there room in Thursday's clinic?",
  },
  {
    channel: "Email",
    from: "them",
    body: "Also, can I pay for my partner too?",
  },
  {
    channel: "Chat",
    from: "club",
    body: "Yes to both. Two spots held until 6 PM.",
  },
] as const;

/**
 * The Concierge (in build): texts, emails and chat from one person land in
 * one thread, each message marked with where it came from, and a reply goes
 * back the way they wrote. The messages Rise once when the card is seen.
 */
export function ConceptConcierge({
  className,
}: {
  readonly className?: string;
}) {
  const { ref, phase } = usePlayOnce<HTMLDivElement>();
  return (
    <div ref={ref}>
      <GlassCard
        className={
          className
            ? `site-concept-concierge ${className}`
            : "site-concept-concierge"
        }
        data-phase={phase}
        example
        label="Concierge"
        status="One thread"
      >
        <p className="site-concierge__who">
          <Avatar name="Maya Lind" size="sm" />
          <span>
            <b>Maya Lind</b>
            <span>Member since 2025</span>
          </span>
        </p>
        <ol className="site-concierge">
          {THREAD.map((message, index) => (
            <li
              data-from={message.from}
              data-secondary={index === 1 ? "" : undefined}
              key={message.body}
              style={{ "--i": index } as CSSProperties}
            >
              <span className="site-concierge__channel">{message.channel}</span>
              <span className="site-concierge__body">{message.body}</span>
            </li>
          ))}
        </ol>
      </GlassCard>
    </div>
  );
}
