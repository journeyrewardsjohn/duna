import { Icon } from "@duna/ui/icons";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The top of every `(next)` screen: the screen's ONE Jost title, a line of
 * context, at most one primary action (with secondary ones beside it), and
 * the sub-navigation slot that S3's `ObjectHeader` / `SubNav` and
 * `SectionNav` fill. A list page passes its filters as `subnav`.
 *
 *   <PageHeader title="Today" description="Friday · Sunset Beach Club"
 *     actions={<Button href="/events/create">Create event</Button>} />
 */
export function PageHeader({
  title,
  description,
  actions,
  back,
  subnav,
  meta,
}: {
  /** The one brand title on the screen: Jost Medium, 22 px or more, never numerals. */
  readonly title: ReactNode;
  readonly description?: ReactNode;
  /** Buttons, primary last. */
  readonly actions?: ReactNode;
  /** A back link for a page below its list: { href, label }. */
  readonly back?: { readonly href: string; readonly label: string };
  /** Sub-navigation: an object's SubNav, a list's filters. */
  readonly subnav?: ReactNode;
  /** Small facts under the title (chips, counts). */
  readonly meta?: ReactNode;
}) {
  return (
    <header className="hqs-page-head">
      {back ? (
        <Link className="hqs-page-head__back" href={back.href}>
          <Icon name="chevron-left" size="inline" />
          {back.label}
        </Link>
      ) : null}
      <div className="hqs-page-head__row">
        <div className="hqs-page-head__text">
          <h1 className="td-display hqs-page-head__title">{title}</h1>
          {description ? (
            <p className="hqs-page-head__description">{description}</p>
          ) : null}
          {meta ? <div className="hqs-page-head__meta">{meta}</div> : null}
        </div>
        {actions ? (
          <div className="hqs-page-head__actions">{actions}</div>
        ) : null}
      </div>
      {subnav ? <div className="hqs-page-head__subnav">{subnav}</div> : null}
    </header>
  );
}

/** A section of a page: an h2 (Geist), an optional link or action, the body. */
export function PageSection({
  id,
  title,
  aside,
  children,
  className,
  flush = false,
}: {
  readonly id: string;
  readonly title: ReactNode;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  /** The body runs to the card's edges (lists with their own rows). */
  readonly flush?: boolean;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className={["hqs-section", className].filter(Boolean).join(" ")}
      data-flush={flush || undefined}
    >
      <div className="hqs-section__head">
        <h2 className="hqs-section__title" id={`${id}-title`}>
          {title}
        </h2>
        {aside ? <div className="hqs-section__aside">{aside}</div> : null}
      </div>
      <div className="hqs-section__body">{children}</div>
    </section>
  );
}
