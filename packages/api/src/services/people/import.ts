/**
 * People import for HQ (PEOPLE-API). Two steps, and nothing in between is
 * guessed:
 *
 * 1. `previewPeopleImport` normalizes every row, matches it against the club
 *    and against Duna, and stores the plan (create / update / duplicate /
 *    problem per row). Nothing about a person is written.
 * 2. `runPeopleImport` writes exactly that plan, in transactions of
 *    IMPORT_BATCH_SIZE rows that also advance `processed_rows`, so an
 *    interrupted import resumes where it stopped. A preview that has expired,
 *    or whose matches changed since, is refused (preview again).
 *
 * Rules: a club import never overwrites a person's own profile (an "update"
 * only adds the club's tags to someone already in the club); a row whose
 * email or mobile belongs to a Duna account outside the club is a problem
 * (invite them instead; the import never links strangers' accounts); a
 * junior needs a guardian with an email or mobile, and the guardian link is
 * created `pending` with consent "not recorded"; no message is sent to
 * anyone. Logs carry ids and counts only.
 */
import {
  getDatabase,
  getTransactionalDatabase,
  guardianships,
  organizationParticipants,
  people,
  peopleImportBatches,
  personTags,
} from "@duna/db";
import { log } from "@duna/observability";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { stableHash } from "../../canonical";
import type {
  PeopleImportPreview,
  PeopleImportResult,
  PeopleImportRow,
} from "../../contracts/people";
import {
  PeopleError,
  adultBand,
  clubPersonIds,
  requireManager,
  writeAudit,
  type PeopleContext,
} from "./shared";

export const IMPORT_BATCH_SIZE = 100;
export const IMPORT_PREVIEW_MINUTES = 30;

type Field =
  | "name"
  | "givenName"
  | "familyName"
  | "email"
  | "phoneE164"
  | "birthDate"
  | "isMinor"
  | "relationship"
  | "guardianName"
  | "guardianEmail"
  | "guardianPhoneE164"
  | "tags";

interface NormalizedRow {
  readonly row: number;
  readonly displayName?: string;
  readonly givenName?: string;
  readonly familyName?: string;
  readonly email?: string;
  readonly phoneE164?: string;
  readonly birthDate?: string;
  readonly isMinor: boolean;
  readonly relationship: "player" | "member";
  readonly guardianName?: string;
  readonly guardianEmail?: string;
  readonly guardianPhoneE164?: string;
  readonly tags: readonly string[];
  readonly problems: { field: string; message: string }[];
}

/** What the import will do for one row; stored as the plan. */
interface PlannedRow extends NormalizedRow {
  readonly action: PeopleImportRow["action"];
  readonly matchPersonId?: string;
  /** The guardian already in the club, or undefined to create one. */
  readonly guardianPersonId?: string;
  /** Rows sharing a new guardian share this key (first row creates them). */
  readonly guardianKey?: string;
  readonly adds?: readonly string[];
}

