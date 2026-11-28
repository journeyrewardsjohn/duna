/**
 * Contract: HQ People (owner: PEOPLE-API). `operator.people.*`: import,
 * merge, staff notes, tags, households, documents and membership changes.
 * Additive; see docs/product/people.md for the rules each shape carries.
 *
 * Every write takes `confirmed: true` (a person confirmed it on screen) and
 * an `idempotencyKey`; import, merge and membership changes also take the id
 * of a preview that is still current. None of these procedures sends
 * anything to a player, parent or guardian.
 */
import { z } from "zod";

const id = z.string().uuid();
const iso = z.iso.datetime();
const key = z.string().uuid();
const phone = z.string().regex(/^\+[1-9]\d{7,14}$/);

export const PEOPLE_IMPORT_MAX_ROWS = 1_000;
export const PEOPLE_BULK_TAG_MAX_PEOPLE = 200;
export const PEOPLE_NOTE_MAX_LENGTH = 4_000;

export const peoplePersonInputSchema = z.object({ personId: id });

export const peopleRefSchema = z.object({
  personId: id,
  displayName: z.string(),
});

/* Notes ------------------------------------------------------------------ */

export const peopleNoteSchema = z.object({
  id,
  personId: id,
  body: z.string(),
  author: peopleRefSchema,
  createdAt: iso,
  editedAt: iso.optional(),
});
export const peopleNotesSchema = z.object({
  notes: z.array(peopleNoteSchema).readonly(),
});
export const peopleNoteAddInputSchema = z.object({
  personId: id,
  body: z.string().trim().min(1).max(PEOPLE_NOTE_MAX_LENGTH),
  idempotencyKey: key,
});
export const peopleNoteEditInputSchema = z.object({
  noteId: id,
  body: z.string().trim().min(1).max(PEOPLE_NOTE_MAX_LENGTH),
  idempotencyKey: key,
});
export const peopleNoteRemoveInputSchema = z.object({
  noteId: id,
  idempotencyKey: key,
});
export const peopleNoteRemovedSchema = z.object({
  noteId: id,
  removed: z.literal(true),
});

/* Tags ------------------------------------------------------------------- */

export const peopleTagSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} '&+./-]*$/u, "Use letters and numbers.");
export const peopleTagsInputSchema = z.object({ personId: id.optional() });
export const peopleTagsSchema = z.object({
  /** The club's tags with how many people carry each. */
  tags: z
    .array(z.object({ tag: z.string(), count: z.number().int().min(0) }))
    .readonly(),
  /** The person's own tags, when `personId` was given. */
  personTags: z.array(z.string()).readonly().optional(),
});
export const peopleTagsSetInputSchema = z
  .object({
    personIds: z.array(id).min(1).max(PEOPLE_BULK_TAG_MAX_PEOPLE),
    add: z.array(peopleTagSchema).max(10).default([]),
    remove: z.array(peopleTagSchema).max(10).default([]),
    idempotencyKey: key,
  })
  .refine(
    (value) => value.add.length + value.remove.length > 0,
    "Add or remove at least one tag.",
  );
export const peopleTagsSetResultSchema = z.object({
  people: z.number().int().min(0),
  added: z.number().int().min(0),
  removed: z.number().int().min(0),
});

/* Household -------------------------------------------------------------- */

export const peopleConsentStateSchema = z.enum([
  "recorded",
  "withdrawn",
  "not-recorded",
]);
export const peopleHouseholdSchema = z.object({
  personId: id,
  guardians: z
    .array(
      peopleRefSchema.extend({
        juniorPersonId: id,
        relationship: z.string(),
        reviewStatus: z.enum(["pending", "verified", "rejected"]),
        canApproveSpending: z.boolean(),
        /** Omitted for viewers without `payments:read`. */
        pays: z.boolean().optional(),
        /** The guardian is who the club contacts about the junior. */
        contacted: z.boolean(),
      }),
    )
    .readonly(),
  juniors: z
    .array(
      peopleRefSchema.extend({
        ageBand: z.enum(["unknown", "under-13", "teen", "adult"]),
        consent: z.object({
          state: peopleConsentStateSchema,
          method: z.string().optional(),
          version: z.string().optional(),
          at: iso.optional(),
        }),
      }),
    )
    .readonly(),
  /** Who pays for this person's purchases at the club; omitted without `payments:read`. */
  payer: peopleRefSchema.optional(),
  /** Who the club contacts about this person (the guardian for a junior). */
  contact: peopleRefSchema.optional(),
});
export const peopleInviteGuardianInputSchema = z
  .object({
    juniorPersonId: id,
    guardianName: z.string().trim().min(2).max(120),
    relationship: z.string().trim().min(2).max(48),
    email: z.email().optional(),
    phoneE164: phone.optional(),
    confirmed: z.literal(true),
    idempotencyKey: key,
  })
  .refine(
    (value) => Boolean(value.email || value.phoneE164),
    "Give the guardian's email or mobile number.",
  );
