/**
 * The saved pass's shape and its parser (pure, so it is unit-tested without
 * the Keychain). See `pass-cache.ts`.
 */
import type { MembershipPassData } from "@duna/tideline-core";

export interface Saved {
  readonly personId: string;
  readonly code: string;
  readonly reference?: string;
  readonly savedAt: string;
}

/** Parses what the store holds; anything unexpected is ignored. Pure. */
export function parseSavedPass(
  raw: string | null,
  personId: string,
): MembershipPassData | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as Partial<Saved>;
    if (
      saved.personId !== personId ||
      typeof saved.code !== "string" ||
      !saved.code.startsWith("duna:member:v1:")
    )
      return null;
    return {
      code: saved.code,
      rotation: "static",
      label: "Duna member credential",
      ...(saved.reference ? { reference: saved.reference } : {}),
      offline: true,
    };
  } catch {
    return null;
  }
}
