/**
 * Router seam: HQ People (owner: PEOPLE-API). Mounted once in ../router.ts
 * as `operator.people`. Shapes: ../contracts/people.ts. Rules:
 * docs/product/people.md.
 *
 * Scopes: reads need "members:read" (coaches see only the people they
 * coach; money fields need "payments:read"); writes need "members:write"
 * (owners and managers). Another club's ids answer NOT_FOUND. Every write is
 * idempotent; import, merge and membership changes need `confirmed: true`
 * and a current preview. Nothing here sends a message to anyone. Every
 * procedure has a demo branch (no database in CI or Playwright).
 */
import { TRPCError } from "@trpc/server";
import { organizationProcedure, rateLimitMiddleware, router } from "../auth";
import type { ApiContext } from "../context";
import {
  peopleChangeMembershipInputSchema,
  peopleChangeMembershipResultSchema,
  peopleDocumentsSchema,
  peopleHouseholdSchema,
  peopleImportInputSchema,
  peopleImportPreviewInputSchema,
  peopleImportPreviewSchema,
  peopleImportResultSchema,
  peopleInviteGuardianInputSchema,
  peopleInviteGuardianResultSchema,
  peopleLinkGuardianInputSchema,
  peopleLinkGuardianResultSchema,
  peopleMembershipChangeInputSchema,
  peopleMembershipChangePreviewSchema,
  peopleMergeInputSchema,
  peopleMergePreviewInputSchema,
  peopleMergePreviewSchema,
  peopleMergeResultSchema,
  peopleNoteAddInputSchema,
  peopleNoteEditInputSchema,
  peopleNoteRemoveInputSchema,
  peopleNoteRemovedSchema,
  peopleNoteSchema,
  peopleNotesSchema,
  peoplePersonInputSchema,
  peopleRequestSignatureInputSchema,
  peopleRequestSignatureResultSchema,
  peopleTagsInputSchema,
  peopleTagsSchema,
  peopleTagsSetInputSchema,
  peopleTagsSetResultSchema,
} from "../contracts/people";
import {
  executeIdempotent,
  IdempotencyConflictError,
  IdempotencyInProgressError,
} from "../idempotency";
import { OperatorServiceError } from "../operator-service";
import { ProfileOnboardingError } from "../profile-onboarding";
import { canonicalPublicWebOrigin } from "../public-web-url";
import * as demo from "../services/people/demo";
import {
  loadPersonDocuments,
  requestWaiverSignature,
} from "../services/people/documents";
import {
  inviteGuardian,
  linkGuardian,
  loadPersonHousehold,
} from "../services/people/household";
import {
  previewPeopleImport,
  runPeopleImport,
} from "../services/people/import";
import {
  changeMembershipPlan,
  previewMembershipChange,
} from "../services/people/membership-change";
import { previewPeopleMerge, runPeopleMerge } from "../services/people/merge";
import {
  addPersonNote,
  editPersonNote,
  listPersonNotes,
  listPersonTags,
  removePersonNote,
  setPersonTags,
} from "../services/people/notes";
import {
  PeopleError,
  peopleUseDemo,
  type PeopleContext,
} from "../services/people/shared";

const read = organizationProcedure("members:read");
const write = organizationProcedure("members:write");

const noteWrites = rateLimitMiddleware({
  id: "people-note-write",
  capacity: 60,
  refillPerMinute: 30,
  scope: "organization",
});
const bulkWrites = rateLimitMiddleware({
  id: "people-bulk",
  capacity: 20,
  refillPerMinute: 6,
  scope: "organization",
});
const importWrites = rateLimitMiddleware({
  id: "people-import",
  capacity: 10,
  refillPerMinute: 2,
  scope: "organization",
});
const mergeWrites = rateLimitMiddleware({
  id: "people-merge",
  capacity: 10,
  refillPerMinute: 2,
  scope: "organization",
});
const draftWrites = rateLimitMiddleware({
  id: "people-draft",
  capacity: 20,
  refillPerMinute: 5,
  scope: "organization",
});

function context(ctx: ApiContext): PeopleContext {
  return {
    actor: ctx.actor!,
    organizationId: ctx.actor!.organizationId!,
    now: ctx.now,
    requestId: ctx.requestId,
    ipAddress: ctx.ipAddress,
  };
}

const PEOPLE_CODES = {
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  CONFLICT: "CONFLICT",
  BAD_REQUEST: "BAD_REQUEST",
  PRECONDITION_FAILED: "PRECONDITION_FAILED",
} as const;

