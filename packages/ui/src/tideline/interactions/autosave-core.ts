/**
 * Draft autosave with no framework in it. A change marks the draft dirty and
 * saves it once typing has stopped for `delayMs`; `flush` (bind it to blur)
 * saves at once. Saves never overlap: a change made while one runs is saved
 * right after it, with the newest value. A failure keeps the draft dirty and
 * says so; `retry` tries again.
 */
import { createDebouncer } from "./debouncer";
import { AUTOSAVE_DELAY_MS } from "./timing";

export type AutosaveStatus =
  /** Nothing to save yet. */
  | "idle"
  /** Changed since the last save. */
  | "dirty"
  | "saving"
  | "saved"
  | "error";

export interface AutosaveState {
  status: AutosaveStatus;
  /** Unsaved changes exist (dirty, saving or failed). Guard leaving on it. */
  dirty: boolean;
  /** When the last save finished, in ms since the epoch. */
  savedAt: number | null;
  error: unknown;
}

export interface AutosaveOptions<Value> {
  save: (value: Value, context: { signal: AbortSignal }) => Promise<unknown>;
  delayMs?: number;
}

export interface Autosave<Value> {
  /** Call with the whole draft on every change. */
  change: (value: Value) => void;
  /** Save now if anything is unsaved; resolves once it is saved or failed. */
  flush: () => Promise<void>;
  /** After a failure, save the newest value again. */
  retry: () => Promise<void>;
  getState: () => AutosaveState;
  dispose: () => void;
}

export function createAutosave<Value>(
  options: AutosaveOptions<Value>,
  onChange: (state: AutosaveState) => void = () => {},
): Autosave<Value> {
  const { delayMs = AUTOSAVE_DELAY_MS } = options;
  let state: AutosaveState = {
    status: "idle",
    dirty: false,
    savedAt: null,
    error: null,
  };
  let latest: { value: Value } | undefined;
  /** Bumped on every change; a save knows whether it saved the newest. */
  let version = 0;
  let savedVersion = 0;
  let inFlight: Promise<void> | undefined;
  let controller = new AbortController();

  const emit = (patch: Partial<AutosaveState>) => {
    state = { ...state, ...patch };
    onChange(state);
  };

  const save = async (): Promise<void> => {
    if (inFlight) {
      await inFlight;
      // The save that was running may not have had the newest value.
      if (version !== savedVersion) return save();
      return;
    }
    if (!latest || version === savedVersion) return;
    const saving = version;
    const value = latest.value;
    emit({ status: "saving", dirty: true, error: null });
    inFlight = (async () => {
      try {
        await options.save(value, { signal: controller.signal });
        savedVersion = saving;
        const newer = version !== savedVersion;
        emit({
          status: newer ? "dirty" : "saved",
          dirty: newer,
          savedAt: Date.now(),
          error: null,
        });
      } catch (error) {
        emit({ status: "error", dirty: true, error });
      } finally {
        inFlight = undefined;
      }
    })();
    await inFlight;
    // Changes that arrived during the save wait for the debounce, unless the
    // save failed (then the person decides, through retry).
    if (version !== savedVersion && state.status !== "error") {
      debounced.call();
    }
  };

  const debounced = createDebouncer(() => {
    void save();
  }, delayMs);

  return {
    change(value) {
      latest = { value };
      version += 1;
      if (state.status !== "saving") {
        emit({ status: "dirty", dirty: true });
      }
      debounced.call();
    },
    async flush() {
      debounced.cancel();
      await save();
    },
    async retry() {
      debounced.cancel();
      await save();
    },
    getState: () => state,
    dispose() {
      debounced.cancel();
      controller.abort();
      controller = new AbortController();
    },
  };
}
