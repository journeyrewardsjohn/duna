export function displayError(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : "Duna Pro could not complete that request.";
}
