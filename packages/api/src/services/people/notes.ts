/**
 * Staff notes on a person (PEOPLE-API). Club-scoped: never shown to the
 * person, never to another club, never in exports, never to Ask Duna (the
 * procedures are not in ASK_DUNA_CAPABILITIES). Policy: a note must not hold
 * health values; Duna stores what staff type, so the exclusion from exports
 * and Ask Duna is the control. Logs and audit rows carry ids only.
 */
import { getDatabase, people, personNotes, personTags } from "@duna/db";
import { log } from "@duna/observability";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { PeopleNote } from "../../contracts/people";
import {
  PeopleError,
  clubPersonIds,
  requireManager,
  requireReadablePerson,
  writeAudit,
  type PeopleContext,
} from "./shared";

function serialize(
  row: typeof personNotes.$inferSelect,
  authorName: string | undefined,
): PeopleNote {
  return {
    id: row.id,
    personId: row.personId,
    body: row.body,
    author: {
      personId: row.authorPersonId,
      displayName: authorName ?? "Club staff",
    },
    createdAt: row.createdAt.toISOString(),
    editedAt: row.editedAt?.toISOString(),
  };
}

/** One query for the notes, one for their authors: no per-note reads. */
export async function listPersonNotes(
  context: PeopleContext,
  personId: string,
): Promise<{ notes: PeopleNote[] }> {
  await requireReadablePerson(context, personId);
  const rows = await getDatabase()
    .select({ note: personNotes, authorName: people.displayName })
    .from(personNotes)
    .innerJoin(people, eq(people.id, personNotes.authorPersonId))
    .where(
      and(
        eq(personNotes.organizationId, context.organizationId),
        eq(personNotes.personId, personId),
        isNull(personNotes.removedAt),
      ),
    )
    .orderBy(desc(personNotes.createdAt))
    .limit(200);
  return { notes: rows.map((row) => serialize(row.note, row.authorName)) };
}

export async function addPersonNote(
  context: PeopleContext,
  input: { readonly personId: string; readonly body: string },
): Promise<PeopleNote> {
  requireManager(context.actor);
  await requireReadablePerson(context, input.personId);
  const database = getDatabase();
  const [row] = await database
    .insert(personNotes)
    .values({
      organizationId: context.organizationId,
      personId: input.personId,
      authorPersonId: context.actor.personId,
      body: input.body.trim(),
      createdAt: context.now,
      updatedAt: context.now,
    })
    .returning();
  if (!row) throw new Error("The note could not be saved.");
  await writeAudit(context, {
    action: "people.note.added",
    entityType: "person-note",
    entityId: row.id,
    reason: "Staff added a note to a person.",
  });
  log.info("people.note.added", {
    organizationId: context.organizationId,
    noteId: row.id,
  });
  return serialize(row, context.actor.displayName);
}

async function ownNote(context: PeopleContext, noteId: string) {
  const note = await getDatabase().query.personNotes.findFirst({
    where: and(
      eq(personNotes.id, noteId),
      eq(personNotes.organizationId, context.organizationId),
      isNull(personNotes.removedAt),
    ),
  });
  if (!note) throw new PeopleError("NOT_FOUND", "This note was not found.");
  return note;
}

export async function editPersonNote(
  context: PeopleContext,
  input: { readonly noteId: string; readonly body: string },
): Promise<PeopleNote> {
  requireManager(context.actor);
  const note = await ownNote(context, input.noteId);
  if (note.authorPersonId !== context.actor.personId) {
    throw new PeopleError(
      "FORBIDDEN",
      "Only the person who wrote a note can edit it.",
    );
  }
  const [row] = await getDatabase()
    .update(personNotes)
    .set({
      body: input.body.trim(),
      editedAt: context.now,
      updatedAt: context.now,
    })
    .where(eq(personNotes.id, note.id))
    .returning();
  if (!row) throw new PeopleError("NOT_FOUND", "This note was not found.");
  await writeAudit(context, {
    action: "people.note.edited",
    entityType: "person-note",
    entityId: row.id,
    reason: "Staff edited their note.",
  });
  return serialize(row, context.actor.displayName);
}

