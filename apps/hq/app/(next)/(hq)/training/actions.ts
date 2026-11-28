"use server";

import type {
  trainingDrillsFiltersSchema,
  trainingDrillsPurchaseInputSchema,
  trainingDrillsSaveListingInputSchema,
  trainingDrillsSaveVersionInputSchema,
  trainingProgramsAddSessionInputSchema,
  trainingProgramsAssignCoachesInputSchema,
  trainingProgramsCreateInputSchema,
  trainingProgramsProposePracticePlanInputSchema,
  trainingProgramsRecordOutcomeInputSchema,
  trainingProgramsResolveConflictInputSchema,
  trainingProgramsSavePracticePlanInputSchema,
  trainingProgramsSetSessionPlanInputSchema,
  trainingProgramsUpdateInputSchema,
} from "@duna/api";
import { deriveTrainingSceneEstimates } from "@duna/core/training-scene";
import { log } from "@duna/observability";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import type { MoneyActionResult } from "@/components/money/money-action-result";
import { isNotConfigured } from "@/components/training/training-data";
import { getServerCaller, getServerContext } from "@/lib/api";
import { isPermissionDenied } from "@/lib/permission-denied";

/**
 * Training's changes (H-TRAIN). Each is a person's confirmed action on a
 * Training screen and answers a result instead of throwing, so the screen
 * says what happened with the reference support needs. Creates and saves
 * carry the idempotency key the confirming control made (reused on retry).
 * Nothing here sends a message to athletes or parents, and nothing moves
 * money: a paid drill purchase stays pending (there is no checkout yet).
 */
type Result<T> = MoneyActionResult<T>;

function codeOf(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : undefined;
}

const plainCodes = new Set([
  "BAD_REQUEST",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "NOT_FOUND",
  "TOO_MANY_REQUESTS",
]);

const notConfiguredWords: Record<string, string> = {
  saveListing:
    "Paid listings aren't set up yet: Duna hasn't set its store fee. Nothing was listed. A free listing works today.",
  purchase: "The drill store isn't available right now. Nothing was bought.",
};

