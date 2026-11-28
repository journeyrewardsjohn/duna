/**
 * Who I am on the club's team (M-R5). Pure; `identity.test.ts`.
 *
 * The API has no "my staff profile" read yet (Needs API:
 * `operator.teamAvailability.me`), so the signed-in email is matched to the
 * team list the workspace already holds. No match is never guessed.
 */
export type TeamRole =
  "coach" | "director" | "manager" | "front-desk" | "accountant";

export interface Me {
  readonly staffProfileId: string;
  readonly personId: string;
  readonly displayName: string;
  readonly role: TeamRole;
  readonly isOwner: boolean;
}

/** Matches the signed-in email to the club's team list. Pure. */
export function findMe(
  staff: readonly {
    readonly id: string;
    readonly personId: string;
    readonly displayName: string;
    readonly email?: string;
    readonly role: TeamRole;
    readonly isOwner: boolean;
    readonly active: boolean;
  }[],
  email: string | undefined,
): Me | undefined {
  const wanted = email?.trim().toLowerCase();
  if (!wanted) return undefined;
  const row = staff.find(
    (candidate) =>
      candidate.active && candidate.email?.trim().toLowerCase() === wanted,
  );
  return row
    ? {
        staffProfileId: row.id,
        personId: row.personId,
        displayName: row.displayName,
        role: row.role,
        isOwner: row.isOwner,
      }
    : undefined;
}
