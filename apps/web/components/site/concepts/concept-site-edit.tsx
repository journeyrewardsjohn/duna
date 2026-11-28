"use client";

import type { CSSProperties } from "react";
import { GlassCard } from "../glass-card";
import { usePlayOnce } from "../use-play-once";

const REQUEST = "Put the summer league first on the home page.";
const BEFORE = "Beach volleyball for every level.";
const AFTER = "Summer league starts June 3.";
const REPLY =
  "Done. The summer league is now the first thing people see. Publish?";

/**
 * The club website, edited by asking (spec 2.4, clubs hero). A request types
 * itself (about 38 ms a character), the site's headline Rises to the new
 * words, and Duna answers "Publish?": nothing goes live until a person
 * says so. All CSS: on the first screen it plays from the first paint
 * (`first-paint`), lower down once at 45% visible. The end state is the
 * server HTML; reduced motion shows only that.
 */
export function ConceptSiteEdit({
  trigger = "in-view",
  className,
}: {
  readonly trigger?: "first-paint" | "in-view";
  readonly className?: string;
}) {
  const { ref, phase } = usePlayOnce<HTMLDivElement>();
  const shown = trigger === "first-paint" ? "paint" : phase;
  return (
    <div ref={ref}>
      <GlassCard
        className={
          className ? `site-concept-site ${className}` : "site-concept-site"
        }
        data-phase={shown}
        example
        label="Your club site"
        style={{ "--site-typing-steps": REQUEST.length } as CSSProperties}
      >
        <div className="site-concept-site__page">
          <p className="site-concept-site__bar">
            <i aria-hidden="true" />
            <i aria-hidden="true" />
            <i aria-hidden="true" />
            <span>harborline.club</span>
          </p>
          <p className="site-concept-site__club">Harbor Line Beach Club</p>
          <p className="site-concept-site__headline">
            <span aria-hidden="true" className="site-concept-site__before">
              {BEFORE}
            </span>
            <span className="site-concept-site__after">{AFTER}</span>
          </p>
          <span aria-hidden="true" className="site-concept-site__book">
            Book a court
          </span>
        </div>
        <div className="site-concept-site__chat">
          <p className="site-concept-site__ask">
            <span className="td-sr">You asked: </span>
            <span className="site-concept-site__typed">{REQUEST}</span>
          </p>
          <p className="site-concept-site__reply">
            <span className="td-sr">Duna replied: </span>
            {REPLY}
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
