/**
 * True when a call was refused because the signed-in person lacks the scope
 * (tRPC `FORBIDDEN`). Looks at the error's own `code`, never its message,
 * which production redacts.
 */
export function isPermissionDenied(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (code === "FORBIDDEN") return true;
  const cause = (error as { cause?: unknown }).cause;
  return cause !== undefined && cause !== error && isPermissionDenied(cause);
}
