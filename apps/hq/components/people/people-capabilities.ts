/**
 * People's capability switches: one per feature whose backend procedure has
 * not landed yet. A feature is offered (its button, tab section, palette
 * entry and empty-state link) only when its procedure exists in the API
 * router, so nothing in production leads to a dead end, and each turns on by
 * itself when the backend package adds the procedure. Pure: the server reads
 * the router's procedure paths and passes them in (`people-data.ts`).
 */
export const PEOPLE_CAPABILITY_PROCEDURES = {
  /** Import people from a file (dry run, then write). */
  import: "operator.people.import",
  /** Merge two records of one person. */
  merge: "operator.people.merge",
  /** Notes about a person, not tied to a session. */
  notes: "operator.people.notes",
  /** Tags on people. */
  tags: "operator.people.tags",
  /** Household links and linking a guardian from HQ. */
  household: "operator.people.household",
  /** Who signed which waiver version, and when. */
  documents: "operator.people.documents",
  /** Pause, resume and cancel a member's plan (with its preview). */
  membershipChange: "operator.people.changeMembership",
} as const;

export type PeopleCapability = keyof typeof PEOPLE_CAPABILITY_PROCEDURES;
export type PeopleCapabilities = Readonly<Record<PeopleCapability, boolean>>;

/** Which capabilities are on, given every procedure path the API serves. */
export function capabilitiesFrom(
  procedurePaths: Iterable<string>,
): PeopleCapabilities {
  const paths = [...procedurePaths];
  const has = (path: string) =>
    paths.some((entry) => entry === path || entry.startsWith(`${path}.`));
  return Object.fromEntries(
    Object.entries(PEOPLE_CAPABILITY_PROCEDURES).map(([key, path]) => [
      key,
      has(path),
    ]),
  ) as unknown as PeopleCapabilities;
}