interface StoredPlan {
  readonly rows: readonly PlannedRow[];
  /** Matched records' state at preview, re-checked before writing. */
  readonly matchedState: string;
  /** Contacts the plan creates, re-checked for new collisions. */
  readonly newEmails: readonly string[];
  readonly newPhones: readonly string[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+[1-9]\d{7,14}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function cell(
  raw: Readonly<Record<string, string>>,
  mapping: Partial<Record<Field, string>>,
  field: Field,
): string | undefined {
  const column = mapping[field];
  const value = column ? raw[column] : undefined;
  const trimmed = value?.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed : undefined;
}

function phoneOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const compact = value.replace(/[\s().-]/g, "");
  return compact;
}

function truthy(value: string | undefined): boolean {
  return Boolean(value && /^(y|yes|true|1|junior|minor)$/i.test(value));
}

export function normalizeImportRow(
  raw: Readonly<Record<string, string>>,
  mapping: Partial<Record<Field, string>>,
  row: number,
  now: Date,
): NormalizedRow {
  const problems: { field: string; message: string }[] = [];
  const givenName = cell(raw, mapping, "givenName");
  const familyName = cell(raw, mapping, "familyName");
  const displayName =
    cell(raw, mapping, "name") ??
    ([givenName, familyName].filter(Boolean).join(" ") || undefined);
  if (!displayName || displayName.length < 2 || displayName.length > 120) {
    problems.push({ field: "name", message: "Add the person's name." });
  }
  const emailRaw = cell(raw, mapping, "email")?.toLowerCase();
  const email = emailRaw && EMAIL.test(emailRaw) ? emailRaw : undefined;
  if (emailRaw && !email) {
    problems.push({ field: "email", message: "This email is not valid." });
  }
  const phoneRaw = phoneOf(cell(raw, mapping, "phoneE164"));
  const phoneE164 = phoneRaw && PHONE.test(phoneRaw) ? phoneRaw : undefined;
  if (phoneRaw && !phoneE164) {
    problems.push({
      field: "phoneE164",
      message: "Use the international format, for example +1 415 555 0100.",
    });
  }
  const birthRaw = cell(raw, mapping, "birthDate");
  const birthDate =
    birthRaw && DATE.test(birthRaw) && !Number.isNaN(Date.parse(birthRaw))
      ? birthRaw
      : undefined;
  if (birthRaw && !birthDate) {
    problems.push({
      field: "birthDate",
      message: "Use year-month-day, for example 2012-04-30.",
    });
  }
  if (birthDate && Date.parse(birthDate) > now.getTime()) {
    problems.push({
      field: "birthDate",
      message: "This date is in the future.",
    });
  }
  const band = birthDate ? adultBand(birthDate, false, now) : undefined;
  const isMinor =
    band === "teen" ||
    band === "under-13" ||
    (!birthDate && truthy(cell(raw, mapping, "isMinor")));
  const relationship = /^member$/i.test(
    cell(raw, mapping, "relationship") ?? "",
  )
    ? ("member" as const)
    : ("player" as const);
  const guardianName = cell(raw, mapping, "guardianName");
  const guardianEmailRaw = cell(raw, mapping, "guardianEmail")?.toLowerCase();
  const guardianEmail =
    guardianEmailRaw && EMAIL.test(guardianEmailRaw)
      ? guardianEmailRaw
      : undefined;
  const guardianPhoneRaw = phoneOf(cell(raw, mapping, "guardianPhoneE164"));
  const guardianPhoneE164 =
    guardianPhoneRaw && PHONE.test(guardianPhoneRaw)
      ? guardianPhoneRaw
      : undefined;
  if (isMinor) {
    if (!guardianName || guardianName.length < 2) {
      problems.push({
        field: "guardianName",
        message: "A junior needs a parent or guardian.",
      });
    }
    if (!guardianEmail && !guardianPhoneE164) {
      problems.push({
        field: "guardianEmail",
        message: "Add the guardian's email or mobile number.",
      });
    }
  }
  const tags = [
    ...new Set(
      (cell(raw, mapping, "tags") ?? "")
        .split(/[;,]/)
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0 && tag.length <= 40),
    ),
  ].slice(0, 10);
  return {
    row,
    displayName,
    givenName,
    familyName,
    // A junior's own contact is never imported: the guardian is the contact.
    email: isMinor ? undefined : email,
    phoneE164: isMinor ? undefined : phoneE164,
    birthDate,
    isMinor,
    relationship,
    guardianName: isMinor ? guardianName : undefined,
    guardianEmail: isMinor ? guardianEmail : undefined,
    guardianPhoneE164: isMinor ? guardianPhoneE164 : undefined,
    tags,
    problems,
  };
}

interface Candidate {
  readonly id: string;
  readonly email: string | null;
  readonly phoneE164: string | null;
  readonly updatedAt: Date;
}

