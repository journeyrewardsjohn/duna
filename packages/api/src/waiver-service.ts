import {
  auditLog,
  catalogItems,
  getDatabase,
  getTransactionalDatabase,
  guardianships,
  organizations,
  people,
  waiverAssignments,
  waiverDocuments,
  waiverExecutions,
  waiverVersions,
} from "@duna/db";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { stableHash } from "./canonical";
import type { ApiActor } from "./context";
import { sendTransactionalEmail } from "./resend";
import { createWaiverReceiptPdf } from "./waiver-receipt";

export type WaiverSection = {
  readonly id: string;
  readonly title: string;
  readonly markdown: string;
  readonly acknowledgementRequired: boolean;
};

export type WaiverWorkspace = {
  readonly documents: readonly {
    readonly id: string;
    readonly title: string;
    readonly status: "draft" | "active" | "archived";
    readonly versionId?: string;
    readonly version?: number;
    readonly markdown?: string;
    readonly contentHash?: string;
    readonly sourceFilename?: string;
    readonly requiresSignature: boolean;
    readonly signatureValidityDays: number;
    readonly requiresParentForMinors: boolean;
    readonly playerAcknowledgementMinimumAge?: number;
    readonly keySections: readonly WaiverSection[];
    readonly assignments: readonly {
      readonly id: string;
      readonly scope: "all-members" | "booking" | "catalog-item";
      readonly catalogItemId?: string;
      readonly required: boolean;
    }[];
    readonly updatedAt: string;
  }[];
};

export type WaiverRequirement = {
  readonly documentId: string;
  readonly versionId: string;
  readonly title: string;
  readonly markdown: string;
  readonly contentHash: string;
  readonly requiresSignature: boolean;
  readonly signatureValidityDays: number;
  readonly keySections: readonly WaiverSection[];
  readonly subjectPersonId: string;
  readonly requiredSigners: readonly (
    "adult-player" | "parent-or-guardian" | "player-acknowledgement"
  )[];
  readonly completedSigners: readonly (
    "adult-player" | "parent-or-guardian" | "player-acknowledgement"
  )[];
  readonly complete: boolean;
};

function requireOrganization(actor: ApiActor): string {
  if (!actor.organizationId) {
    throw new WaiverError(
      "ORGANIZATION_REQUIRED",
      "Choose a club workspace first.",
    );
  }
  return actor.organizationId;
}

function slugify(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 96);
  return normalized || "waiver";
}

function normalizedSections(
  value: readonly WaiverSection[],
): readonly WaiverSection[] {
  const ids = new Set<string>();
  return value.map((section, index) => {
    const id = section.id
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-");
    if (!id || ids.has(id)) {
      throw new WaiverError(
        "SECTION_INVALID",
        `Key section ${index + 1} needs a unique identifier.`,
      );
    }
    ids.add(id);
    if (!section.title.trim() || !section.markdown.trim()) {
      throw new WaiverError(
        "SECTION_INVALID",
        `Key section ${index + 1} needs a title and its full text.`,
      );
    }
    return {
      id,
      title: section.title.trim(),
      markdown: section.markdown.trim(),
      acknowledgementRequired: section.acknowledgementRequired,
    };
  });
}

export class WaiverError extends Error {
  constructor(
    readonly code:
      | "ORGANIZATION_REQUIRED"
      | "WAIVER_NOT_FOUND"
      | "SECTION_INVALID"
      | "SIGNER_NOT_AUTHORIZED"
      | "PARENT_REQUIRED"
      | "ACKNOWLEDGEMENT_REQUIRED"
      | "SIGNATURE_REQUIRED",
    message: string,
  ) {
    super(message);
    this.name = "WaiverError";
  }
}