export function toPeopleTrpcError(error: unknown): never {
  if (error instanceof TRPCError) throw error;
  if (error instanceof PeopleError) {
    throw new TRPCError({
      code: PEOPLE_CODES[error.code],
      message: error.message,
      cause: error,
    });
  }
  if (
    error instanceof OperatorServiceError ||
    error instanceof ProfileOnboardingError
  ) {
    const code = String(error.code);
    throw new TRPCError({
      code: /NOT_FOUND/.test(code)
        ? "NOT_FOUND"
        : code === "FORBIDDEN" || code === "SUBJECT_NOT_ALLOWED"
          ? "FORBIDDEN"
          : "PRECONDITION_FAILED",
      message: error.message,
      cause: error,
    });
  }
  if (error instanceof IdempotencyConflictError) {
    throw new TRPCError({ code: "CONFLICT", message: error.message });
  }
  if (error instanceof IdempotencyInProgressError) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: error.message });
  }
  throw error;
}

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    return toPeopleTrpcError(error);
  }
}

async function idempotent<T extends object>(
  ctx: ApiContext,
  procedure: string,
  input: { readonly idempotencyKey: string } & Record<string, unknown>,
  execute: () => Promise<T>,
): Promise<T> {
  return guarded(async () => {
    const { idempotencyKey, ...request } = input;
    return (
      await executeIdempotent({
        key: idempotencyKey,
        procedure: `operator.people.${procedure}`,
        personId: ctx.actor?.personId,
        organizationId: ctx.actor?.organizationId,
        request: JSON.parse(JSON.stringify(request)),
        now: ctx.now,
        execute,
      })
    ).result;
  });
}

const notesRouter = router({
  list: read
    .input(peoplePersonInputSchema)
    .output(peopleNotesSchema)
    .query(({ input, ctx }) =>
      peopleUseDemo()
        ? demo.demoNotes(input.personId)
        : guarded(() => listPersonNotes(context(ctx), input.personId)),
    ),
  add: write
    .use(noteWrites)
    .input(peopleNoteAddInputSchema)
    .output(peopleNoteSchema)
    .mutation(({ input, ctx }) =>
      peopleUseDemo()
        ? demo.demoNote(
            input.personId,
            input.body,
            ctx.actor!.personId,
            ctx.actor!.displayName,
            ctx.now,
          )
        : idempotent(ctx, "notes.add", input, () =>
            addPersonNote(context(ctx), input),
          ),
    ),
  edit: write
    .use(noteWrites)
    .input(peopleNoteEditInputSchema)
    .output(peopleNoteSchema)
    .mutation(({ input, ctx }) =>
      peopleUseDemo()
        ? demo.demoNote(
            demo.peopleDemoIds.maya,
            input.body,
            ctx.actor!.personId,
            ctx.actor!.displayName,
            ctx.now,
          )
        : idempotent(ctx, "notes.edit", input, () =>
            editPersonNote(context(ctx), input),
          ),
    ),
  remove: write
    .use(noteWrites)
    .input(peopleNoteRemoveInputSchema)
    .output(peopleNoteRemovedSchema)
    .mutation(({ input, ctx }) =>
      peopleUseDemo()
        ? { noteId: input.noteId, removed: true as const }
        : idempotent(ctx, "notes.remove", input, () =>
            removePersonNote(context(ctx), input),
          ),
    ),
});

const tagsRouter = router({
  list: read
    .input(peopleTagsInputSchema)
    .output(peopleTagsSchema)
    .query(({ input, ctx }) =>
      peopleUseDemo()
        ? demo.demoTags(input.personId)
        : guarded(() => listPersonTags(context(ctx), input.personId)),
    ),
  set: write
    .use(bulkWrites)
    .input(peopleTagsSetInputSchema)
    .output(peopleTagsSetResultSchema)
    .mutation(({ input, ctx }) =>
      peopleUseDemo()
        ? {
            people: new Set(input.personIds).size,
            added: input.add.length * new Set(input.personIds).size,
            removed: 0,
          }
        : idempotent(ctx, "tags.set", input, () =>
            setPersonTags(context(ctx), input),
          ),
    ),
});

