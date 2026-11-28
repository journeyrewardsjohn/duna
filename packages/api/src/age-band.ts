import { ageOnDate } from "@duna/core";
import { getDatabase, people } from "@duna/db";
import { and, inArray, isNotNull, sql } from "drizzle-orm";
import type { ApiAgeBand } from "./context";

const STORED_BANDS: readonly ApiAgeBand[] = [
  "unknown",
  "under-13",
  "teen",
  "adult",
];

/**
 * The age band to use for a person right now. `people.age_band` is written
 * once when a birth date is recorded and is otherwise stale (a 12-year-old
 * stays "under-13" after turning 13), so whenever a birth date exists the
 * band is recomputed from it at request time. Without a birth date the stored
 * value is kept (it is "unknown" unless an administrator set it).
 */
export function currentAgeBand(
  person: {
    readonly birthDate?: string | null;
    readonly ageBand?: string | null;
  },
  now: Date,
): ApiAgeBand {
  if (person.birthDate) {
    const age = ageOnDate(person.birthDate, now.toISOString());
    if (age !== null) {
      return age < 13 ? "under-13" : age < 18 ? "teen" : "adult";
    }
  }
  return STORED_BANDS.includes(person.ageBand as ApiAgeBand)
    ? (person.ageBand as ApiAgeBand)
    : "unknown";
}

/**
 * Daily correction of the stored `age_band` / `is_minor` columns for readers
 * that filter on them in SQL. Only rows with a birth date whose stored band
 * no longer matches today's band are touched. Idempotent and batch-limited;
 * returns a count only.
 */
export async function refreshStoredAgeBands(input: {
  readonly now: Date;
  readonly limit: number;
}): Promise<{ readonly updated: number }> {
  const today = input.now.toISOString().slice(0, 10);
  const computed = sql<string>`CASE
    WHEN ${people.birthDate} > (${today}::date - interval '13 years')::date THEN 'under-13'
    WHEN ${people.birthDate} > (${today}::date - interval '18 years')::date THEN 'teen'
    ELSE 'adult' END`;
  const stale = getDatabase()
    .select({ id: people.id })
    .from(people)
    .where(
      and(
        isNotNull(people.birthDate),
        sql`(${people.ageBand} IS DISTINCT FROM ${computed} OR ${people.isMinor} IS DISTINCT FROM (${computed} <> 'adult'))`,
      ),
    )
    .limit(Math.max(1, input.limit));
  const updated = await getDatabase()
    .update(people)
    .set({
      ageBand: computed,
      isMinor: sql`${computed} <> 'adult'`,
      updatedAt: input.now,
    })
    .where(inArray(people.id, stale))
    .returning({ id: people.id });
  return { updated: updated.length };
}
