"use server";

import {
  createTrainingPracticePlanInputSchema,
  draftTrainingDrillInputSchema,
  draftTrainingProgramInputSchema,
  recordTrainingOutcomeInputSchema,
  trainingDrillSchema,
  trainingProgramDraftSchema,
  type DraftTrainingDrillInput,
  type DraftTrainingProgramInput,
  type RecordTrainingOutcomeInput,
  type TrainingDrill,
  type TrainingPracticePlan,
  type TrainingProgramDraft,
} from "@duna/api";
import { revalidatePath } from "next/cache";
import { getServerCaller } from "@/lib/api";

export type TrainingStudioResult<T> =
  | { readonly status: "success"; readonly message: string; readonly value: T }
  | { readonly status: "error"; readonly message: string };

function message(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Duna could not complete that training action.";
}

export async function generateTrainingDrillAction(
  input: DraftTrainingDrillInput,
): Promise<TrainingStudioResult<TrainingDrill>> {
  try {
    const parsed = draftTrainingDrillInputSchema.parse(input);
    const caller = await getServerCaller();
    const draft = trainingDrillSchema.parse(
      await caller.operator.draftTrainingDrill(parsed),
    );
    return {
      status: "success",
      message:
        "Draft created. Review the court flow, scoring, estimates, and coaching language before saving.",
      value: draft,
    };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

export async function saveTrainingDrillAction(
  draft: TrainingDrill,
): Promise<
  TrainingStudioResult<{ readonly id: string; readonly status: string }>
> {
  try {
    const parsed = trainingDrillSchema.parse(draft);
    const caller = await getServerCaller();
    const saved = await caller.operator.createTrainingDrill({
      draft: {
        title: parsed.title,
        slug: parsed.slug,
        status: parsed.status,
        visibility: parsed.visibility,
        activityKind: parsed.activityKind,
        discipline: parsed.discipline,
        skillLevel: parsed.skillLevel,
        mode: parsed.mode,
        purpose: parsed.purpose,
        targetAudience: parsed.targetAudience,
        summary: parsed.summary,
        descriptionMarkdown: parsed.descriptionMarkdown,
        minPlayers: parsed.minPlayers,
        maxPlayers: parsed.maxPlayers,
        recommendedPlayers: parsed.recommendedPlayers,
        durationMinutes: parsed.durationMinutes,
        intensity: parsed.intensity,
        ballCount: parsed.ballCount,
        equipment: parsed.equipment,
        focusArea: parsed.focusArea,
        tags: parsed.tags,
        steps: parsed.steps,
        coachingCues: parsed.coachingCues,
        safety: parsed.safety,
        variations: parsed.variations,
        scoring: parsed.scoring,
        estimate: parsed.estimate,
        scene: parsed.scene,
        source: parsed.source,
        animation: parsed.animation,
      },
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/training");
    return {
      status: "success",
      message:
        saved.status === "review"
          ? "Drill saved and submitted for shared-library review."
          : "Private organization drill saved.",
      value: { id: saved.id, status: saved.status },
    };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

export async function generateTrainingProgramAction(
  input: DraftTrainingProgramInput,
): Promise<TrainingStudioResult<TrainingProgramDraft>> {
  try {
    const parsed = draftTrainingProgramInputSchema.parse(input);
    const caller = await getServerCaller();
    const draft = trainingProgramDraftSchema.parse(
      await caller.operator.draftTrainingProgram(parsed),
    );
    return {
      status: "success",
      message: `${draft.scheduledSessionCount} practices placed with competition and travel context. Review before saving.`,
      value: draft,
    };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

export async function saveTrainingProgramAction(input: {
  readonly brief: DraftTrainingProgramInput;
  readonly draft: TrainingProgramDraft;
  readonly catalogItemId?: string;
}): Promise<
  TrainingStudioResult<{ readonly id: string; readonly sessionCount: number }>
> {
  try {
    const brief = draftTrainingProgramInputSchema.parse(input.brief);
    const draft = trainingProgramDraftSchema.parse(input.draft);
    const caller = await getServerCaller();
    const saved = await caller.operator.createTrainingProgram({
      brief,
      draft,
      catalogItemId: input.catalogItemId,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/training");
    return {
      status: "success",
      message: `Program saved as a private draft with ${saved.sessionCount} practices.`,
      value: { id: saved.id, sessionCount: saved.sessionCount },
    };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

export async function saveTrainingPracticePlanAction(
  plan: Omit<
    TrainingPracticePlan,
    | "id"
    | "versionId"
    | "version"
    | "updatedAt"
    | "totalTouchesTypical"
    | "totalJumpsTypical"
    | "blocks"
  > & {
    readonly blocks: readonly Omit<
      TrainingPracticePlan["blocks"][number],
      "id"
    >[];
  },
): Promise<
  TrainingStudioResult<{ readonly id: string; readonly versionId: string }>
> {
  try {
    const parsed = createTrainingPracticePlanInputSchema.parse({
      plan,
      idempotencyKey: crypto.randomUUID(),
    });
    const caller = await getServerCaller();
    const saved = await caller.operator.createTrainingPracticePlan(parsed);
    revalidatePath("/training");
    return {
      status: "success",
      message: "Practice plan saved as a private, versioned draft.",
      value: { id: saved.id, versionId: saved.versionId },
    };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

export async function recordTrainingOutcomeAction(
  input: Omit<RecordTrainingOutcomeInput, "idempotencyKey">,
): Promise<TrainingStudioResult<{ readonly id: string }>> {
  try {
    const parsed = recordTrainingOutcomeInputSchema.parse({
      ...input,
      idempotencyKey: crypto.randomUUID(),
    });
    const caller = await getServerCaller();
    const saved = await caller.operator.recordTrainingOutcome(parsed);
    revalidatePath("/training");
    return {
      status: "success",
      message:
        "Practice completed. Actual load, modifications, and athlete check-ins are now separated from the original plan.",
      value: { id: saved.id },
    };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}
