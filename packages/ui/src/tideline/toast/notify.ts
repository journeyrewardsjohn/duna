/**
 * The three toasts the interaction kit uses, on UI SDK's shared `toast`:
 * a success that names what happened, an error with its reference, and an
 * Undo with a visible countdown. Render one `Toaster` per scope; it shows at
 * most `TOAST_MAX_VISIBLE` at once and queues the rest (their timers wait).
 */
import { toast } from "@ui-sdk/react/toast";
import { UNDO_WINDOW_MS } from "../interactions/timing";

/** How many toasts show at once; the rest wait their turn. */
export const TOAST_MAX_VISIBLE = 3;

/** What `Toaster` reads from a toast's `data`. */
export interface TidelineToastData {
  /** Shown as "Reference: …" in Geist Mono, for support to find the log. */
  reference?: string;
  /** Draws a line that empties over this many ms (the Undo window). */
  countdownMs?: number;
}

export interface SuccessToastOptions {
  description?: string;
  /** Reuse a toast: a toast with this id still showing is updated. */
  id?: string;
}

/** "Booking confirmed for Sat 10:30 AM": the result, where the person is looking. */
export function successToast(
  title: string,
  options: SuccessToastOptions = {},
): string {
  return toast.success(title, options);
}

export interface ErrorToastOptions {
  /** What to do next, in plain words. */
  description?: string;
  /** The request id or digest; shown as "Reference: …". */
  reference?: string;
  /** Offers Try again in the toast. */
  retry?: { label?: string; onRetry: () => unknown };
  id?: string;
}

/**
 * An error the person can act on. It stays until dismissed when it carries
 * a reference or a retry, so there is time to read and copy the reference.
 */
export function errorToast(
  title: string,
  { description, reference, retry, id }: ErrorToastOptions = {},
): string {
  const data: TidelineToastData = { reference };
  return toast.error(title, {
    id,
    description,
    data,
    priority: "assertive",
    duration: reference || retry ? Number.POSITIVE_INFINITY : undefined,
    action: retry
      ? { label: retry.label ?? "Try again", onAction: () => retry.onRetry() }
      : undefined,
  });
}

export interface UndoToastOptions {
  description?: string;
  /** Reverses the change. A returned Promise keeps the toast (Undoing…) until it settles. */
  onUndo: () => unknown;
  /** How long Undo is on offer. At least 5 s; the timer pauses on hover and focus. */
  windowMs?: number;
  /** The button's label. */
  undoLabel?: string;
  /** Runs when the window closes without Undo: the change is final. */
  onExpire?: () => void;
  id?: string;
}

/**
 * The tier-0 toast: the change is already made; Undo reverses it for a stated
 * window, shown as a line that empties. Undo runs once; if it fails, the
 * toast stays (Undo pending, then available again).
 */
export function undoToast(
  title: string,
  {
    description,
    onUndo,
    windowMs = UNDO_WINDOW_MS,
    undoLabel = "Undo",
    onExpire,
    id,
  }: UndoToastOptions,
): string {
  let undone = false;
  const data: TidelineToastData = { countdownMs: windowMs };
  return toast(title, {
    id,
    description,
    duration: windowMs,
    data,
    action: {
      label: undoLabel,
      onAction: async () => {
        if (undone) return;
        undone = true;
        try {
          await onUndo();
        } catch (error) {
          // A failed Undo keeps the toast, so it can be tried again.
          undone = false;
          throw error;
        }
      },
    },
    onDismiss: () => {
      if (!undone) onExpire?.();
    },
  });
}