export const peopleInviteGuardianResultSchema = z.object({
  invitationId: id,
  inviteUrl: z.url(),
  expiresAt: iso,
  /** A draft for staff to review and send from Inbox; nothing was sent. */
  draft: z.object({
    channel: z.enum(["email", "sms"]),
    contactHint: z.string(),
    body: z.string(),
  }),
  sent: z.literal(false),
});
export const peopleLinkGuardianInputSchema = z.object({
  juniorPersonId: id,
  guardianPersonId: id,
  relationship: z.string().trim().min(2).max(48),
  confirmed: z.literal(true),
  idempotencyKey: key,
});
export const peopleLinkGuardianResultSchema = z.object({
  juniorPersonId: id,
  guardianPersonId: id,
  /** Duna reviews every new guardian link before it carries authority. */
  reviewStatus: z.literal("pending"),
  consent: z.literal("not-recorded"),
});

/* Documents -------------------------------------------------------------- */

export const peopleDocumentSchema = z.object({
  documentId: id,
  title: z.string(),
  kind: z.enum(["waiver", "consent"]),
  /** The version the person signed (or the current one when missing). */
  versionSigned: z.number().int().optional(),
  currentVersion: z.number().int().optional(),
  signedAt: iso.optional(),
  signedBy: z
    .object({
      personId: id,
      displayName: z.string(),
      role: z.enum(["self", "guardian"]),
    })
    .optional(),
  expiresAt: iso.optional(),
  status: z.enum(["signed", "missing", "expired", "superseded", "withdrawn"]),
  required: z.boolean(),
});
export const peopleDocumentsSchema = z.object({
  documents: z.array(peopleDocumentSchema).readonly(),
});
export const peopleRequestSignatureInputSchema = z.object({
  personId: id,
  waiverDocumentId: id,
  idempotencyKey: key,
});
export const peopleRequestSignatureResultSchema = z.object({
  /** The message draft in Inbox; a person reviews and sends it. */
  draftId: id,
  recipientPersonId: id,
  signUrl: z.url(),
  sent: z.literal(false),
});

/* Import ----------------------------------------------------------------- */

export const peopleImportFieldSchema = z.enum([
  "name",
  "givenName",
  "familyName",
  "email",
  "phoneE164",
  "birthDate",
  "isMinor",
  "relationship",
  "guardianName",
  "guardianEmail",
  "guardianPhoneE164",
  "tags",
]);
export const peopleImportPreviewInputSchema = z.object({
  /** Rows as parsed from the club's file: column name → cell text. */
  rows: z
    .array(z.record(z.string().max(80), z.string().max(400)))
    .min(1)
    .max(PEOPLE_IMPORT_MAX_ROWS),
  /** Duna field → the column that holds it. Unmapped columns are ignored. */
  mapping: z.partialRecord(peopleImportFieldSchema, z.string().max(80)),
});
export const peopleImportRowSchema = z.object({
  /** 1-based, as the club sees it in their file (header excluded). */
  row: z.number().int().min(1),
  action: z.enum(["create", "update", "duplicate", "problem"]),
  displayName: z.string().optional(),
  /** The club record this row matched (update, duplicate). */
  matchPersonId: id.optional(),
  isMinor: z.boolean(),
  /** What an update adds (tags only; a person's own profile is never overwritten). */
  adds: z.array(z.string()).readonly().optional(),
  problems: z
    .array(z.object({ field: z.string(), message: z.string() }))
    .readonly(),
});
export const peopleImportCountsSchema = z.object({
  total: z.number().int(),
  create: z.number().int(),
  update: z.number().int(),
  duplicate: z.number().int(),
  problem: z.number().int(),
  juniors: z.number().int(),
  guardians: z.number().int(),
});
export const peopleImportPreviewSchema = z.object({
  previewId: id,
  expiresAt: iso,
  counts: peopleImportCountsSchema,
  rows: z.array(peopleImportRowSchema).readonly(),
});
export const peopleImportInputSchema = z.object({
  previewId: id,
  confirmed: z.literal(true),
  idempotencyKey: key,
});
export const peopleImportResultSchema = z.object({
  previewId: id,
  status: z.enum(["importing", "completed"]),
  processed: z.number().int(),
  total: z.number().int(),
  created: z.number().int(),
  updated: z.number().int(),
  skipped: z.number().int(),
  guardiansLinked: z.number().int(),
  /** Always 0: an import never sends anything. */
  messagesSent: z.literal(0),
});