async function run<T>(
  action: string,
  perform: () => Promise<T>,
  { revalidate = true }: { readonly revalidate?: boolean } = {},
): Promise<Result<T>> {
  const { requestId } = await getServerContext();
  try {
    const data = await perform();
    if (revalidate) revalidatePath("/training", "layout");
    log.info("hq.training.action_succeeded", { action });
    return { ok: true, data };
  } catch (error) {
    const code = codeOf(error);
    if (isPermissionDenied(error)) {
      log.info("hq.training.action_denied", { action });
      return {
        ok: false,
        code: "denied",
        message:
          "You don't have permission to do this here. Nothing was changed.",
        reference: requestId,
      };
    }
    if (isNotConfigured(error)) {
      log.info("hq.training.action_not_configured", { action });
      return {
        ok: false,
        code: "not-configured",
        message:
          notConfiguredWords[action] ??
          "This isn't configured yet in this environment (it needs Duna Database). Nothing was changed.",
        reference: requestId,
      };
    }
    log.warn("hq.training.action_failed", { action, code: code ?? "unknown" });
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

const uuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : crypto.randomUUID();

/* -------------------------------------------------------------- programs */

/** Reads the sentence into a draft. Saves nothing. */
export async function proposeProgramAction(sentence: string) {
  return run(
    "proposeFromSentence",
    async () => {
      const caller = await getServerCaller();
      return caller.operator.trainingPrograms.proposeFromSentence({ sentence });
    },
    { revalidate: false },
  );
}

export async function createProgramAction(
  input: z.input<typeof trainingProgramsCreateInputSchema>,
) {
  return run("createProgram", async () => {
    const caller = await getServerCaller();
    return caller.operator.trainingPrograms.create({
      ...input,
      idempotencyKey: uuid(input.idempotencyKey),
    });
  });
}

export async function updateProgramAction(
  input: z.input<typeof trainingProgramsUpdateInputSchema>,
) {
  return run("updateProgram", async () => {
    const caller = await getServerCaller();
    return caller.operator.trainingPrograms.update(input);
  });
}

export async function activateProgramAction(programId: string) {
  return run("activateProgram", async () => {
    const caller = await getServerCaller();
    return caller.operator.trainingPrograms.activate({ programId });
  });
}

export async function cancelProgramAction(input: {
  readonly programId: string;
  readonly reason: string;
}) {
  return run("cancelProgram", async () => {
    const caller = await getServerCaller();
    // Athletes are told only through a message a person reviews and sends.
    return caller.operator.trainingPrograms.cancel({
      ...input,
      notifyAthletes: false,
    });
  });
}

/* -------------------------------------------------------------- sessions */

export async function addSessionAction(
  input: z.input<typeof trainingProgramsAddSessionInputSchema>,
) {
  return run("addSession", async () => {
    const caller = await getServerCaller();
    return caller.operator.trainingPrograms.addSession({
      ...input,
      idempotencyKey: uuid(input.idempotencyKey),
    });
  });
}

export async function cancelSessionAction(input: {
  readonly sessionId: string;
  readonly reason: string;
}) {
  return run("cancelSession", async () => {
    const caller = await getServerCaller();
    return caller.operator.trainingPrograms.cancelSession({
      ...input,
      notifyAthletes: false,
    });
  });
}

export async function assignCoachesAction(
  input: z.input<typeof trainingProgramsAssignCoachesInputSchema>,
) {
  return run("assignSessionCoaches", async () => {
    const caller = await getServerCaller();
    return caller.operator.trainingPrograms.assignSessionCoaches(input);
  });
}

export async function setSessionPlanAction(
  input: z.input<typeof trainingProgramsSetSessionPlanInputSchema>,
) {
  return run("setSessionPlan", async () => {
    const caller = await getServerCaller();
    return caller.operator.trainingPrograms.setSessionPlan(input);
  });
}

/** Attaches a plan's current version to a practice (the session keeps that version). */
export async function attachPlanAction(input: {
  readonly sessionId: string;
  readonly practicePlanId: string;
}) {
  return run("attachPlan", async () => {
    const caller = await getServerCaller();
    const plan = await caller.operator.trainingPrograms.practicePlan({
      practicePlanId: input.practicePlanId,
    });
    return caller.operator.trainingPrograms.setSessionPlan({
      sessionId: input.sessionId,
      plan: { mode: "plan", practicePlanVersionId: plan.versionId },
    });
  });
}

export async function resolveConflictAction(
  input: z.input<typeof trainingProgramsResolveConflictInputSchema>,
) {
  return run("resolveConflict", async () => {
    const caller = await getServerCaller();
    return caller.operator.trainingPrograms.resolveConflict(input);
  });
}

export async function recordOutcomeAction(
  input: z.input<typeof trainingProgramsRecordOutcomeInputSchema>,
) {
  return run("recordSessionOutcome", async () => {
    const caller = await getServerCaller();
    return caller.operator.trainingPrograms.recordSessionOutcome(input);
  });
}

/* --------------------------------------------------------- practice plans */

export async function savePlanAction(
  input: z.input<typeof trainingProgramsSavePracticePlanInputSchema>,
) {
  return run("savePracticePlan", async () => {
    const caller = await getServerCaller();
    return caller.operator.trainingPrograms.savePracticePlan({
      ...input,
      idempotencyKey: uuid(input.idempotencyKey),
    });
  });
}

/** Duna's first draft of a practice. Nothing is saved. */
export async function proposePlanAction(
  input: z.input<typeof trainingProgramsProposePracticePlanInputSchema>,
) {
  return run(
    "proposePracticePlan",
    async () => {
      const caller = await getServerCaller();
      return caller.operator.trainingPrograms.proposePracticePlan(input);
    },
    { revalidate: false },
  );
}

/** A drill's current version and its drawing's estimates, to pin it in a plan. */
export async function drillForPlanAction(drillId: string) {
  return run(
    "drillForPlan",
    async () => {
      const caller = await getServerCaller();
      const drill = await caller.operator.trainingDrills.drill({ drillId });
      const perRep = drill.scene
        ? deriveTrainingSceneEstimates(drill.scene.document)
        : {};
      return {
        id: drill.id,
        title: drill.title,
        focus: drill.focus,
        durationMinutes: drill.durationMinutes,
        load: drill.load,
        touches: drill.touches,
        jumps: drill.jumps,
        version: drill.version,
        currentVersionId: drill.currentVersionId,
        ...(perRep.touchesPerRep !== undefined
          ? {
              perRep: {
                touches: perRep.touchesPerRep,
                jumps: perRep.jumpsPerRep ?? 0,
              },
            }
          : {}),
      };
    },
    { revalidate: false },
  );
}

/* ----------------------------------------------------------------- drills */

export async function searchLibraryAction(
  input: z.input<typeof trainingDrillsFiltersSchema> & {
    readonly scope: "personal" | "club" | "duna" | "purchased" | "store";
  },
) {
  return run(
    "searchLibrary",
    async () => {
      const caller = await getServerCaller();
      const { scope, ...filters } = input;
      if (scope === "store") {
        const store = await caller.operator.trainingDrills.store(filters);
        return { kind: "store" as const, ...store };
      }
      const library = await caller.operator.trainingDrills.library({
        scope,
        ...filters,
      });
      return { kind: "library" as const, ...library };
    },
    { revalidate: false },
  );
}

export async function saveDrillAction(
  input: z.input<typeof trainingDrillsSaveVersionInputSchema>,
) {
  return run("saveDrillVersion", async () => {
    const caller = await getServerCaller();
    return caller.operator.trainingDrills.saveVersion({
      ...input,
      idempotencyKey: uuid(input.idempotencyKey),
    });
  });
}

export async function setDrillScopeAction(input: {
  readonly drillId: string;
  readonly scope: "personal" | "club";
}) {
  return run("setDrillScope", async () => {
    const caller = await getServerCaller();
    return caller.operator.trainingDrills.setScope(input);
  });
}

export async function submitDrillAction(input: {
  readonly drillId: string;
  readonly drillVersionId: string;
}) {
  return run("submitForReview", async () => {
    const caller = await getServerCaller();
    return caller.operator.trainingDrills.submitForReview(input);
  });
}

export async function saveListingAction(
  input: z.input<typeof trainingDrillsSaveListingInputSchema>,
) {
  return run("saveListing", async () => {
    const caller = await getServerCaller();
    return caller.operator.trainingDrills.saveListing(input);
  });
}

export async function delistAction(listingId: string) {
  return run("delist", async () => {
    const caller = await getServerCaller();
    return caller.operator.trainingDrills.delist({ listingId });
  });
}

export async function purchaseAction(
  input: z.input<typeof trainingDrillsPurchaseInputSchema>,
) {
  return run("purchase", async () => {
    const caller = await getServerCaller();
    return caller.operator.trainingDrills.purchase({
      ...input,
      idempotencyKey: uuid(input.idempotencyKey),
    });
  });
}