/** Soft delete: the text is cleared, who removed it and when are kept. */
export async function removePersonNote(
  context: PeopleContext,
  input: { readonly noteId: string },
): Promise<{ noteId: string; removed: true }> {
  requireManager(context.actor);
  const note = await ownNote(context, input.noteId);
  if (
    note.authorPersonId !== context.actor.personId &&
    !context.actor.roles.includes("owner") &&
    !context.actor.scopes.includes("*")
  ) {
    throw new PeopleError(
      "FORBIDDEN",
      "Only the author or the club owner can remove a note.",
    );
  }
  await getDatabase()
    .update(personNotes)
    .set({
      body: "",
      removedAt: context.now,
      removedByPersonId: context.actor.personId,
      updatedAt: context.now,
    })
    .where(eq(personNotes.id, note.id));
  await writeAudit(context, {
    action: "people.note.removed",
    entityType: "person-note",
    entityId: note.id,
    reason: "Staff removed a note.",
  });
  return { noteId: note.id, removed: true };
}

/* Tags ------------------------------------------------------------------- */

function normalizeTag(tag: string): string {
  return tag.trim().replace(/\s+/g, " ");
}

/** The club's tag vocabulary (one grouped query) and, optionally, a person's tags. */
export async function listPersonTags(
  context: PeopleContext,
  personId?: string,
): Promise<{ tags: { tag: string; count: number }[]; personTags?: string[] }> {
  if (personId) await requireReadablePerson(context, personId);
  const database = getDatabase();
  const [counts, own] = await Promise.all([
    database
      .select({
        tag: personTags.tag,
        count: sql<number>`count(*)::int`,
      })
      .from(personTags)
      .where(eq(personTags.organizationId, context.organizationId))
      .groupBy(personTags.tag)
      .orderBy(asc(personTags.tag))
      .limit(500),
    personId
      ? database
          .select({ tag: personTags.tag })
          .from(personTags)
          .where(
            and(
              eq(personTags.organizationId, context.organizationId),
              eq(personTags.personId, personId),
            ),
          )
          .orderBy(asc(personTags.tag))
      : Promise.resolve(undefined),
  ]);
  return {
    tags: counts.map((row) => ({ tag: row.tag, count: Number(row.count) })),
    personTags: own?.map((row) => row.tag),
  };
}

/** Bulk tagging, bounded by the contract (200 people, 10 tags each way). */
export async function setPersonTags(
  context: PeopleContext,
  input: {
    readonly personIds: readonly string[];
    readonly add: readonly string[];
    readonly remove: readonly string[];
  },
): Promise<{ people: number; added: number; removed: number }> {
  requireManager(context.actor);
  const personIds = [...new Set(input.personIds)];
  const inClub = await clubPersonIds(context.organizationId, personIds);
  if (personIds.some((id) => !inClub.has(id))) {
    throw new PeopleError(
      "NOT_FOUND",
      "One or more people were not found in your club.",
    );
  }
  const add = [...new Set(input.add.map(normalizeTag))].filter(Boolean);
  const remove = [...new Set(input.remove.map(normalizeTag))].filter(
    (tag) => tag && !add.includes(tag),
  );
  const database = getDatabase();
  const inserted = add.length
    ? await database
        .insert(personTags)
        .values(
          personIds.flatMap((personId) =>
            add.map((tag) => ({
              organizationId: context.organizationId,
              personId,
              tag,
              createdByPersonId: context.actor.personId,
              createdAt: context.now,
            })),
          ),
        )
        .onConflictDoNothing()
        .returning({ id: personTags.id })
    : [];
  const deleted = remove.length
    ? await database
        .delete(personTags)
        .where(
          and(
            eq(personTags.organizationId, context.organizationId),
            inArray(personTags.personId, personIds),
            inArray(personTags.tag, remove),
          ),
        )
        .returning({ id: personTags.id })
    : [];
  await writeAudit(context, {
    action: "people.tags.set",
    entityType: "person-tags",
    entityId: context.organizationId,
    reason: `Staff tagged ${personIds.length} people (${inserted.length} added, ${deleted.length} removed).`,
    after: { personIds, add, remove },
  });
  log.info("people.tags.set", {
    organizationId: context.organizationId,
    people: personIds.length,
    added: inserted.length,
    removed: deleted.length,
  });
  return {
    people: personIds.length,
    added: inserted.length,
    removed: deleted.length,
  };
}
