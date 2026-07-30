import {
  auditLog,
  consents,
  formResponses,
  forms,
  getDatabase,
} from "@duna/db";
import {
  validateFormResponse,
  type FormField,
  type SignatureEnvelope,
  type VersionedForm,
} from "@duna/core";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { stableHash } from "./canonical";
import { assertSubjectAuthority, CommerceError } from "./commerce";
import type { ApiActor } from "./context";

const conditionSchema = z.object({
  fieldId: z.string().min(1),
  operator: z.enum(["equals", "not-equals", "includes"]),
  value: z.union([z.string(), z.number(), z.boolean()]),
});

const fieldSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    "short-text",
    "long-text",
    "number",
    "date",
    "dropdown",
    "multi-select",
    "checkbox",
    "file",
    "signature",
    "phone",
    "email",
    "address",
    "rating-band",
    "guardian",
    "emergency-contact",
  ]),
  label: z.string().min(1),
  required: z.boolean(),
  options: z.array(z.string()).readonly().optional(),
  visibleWhen: conditionSchema.optional(),
  privateToOrganization: z.boolean().optional(),
});

const storedFormSchema = z.object({
  title: z.string().min(1),
  fields: z.array(fieldSchema).readonly(),
});

export class FormSubmissionError extends Error {
  constructor(
    readonly code:
      | "DATABASE_REQUIRED"
      | "FORM_NOT_FOUND"
      | "FORM_VERSION_MISMATCH"
      | "FORM_SCHEMA_INVALID"
      | "VALIDATION_FAILED",
    message: string,
    readonly issues?: readonly {
      readonly fieldId: string;
      readonly code: string;
    }[],
  ) {
    super(message);
    this.name = "FormSubmissionError";
  }
}

export interface FormSubmissionResult {
  readonly responseId: string;
  readonly formId: string;
  readonly formVersion: number;
  readonly subjectPersonId: string;
  readonly signed: boolean;
  readonly signedAt?: string;
  readonly documentTextHash?: string;
}

