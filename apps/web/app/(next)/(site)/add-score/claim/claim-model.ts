/** Pure helpers for the claim form. */

export interface ClaimRow {
  readonly firstName: string;
  readonly lastName: string;
  /** A phone (with its country code) or an email, or empty. */
  readonly contact: string;
}

/**
 * One box for a phone or an email. An email is anything with an @; a phone
 * must carry its country code (+1 …): we never guess a country.
 */
export function contactFrom(value: string): {
  readonly email?: string;
  readonly phoneE164?: string;
  readonly error?: string;
} {
  const trimmed = value.trim();
  if (!trimmed) return {};
  if (trimmed.includes("@")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
      ? { email: trimmed.toLowerCase() }
      : { error: "That email doesn’t look right." };
  }
  const digits = trimmed.replace(/[\s().-]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return { phoneE164: digits };
  return {
    error: "Use the full number with its country code, like +1 310 555 0100.",
  };
}
