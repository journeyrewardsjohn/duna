/** The plain message a Money action failed with, or the fallback. */
export function actionError(error: unknown, fallback: string): string {
  const message = (error as { userMessage?: unknown } | null)?.userMessage;
  return typeof message === "string" && message ? message : fallback;
}