/** One query for every email and phone in the file. */
async function findCandidates(
  emails: readonly string[],
  phones: readonly string[],
): Promise<Candidate[]> {
  if (emails.length === 0 && phones.length === 0) return [];
  return getDatabase()
    .select({
      id: people.id,
      email: people.email,
      phoneE164: people.phoneE164,
      updatedAt: people.updatedAt,
    })
    .from(people)
    .where(
      or(
        emails.length
          ? inArray(sql`lower(${people.email})`, [...emails])
          : undefined,
        phones.length ? inArray(people.phoneE164, [...phones]) : undefined,
      ),
    );
}

function matchFor(
  candidates: readonly Candidate[],
  email: string | undefined,
  phone: string | undefined,
): Candidate | undefined {
  return candidates.find(
    (candidate) =>
      (email && candidate.email?.toLowerCase() === email) ||
      (phone && candidate.phoneE164 === phone),
  );
}

async function buildPlan(
  context: PeopleContext,
  normalized: readonly NormalizedRow[],
): Promise<StoredPlan> {
  const emails = new Set<string>();
  const phones = new Set<string>();
  for (const row of normalized) {
    for (const value of [row.email, row.guardianEmail])
      if (value) emails.add(value);
    for (const value of [row.phoneE164, row.guardianPhoneE164])
      if (value) phones.add(value);
  }
  const candidates = await findCandidates([...emails], [...phones]);
  const inClub = await clubPersonIds(
    context.organizationId,
    candidates.map((candidate) => candidate.id),
  );
  const existingTags = inClub.size
    ? await getDatabase()
        .select({ personId: personTags.personId, tag: personTags.tag })
        .from(personTags)
        .where(
          and(
            eq(personTags.organizationId, context.organizationId),
            inArray(personTags.personId, [...inClub]),
          ),
        )
    : [];
  const seenContacts = new Map<string, number>();
  const newEmails = new Set<string>();
  const newPhones = new Set<string>();
  const rows: PlannedRow[] = normalized.map((row) => {
    const problems = [...row.problems];
    for (const contact of [row.email, row.phoneE164]) {
      if (!contact) continue;
      const earlier = seenContacts.get(contact);
      if (earlier !== undefined) {
        problems.push({
          field: contact.includes("@") ? "email" : "phoneE164",
          message: `Same contact as row ${earlier}.`,
        });
      } else seenContacts.set(contact, row.row);
    }
    const match = matchFor(candidates, row.email, row.phoneE164);
    if (match && !inClub.has(match.id)) {
      problems.push({
        field:
          row.email && match.email?.toLowerCase() === row.email
            ? "email"
            : "phoneE164",
        message:
          "This contact already belongs to a Duna account. Invite them with Add a person instead.",
      });
    }
    let guardianPersonId: string | undefined;
    let guardianKey: string | undefined;
    if (row.isMinor && (row.guardianEmail || row.guardianPhoneE164)) {
      const guardian = matchFor(
        candidates,
        row.guardianEmail,
        row.guardianPhoneE164,
      );
      if (guardian && !inClub.has(guardian.id)) {
        problems.push({
          field: "guardianEmail",
          message:
            "The guardian's contact belongs to a Duna account outside the club. Add the junior with Add a person instead.",
        });
      } else if (guardian) {
        guardianPersonId = guardian.id;
      } else {
        guardianKey = row.guardianEmail ?? row.guardianPhoneE164;
      }
    }
    if (problems.length > 0) {
      return { ...row, problems, action: "problem" };
    }
    if (match) {
      const has = new Set(
        existingTags
          .filter((tag) => tag.personId === match.id)
          .map((tag) => tag.tag),
      );
      const adds = row.tags.filter((tag) => !has.has(tag));
      return {
        ...row,
        problems,
        action: adds.length ? "update" : "duplicate",
        matchPersonId: match.id,
        adds: adds.length ? adds : undefined,
      };
    }
    if (row.email) newEmails.add(row.email);
    if (row.phoneE164) newPhones.add(row.phoneE164);
    if (guardianKey?.includes("@")) newEmails.add(guardianKey);
    else if (guardianKey) newPhones.add(guardianKey);
    return {
      ...row,
      problems,
      action: "create",
      guardianPersonId,
      guardianKey,
    };
  });
  const matchedIds = new Set(
    rows.flatMap((row) =>
      [row.matchPersonId, row.guardianPersonId].filter(
        (value): value is string => Boolean(value),
      ),
    ),
  );
  return {
    rows,
    matchedState: stableHash(
      candidates
        .filter((candidate) => matchedIds.has(candidate.id))
        .map((candidate) => [candidate.id, candidate.updatedAt.toISOString()])
        .sort(),
    ),
    newEmails: [...newEmails],
    newPhones: [...newPhones],
  };
}

