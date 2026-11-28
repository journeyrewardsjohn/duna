import type { ComponentProps, ReactNode } from "react";
import { cx } from "../base/cx";
import { CopyLinkButton } from "./copy-link";

export interface SectionHeadingProps extends Omit<
  ComponentProps<"h2">,
  "id" | "title"
> {
  /** The anchor id; the section list and shared links point here. */
  id: string;
  level?: 2 | 3;
  /** Plain text of the heading, for the copy button's name. */
  title: string;
  children: ReactNode;
}

/**
 * A document heading people can link to: an anchor with a scroll margin
 * clear of sticky headers, and a "Copy link" button beside it.
 */
export function SectionHeading({
  id,
  level = 2,
  title,
  className,
  children,
  ...props
}: SectionHeadingProps) {
  const Tag = level === 2 ? "h2" : "h3";
  return (
    <Tag
      className={cx("td-doc-heading", `td-doc-heading--${level}`, className)}
      id={id}
      {...props}
    >
      <span className="td-doc-heading__text">{children}</span>
      <CopyLinkButton targetId={id} title={title} />
    </Tag>
  );
}

export interface DocumentTableProps extends ComponentProps<"div"> {
  /** Names the scrolling region, like "Payout timing". */
  label: string;
}

/**
 * A wide table that scrolls inside itself, never the page: a labelled,
 * keyboard-focusable region (arrow keys scroll it) with an edge hint.
 */
export function DocumentTable({
  label,
  className,
  ...props
}: DocumentTableProps) {
  return (
    <div
      aria-label={label}
      className={cx("td-doc-table", className)}
      role="region"
      tabIndex={0}
      {...props}
    />
  );
}

export type DocumentProseProps = ComponentProps<"div">;

/**
 * Long-form reading: a 65–75 character measure, comfortable leading, list
 * and table rhythm, and words that wrap rather than widen the page.
 */
export function DocumentProse({ className, ...props }: DocumentProseProps) {
  return <div className={cx("td-doc-prose", className)} {...props} />;
}
