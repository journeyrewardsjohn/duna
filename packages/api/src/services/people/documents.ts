/**
 * Documents for HQ People (PEOPLE-API): the person's waivers (from the
 * existing waiver workspace tables) and guardian consents, each with the
 * version signed, when, by whom (the guardian for a junior) and its status.
 * `requestSignature` saves a message draft through the existing
 * review-before-send path (`saveMessageDraft`); nothing is sent here.
 */
import {
  getDatabase,
  guardianConsents,
  guardianships,
  people,
  waiverAssignments,
  waiverDocuments,
  waiverExecutions,
  waiverVersions,
} from "@duna/db";
import { log } from "@duna/observability";
import { and, desc, eq, inArray, ne, or } from "drizzle-orm";
import type { PeopleDocument } from "../../contracts/people";
import { saveMessageDraft } from "../../operator-service";
import { canonicalPublicWebUrl } from "../../public-web-url";
import {
  PeopleError,
  adultBand,
  requireManager,
  requireReadablePerson,
  writeAudit,
  type PeopleContext,
} from "./shared";

/** Fixed query count: documents, versions, executions, signers, consents. */
export async function loadPersonDocuments(
  context: PeopleContext,
  personId: string,
): Promise<{ documents: PeopleDocument[] }> {
  await requireReadablePerson(context, personId);
  const database = getDatabase();
  const [executions, assignments, consents] = await Promise.all([
    database
      .select()
      .from(waiverExecutions)
      .where(
        and(
          eq(waiverExecutions.organizationId, context.organizationId),
          eq(waiverExecutions.subjectPersonId, personId),
        ),
      )
      .orderBy(desc(waiverExecutions.occurredAt)),
    database
      .select()
      .from(waiverAssignments)
      .where(
        and(
          eq(waiverAssignments.organizationId, context.organizationId),
          eq(waiverAssignments.scope, "all-members"),
          eq(waiverAssignments.required, true),
        ),
      ),
    database
      .select({ consent: guardianConsents, guardianName: people.displayName })
      .from(guardianConsents)
      .innerJoin(people, eq(people.id, guardianConsents.guardianId))
      .where(eq(guardianConsents.minorId, personId))
      .orderBy(desc(guardianConsents.occurredAt))
      .limit(20),
  ]);
  const requiredIds = new Set(assignments.map((row) => row.waiverDocumentId));
  const documentIds = [
    ...new Set([
      ...requiredIds,
      ...executions.map((row) => row.waiverDocumentId),
    ]),
  ];
  const documents = documentIds.length
    ? await database
        .select()
        .from(waiverDocuments)
        .where(
          and(
            eq(waiverDocuments.organizationId, context.organizationId),
            inArray(waiverDocuments.id, documentIds),
            or(
              ne(waiverDocuments.status, "archived"),
              inArray(
                waiverDocuments.id,
                executions.map((row) => row.waiverDocumentId),
              ),
            ),
          ),
        )
    : [];
  const versionIds = [
    ...new Set([
      ...documents.flatMap((row) =>
        row.currentVersionId ? [row.currentVersionId] : [],
      ),
      ...executions.map((row) => row.waiverVersionId),
    ]),
  ];
  const signerIds = [...new Set(executions.map((row) => row.signerPersonId))];
  const [versions, signers] = await Promise.all([
    versionIds.length
      ? database
          .select({ id: waiverVersions.id, version: waiverVersions.version })
          .from(waiverVersions)
          .where(inArray(waiverVersions.id, versionIds))
      : Promise.resolve([]),
    signerIds.length
      ? database
          .select({ id: people.id, displayName: people.displayName })
          .from(people)
          .where(inArray(people.id, signerIds))
      : Promise.resolve([]),
  ]);
  const versionOf = new Map(versions.map((row) => [row.id, row.version]));
  const signerName = new Map(signers.map((row) => [row.id, row.displayName]));
  const waivers: PeopleDocument[] = documents
    .filter((document) => document.status !== "draft")
    .map((document) => {
      const latest = executions.find(
        (row) => row.waiverDocumentId === document.id,
      );
      const currentVersion = document.currentVersionId
        ? versionOf.get(document.currentVersionId)
        : undefined;
      const base = {
        documentId: document.id,
        title: document.title,
        kind: "waiver" as const,
        currentVersion,
        required: requiredIds.has(document.id),
      };
      if (!latest) return { ...base, status: "missing" as const };
      const status =
        latest.expiresAt <= context.now
          ? ("expired" as const)
          : document.currentVersionId &&
              latest.waiverVersionId !== document.currentVersionId
            ? ("superseded" as const)
            : ("signed" as const);
      return {
        ...base,
        versionSigned: versionOf.get(latest.waiverVersionId),
        signedAt: latest.occurredAt.toISOString(),
        signedBy: {
          personId: latest.signerPersonId,
          displayName:
            signerName.get(latest.signerPersonId) ?? latest.typedLegalName,
          role:
            latest.signerRole === "parent-or-guardian"
              ? ("guardian" as const)
              : ("self" as const),
        },
        expiresAt: latest.expiresAt.toISOString(),
        status,
      };
    });
  const seenGuardians = new Set<string>();
  const consentDocuments: PeopleDocument[] = consents
    .filter(({ consent }) => {
      if (seenGuardians.has(consent.guardianId)) return false;
      seenGuardians.add(consent.guardianId);
      return true;
    })
    .map(({ consent, guardianName }) => ({
      documentId: consent.id,
      title: "Parent or guardian consent",
      kind: "consent" as const,
      signedAt: consent.occurredAt.toISOString(),
      signedBy: {
        personId: consent.guardianId,
        displayName: guardianName,
        role: "guardian" as const,
      },
      status: consent.granted ? ("signed" as const) : ("withdrawn" as const),
      required: true,
    }));
  return { documents: [...waivers, ...consentDocuments] };
}

