import { Rally } from "@duna/ui/tideline";
import type { ReactNode } from "react";
import { NetLine } from "./net-line";
import { Reveal } from "./reveal";

/**
 * The first screen of a marketing page (spec 2.3 and 2.6–2.8): label, the
 * page's one Jost title, the lead, the actions and a short note on the left;
 * a photograph with its concept on the right. On phones the stage moves under
 * the copy, so the first screen is title, promise and action. Everything
 * Rises with CSS from the first paint; nothing waits for script.
 */
export function PageHero({
  id,
  label,
  title,
  lead,
  actions,
  note,
  stage,
  children,
}: {
  readonly id: string;
  readonly label: ReactNode;
  readonly title: ReactNode;
  readonly lead: ReactNode;
  readonly actions?: ReactNode;
  readonly note?: ReactNode;
  /** The photograph with its concept. Without one the copy takes the width. */
  readonly stage?: ReactNode;
  /** Extra first-screen content under the actions. */
  readonly children?: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="site-wrap site-page-hero"
      data-stage={stage ? "" : undefined}
    >
      <Rally className="site-page-hero__copy">
        <p className="site-label">{label}</p>
        <h1 className="site-display" id={id}>
          {title}
        </h1>
        <p className="site-lead">{lead}</p>
        {actions ? <div className="site-actions">{actions}</div> : null}
        {note ? <p className="site-meta">{note}</p> : null}
        {children}
      </Rally>
      {stage ? (
        <div className="site-page-hero__stage td-rise">{stage}</div>
      ) : null}
    </section>
  );
}

/**
 * A section heading: the net line with its label (and an optional chip), the
 * Jost h2 and an optional line of lead. It Rises once in view.
 */
export function SectionHead({
  id,
  label,
  chip,
  title,
  lead,
  row = false,
}: {
  readonly id: string;
  readonly label: ReactNode;
  readonly chip?: ReactNode;
  readonly title: ReactNode;
  readonly lead?: ReactNode;
  /** Title and lead side by side on wide screens. */
  readonly row?: boolean;
}) {
  return (
    <>
      <NetLine chip={chip} label={label} />
      <Reveal
        className={
          row
            ? "site-section__head site-section__head--row"
            : "site-section__head"
        }
      >
        <h2 className="site-h2" id={id}>
          {title}
        </h2>
        {lead ? (
          <p className={row ? "site-body" : "site-lead"}>{lead}</p>
        ) : null}
      </Reveal>
    </>
  );
}

/**
 * Copy beside a photograph with its concept (a chapter of a page). The copy
 * column is the reading order; `flip` puts the stage first on wide screens
 * only, so phones always read the words, then see the concept.
 */
export function Split({
  id,
  anchor,
  label,
  chip,
  title,
  children,
  stage,
  flip = false,
}: {
  readonly id: string;
  /** The fragment other pages link to (`/coaches#plan`). */
  readonly anchor?: string;
  readonly label: ReactNode;
  readonly chip?: ReactNode;
  readonly title: ReactNode;
  readonly children: ReactNode;
  readonly stage: ReactNode;
  readonly flip?: boolean;
}) {
  return (
    <section
      aria-labelledby={id}
      className="site-wrap site-section"
      id={anchor}
    >
      <div className="site-split" data-flip={flip ? "" : undefined}>
        <div className="site-split__copy">
          <NetLine chip={chip} label={label} />
          <Reveal className="site-split__text">
            <h2 className="site-h2" id={id}>
              {title}
            </h2>
            {children}
          </Reveal>
        </div>
        <div className="site-split__stage">{stage}</div>
      </div>
    </section>
  );
}

/** "Live today" or "In build": what the product does now, never more. */
export function StatusChip({
  status,
  children,
}: {
  readonly status: "live" | "build" | "example";
  readonly children: ReactNode;
}) {
  return (
    <span className="site-status" data-status={status}>
      {children}
    </span>
  );
}

/**
 * A marked slot for something only the owner can supply (a real club's
 * result, a quote with permission). It renders nothing until it is filled:
 * no placeholder ever reaches the live site.
 */
export function OwnerSlot({ children }: { readonly children?: ReactNode }) {
  if (!children) return null;
  return <div className="site-owner-slot">{children}</div>;
}
