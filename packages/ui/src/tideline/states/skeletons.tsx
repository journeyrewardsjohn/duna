/**
 * Loading placeholders shaped like the layouts they stand in for, so the
 * content arrives without moving anything: a list row has the row's height
 * and padding, a card the card's padding, a table the table's rows. Plain
 * markup; the shimmer is `Skeleton`'s (sand shimmer, resting under reduced
 * motion).
 */
import type { ReactNode } from "react";
import { cx } from "../base/cx";
import { Skeleton } from "../loaders/loaders";

export interface SkeletonListRowProps {
  /** Lines of text beside the avatar. */
  lines?: number;
  /** Leave the avatar out for rows without one. */
  avatar?: boolean;
  className?: string;
}

/** One `td-listrow`'s worth of placeholder. */
export function SkeletonListRow({
  lines = 2,
  avatar = true,
  className,
}: SkeletonListRowProps) {
  return (
    <div className={cx("td-listrow td-skelrow", className)}>
      <Skeleton kind={avatar ? "row" : "lines"} lines={lines} />
    </div>
  );
}

export interface SkeletonCardProps {
  /** A 16:9 image on top. */
  media?: boolean;
  lines?: number;
  className?: string;
}

/** A card's placeholder, with the card's padding and radius. */
export function SkeletonCard({
  media = false,
  lines = 3,
  className,
}: SkeletonCardProps) {
  return (
    <div className={cx("td-card td-skelcard", className)}>
      {media ? (
        <span className="td-skel td-skeleton__media td-skelcard__media" />
      ) : null}
      <Skeleton kind="lines" lines={lines} />
    </div>
  );
}

export interface SkeletonTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

/** A table's placeholder: a header and rows at the table's row height. */
export function SkeletonTable({
  rows = 5,
  columns = 4,
  className,
}: SkeletonTableProps) {
  const cells = (row: number) =>
    Array.from({ length: columns }, (_, column) => (
      <span
        className="td-skel td-skeltable__cell"
        data-first={column === 0 ? "" : undefined}
        key={`${row}-${column}`}
      />
    ));
  return (
    <div
      className={cx("td-skeltable", className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      <div className="td-skeltable__row td-skeltable__row--head">
        {cells(-1)}
      </div>
      {Array.from({ length: rows }, (_, row) => (
        <div className="td-skeltable__row" key={row}>
          {cells(row)}
        </div>
      ))}
    </div>
  );
}

export interface SkeletonDetailHeaderProps {
  /** Show the action buttons' places. */
  actions?: number;
  className?: string;
}

/** An object page's header: title, a meta line and the action buttons. */
export function SkeletonDetailHeader({
  actions = 2,
  className,
}: SkeletonDetailHeaderProps) {
  return (
    <div className={cx("td-skelheader", className)}>
      <div className="td-skelheader__text">
        <span className="td-skel td-skelheader__title" />
        <span className="td-skel td-skelheader__meta" />
      </div>
      {actions > 0 ? (
        <div className="td-skelheader__actions">
          {Array.from({ length: actions }, (_, index) => (
            <span className="td-skel td-skelheader__action" key={index} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export type LoadingLayout = "list" | "cards" | "table" | "detail";

export interface LoadingStateProps {
  /** The layout that is coming. */
  layout: LoadingLayout;
  /** Rows or cards to draw. */
  count?: number;
  /** Table columns. */
  columns?: number;
  /** Announced once: "Loading members". */
  label: string;
  className?: string;
}

/**
 * The placeholder for a pane while its first data loads, in the shape of its
 * layout. Announced once as a status. Use it through `AsyncBoundary` so it
 * waits 250 ms before it shows.
 */
export function LoadingState({
  layout,
  count = layout === "cards" ? 3 : 4,
  columns = 4,
  label,
  className,
}: LoadingStateProps) {
  let shape: ReactNode;
  if (layout === "list") {
    shape = (
      <div className="td-list td-skellist">
        {Array.from({ length: count }, (_, index) => (
          <SkeletonListRow key={index} />
        ))}
      </div>
    );
  } else if (layout === "cards") {
    shape = (
      <div className="td-skelcards">
        {Array.from({ length: count }, (_, index) => (
          <SkeletonCard key={index} />
        ))}
      </div>
    );
  } else if (layout === "table") {
    shape = <SkeletonTable columns={columns} rows={count} />;
  } else {
    shape = (
      <div className="td-skeldetail">
        <SkeletonDetailHeader />
        <SkeletonCard lines={4} />
      </div>
    );
  }
  return (
    <div
      className={cx("td-loadingstate", className)}
      data-layout={layout}
      role="status"
    >
      <span className="td-sr">{label}</span>
      <div aria-hidden="true">{shape}</div>
    </div>
  );
}
