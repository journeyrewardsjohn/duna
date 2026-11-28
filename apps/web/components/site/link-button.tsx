import {
  buttonClassName,
  Icon,
  type ButtonStyleOptions,
} from "@duna/ui/tideline";
import Link from "@/components/site/site-link";
import type { ReactNode } from "react";

interface LinkButtonProps extends ButtonStyleOptions {
  readonly href: string;
  readonly children: ReactNode;
  readonly className?: string;
  /** Draws the arrow after the label. */
  readonly arrow?: boolean;
  readonly icon?: ReactNode;
}

/**
 * A link that looks like the kit's Button. Addresses inside the site go
 * through `next/link`, so moving between rebuilt pages is a client
 * navigation (and Crosses); anything else is a plain link.
 */
export function LinkButton({
  href,
  children,
  className,
  arrow = false,
  icon,
  ...style
}: LinkButtonProps) {
  const content = (
    <>
      {icon ? (
        <span className="td-btn__icon td-btn__icon--start">{icon}</span>
      ) : null}
      <span className="td-btn__label">{children}</span>
      {arrow ? (
        <span className="td-btn__icon">
          <Icon name="chevron-right" size="inline" />
        </span>
      ) : null}
    </>
  );
  const classes = buttonClassName(style, className);
  return href.startsWith("/") || href.startsWith("#") ? (
    <Link className={classes} href={href}>
      {content}
    </Link>
  ) : (
    <a className={classes} href={href}>
      {content}
    </a>
  );
}

/** An underlined text link with the arrow, for secondary paths. */
export function ArrowLink({
  href,
  children,
  className,
}: {
  readonly href: string;
  readonly children: ReactNode;
  readonly className?: string;
}) {
  const classes = className ? `site-link ${className}` : "site-link";
  const content = (
    <>
      <span>{children}</span>
      <Icon name="chevron-right" size="inline" />
    </>
  );
  return href.startsWith("/") || href.startsWith("#") ? (
    <Link className={classes} href={href}>
      {content}
    </Link>
  ) : (
    <a className={classes} href={href}>
      {content}
    </a>
  );
}