/* Merge ------------------------------------------------------------------ */

export const peopleMergeMoveKinds = [
  "bookings",
  "attendance",
  "memberships",
  "credits",
  "payments",
  "waivers",
  "familyLinks",
  "notes",
  "tags",
] as const;
export const peopleMergeBlockerCodes = [
  "same-person",
  "sign-in-account",
  "other-club",
  "staff-record",
  "same-plan-twice",
  "same-booking-twice",
  "two-credit-wallets",
  "different-guardians",
  "age-mismatch",
  "already-merged",
] as const;
export const peopleMergePreviewInputSchema = z.object({
  keepId: id,
  mergeId: id,
});
export const peopleMergePreviewSchema = z.object({
  previewId: id,
  expiresAt: iso,
  keep: peopleRefSchema,
  merge: peopleRefSchema,
  canMerge: z.boolean(),
  /** What stays: the kept record's name, contact, sign-in and profile. */
  kept: z.array(z.string()).readonly(),
  moves: z.record(z.enum(peopleMergeMoveKinds), z.number().int().min(0)),
  blockers: z
    .array(
      z.object({ code: z.enum(peopleMergeBlockerCodes), message: z.string() }),
    )
    .readonly(),
});
export const peopleMergeInputSchema = z.object({
  previewId: id,
  confirmed: z.literal(true),
  idempotencyKey: key,
});
export const peopleMergeResultSchema = z.object({
  mergeId: id,
  personId: id,
  moved: z.record(z.enum(peopleMergeMoveKinds), z.number().int().min(0)),
});

/* Membership changes ----------------------------------------------------- */

export const peopleMembershipChangeTimingSchema = z.enum(["now", "at-renewal"]);
export const peopleMembershipChangeInputSchema = z.object({
  personId: id,
  membershipId: id,
  toTierId: id,
  timing: peopleMembershipChangeTimingSchema,
});
const planRef = z.object({
  tierId: id,
  name: z.string(),
  priceMinor: z.number().int(),
  currency: z.string().length(3),
  interval: z.string(),
});
export const peopleMembershipChangePreviewSchema = z.object({
  /** Changes whenever the membership or either plan changes. */
  previewId: z.string(),
  status: z.enum(["available", "unavailable"]),
  reason: z.string().optional(),
  kind: z.enum(["upgrade", "downgrade", "switch"]),
  from: planRef,
  to: planRef,
  timing: peopleMembershipChangeTimingSchema,
  effectiveAt: iso.optional(),
  /** Exactly what moves through Duna Pay because of this change. */
  chargeNowMinor: z.number().int().min(0),
  creditNowMinor: z.number().int().min(0),
  nextCharge: z
    .object({ amountMinor: z.number().int().min(0), at: iso })
    .optional(),
  billedThroughDuna: z.boolean(),
  wording: z.string(),
});
export const peopleChangeMembershipInputSchema =
  peopleMembershipChangeInputSchema.extend({
    previewId: z.string(),
    confirmed: z.literal(true),
    idempotencyKey: key,
  });
export const peopleChangeMembershipResultSchema = z.object({
  membershipId: id,
  status: z.enum(["changed", "unavailable"]),
  reason: z.string().optional(),
  tierId: id,
  effectiveAt: iso.optional(),
  chargeNowMinor: z.number().int().min(0),
  creditNowMinor: z.number().int().min(0),
});

export type PeopleNote = z.infer<typeof peopleNoteSchema>;
export type PeopleHousehold = z.infer<typeof peopleHouseholdSchema>;
export type PeopleDocument = z.infer<typeof peopleDocumentSchema>;
export type PeopleImportPreview = z.infer<typeof peopleImportPreviewSchema>;
export type PeopleImportResult = z.infer<typeof peopleImportResultSchema>;
export type PeopleImportRow = z.infer<typeof peopleImportRowSchema>;
export type PeopleMergePreview = z.infer<typeof peopleMergePreviewSchema>;
export type PeopleMergeResult = z.infer<typeof peopleMergeResultSchema>;
export type PeopleMergeMoveKind = (typeof peopleMergeMoveKinds)[number];
export type PeopleMembershipChangePreview = z.infer<
  typeof peopleMembershipChangePreviewSchema
>;