/**
 * A reviewed draft asking the right person to sign: the adult themselves, or
 * a verified guardian for a junior (never the junior's own contact).
 */
export async function requestWaiverSignature(
  context: PeopleContext,
  input: { readonly personId: string; readonly waiverDocumentId: string },
) {
  requireManager(context.actor);
  const person = await requireReadablePerson(context, input.personId);
  const database = getDatabase();
  const document = await database.query.waiverDocuments.findFirst({
    where: and(
      eq(waiverDocuments.id, input.waiverDocumentId),
      eq(waiverDocuments.organizationId, context.organizationId),
      eq(waiverDocuments.status, "active"),
    ),
  });
  if (!document) {
    throw new PeopleError("NOT_FOUND", "This waiver was not found.");
  }
  const junior =
    person.isMinor ||
    ["teen", "under-13"].includes(
      adultBand(person.birthDate, person.isMinor, context.now),
    );
  let recipientId = person.id;
  if (junior) {
    const guardian = await database.query.guardianships.findFirst({
      where: and(
        eq(guardianships.minorId, person.id),
        eq(guardianships.verified, true),
        eq(guardianships.reviewStatus, "verified"),
      ),
    });
    if (!guardian) {
      throw new PeopleError(
        "PRECONDITION_FAILED",
        "This junior has no verified guardian to sign yet.",
      );
    }
    recipientId = guardian.guardianId;
  }
  const recipient = await database.query.people.findFirst({
    where: eq(people.id, recipientId),
  });
  const channel = recipient?.email
    ? ("email" as const)
    : recipient?.phoneE164
      ? ("sms" as const)
      : undefined;
  if (!recipient || !channel) {
    throw new PeopleError(
      "PRECONDITION_FAILED",
      "There is no email or mobile number to send this to.",
    );
  }
  const signUrl = canonicalPublicWebUrl(
    `/waivers/complete?organizationId=${context.organizationId}&waiverDocumentId=${document.id}&subjectPersonId=${person.id}`,
  );
  const draft = await saveMessageDraft({
    actor: context.actor,
    recipientPersonId: recipient.id,
    channel,
    classification: "transactional",
    subject: `Please sign: ${document.title}`,
    body: junior
      ? `Please review and sign "${document.title}" for ${person.displayName}: ${signUrl}`
      : `Please review and sign "${document.title}": ${signUrl}`,
    requestId: context.requestId,
    ipAddress: context.ipAddress,
    now: context.now,
  });
  await writeAudit(context, {
    action: "people.waiver.signature-drafted",
    entityType: "waiver-document",
    entityId: document.id,
    reason: "Staff drafted a signature request; nothing was sent.",
  });
  log.info("people.waiver.signature-drafted", {
    organizationId: context.organizationId,
    waiverDocumentId: document.id,
    draftId: draft.id,
  });
  return {
    draftId: draft.id,
    recipientPersonId: recipient.id,
    signUrl,
    sent: false as const,
  };
}