export async function loadWaiverWorkspace(
  organizationId: string,
): Promise<WaiverWorkspace> {
  const database = getDatabase();
  const documents = await database.query.waiverDocuments.findMany({
    where: eq(waiverDocuments.organizationId, organizationId),
    orderBy: [desc(waiverDocuments.updatedAt)],
  });
  if (!documents.length) return { documents: [] };
  const documentIds = documents.map((document) => document.id);
  const [versions, assignments] = await Promise.all([
    database
      .select()
      .from(waiverVersions)
      .where(inArray(waiverVersions.waiverDocumentId, documentIds)),
    database
      .select()
      .from(waiverAssignments)
      .where(
        and(
          eq(waiverAssignments.organizationId, organizationId),
          inArray(waiverAssignments.waiverDocumentId, documentIds),
        ),
      ),
  ]);
  const versionById = new Map(versions.map((version) => [version.id, version]));
  const assignmentsByDocument = new Map<
    string,
    (typeof assignments)[number][]
  >();
  for (const assignment of assignments) {
    assignmentsByDocument.set(assignment.waiverDocumentId, [
      ...(assignmentsByDocument.get(assignment.waiverDocumentId) ?? []),
      assignment,
    ]);
  }
  return {
    documents: documents.map((document) => {
      const version = document.currentVersionId
        ? versionById.get(document.currentVersionId)
        : undefined;
      const status = ["draft", "active", "archived"].includes(document.status)
        ? (document.status as "draft" | "active" | "archived")
        : "draft";
      return {
        id: document.id,
        title: document.title,
        status,
        versionId: version?.id,
        version: version?.version,
        markdown: version?.markdown,
        contentHash: version?.contentHash,
        sourceFilename: version?.sourceFilename ?? undefined,
        requiresSignature: version?.requiresSignature ?? true,
        signatureValidityDays: version?.signatureValidityDays ?? 365,
        requiresParentForMinors: version?.requiresParentForMinors ?? true,
        playerAcknowledgementMinimumAge:
          version?.playerAcknowledgementMinimumAge ?? undefined,
        keySections: version?.keySections ?? [],
        assignments: (assignmentsByDocument.get(document.id) ?? []).map(
          (assignment) => ({
            id: assignment.id,
            scope: assignment.scope as
              "all-members" | "booking" | "catalog-item",
            catalogItemId: assignment.catalogItemId ?? undefined,
            required: assignment.required,
          }),
        ),
        updatedAt: document.updatedAt.toISOString(),
      };
    }),
  };
}

