import { report } from "@duna/observability";

/**
 * A reporter for `useAction`: reports real failures under `event`, never
 * an expected answer (no access, not configured yet), which the screen
 * already explains with its reference.
 */
export function reportFailure(event: string) {
  return (error: unknown) => {
    const code = (error as { code?: unknown } | null)?.code;
    if (code === "denied" || code === "not-configured") return;
    report(error, { event });
  };
}
