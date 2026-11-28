"use client";

import { useEffect, useRef, useState } from "react";
import { SUCCESS_HOLD_MS } from "../interactions/timing";
import { Icon } from "../base/icons";
import { sectionHref } from "./document-core";

export interface CopyLinkButtonProps {
  /** The heading's id. */
  targetId: string;
  /** The heading's text, for the button's name: "Copy link to “1. Scope”". */
  title: string;
}

/**
 * Copies the link to a heading. Says "Link copied" in a polite live region;
 * where the clipboard is blocked it puts the link in the address bar instead
 * and says so.
 */
export function CopyLinkButton({ targetId, title }: CopyLinkButtonProps) {
  const [state, setState] = useState<"idle" | "copied" | "address">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    const href = sectionHref(window.location, targetId);
    let next: "copied" | "address" = "copied";
    try {
      await navigator.clipboard.writeText(href);
    } catch {
      window.history.replaceState(null, "", `#${encodeURIComponent(targetId)}`);
      next = "address";
    }
    setState(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), SUCCESS_HOLD_MS);
  };

  return (
    <span className="td-doc-copy">
      <button
        aria-label={`Copy link to “${title}”`}
        className="td-doc-copy__button"
        data-state={state}
        onClick={() => void copy()}
        type="button"
      >
        {state === "idle" ? (
          <span aria-hidden className="td-doc-copy__hash">
            #
          </span>
        ) : (
          <Icon name="check" size="inline" />
        )}
      </button>
      <span className="td-doc-copy__status" role="status">
        {state === "copied"
          ? "Link copied"
          : state === "address"
            ? "Link is in the address bar"
            : ""}
      </span>
    </span>
  );
}