function countsOf(rows: readonly PlannedRow[]) {
  const guardianKeys = new Set(
    rows
      .filter((row) => row.action === "create" && row.guardianKey)
      .map((row) => row.guardianKey),
  );
  return {
    total: rows.length,
    create: rows.filter((row) => row.action === "create").length,
    update: rows.filter((row) => row.action === "update").length,
    duplicate: rows.filter((row) => row.action === "duplicate").length,
    problem: rows.filter((row) => row.action === "problem").length,
    juniors: rows.filter((row) => row.action === "create" && row.isMinor)
      .length,
    guardians:
      guardianKeys.size +
      new Set(
        rows
          .filter((row) => row.action === "create" && row.guardianPersonId)
          .map((row) => row.guardianPersonId),
      ).size,
  };
}

function publicRow(row: PlannedRow): PeopleImportRow {
  return {
    row: row.row,
    action: row.action,
    displayName: row.displayName,
    matchPersonId: row.matchPersonId,
    isMinor: row.isMinor,
    adds: row.adds,
    problems: row.problems,
  };
}

export async function previewPeopleImport(
  context: PeopleContext,
  input: {
    readonly rows: readonly Readonly<Record<string, string>>[];
    readonly mapping: Partial<Record<Field, string>>;
  },
): Promise<PeopleImportPreview> {
  requireManager(context.actor);
  if (!input.mapping.name && !input.mapping.givenName) {
    throw new PeopleError(
      "BAD_REQUEST",
      "Choose the column that holds each person's name.",
    );
  }
  const normalized = input.rows.map((raw, index) =>
    normalizeImportRow(raw, input.mapping, index + 1, context.now),
  );
  const plan = await buildPlan(context, normalized);
  const counts = countsOf(plan.rows);
  const expiresAt = new Date(
    context.now.getTime() + IMPORT_PREVIEW_MINUTES * 60_000,
  );
  const [batch] = await getDatabase()
    .insert(peopleImportBatches)
    .values({
      organizationId: context.organizationId,
      createdByPersonId: context.actor.personId,
      status: "previewed",
      planHash: stableHash(plan),
      plan,
      counts,
      totalRows: plan.rows.length,
      expiresAt,
      createdAt: context.now,
      updatedAt: context.now,
    })
    .returning({ id: peopleImportBatches.id });
  if (!batch) throw new Error("The import preview could not be saved.");
  log.info("people.import.previewed", {
    organizationId: context.organizationId,
    batchId: batch.id,
    ...counts,
  });
  return {
    previewId: batch.id,
    expiresAt: expiresAt.toISOString(),
    counts,
    rows: plan.rows.map(publicRow),
  };
}

