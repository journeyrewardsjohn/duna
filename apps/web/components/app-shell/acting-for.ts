/**
 * "Acting for": a guardian looking at Duna as one of their juniors.
 *
 * The choice is a cookie holding the junior's person id. It never grants
 * anything by itself: every request re-reads the guardian's own links
 * (`resolveActingFor`) and ignores an id that is not one of their juniors, so
 * a stale or forged cookie falls back to the guardian's own account. The API
 * still authorises every read and write against the signed-in guardian.
 */
import type { AppDependent, AgeBand } from "./session-types";

export const ACTING_FOR_COOKIE = "duna-acting-for";

/** Ninety days, like the club choice. */
export const ACTING_FOR_MAX_AGE = 60 * 60 * 24 * 90;

export function firstNameOf(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? displayName;
}

/** The junior named by the cookie, if the guardian really manages them. */
export function resolveActingFor(
  cookieValue: string | undefined,
  dependents: readonly AppDependent[],
): AppDependent | null {
  if (!cookieValue) return null;
  return (
    dependents.find((dependent) => dependent.personId === cookieValue) ?? null
  );
}

interface GuardianLink {
  readonly guardian: { readonly personId: string };
  readonly minor: { readonly personId: string; readonly displayName: string };
  readonly relationship?: string;
  readonly reviewStatus?: string;
}

interface HouseholdMember {
  readonly person: { readonly personId: string; readonly displayName: string };
  readonly role: string;
  readonly ageBand: string;
  readonly status: string;
}

interface SettingsHouseholdEntry {
  readonly person: { readonly id: string; readonly displayName: string };
  readonly role: "guardian" | "dependent";
  readonly relationship: string;
  readonly ageBand?: string;
}

function ageBandOf(value: string | undefined): AgeBand {
  return value === "under-13" || value === "teen" || value === "adult"
    ? value
    : "unknown";
}

/**
 * The juniors a guardian manages, from every source the API has today: the
 * guardianship links (households seam), the household members' age bands, and
 * the account settings' household list. Duplicates merge by person id;
 * removed members and links still under review never count.
 */
export function dependentsFrom(input: {
  readonly guardianId: string;
  readonly links?: readonly GuardianLink[];
  readonly members?: readonly HouseholdMember[];
  readonly settingsHousehold?: readonly SettingsHouseholdEntry[];
}): AppDependent[] {
  const byId = new Map<string, AppDependent>();
  const memberBand = new Map(
    (input.members ?? [])
      .filter((member) => member.status === "active")
      .map((member) => [member.person.personId, ageBandOf(member.ageBand)]),
  );
  const removed = new Set(
    (input.members ?? [])
      .filter((member) => member.status !== "active")
      .map((member) => member.person.personId),
  );
  for (const link of input.links ?? []) {
    if (link.guardian.personId !== input.guardianId) continue;
    if (link.reviewStatus && link.reviewStatus !== "verified") continue;
    if (removed.has(link.minor.personId)) continue;
    byId.set(link.minor.personId, {
      personId: link.minor.personId,
      displayName: link.minor.displayName,
      firstName: firstNameOf(link.minor.displayName),
      ageBand: memberBand.get(link.minor.personId) ?? "unknown",
      ...(link.relationship ? { relationship: link.relationship } : {}),
    });
  }
  for (const entry of input.settingsHousehold ?? []) {
    if (entry.role !== "dependent" || byId.has(entry.person.id)) continue;
    byId.set(entry.person.id, {
      personId: entry.person.id,
      displayName: entry.person.displayName,
      firstName: firstNameOf(entry.person.displayName),
      ageBand: ageBandOf(entry.ageBand),
      relationship: entry.relationship,
    });
  }
  return [...byId.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
}
