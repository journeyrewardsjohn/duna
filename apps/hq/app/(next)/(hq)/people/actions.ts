"use server";

import { log } from "@duna/observability";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getServerCaller, getServerContext } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";
import {
  isNotConfigured,
  loadPeople,
  peopleContext,
} from "@/components/people/people-data";
import {
  exportColumns,
  exportRow,
  filterRows,
  listStateFromParams,
  normaliseEmail,
  normalisePhone,
  sortRows,
  toCsv,
} from "@/components/people/people-model";
import type { PeopleActionResult } from "@/components/people/people-result";

/**
 * People's changes (H-PEOPLE). Each one is a person's confirmed action from
 * a People screen. Nothing here sends a message: a draft goes to Inbox,
 * where it is reviewed and sent. Every call carries the idempotency key the
 * confirming control created (reused on retry) and answers a result instead
 * of throwing, so the dialog can say what happened with the reference.
 * Logs carry ids and counts only.
 */

function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

/** Codes whose message is written for people (the API keeps them plain). */
const plainCodes = new Set([
  "BAD_REQUEST",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "NOT_FOUND",
  "TOO_MANY_REQUESTS",
]);

const NOT_CONFIGURED =
  "This needs Duna Database connected in this environment, which isn't set up yet. Nothing was changed.";

async function run<T>(
  action: string,
  perform: () => Promise<T>,
): Promise<PeopleActionResult<T>> {
  const { requestId } = await getServerContext();
  try {
    const data = await perform();
    revalidatePath("/people", "layout");
    log.info("hq.people.action_succeeded", { action });
    return { ok: true, data };
  } catch (error) {
    const code = codeOf(error);
    if (isPermissionDenied(error)) {
      log.info("hq.people.action_denied", { action });
      return {
        ok: false,
        code: "denied",
        message:
          "Your role can't do this. An owner or manager can. Nothing was changed.",
        reference: requestId,
      };
    }
    if (isNotConfigured(error)) {
      log.info("hq.people.action_not_configured", { action });
      return {
        ok: false,
        code: "not-configured",
        message: NOT_CONFIGURED,
        reference: requestId,
      };
    }
    log.warn("hq.people.action_failed", { action, code: code ?? "unknown" });
    return {
      ok: false,
      code: "failed",
      message:
        code && plainCodes.has(code) && error instanceof Error && error.message
          ? `${error.message} Nothing was changed.`
          : "Something went wrong on our side. Nothing was changed; try again.",
      reference: requestId,
    };
  }
}

/**
 * A change whose backend procedure has not landed yet (listed in the pull
 * request as "Needs API"). It answers the honest "not set up yet" and
 * changes nothing; it never pretends to have worked.
 */