function handleFor(): string {
  return `club-${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}

function resultOf(
  batchId: string,
  rows: readonly PlannedRow[],
  processed: number,
  total: number,
): PeopleImportResult {
  const done = rows.slice(0, processed);
  const counts = countsOf(done);
  return {
    previewId: batchId,
    status: processed >= total ? "completed" : "importing",
    processed,
    total,
    created: counts.create,
    updated: counts.update,
    skipped: counts.duplicate + counts.problem,
    guardiansLinked: done.filter(
      (row) => row.action === "create" && row.isMinor,
    ).length,
    messagesSent: 0,
  };
}

async function stillCurrent(plan: StoredPlan): Promise<boolean> {
  const matchedIds = [
    ...new Set(
      plan.rows.flatMap((row) =>
        [row.matchPersonId, row.guardianPersonId].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    ),
  ];
  const database = getDatabase();
  const [matched, collisions] = await Promise.all([
    matchedIds.length
      ? database
          .select({ id: people.id, updatedAt: people.updatedAt })
          .from(people)
          .where(inArray(people.id, matchedIds))
      : Promise.resolve([]),
    findCandidates(plan.newEmails, plan.newPhones),
  ]);
  const state = stableHash(
    matched.map((row) => [row.id, row.updatedAt.toISOString()]).sort(),
  );
  // Someone joined with a contact this plan would create: preview again.
  return state === plan.matchedState && collisions.length === 0;
}

/**
 * Writes the stored plan. Resumable: each transaction writes up to
 * IMPORT_BATCH_SIZE rows and advances `processed_rows` with them.
 */
export async function runPeopleImport(
  context: PeopleContext,
  input: { readonly previewId: string; readonly idempotencyKey: string },
): Promise<PeopleImportResult> {
  requireManager(context.actor);
  const database = getDatabase();
  const batch = await database.query.peopleImportBatches.findFirst({
    where: and(
      eq(peopleImportBatches.id, input.previewId),
      eq(peopleImportBatches.organizationId, context.organizationId),
    ),
  });
  if (!batch) {
    throw new PeopleError("NOT_FOUND", "This import preview was not found.");
  }
  if (batch.status === "completed") {
    const counts = batch.counts as Record<string, number>;
    return {
      previewId: batch.id,
      status: "completed",
      processed: batch.processedRows,
      total: batch.totalRows,
      created: counts.created ?? 0,
      updated: counts.updated ?? 0,
      skipped: counts.skipped ?? 0,
      guardiansLinked: counts.guardiansLinked ?? 0,
      messagesSent: 0,
    };
  }
  const plan = batch.plan as StoredPlan | null;
  if (
    !plan ||
    batch.status === "expired" ||
    (batch.status === "previewed" && batch.expiresAt <= context.now)
  ) {
    throw new PeopleError(
      "PRECONDITION_FAILED",
      "This preview has expired. Preview the file again.",
    );
  }
  if (batch.status === "previewed" && !(await stillCurrent(plan))) {
    throw new PeopleError(
      "PRECONDITION_FAILED",
      "People in this file changed since the preview. Preview the file again.",
    );
  }
  if (batch.status === "previewed") {
    await database
      .update(peopleImportBatches)
      .set({
        status: "importing",
        idempotencyKey: input.idempotencyKey,
        startedAt: context.now,
        updatedAt: context.now,
      })
      .where(eq(peopleImportBatches.id, batch.id));
    await writeAudit(context, {
      action: "people.import.started",
      entityType: "people-import",
      entityId: batch.id,
      reason: `Staff confirmed an import of ${plan.rows.length} rows.`,
      after: { planHash: batch.planHash },
    });
  }
  let processed = batch.processedRows;
  // Guardians created by earlier batches of this import, by contact key.
  const createdGuardians = new Map<string, string>();
  while (processed < plan.rows.length) {
    const chunk = plan.rows.slice(processed, processed + IMPORT_BATCH_SIZE);
    const next = processed + chunk.length;
    await getTransactionalDatabase().transaction(async (transaction) => {
      for (const row of chunk) {
        if (row.action === "update" && row.matchPersonId && row.adds?.length) {
          await transaction
            .insert(personTags)
            .values(
              row.adds.map((tag) => ({
                organizationId: context.organizationId,
                personId: row.matchPersonId!,
                tag,
                createdByPersonId: context.actor.personId,
                createdAt: context.now,
              })),
            )
            .onConflictDoNothing();
        }
        if (row.action !== "create") continue;
        let guardianId = row.guardianPersonId;
        if (row.isMinor && !guardianId && row.guardianKey) {
          guardianId = createdGuardians.get(row.guardianKey);
          if (!guardianId) {
            const existing = await transaction
              .select({ id: people.id })
              .from(people)
              .where(
                row.guardianKey.includes("@")
                  ? sql`lower(${people.email}) = ${row.guardianKey}`
                  : eq(people.phoneE164, row.guardianKey),
              )
              .limit(1);
            guardianId = existing[0]?.id;
          }
          if (!guardianId) {
            const [guardian] = await transaction
              .insert(people)
              .values({
                displayName: row.guardianName ?? "Guardian",
                handle: handleFor(),
                email: row.guardianEmail,
                phoneE164: row.guardianPhoneE164,
                profileClaimStatus: "unclaimed",
                isMinor: false,
                ageBand: "unknown",
                createdAt: context.now,
                updatedAt: context.now,
              })
              .returning({ id: people.id });
            guardianId = guardian!.id;
            await transaction
              .insert(organizationParticipants)
              .values({
                organizationId: context.organizationId,
                personId: guardianId,
                relationship: "guardian",
                status: "active",
                addedByPersonId: context.actor.personId,
                joinedAt: context.now,
              })
              .onConflictDoNothing();
          }
          createdGuardians.set(row.guardianKey, guardianId);
        }
        const band = row.birthDate
          ? adultBand(row.birthDate, row.isMinor, context.now)
          : row.isMinor
            ? "teen"
            : "unknown";
        const [person] = await transaction
          .insert(people)
          .values({
            displayName: row.displayName!,
            givenName: row.givenName,
            familyName: row.familyName,
            handle: handleFor(),
            email: row.email,
            phoneE164: row.phoneE164,
            birthDate: row.birthDate,
            isMinor: row.isMinor,
            ageBand: band,
            profileClaimStatus: "unclaimed",
            createdAt: context.now,
            updatedAt: context.now,
          })
          .returning({ id: people.id });
        await transaction.insert(organizationParticipants).values({
          organizationId: context.organizationId,
          personId: person!.id,
          relationship: row.relationship,
          status: "active",
          addedByPersonId: context.actor.personId,
          joinedAt: context.now,
        });
        if (row.tags.length) {
          await transaction
            .insert(personTags)
            .values(
              row.tags.map((tag) => ({
                organizationId: context.organizationId,
                personId: person!.id,
                tag,
                createdByPersonId: context.actor.personId,
                createdAt: context.now,
              })),
            )
            .onConflictDoNothing();
        }
        if (row.isMinor && guardianId) {
          // Honest state: pending Duna review, no consent recorded.
          await transaction
            .insert(guardianships)
            .values({
              guardianId,
              minorId: person!.id,
              relationship: "guardian",
              verified: false,
              emergencyContact: true,
              canApproveSpending: false,
              reviewStatus: "pending",
              createdAt: context.now,
            })
            .onConflictDoNothing();
        }
      }
      await transaction
        .update(peopleImportBatches)
        .set({ processedRows: next, updatedAt: context.now })
        .where(eq(peopleImportBatches.id, batch.id));
    });
    processed = next;
  }
  const result = resultOf(batch.id, plan.rows, processed, plan.rows.length);
  await database
    .update(peopleImportBatches)
    .set({
      status: "completed",
      completedAt: context.now,
      updatedAt: context.now,
      // The personal data in the plan is not kept once written.
      plan: null,
      counts: {
        ...countsOf(plan.rows),
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        guardiansLinked: result.guardiansLinked,
      },
    })
    .where(eq(peopleImportBatches.id, batch.id));
  await writeAudit(context, {
    action: "people.import.completed",
    entityType: "people-import",
    entityId: batch.id,
    reason: `Import wrote ${result.created} new people and updated ${result.updated}; no messages were sent.`,
  });
  log.info("people.import.completed", {
    organizationId: context.organizationId,
    batchId: batch.id,
    created: result.created,
    updated: result.updated,
    skipped: result.skipped,
  });
  return result;
}
