/**
 * Development-only warnings for rules the type can't check (one Title per
 * screen region, no digit in a Title). Silent in production builds.
 */
export function isDevelopment(): boolean {
  const flag = (globalThis as { __DEV__?: boolean }).__DEV__;
  if (typeof flag === "boolean") return flag;
  return process.env.NODE_ENV !== "production";
}

/** Collected in tests; printed as a yellow box in development. */
export const devWarnings: string[] = [];

export function devWarn(message: string): void {
  if (!isDevelopment()) return;
  devWarnings.push(message);
  if (process.env.VITEST) return;
  console.warn(`[Duna Design System] ${message}`);
}
