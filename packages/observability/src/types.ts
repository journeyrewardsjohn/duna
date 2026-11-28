import type { SerializedError } from "./redact";

export type ReportLevel = "warning" | "error" | "fatal";

/** What every error transport receives. Already redacted. */
export interface ErrorReport {
  readonly event: string;
  readonly level: ReportLevel;
  /** The id a person can quote: request id, Next.js digest or client event id. */
  readonly reference: string;
  readonly error: SerializedError;
  readonly context: Readonly<Record<string, string | number | boolean>>;
  readonly fields: Readonly<Record<string, unknown>>;
  readonly tags: Readonly<Record<string, string>>;
  readonly occurredAt: string;
}
