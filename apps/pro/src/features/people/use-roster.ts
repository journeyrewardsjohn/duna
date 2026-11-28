/**
 * The roster rows from what the Pro runtime already holds (no request):
 * `members`, `workspace.people` and `workspace.calendar.entries`. Preview
 * builds read the example club (`preview-people.ts`).
 */
import { useMemo } from "react";
import { useProRuntime } from "../../../runtime";
import { previewTimeZone } from "../today/preview-day";
import {
  nextSessionFor,
  rosterRow,
  type CalendarEntryInput,
  type MemberInput,
  type RelationshipInput,
  type RosterRow,
} from "./people-model";
import {
  previewMembers,
  previewRelationships,
  previewRosterEntries,
} from "./preview-people";

export interface Roster {
  readonly rows: readonly RosterRow[];
  readonly timeZone: string;
  readonly preview: boolean;
  readonly member: (personId: string) => MemberInput | undefined;
  readonly relationship: (personId: string) => RelationshipInput | undefined;
}

export function useRoster(): Roster {
  const runtime = useProRuntime();
  const preview = runtime.mode === "preview";
  const members: readonly MemberInput[] = preview
    ? previewMembers
    : (runtime.members ?? []);
  const relationships: readonly RelationshipInput[] = preview
    ? previewRelationships
    : (runtime.workspace?.people ?? []);
  const timeZone = preview
    ? previewTimeZone
    : (runtime.workspace?.organization.timezone ?? "UTC");
  return useMemo(() => {
    const now = Date.now();
    const entries: readonly CalendarEntryInput[] = preview
      ? previewRosterEntries(now)
      : (runtime.workspace?.calendar.entries ?? []);
    const byRelationship = new Map(relationships.map((r) => [r.personId, r]));
    const byMember = new Map(members.map((m) => [m.id, m]));
    return {
      rows: members.map((member) =>
        rosterRow(member, byRelationship.get(member.id), {
          next: nextSessionFor(member.id, entries, now),
          timeZone,
        }),
      ),
      timeZone,
      preview,
      member: (personId) => byMember.get(personId),
      relationship: (personId) => byRelationship.get(personId),
    };
  }, [members, preview, relationships, runtime.workspace, timeZone]);
}

/** A person's name for the route header (the page's one title). */
export function usePersonName(
  personId: string | undefined,
): string | undefined {
  const roster = useRoster();
  return personId ? roster.member(personId)?.displayName : undefined;
}
