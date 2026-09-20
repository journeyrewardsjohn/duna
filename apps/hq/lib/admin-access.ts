/** Server callers expose tRPC codes. Copy changes must not break the denial UI. */
export function isAdminAccessDenied(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "FORBIDDEN"
  );
}
