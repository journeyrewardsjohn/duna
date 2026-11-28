"use client";

import { buttonClassName, Icon } from "@duna/ui/tideline";
import { type ReactNode, useEffect, useState } from "react";

/** "Reference: …" with Copy, as the kit's `ReferenceLine` draws it. */
function ReferenceLine({ reference }: { readonly reference: string }) {
  const [canCopy, setCanCopy] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setCanCopy(Boolean(navigator.clipboard));
  }, []);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <p className="td-state__reference">
      <span>
        Reference: <span className="td-state__code">{reference}</span>
      </span>
      {canCopy ? (
        <button
          className={buttonClassName({ size: "sm", variant: "ghost" })}
          onClick={() =>
            navigator.clipboard.writeText(reference).then(() => setCopied(true))
          }
          type="button"
        >
          <span className="td-btn__label">
            {copied ? "Copied" : "Copy reference"}
          </span>
        </button>
      ) : null}
    </p>
  );
}

export interface SiteErrorStateProps {
  readonly title: ReactNode;
  readonly message: ReactNode;
  readonly reference: string;
  readonly onRetry: () => void;
  /** A second way out, like "Duna home". */
  readonly action?: ReactNode;
}

/**
 * The kit's error state (`ErrorState`: the `td-state` markup and classes,
 * Try again, a second action and the copyable reference) for the public
 * site's error boundaries and its global error document.
 *
 * Next ships every `error.tsx` and `global-error.tsx` with the first view of
 * every page, and `global-error` in a chunk group of its own, so whatever an
 * error boundary imports is paid for on every visit, twice for the global
 * one. `ErrorState` brings the interaction kit (pending buttons, toasts) and
 * the UI SDK's button and toast machinery: about 60 KiB of script nobody
 * needs until something fails. This renders the same state with plain
 * elements. See docs/design/website-performance.md §7.
 */
export function SiteErrorState({
  title,
  message,
  reference,
  onRetry,
  action,
}: SiteErrorStateProps) {
  return (
    <div className="td-state" data-kind="error" role="alert">
      <span aria-hidden="true" className="td-state__glyph">
        <Icon name="alert" />
      </span>
      <div className="td-state__body">
        <p className="td-state__title">{title}</p>
        <div className="td-state__text">
          <p>{message}</p>
          <ReferenceLine reference={reference} />
        </div>
        <div className="td-state__actions">
          <button
            className={buttonClassName({ variant: "secondary" })}
            onClick={onRetry}
            type="button"
          >
            <span className="td-btn__label">Try again</span>
          </button>
          {action}
        </div>
      </div>
    </div>
  );
}