export const peopleOperatorRouter = router({
  notes: notesRouter,
  tags: tagsRouter,

  household: read
    .input(peoplePersonInputSchema)
    .output(peopleHouseholdSchema)
    .query(({ input, ctx }) =>
      peopleUseDemo()
        ? demo.demoHousehold(input.personId)
        : guarded(() => loadPersonHousehold(context(ctx), input.personId)),
    ),

  /** A guardian invitation link plus a draft to review; nothing is sent. */
  inviteGuardian: write
    .use(draftWrites)
    .input(peopleInviteGuardianInputSchema)
    .output(peopleInviteGuardianResultSchema)
    .mutation(({ input, ctx }) =>
      peopleUseDemo()
        ? {
            invitationId: demo.peopleDemoIds.invitation,
            inviteUrl: `${canonicalPublicWebOrigin()}/join/guardian/demo`,
            expiresAt: new Date(
              ctx.now.getTime() + 14 * 24 * 60 * 60_000,
            ).toISOString(),
            draft: {
              channel: input.phoneE164 ? ("sms" as const) : ("email" as const),
              contactHint: "••••",
              body: `Hi ${input.guardianName}, please confirm you are the junior's ${input.relationship}.`,
            },
            sent: false as const,
          }
        : idempotent(ctx, "inviteGuardian", input, () =>
            inviteGuardian(context(ctx), {
              ...input,
              applicationOrigin: canonicalPublicWebOrigin(),
            }),
          ),
    ),

  /** Links a known adult as a junior's guardian, pending Duna review. */
  linkGuardian: write
    .use(draftWrites)
    .input(peopleLinkGuardianInputSchema)
    .output(peopleLinkGuardianResultSchema)
    .mutation(({ input, ctx }) =>
      peopleUseDemo()
        ? {
            juniorPersonId: input.juniorPersonId,
            guardianPersonId: input.guardianPersonId,
            reviewStatus: "pending" as const,
            consent: "not-recorded" as const,
          }
        : idempotent(ctx, "linkGuardian", input, () =>
            linkGuardian(context(ctx), input),
          ),
    ),

  documents: read
    .input(peoplePersonInputSchema)
    .output(peopleDocumentsSchema)
    .query(({ input, ctx }) =>
      peopleUseDemo()
        ? demo.demoDocuments()
        : guarded(() => loadPersonDocuments(context(ctx), input.personId)),
    ),

  /** A signature request as an Inbox draft; nothing is sent. */
  requestSignature: write
    .use(draftWrites)
    .input(peopleRequestSignatureInputSchema)
    .output(peopleRequestSignatureResultSchema)
    .mutation(({ input, ctx }) =>
      peopleUseDemo()
        ? {
            draftId: demo.peopleDemoIds.draft,
            recipientPersonId: input.personId,
            signUrl: `${canonicalPublicWebOrigin()}/waivers/complete?organizationId=${ctx.actor!.organizationId}&waiverDocumentId=${input.waiverDocumentId}&subjectPersonId=${input.personId}`,
            sent: false as const,
          }
        : idempotent(ctx, "requestSignature", input, () =>
            requestWaiverSignature(context(ctx), input),
          ),
    ),

  /** Nothing is written about any person; the plan is stored for `import`. */
  importPreview: write
    .use(importWrites)
    .input(peopleImportPreviewInputSchema)
    .output(peopleImportPreviewSchema)
    .mutation(({ input, ctx }) =>
      peopleUseDemo()
        ? demo.demoImportPreview(input.rows, input.mapping, ctx.now)
        : guarded(() => previewPeopleImport(context(ctx), input)),
    ),

  import: write
    .use(importWrites)
    .input(peopleImportInputSchema)
    .output(peopleImportResultSchema)
    .mutation(({ input, ctx }) =>
      peopleUseDemo()
        ? demo.demoImportResult()
        : idempotent(ctx, "import", input, () =>
            runPeopleImport(context(ctx), input),
          ),
    ),

  mergePreview: write
    .use(mergeWrites)
    .input(peopleMergePreviewInputSchema)
    .output(peopleMergePreviewSchema)
    .mutation(({ input, ctx }) =>
      peopleUseDemo()
        ? demo.demoMergePreview(input.keepId, input.mergeId, ctx.now)
        : guarded(() => previewPeopleMerge(context(ctx), input)),
    ),

  merge: write
    .use(mergeWrites)
    .input(peopleMergeInputSchema)
    .output(peopleMergeResultSchema)
    .mutation(({ input, ctx }) =>
      peopleUseDemo()
        ? {
            mergeId: input.previewId,
            personId: demo.peopleDemoIds.maya,
            moved: demo.demoMergePreview(
              demo.peopleDemoIds.maya,
              demo.peopleDemoIds.jordan,
              ctx.now,
            ).moves,
          }
        : idempotent(ctx, "merge", input, () =>
            runPeopleMerge(context(ctx), input),
          ),
    ),

  planChangePreview: read
    .input(peopleMembershipChangeInputSchema)
    .output(peopleMembershipChangePreviewSchema)
    .query(({ input, ctx }) =>
      peopleUseDemo()
        ? demo.demoMembershipPreview(input)
        : guarded(() => previewMembershipChange(context(ctx), input)),
    ),

  changePlan: write
    .use(bulkWrites)
    .input(peopleChangeMembershipInputSchema)
    .output(peopleChangeMembershipResultSchema)
    .mutation(({ input, ctx }) => {
      if (peopleUseDemo()) {
        const preview = demo.demoMembershipPreview(input);
        return {
          membershipId: input.membershipId,
          status: "unavailable" as const,
          reason: preview.reason,
          tierId: preview.from.tierId,
          chargeNowMinor: 0,
          creditNowMinor: 0,
        };
      }
      return idempotent(ctx, "changePlan", input, () =>
        changeMembershipPlan(context(ctx), input),
      );
    }),
});
