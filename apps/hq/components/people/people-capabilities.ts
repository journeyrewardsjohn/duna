/**
 * People's capability switches: one per feature that needs a backend
 * procedure. A feature is offered (its button, tab section, palette entry
 * and empty-state link) only when EVERY procedure it needs exists in the API
 * router, so nothing in production leads to a dead end, and each turns on by
 * itself when the backend adds what is missing. Pure: the server reads the
 * router's procedure paths and passes them in (`people-data.ts`).
 *
 * The guard test (`people-capabilities.test.ts`) fails if a switch is on
 * while its server action still answers "isn't switched on yet".
 */
export const PEOPLE_CAPABILITY_PROCEDURES = {
  /** Import people from a file: dry run, then write. */
  import: ["operator.people.importPreview", "operator.people.import"],
  /** Merge two records of one person: preview, then merge. */
  merge: ["operator.people.mergePreview", "operator.people.merge"],
  /** Staff notes about a person, not tied to a session. */
  notes: ["operator.people.notes"],
  /** The club's tags on people. */
  tags: ["operator.people.tags"],
  /** The household, inviting and linking a guardian. */
  household: [
    "operator.people.household",
    "operator.people.inviteGuardian",
    "operator.people.linkGuardian",
  ],
  /** Who signed which waiver version, and asking for a signature. */
  documents: ["operator.people.documents", "operator.people.requestSignature"],
  /**
   * Changing a member to another plan, with its preview. It also needs a
   * read of the club's plans with their ids, and the plan id on each of the
   * person's memberships, so HQ can offer a target: neither exists yet
   * ("Needs API" in docs/product/people.md), so this stays off.
   */
  planChange: [
    "operator.people.planChangePreview",
    "operator.people.changePlan",
    "operator.people.planOptions",
  ],
  /** Pause, resume and cancel a member's plan for them: not built. */
  membershipChange: ["operator.people.changeMembership"],
} as const satisfies Record<string, readonly string[]>;

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
    Object.entries(PEOPLE_CAPABILITY_PROCEDURES).map(([key, needed]) => [
      key,
      needed.every(has),
    ]),
  ) as unknown as PeopleCapabilities;
}