export async function createWaiver(input: {
  readonly actor: ApiActor;
  /** When supplied, append an immutable revision instead of creating a new library document. */
  readonly waiverDocumentId?: string;
  readonly title: string;
  readonly markdown: string;
  readonly sourceFilename?: string;
  readonly sourceMimeType?: string;
  readonly requiresSignature: boolean;
  readonly signatureValidityDays: number;
  readonly requiresParentForMinors: boolean;
  readonly playerAcknowledgementMinimumAge?: number;
  readonly keySections: readonly WaiverSection[];
  readonly appliesToMembers: boolean;
  readonly appliesToBookings: boolean;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}) {
  const organizationId = requireOrganization(input.actor);
  const title = input.title.trim();
  const markdown = input.markdown.trim();
  if (!title || !markdown) {
    throw new WaiverError(
      "WAIVER_NOT_FOUND",
      "Add a title and the complete waiver text.",
    );
  }
  if (
    !Number.isInteger(input.signatureValidityDays) ||
    input.signatureValidityDays < 1 ||
    input.signatureValidityDays > 3650
  ) {
    throw new WaiverError(
      "WAIVER_NOT_FOUND",
      "Choose a validity period from 1 day to 10 years.",
    );
  }
  const keySections = normalizedSections(input.keySections);
  const database = getTransactionalDatabase();
  const contentHash = stableHash({ markdown, keySections });
  const result = await database.transaction(async (tx) => {
    const existingDocument = input.waiverDocumentId
      ? await tx.query.waiverDocuments.findFirst({
          where: and(
            eq(waiverDocuments.id, input.waiverDocumentId),
            eq(waiverDocuments.organizationId, organizationId),
          ),
        })
      : undefined;
    if (input.waiverDocumentId && !existingDocument) {
      throw new WaiverError(
        "WAIVER_NOT_FOUND",
        "This library waiver was not found.",
      );
    }
    const [document] = existingDocument
      ? await tx
          .update(waiverDocuments)
          .set({ title, status: "active", updatedAt: input.now })
          .where(eq(waiverDocuments.id, existingDocument.id))
          .returning()
      : await tx
          .insert(waiverDocuments)
          .values({
            organizationId,
            title,
            slug: `${slugify(title)}-${contentHash.slice(0, 8)}`,
            status: "active",
            createdByPersonId: input.actor.personId,
            createdAt: input.now,
            updatedAt: input.now,
          })
          .returning();
    if (!document)
      throw new Error("Duna could not create the waiver document.");
    const existingVersions = existingDocument
      ? await tx
          .select({ version: waiverVersions.version })
          .from(waiverVersions)
          .where(eq(waiverVersions.waiverDocumentId, document.id))
      : [];
    const nextVersion =
      existingVersions.reduce(
        (latest, candidate) => Math.max(latest, candidate.version),
        0,
      ) + 1;
    const [version] = await tx
      .insert(waiverVersions)
      .values({
        waiverDocumentId: document.id,
        version: nextVersion,
        title,
        markdown,
        contentHash,
        sourceFilename: input.sourceFilename,
        sourceMimeType: input.sourceMimeType,
        requiresSignature: input.requiresSignature,
        signatureValidityDays: input.signatureValidityDays,
        requiresParentForMinors: input.requiresParentForMinors,
        playerAcknowledgementMinimumAge: input.playerAcknowledgementMinimumAge,
        keySections,
        createdByPersonId: input.actor.personId,
        createdAt: input.now,
      })
      .returning();
    if (!version)
      throw new Error("Duna could not version the waiver document.");
    await tx
      .update(waiverDocuments)
      .set({ currentVersionId: version.id, updatedAt: input.now })
      .where(eq(waiverDocuments.id, document.id));
    const assignments = [
      ...(input.appliesToMembers ? ["all-members" as const] : []),
      ...(input.appliesToBookings ? ["booking" as const] : []),
    ];
    if (existingDocument) {
      const priorAssignments = await tx
        .select({ id: waiverAssignments.id })
        .from(waiverAssignments)
        .where(
          and(
            eq(waiverAssignments.organizationId, organizationId),
            eq(waiverAssignments.waiverDocumentId, document.id),
            inArray(waiverAssignments.scope, ["all-members", "booking"]),
          ),
        );
      if (priorAssignments.length) {
        await tx.delete(waiverAssignments).where(
          inArray(
            waiverAssignments.id,
            priorAssignments.map(({ id }) => id),
          ),
        );
      }
    }
    if (assignments.length) {
      await tx.insert(waiverAssignments).values(
        assignments.map((scope) => ({
          organizationId,
          waiverDocumentId: document.id,
          scope,
          required: true,
          createdAt: input.now,
        })),
      );
    }
    await tx.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      actorType: "person",
      action: existingDocument
        ? "waiver.document.revised"
        : "waiver.document.created",
      entityType: "waiver-document",
      entityId: document.id,
      afterHash: stableHash({
        documentId: document.id,
        contentHash,
        assignments,
      }),
      reason: existingDocument
        ? "Created a new immutable waiver revision; active signers must assent to this version."
        : "Created a club-scoped waiver with immutable version evidence.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
      createdAt: input.now,
    });
    return { document, version };
  });
  return { id: result.document.id, versionId: result.version.id };
}

