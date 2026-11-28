"use client";

import { useDebouncedValue, useLatest } from "@duna/ui/tideline";
import { useEffect, useState } from "react";
import { MoneyActionError } from "../money/money-action-result";
import { act, reportError } from "./schedule-parts";
import type { MoneyActionResult } from "../money/money-action-result";

export type Preview<T> =
  | { readonly state: "idle" }
  | { readonly state: "loading"; readonly last?: T }
  | { readonly state: "ready"; readonly data: T; readonly key: string }
  | {
      readonly state: "error";
      readonly message: string;
      readonly reference?: string;
      readonly denied: boolean;
    };

/**
 * A server preview that follows the person's choices: debounced (the
 * kit's 220 ms), only the newest answer counts (`useLatest`), the last good
 * answer stays on screen while the next loads, and a failure keeps its
 * words and reference. `key` is null while the choices are incomplete.
 */
export function usePreview<T>(
  key: string | null,
  load: () => Promise<MoneyActionResult<T>>,
): Preview<T> {
  const settled = useDebouncedValue(key);
  const latest = useLatest();
  const [preview, setPreview] = useState<Preview<T>>({ state: "idle" });
  useEffect(() => {
    if (!settled) {
      setPreview({ state: "idle" });
      return;
    }
    setPreview((current) => ({
      state: "loading",
      ...(current.state === "ready"
        ? { last: current.data }
        : current.state === "loading" && current.last
          ? { last: current.last }
          : {}),
    }));
    void latest
      .run(() => act(load()))
      .then((result) => {
        if (result.status === "stale") return;
        if (result.status === "ok") {
          setPreview({ state: "ready", data: result.value, key: settled });
          return;
        }
        const error = result.error;
        if (!(error instanceof MoneyActionError)) reportError(error);
        setPreview({
          state: "error",
          message:
            error instanceof MoneyActionError
              ? error.userMessage
              : "Something went wrong on our side. Try again.",
          ...(error instanceof MoneyActionError && error.reference
            ? { reference: error.reference }
            : {}),
          denied: error instanceof MoneyActionError && error.code === "denied",
        });
      });
    // `load` reads the same choices `key` names.
  }, [settled]);
  return preview;
}

/** The newest good answer, also while the next one loads. */
export function previewData<T>(preview: Preview<T>): T | undefined {
  return preview.state === "ready"
    ? preview.data
    : preview.state === "loading"
      ? preview.last
      : undefined;
}

/** The answer is for exactly the choices on screen now (not one still debouncing). */
export function previewIsCurrent<T>(
  preview: Preview<T>,
  key: string | null,
): boolean {
  return preview.state === "ready" && preview.key === key;
}
