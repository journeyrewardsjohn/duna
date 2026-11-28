import type { ReactNode } from "react";
import styles from "./error-state.module.css";

/**
 * The look of every error, not-found and failed-pane state. Pure
 * presentation: callers pass the words, the reference and the actions.
 */
export interface ErrorStateProps {
  readonly eyebrow?: string;
  readonly title: string;
  readonly description: string;
  /** Shown as "Reference: …" so a person can quote it to support. */
  readonly reference?: string;
  readonly actions?: ReactNode;
  /** `page` fills the viewport; `pane` sits inside a page. */
  readonly variant?: "page" | "pane";
  readonly zone?: "editorial" | "athletic" | "hq";
  /** Announce as an alert (errors); off for not-found. */
  readonly alert?: boolean;
}

export function ErrorState({
  eyebrow,
  title,
  description,
  reference,
  actions,
  variant = "page",
  zone = "hq",
  alert = true,
}: ErrorStateProps) {
  const body = (
    <div className={variant === "page" ? styles.panel : styles.compact}>
      {eyebrow ? <p className={styles.eyebrow}>{eyebrow}</p> : null}
      {variant === "page" ? (
        <h1 className={styles.title}>{title}</h1>
      ) : (
        <h2 className={styles.title}>{title}</h2>
      )}
      <p className={styles.description}>{description}</p>
      {reference ? (
        <p className={styles.reference}>
          Reference: <code>{reference}</code>
        </p>
      ) : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </div>
  );
  if (variant === "pane") {
    return (
      <section aria-live="polite" role={alert ? "alert" : undefined}>
        {body}
      </section>
    );
  }
  return (
    <main
      className={styles.page}
      data-zone={zone}
      role={alert ? "alert" : undefined}
    >
      {body}
    </main>
  );
}

export const errorStateActionClass = {
  primary: styles.primary,
  secondary: styles.secondary,
};