export async function executeWaiver(input: {
  readonly actor: ApiActor;
  readonly organizationId?: string;
  readonly waiverDocumentId: string;
  readonly subjectPersonId: string;
  readonly typedLegalName?: string;
  readonly acknowledgedSectionIds: readonly string[];
  readonly displayedInline: true;
  readonly scrolledToEnd: true;
  readonly confirmed: true;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly now: Date;
}) {
  const organizationId =
    input.organizationId ?? requireOrganization(input.actor);
  const database = getTransactionalDatabase();
  const [document, subject, signer, organization] = await Promise.all([
    database.query.waiverDocuments.findFirst({
      where: and(
        eq(waiverDocuments.id, input.waiverDocumentId),
        eq(waiverDocuments.organizationId, organizationId),
        eq(waiverDocuments.status, "active"),
      ),
    }),
    database.query.people.findFirst({
      where: eq(people.id, input.subjectPersonId),
    }),
    database.query.people.findFirst({
      where: eq(people.id, input.actor.personId),
    }),
    database.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    }),
  ]);
  if (!document?.currentVersionId || !subject || !signer) {
    throw new WaiverError(
      "WAIVER_NOT_FOUND",
      "This waiver is no longer available.",
    );
  }
  const version = await database.query.waiverVersions.findFirst({
    where: eq(waiverVersions.id, document.currentVersionId),
  });
  if (!version)
    throw new WaiverError(
      "WAIVER_NOT_FOUND",
      "This waiver version is unavailable.",
    );
  let signerRole:
    "adult-player" | "parent-or-guardian" | "player-acknowledgement" =
    "adult-player";
  let relationship: string | undefined;
  if (subject.isMinor) {
    const guardianship = await database.query.guardianships.findFirst({
      where: and(
        eq(guardianships.guardianId, signer.id),
        eq(guardianships.minorId, subject.id),
        eq(guardianships.reviewStatus, "verified"),
      ),
    });
    const playerCanAcknowledge =
      signer.id === subject.id &&
      subject.ageBand === "teen" &&
      version.playerAcknowledgementMinimumAge !== null;
    const parentSignature = await database.query.waiverExecutions.findFirst({
      where: and(
        eq(waiverExecutions.organizationId, organizationId),
        eq(waiverExecutions.waiverDocumentId, document.id),
        eq(waiverExecutions.waiverVersionId, version.id),
        eq(waiverExecutions.subjectPersonId, subject.id),
        eq(waiverExecutions.signerRole, "parent-or-guardian"),
        gt(waiverExecutions.expiresAt, input.now),
      ),
      orderBy: desc(waiverExecutions.occurredAt),
    });
    if (version.requiresParentForMinors && !guardianship && !parentSignature) {
      throw new WaiverError(
        "PARENT_REQUIRED",
        "A verified parent or legal guardian must sign this waiver for a minor.",
      );
    }
    if (!guardianship && !playerCanAcknowledge) {
      throw new WaiverError(
        "SIGNER_NOT_AUTHORIZED",
        "This account cannot sign for this player.",
      );
    }
    signerRole = guardianship ? "parent-or-guardian" : "player-acknowledgement";
    relationship = guardianship?.relationship;
  } else if (signer.id !== subject.id) {
    throw new WaiverError(
      "SIGNER_NOT_AUTHORIZED",
      "Only the adult player can sign this waiver.",
    );
  }
  const typedLegalName = input.typedLegalName?.trim() || signer.displayName;
  if (version.requiresSignature && typedLegalName.length < 3) {
    throw new WaiverError(
      "SIGNATURE_REQUIRED",
      "Type the full legal name to sign this waiver.",
    );
  }
  const requiredSectionIds = version.keySections
    .filter((section) => section.acknowledgementRequired)
    .map((section) => section.id);
  if (
    !requiredSectionIds.every((id) => input.acknowledgedSectionIds.includes(id))
  ) {
    throw new WaiverError(
      "ACKNOWLEDGEMENT_REQUIRED",
      "Acknowledge each required waiver section before signing.",
    );
  }
  const expiresAt = new Date(
    input.now.getTime() + version.signatureValidityDays * 24 * 60 * 60 * 1_000,
  );
  const [execution] = await database
    .insert(waiverExecutions)
    .values({
      organizationId,
      waiverDocumentId: document.id,
      waiverVersionId: version.id,
      subjectPersonId: subject.id,
      signerPersonId: signer.id,
      signerRole,
      relationship,
      typedLegalName,
      displayedInline: input.displayedInline,
      scrolledToEnd: input.scrolledToEnd,
      acknowledgedSectionIds: [...new Set(input.acknowledgedSectionIds)],
      contentHash: version.contentHash,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      occurredAt: input.now,
      expiresAt,
    })
    .returning({
      id: waiverExecutions.id,
      expiresAt: waiverExecutions.expiresAt,
    });
  if (!execution)
    throw new Error("Duna could not record the waiver signature.");
  await database.insert(auditLog).values({
    actorPersonId: signer.id,
    actorType: "person",
    action: "waiver.executed",
    entityType: "waiver-execution",
    entityId: execution.id,
    afterHash: stableHash({
      documentId: document.id,
      versionId: version.id,
      subjectPersonId: subject.id,
      signerPersonId: signer.id,
      contentHash: version.contentHash,
    }),
    reason:
      "Recorded a typed-name waiver signature with version and device evidence.",
    traceId: input.requestId,
    ipAddress: input.ipAddress,
    createdAt: input.now,
  });
  // Delivery is best-effort: the execution is already durable and never
  // depends on an email provider accepting the receipt.
  if (signer.email && organization) {
    try {
      const receipt = await createWaiverReceiptPdf({
        organizationName: organization.name,
        title: version.title,
        version: version.version,
        markdown: version.markdown,
        contentHash: version.contentHash,
        subjectName: subject.displayName,
        signerName: typedLegalName,
        signerRole,
        relationship,
        occurredAt: input.now,
        expiresAt,
        acknowledgedSections: [...new Set(input.acknowledgedSectionIds)],
      });
      await sendTransactionalEmail({
        to: signer.email,
        subject: `Your signed copy: ${version.title}`,
        text: `Attached is your signed waiver receipt for ${subject.displayName}. Duna recorded the exact version, typed-name signature, acknowledgement time, and validity period. Keep this copy for your records.`,
        idempotencyKey: `waiver-receipt-${execution.id}`,
        attachments: [
          {
            filename: `duna-waiver-${document.slug}-v${version.version}.pdf`,
            content: Buffer.from(receipt).toString("base64"),
          },
        ],
      });
    } catch {
      // Audit evidence is authoritative even if a provider outage prevents delivery.
    }
  }
  return {
    executionId: execution.id,
    expiresAt: execution.expiresAt.toISOString(),
  };
}