async function needsApi(
  action: string,
  what: string,
): Promise<PeopleActionResult<never>> {
  const { requestId } = await getServerContext();
  log.info("hq.people.action_needs_api", { action });
  return {
    ok: false,
    code: "not-configured",
    message: `${what} isn't switched on for clubs yet. Nothing was changed.`,
    reference: requestId,
  };
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (value: string) =>
  uuidPattern.test(value) ? value : crypto.randomUUID();

/** A stable key per person inside one bulk attempt (a retry reuses it). */
function derivedKey(base: string, part: string): string {
  const hex = createHash("sha256").update(`${base}:${part}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function invalid(message: string): PeopleActionResult<never> {
  return { ok: false, code: "invalid", message };
}

export interface AddPersonInput {
  readonly name: string;
  readonly kind: "adult" | "junior";
  readonly relationship: "player" | "member";
  readonly email?: string;
  readonly phone?: string;
  readonly guardianName?: string;
  readonly guardianEmail?: string;
  readonly guardianPhone?: string;
  readonly idempotencyKey: string;
}

/**
 * Adds a person by the club's existing invitation: an adult claims their own
 * profile; a junior's invitation goes to the guardian, and the junior joins
 * only once the guardian accepts.
 */
export async function addPersonAction(input: AddPersonInput) {
  const name = input.name.trim();
  if (name.length < 2) return invalid("Enter the person's full name.");
  const junior = input.kind === "junior";
  const email = normaliseEmail(input.email);
  const phone = normalisePhone(input.phone);
  const guardianEmail = normaliseEmail(input.guardianEmail);
  const guardianPhone = normalisePhone(input.guardianPhone);
  if (junior && (input.guardianName ?? "").trim().length < 2)
    return invalid("Enter the guardian's name.");
  if (junior && !guardianEmail && !guardianPhone)
    return invalid("Enter the guardian's email or mobile number.");
  if (!junior && !email && !phone)
    return invalid("Enter an email or a mobile number.");
  return run("addPerson", async () => {
    const caller = await getServerCaller();
    await caller.operator.createPlayerInvitation({
      invitedName: name,
      invitedEmail: junior ? undefined : email,
      invitedPhoneE164: junior ? undefined : phone,
      relationship: input.relationship,
      isMinor: junior,
      guardianName: junior ? input.guardianName?.trim() : undefined,
      guardianEmail: junior ? guardianEmail : undefined,
      guardianPhoneE164: junior ? guardianPhone : undefined,
      confirmed: true,
      idempotencyKey: uuid(input.idempotencyKey),
    });
    return { invited: true } as const;
  });
}

/** Grants organisation credits through the existing ledger-backed procedure. */
export async function grantCreditsAction(input: {
  readonly personId: string;
  readonly credits: number;
  readonly expiresAt?: string;
  readonly reason: string;
  readonly idempotencyKey: string;
}) {
  if (!Number.isInteger(input.credits) || input.credits < 1)
    return invalid("Enter a whole number of credits.");
  if (input.reason.trim().length < 5)
    return invalid("Say why, in a few words (5 characters or more).");
  return run("grantCredits", async () => {
    const caller = await getServerCaller();
    return caller.operator.issueOrganizationCredits({
      personId: input.personId,
      credits: input.credits,
      expiresAt: input.expiresAt
        ? new Date(input.expiresAt).toISOString()
        : undefined,
      reason: input.reason.trim(),
      confirmed: true,
      idempotencyKey: uuid(input.idempotencyKey),
    });
  });
}

/**
 * Pause, resume or cancel a member's plan for them. The operator procedure
 * (with the backend's own wording, amounts and refund) has not landed: see
 * "Needs API" in the pull request. Answers honestly; changes nothing.
 */
export async function changeMembershipAction(input: {
  readonly personId: string;
  readonly planId: string;
  readonly action: "pause" | "resume" | "cancel";
  readonly idempotencyKey: string;
}) {
  void input;
  return needsApi(`membership_${input.action}`, "Changing a plan from HQ");
}

/** Saves one message draft in Inbox. Nothing is sent from People. */
export async function saveDraftAction(input: {
  readonly personId: string;
  readonly subject: string;
  readonly body: string;
  readonly channel: "email" | "sms";
  readonly idempotencyKey: string;
}) {
  if (!input.body.trim()) return invalid("Write the message first.");
  return run("saveDraft", async () => {
    const caller = await getServerCaller();
    await caller.operator.saveMessageDraft({
      recipientPersonId: input.personId,
      channel: input.channel,
      classification: "transactional",
      subject: input.subject.trim() || undefined,
      body: input.body.trim(),
      idempotencyKey: uuid(input.idempotencyKey),
    });
    return { drafted: 1 } as const;
  });
}

/** Drafts per message batch (the draft procedure's own rate limit). */
const BULK_DRAFT_MAX = 25;

/**
 * Saves the same draft for several adults in Inbox, one per person. Juniors
 * are left out (Inbox writes to their guardian). Nothing is sent.
 */
export async function bulkDraftAction(input: {
  readonly personIds: readonly string[];
  readonly subject: string;
  readonly body: string;
  readonly idempotencyKey: string;
}) {
  if (!input.body.trim()) return invalid("Write the message first.");
  if (input.personIds.length > BULK_DRAFT_MAX)
    return invalid(
      `Choose ${BULK_DRAFT_MAX} people or fewer for one draft. For more, use an audience in Marketing.`,
    );
  const people = await loadPeople();
  if (people.state !== "ok") {
    return people.state === "denied"
      ? invalid("Your role can't see these people.")
      : needsApi("bulkDraft", "Drafting for several people");
  }
  const chosen = people.data.rows.filter((row) =>
    input.personIds.includes(row.id),
  );
  const adults = chosen.filter(
    (row) => !row.isJunior && Boolean(row.email || row.phone),
  );
  const base = uuid(input.idempotencyKey);
  return run("bulkDraft", async () => {
    const caller = await getServerCaller();
    for (const row of adults) {
      await caller.operator.saveMessageDraft({
        recipientPersonId: row.id,
        channel: row.email ? "email" : "sms",
        classification: "transactional",
        subject: input.subject.trim() || undefined,
        body: input.body.trim(),
        idempotencyKey: derivedKey(base, row.id),
      });
    }
    log.info("hq.people.bulk_drafted", {
      drafted: adults.length,
      skipped: chosen.length - adults.length,
    });
    return {
      drafted: adults.length,
      skipped: chosen.length - adults.length,
    } as const;
  });
}

/**
 * The people list as a CSV, rebuilt on the server for the viewer's role:
 * no health values ever, money only for roles that read payments, no
 * junior's own contact. Owners and managers only.
 */
export async function exportPeopleAction(input: {
  readonly segment?: string;
  readonly q?: string;
  readonly ids?: readonly string[];
}): Promise<
  PeopleActionResult<{ readonly csv: string; readonly count: number }>
> {
  const context = await peopleContext();
  const { requestId } = await getServerContext();
  if (!context.canExport) {
    log.info("hq.people.action_denied", { action: "export" });
    return {
      ok: false,
      code: "denied",
      message:
        "Only an owner or manager can download the people list. Nothing was downloaded.",
      reference: requestId,
    };
  }
  const people = await loadPeople();
  if (people.state !== "ok") {
    return {
      ok: false,
      code: people.state === "not-configured" ? "not-configured" : "failed",
      message:
        "The people list can't be read right now. Nothing was downloaded.",
      reference: requestId,
    };
  }
  const state = listStateFromParams({ segment: input.segment, q: input.q });
  const rows = input.ids?.length
    ? people.data.rows.filter((row) => input.ids!.includes(row.id))
    : filterRows(
        people.data.rows,
        state,
        new Date(context.now),
        context.timeZone,
      );
  const columns = exportColumns({ canSeePayments: context.canSeePayments });
  const csv = toCsv([
    columns.map((column) => column.header),
    ...sortRows(rows).map((row) => exportRow(row, columns)),
  ]);
  log.info("hq.people.exported", {
    count: rows.length,
    juniors: rows.filter((row) => row.isJunior).length,
  });
  return { ok: true, data: { csv, count: rows.length } };
}

/** Imports checked rows. The import procedure is "Needs API"; nothing is written. */
export async function importPeopleAction(input: {
  readonly ready: number;
  readonly idempotencyKey: string;
}) {
  void input;
  return needsApi("import", "Importing people from a file");
}

/** Merges two records into one. The merge procedure is "Needs API". */
export async function mergePeopleAction(input: {
  readonly keepId: string;
  readonly mergeId: string;
  readonly idempotencyKey: string;
}) {
  void input;
  return needsApi("merge", "Merging two people");
}

/** Tags people. Tags are "Needs API". */
export async function tagPeopleAction(input: {
  readonly personIds: readonly string[];
  readonly tag: string;
}) {
  void input;
  return needsApi("tag", "Tagging people");
}

/** A note about the person (not tied to a session). "Needs API". */
export async function addNoteAction(input: {
  readonly personId: string;
  readonly body: string;
  readonly idempotencyKey: string;
}) {
  void input;
  return needsApi("note", "Notes about a person");
}

/** Edits a person's details (name, and an adult's contact). */
export async function updateDetailsAction(input: {
  readonly personId: string;
  readonly displayName: string;
  readonly email?: string;
  readonly phone?: string;
  readonly isJunior: boolean;
  readonly idempotencyKey: string;
}) {
  const name = input.displayName.trim();
  if (name.length < 2) return invalid("Enter the person's full name.");
  const email = input.isJunior ? undefined : normaliseEmail(input.email);
  const phone = input.isJunior ? undefined : normalisePhone(input.phone);
  if (!input.isJunior && input.phone?.trim() && !phone)
    return invalid(
      "Enter the mobile number with its country code, like +1 310 555 0121.",
    );
  return run("updateDetails", async () => {
    const caller = await getServerCaller();
    return caller.operator.updateMemberProfile({
      personId: input.personId,
      displayName: name,
      email,
      phoneE164: phone,
      reason: "Updated from the person's page in People.",
      idempotencyKey: uuid(input.idempotencyKey),
    });
  });
}

/** Adds the person to an upcoming session (the existing registration change). */
export async function addToSessionAction(input: {
  readonly personId: string;
  readonly sessionId: string;
  readonly idempotencyKey: string;
}) {
  return run("addToSession", async () => {
    const caller = await getServerCaller();
    return caller.operator.addCalendarParticipant({
      personId: input.personId,
      sessionId: input.sessionId,
      reason: "Added from the person's page in People.",
      idempotencyKey: uuid(input.idempotencyKey),
    });
  });
}
