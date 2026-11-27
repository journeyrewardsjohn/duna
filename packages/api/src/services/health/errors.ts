import type { HealthRefusalReason } from "./policy";

export type HealthServiceErrorCode =
  | "DATABASE_REQUIRED"
  | "ENCRYPTION_REQUIRED"
  | "NOT_ELIGIBLE"
  | "HEALTH_NOT_FOUND"
  | "ACCESS_DENIED"
  | "INVALID_GRANT"
  | "GRANT_NOT_FOUND"
  | "POLICY_VERSION_MISMATCH";

/**
 * Domain error for Duna Health. `healthReason` is set for policy refusals so
 * the API error formatter can hand the app a typed reason to render.
 */
export class HealthServiceError extends Error {
  constructor(
    readonly code: HealthServiceErrorCode,
    message: string,
    readonly healthReason?: HealthRefusalReason,
  ) {
    super(message);
    this.name = "HealthServiceError";
  }
}