export async function submitFormResponse(input: {
  readonly actor: ApiActor;
  readonly formId: string;
  readonly formVersion: number;
  readonly subjectPersonId?: string;
  readonly answers: Readonly<Record<string, unknown>>;
  readonly signatureValue?: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly now: Date;
}): Promise<FormSubmissionResult> {
  if (!process.env.DATABASE_URL) {
    throw new FormSubmissionError(
      "DATABASE_REQUIRED",
      "Form submission requires the connected Duna database.",
    );
  }
  const database = getDatabase();
  const stored = await database.query.forms.findFirst({
    where: eq(forms.id, input.formId),
  });
  if (!stored) {
    throw new FormSubmissionError("FORM_NOT_FOUND", "Form was not found.");
  }
  if (stored.version !== input.formVersion) {
    throw new FormSubmissionError(
      "FORM_VERSION_MISMATCH",
      `Form version ${stored.version} is current and must be shown before submission.`,
    );
  }
  const parsed = storedFormSchema.safeParse(stored.schema);
  if (!parsed.success) {
    throw new FormSubmissionError(
      "FORM_SCHEMA_INVALID",
      "The published form schema is invalid.",
    );
  }
  const subjectPersonId = input.subjectPersonId ?? input.actor.personId;
  const authority = await assertSubjectAuthority({
    actor: input.actor,
    subjectPersonId,
  });
  const form: VersionedForm = {
    id: stored.id,
    version: stored.version,
    title: parsed.data.title,
    fields: parsed.data.fields as readonly FormField[],
    waiver:
      stored.documentText && stored.documentTextHash
        ? {
            documentText: stored.documentText,
            documentTextHash: stored.documentTextHash,
          }
        : undefined,
  };
  const signature: SignatureEnvelope | undefined =
    input.signatureValue && form.waiver
      ? {
          formId: form.id,
          formVersion: form.version,
          documentTextHash: form.waiver.documentTextHash,
          personId: subjectPersonId,
          minorPersonId: authority.person.isMinor ? subjectPersonId : undefined,
          signerPersonId: input.actor.personId,
          signedAt: input.now.toISOString(),
          ipAddress: input.ipAddress ?? "unavailable",
          signatureValue: input.signatureValue,
        }
      : undefined;
  const issues = validateFormResponse({
    form,
    personId: subjectPersonId,
    minorPersonId: authority.person.isMinor ? subjectPersonId : undefined,
    verifiedGuardianOfMinorIds: authority.guardianIds,
    answers: input.answers,
    signature,
  });
  if (issues.length > 0) {
    throw new FormSubmissionError(
      "VALIDATION_FAILED",
      "The form response did not pass server validation.",
      issues,
    );
  }
  const responseId = crypto.randomUUID();
  const signatureTextHash = signature
    ? stableHash({
        formId: form.id,
        formVersion: form.version,
        documentTextHash: form.waiver?.documentTextHash,
        subjectPersonId,
        signerPersonId: input.actor.personId,
        signatureValue: signature.signatureValue,
      })
    : undefined;
  await database.batch([
    database.insert(formResponses).values({
      id: responseId,
      formId: form.id,
      formVersion: form.version,
      personId: input.actor.personId,
      subjectPersonId,
      answers: input.answers,
      signedByPersonId: signature ? input.actor.personId : undefined,
      signatureTextHash,
      signedAt: signature ? input.now : undefined,
      ipAddress: input.ipAddress,
    }),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      organizationId: input.actor.organizationId,
      actorType: "person",
      action: signature ? "form.signed" : "form.submitted",
      entityType: "form-response",
      entityId: responseId,
      afterHash: stableHash({
        formId: form.id,
        formVersion: form.version,
        subjectPersonId,
        documentTextHash: form.waiver?.documentTextHash,
        answers: input.answers,
      }),
      reason: signature
        ? "Signer submitted the exact published form and waiver version."
        : "Participant submitted the published form version.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
    }),
  ]);
  return {
    responseId,
    formId: form.id,
    formVersion: form.version,
    subjectPersonId,
    signed: Boolean(signature),
    signedAt: signature?.signedAt,
    documentTextHash: form.waiver?.documentTextHash,
  };
}

export interface ConsentRecordResult {
  readonly consentId: string;
  readonly personId: string;
  readonly scope:
    "transactional" | "marketing-email" | "marketing-sms" | "marketing-push";
  readonly granted: boolean;
  readonly disclosureTextHash: string;
  readonly occurredAt: string;
}

export async function recordConsent(input: {
  readonly actor: ApiActor;
  readonly scope: ConsentRecordResult["scope"];
  readonly granted: boolean;
  readonly disclosureText: string;
  readonly requestId: string;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly now: Date;
}): Promise<ConsentRecordResult> {
  if (!process.env.DATABASE_URL) {
    throw new CommerceError(
      "DATABASE_REQUIRED",
      "Consent records require the connected Duna database.",
    );
  }
  const database = getDatabase();
  const consentId = crypto.randomUUID();
  const disclosureTextHash = stableHash(input.disclosureText);
  await database.batch([
    database.insert(consents).values({
      id: consentId,
      personId: input.actor.personId,
      scope: input.scope,
      granted: input.granted,
      disclosureText: input.disclosureText,
      disclosureTextHash,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      occurredAt: input.now,
    }),
    database.insert(auditLog).values({
      actorPersonId: input.actor.personId,
      organizationId: input.actor.organizationId,
      actorType: "person",
      action: input.granted ? "consent.granted" : "consent.revoked",
      entityType: "consent",
      entityId: consentId,
      afterHash: stableHash({
        scope: input.scope,
        granted: input.granted,
        disclosureTextHash,
      }),
      reason: "Person explicitly updated a scoped communication preference.",
      traceId: input.requestId,
      ipAddress: input.ipAddress,
    }),
  ]);
  return {
    consentId,
    personId: input.actor.personId,
    scope: input.scope,
    granted: input.granted,
    disclosureTextHash,
    occurredAt: input.now.toISOString(),
  };
}