export async function activeWaiverExecutionExists(input: {
  readonly organizationId: string;
  readonly waiverDocumentId: string;
  readonly subjectPersonId: string;
  readonly now: Date;
}) {
  const execution = await getDatabase().query.waiverExecutions.findFirst({
    where: and(
      eq(waiverExecutions.organizationId, input.organizationId),
      eq(waiverExecutions.waiverDocumentId, input.waiverDocumentId),
      eq(waiverExecutions.subjectPersonId, input.subjectPersonId),
      gt(waiverExecutions.expiresAt, input.now),
    ),
    orderBy: desc(waiverExecutions.occurredAt),
  });
  return Boolean(execution);
}

export async function loadWaiverRequirements(input: {
  readonly actor: ApiActor;
  readonly organizationId: string;
  readonly catalogItemId?: string;
  /** Specific immutable library documents attached by an event or program. */
  readonly waiverDocumentIds?: readonly string[];
  readonly subjectPersonId?: string;
  readonly now: Date;
}): Promise<readonly WaiverRequirement[]> {
  const database = getDatabase();
  const subjectPersonId = input.subjectPersonId ?? input.actor.personId;
  const subject = await database.query.people.findFirst({
    where: eq(people.id, subjectPersonId),
  });
  if (!subject)
    throw new WaiverError(
      "SIGNER_NOT_AUTHORIZED",
      "This player was not found.",
    );
  if (subject.id !== input.actor.personId) {
    const relationship = await database.query.guardianships.findFirst({
      where: and(
        eq(guardianships.guardianId, input.actor.personId),
        eq(guardianships.minorId, subject.id),
        eq(guardianships.reviewStatus, "verified"),
      ),
    });
    if (!relationship) {
      throw new WaiverError(
        "SIGNER_NOT_AUTHORIZED",
        "This account cannot review waivers for this player.",
      );
    }
  }
  const item = input.catalogItemId
    ? await database.query.catalogItems.findFirst({
        where: and(
          eq(catalogItems.id, input.catalogItemId),
          eq(catalogItems.organizationId, input.organizationId),
        ),
      })
    : undefined;
  if (input.catalogItemId && !item) {
    throw new WaiverError("WAIVER_NOT_FOUND", "This offer is unavailable.");
  }
  const assignments = await database
    .select()
    .from(waiverAssignments)
    .where(
      and(
        eq(waiverAssignments.organizationId, input.organizationId),
        inArray(waiverAssignments.scope, [
          "all-members",
          "booking",
          "catalog-item",
        ]),
      ),
    );
  const assignmentIds = assignments
    .filter(
      (assignment) =>
        assignment.required &&
        ((assignment.scope === "all-members" &&
          item?.type === "plan" &&
          item.subtype === "membership") ||
          (assignment.scope === "booking" &&
            (item?.type === "event" || item?.type === "service")) ||
          (assignment.scope === "catalog-item" &&
            assignment.catalogItemId === item?.id)),
    )
    .map((assignment) => assignment.waiverDocumentId);
  const configuredMembershipIds =
    item?.type === "plan" &&
    item.subtype === "membership" &&
    item.configuration.membership &&
    typeof item.configuration.membership === "object" &&
    !Array.isArray(item.configuration.membership) &&
    Array.isArray(
      (item.configuration.membership as Record<string, unknown>)
        .waiverDocumentIds,
    )
      ? (
          (item.configuration.membership as Record<string, unknown>)
            .waiverDocumentIds as unknown[]
        ).filter((id): id is string => typeof id === "string")
      : [];
  const documentIds = [
    ...new Set([
      ...assignmentIds,
      ...configuredMembershipIds,
      ...(input.waiverDocumentIds ?? []),
    ]),
  ];
  if (!documentIds.length) return [];
  const documents = await database
    .select()
    .from(waiverDocuments)
    .where(
      and(
        eq(waiverDocuments.organizationId, input.organizationId),
        eq(waiverDocuments.status, "active"),
        inArray(waiverDocuments.id, documentIds),
      ),
    );
  const versionIds = documents
    .map((document) => document.currentVersionId)
    .filter((id): id is string => Boolean(id));
  const [versions, executions] = await Promise.all([
    versionIds.length
      ? database
          .select()
          .from(waiverVersions)
          .where(inArray(waiverVersions.id, versionIds))
      : Promise.resolve([]),
    database
      .select()
      .from(waiverExecutions)
      .where(
        and(
          eq(waiverExecutions.organizationId, input.organizationId),
          eq(waiverExecutions.subjectPersonId, subject.id),
          gt(waiverExecutions.expiresAt, input.now),
        ),
      ),
  ]);
  const versionById = new Map(versions.map((version) => [version.id, version]));
  return documents.flatMap((document) => {
    const version = document.currentVersionId
      ? versionById.get(document.currentVersionId)
      : undefined;
    if (!version) return [];
    const requiredSigners: WaiverRequirement["requiredSigners"] =
      subject.isMinor
        ? [
            ...(version.requiresParentForMinors
              ? ["parent-or-guardian" as const]
              : []),
            ...(subject.ageBand === "teen" &&
            version.playerAcknowledgementMinimumAge !== null
              ? ["player-acknowledgement" as const]
              : []),
          ]
        : ["adult-player"];
    const completedSigners = [
      ...new Set(
        executions
          .filter(
            (execution) =>
              execution.waiverDocumentId === document.id &&
              execution.waiverVersionId === version.id,
          )
          .map(
            (execution) =>
              execution.signerRole as WaiverRequirement["requiredSigners"][number],
          ),
      ),
    ];
    return [
      {
        documentId: document.id,
        versionId: version.id,
        title: version.title,
        markdown: version.markdown,
        contentHash: version.contentHash,
        requiresSignature: version.requiresSignature,
        signatureValidityDays: version.signatureValidityDays,
        keySections: version.keySections,
        subjectPersonId: subject.id,
        requiredSigners,
        completedSigners,
        complete: requiredSigners.every((role) =>
          completedSigners.includes(role),
        ),
      },
    ];
  });
}
