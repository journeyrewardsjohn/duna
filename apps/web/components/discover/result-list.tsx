"use client";

import { Chip, ClubMark, rallyStyle, riseClassName } from "@duna/ui/tideline";
import Link from "next/link";
import type { ResultRow } from "./results";

const TONES = {
  neutral: "neutral",
  positive: "positive",
  caution: "warning",
  critical: "danger",
} as const;

export interface RowHandlers {
  readonly hoveredId: string | null;
  readonly selectedId: string | null;
  readonly onHover: (id: string | null) => void;
  readonly onSelect: (id: string | null) => void;
}

/**
 * One result. The whole row is one link (to the session, venue, club or
 * coach) named by its title; everything else is plain text a screen reader
 * reads in order: what, when, where, level, price, group state, light.
 */
export function ResultItem({
  row,
  index,
  handlers,
  session,
}: {
  readonly row: ResultRow;
  readonly index: number;
  /** The search page links rows and pins; elsewhere a row stands alone. */
  readonly handlers?: RowHandlers;
  /** Sessions lead with the time; places with their mark. */
  readonly session: boolean;
}) {
  const titleId = `dv-row-${row.id.replace(/[^\w-]/g, "-")}`;
  return (
    <li
      className={riseClassName({ short: true }, "dv-row")}
      data-hovered={handlers?.hoveredId === row.id || undefined}
      data-row={row.id}
      data-selected={handlers?.selectedId === row.id || undefined}
      onBlur={() => handlers?.onHover(null)}
      onFocus={() => handlers?.onHover(row.id)}
      onMouseEnter={() => handlers?.onHover(row.id)}
      onMouseLeave={() => handlers?.onHover(null)}
      style={rallyStyle(index)}
    >
      <article aria-labelledby={titleId} className="dv-row__card">
        {session ? (
          <div className="dv-row__when">
            {row.startsAt ? (
              <time dateTime={row.startsAt}>{row.time?.split(" to ")[0]}</time>
            ) : null}
            {row.time?.includes(" to ") ? (
              <span className="dv-row__until">
                to {row.time.split(" to ")[1]}
              </span>
            ) : null}
          </div>
        ) : (
          <div className="dv-row__media">
            {row.imageUrl ? (
              // A club's own upload, sized so nothing moves when it lands.
              <img
                alt=""
                decoding="async"
                height={56}
                loading="lazy"
                src={row.imageUrl}
                width={56}
              />
            ) : (
              <ClubMark decorative name={row.title} size={56} />
            )}
          </div>
        )}
        <div className="dv-row__body">
          <p className="dv-row__chips">
            {row.live ? (
              <Chip kind="status" tone="live">
                Live now
              </Chip>
            ) : null}
            <Chip kind="taxonomy">{row.kindLabel}</Chip>
            {row.multiDay ? (
              <span className="dv-row__days">{row.multiDay}</span>
            ) : null}
          </p>
          <h3 className="dv-row__title" id={titleId}>
            <Link
              className="dv-row__link"
              href={row.href}
              onClick={() => handlers?.onSelect(row.id)}
              prefetch={false}
            >
              {row.title}
            </Link>
          </h3>
          <p className="dv-row__where">
            {row.place ? <span>{row.place}</span> : null}
            {row.distance ? (
              <span className="dv-row__distance">{row.distance}</span>
            ) : null}
          </p>
          {row.level || row.conditions || row.facts ? (
            <p className="dv-row__meta">
              {row.facts ? <span>{row.facts}</span> : null}
              {row.level ? <span>{row.level}</span> : null}
              {row.conditions ? (
                <span className="dv-row__light">{row.conditions}</span>
              ) : null}
            </p>
          ) : null}
        </div>
        {row.price || row.group ? (
          <div className="dv-row__aside">
            {row.price ? (
              <p className="dv-row__price" title={row.price.detail}>
                {row.price.label}
                <span className="td-sr"> ({row.price.detail})</span>
              </p>
            ) : null}
            {row.group ? (
              <Chip kind="status" tone={TONES[row.group.tone]}>
                {row.group.words}
              </Chip>
            ) : null}
          </div>
        ) : null}
      </article>
    </li>
  );
}
