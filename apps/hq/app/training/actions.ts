"use server";

import {
  archiveTrainingPracticePlanInputSchema,
  archiveTrainingProgramInputSchema,
  createTrainingPracticePlanInputSchema,
  draftTrainingDrillInputSchema,
  draftTrainingProgramInputSchema,
  recordTrainingOutcomeInputSchema,
  restoreTrainingPracticePlanArchiveInputSchema,
  restoreTrainingPracticePlanVersionInputSchema,
  restoreTrainingProgramArchiveInputSchema,
  restoreTrainingProgramVersionInputSchema,
  trainingDrillSchema,
  trainingProgramDraftSchema,
  updateTrainingProgramEventInputSchema,
  updateTrainingPracticePlanInputSchema,
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
  if (error instanceof Error && error.message.trim()) {
    // Database drivers include full SQL and parameters in their error message.
    // That is useful in logs, but it is neither safe nor useful coaching UI.
    if (/failed query:|\b(insert|update|delete) into\b/i.test(error.message)) {
      return "Duna could not save that change. Your existing program is still safe—refresh Training and try again.";
    }
    return error.message;
  }
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
  readonly idempotencyKey: string;
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
      idempotencyKey: input.idempotencyKey,
    });
    revalidatePath("/training");
    revalidatePath(`/training/programs/${saved.id}`);
    return {
      status: "success",
      message: `Program saved as a private draft with ${saved.sessionCount} practices.`,
      value: { id: saved.id, sessionCount: saved.sessionCount },
    };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

export async function updateTrainingProgramEventAction(input: {
  readonly trainingEventId: string;
  readonly localDate: string;
  readonly startsAt: string;
  readonly durationMinutes: number;
  readonly title: string;
  readonly plannedLoad: number;
  readonly focusArea?: string;
  readonly idempotencyKey: string;
}): Promise<
  TrainingStudioResult<{ readonly id: string; readonly programId: string }>
> {
  try {
    const parsed = updateTrainingProgramEventInputSchema.parse(input);
    const caller = await getServerCaller();
    const saved = await caller.operator.updateTrainingProgramEvent(parsed);
    revalidatePath("/training");
    revalidatePath(`/training/programs/${saved.programId}`);
    return {
      status: "success",
      message: "Program calendar updated.",
      value: saved,
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
    readonly practicePlanId?: string;
    readonly changeNote?: string;
  },
): Promise<
  TrainingStudioResult<{ readonly id: string; readonly versionId: string }>
> {
  try {
    const { changeNote, practicePlanId, ...editorPlan } = plan;
    const caller = await getServerCaller();
    const saved = practicePlanId
      ? await caller.operator.updateTrainingPracticePlan(
          updateTrainingPracticePlanInputSchema.parse({
            practicePlanId,
            plan: editorPlan,
            ...(changeNote ? { changeNote } : {}),
            idempotencyKey: crypto.randomUUID(),
          }),
        )
      : await caller.operator.createTrainingPracticePlan(
          createTrainingPracticePlanInputSchema.parse({
            plan: editorPlan,
            idempotencyKey: crypto.randomUUID(),
          }),
        );
    revalidatePath("/training");
    revalidatePath(`/training/practice-plans/${saved.id}`);
    return {
      status: "success",
      message: practicePlanId
        ? "New practice-plan version saved. The prior version is still recoverable."
        : "Practice plan saved as a private, versioned draft.",
      value: { id: saved.id, versionId: saved.versionId },
    };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

export async function archiveTrainingProgramAction(
  programId: string,
): Promise<TrainingStudioResult<{ readonly id: string }>> {
  try {
    const parsed = archiveTrainingProgramInputSchema.parse({
      programId,
      idempotencyKey: crypto.randomUUID(),
    });
    const caller = await getServerCaller();
    const saved = await caller.operator.archiveTrainingProgram(parsed);
    revalidatePath("/training");
    revalidatePath(`/training/programs/${saved.id}`);
    return {
      status: "success",
      message:
        "Program archived. Its schedule, completed sessions, and commercial offer are still preserved.",
      value: { id: saved.id },
    };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

export async function restoreTrainingProgramArchiveAction(
  programId: string,
): Promise<TrainingStudioResult<{ readonly id: string }>> {
  try {
    const parsed = restoreTrainingProgramArchiveInputSchema.parse({
      programId,
      idempotencyKey: crypto.randomUUID(),
    });
    const caller = await getServerCaller();
    const saved = await caller.operator.restoreTrainingProgramArchive(parsed);
    revalidatePath("/training");
    revalidatePath(`/training/programs/${saved.id}`);
    return {
      status: "success",
      message: "Program restored as a private draft.",
      value: { id: saved.id },
    };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

export async function restoreTrainingProgramVersionAction(input: {
  readonly programId: string;
  readonly versionId: string;
}): Promise<
  TrainingStudioResult<{ readonly id: string; readonly versionId: string }>
> {
  try {
    const parsed = restoreTrainingProgramVersionInputSchema.parse({
      ...input,
      idempotencyKey: crypto.randomUUID(),
    });
    const caller = await getServerCaller();
    const saved = await caller.operator.restoreTrainingProgramVersion(parsed);
    revalidatePath("/training");
    revalidatePath(`/training/programs/${saved.id}`);
    return {
      status: "success",
      message:
        "Earlier program version restored as the new current version. Completed sessions stayed intact.",
      value: saved,
    };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

export async function archiveTrainingPracticePlanAction(
  practicePlanId: string,
): Promise<TrainingStudioResult<{ readonly id: string }>> {
  try {
    const parsed = archiveTrainingPracticePlanInputSchema.parse({
      practicePlanId,
      idempotencyKey: crypto.randomUUID(),
    });
    const caller = await getServerCaller();
    const saved = await caller.operator.archiveTrainingPracticePlan(parsed);
    revalidatePath("/training");
    revalidatePath(`/training/practice-plans/${saved.id}`);
    return {
      status: "success",
      message:
        "Practice plan archived. Existing assigned sessions still retain their exact version.",
      value: { id: saved.id },
    };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

export async function restoreTrainingPracticePlanArchiveAction(
  practicePlanId: string,
): Promise<TrainingStudioResult<{ readonly id: string }>> {
  try {
    const parsed = restoreTrainingPracticePlanArchiveInputSchema.parse({
      practicePlanId,
      idempotencyKey: crypto.randomUUID(),
    });
    const caller = await getServerCaller();
    const saved =
      await caller.operator.restoreTrainingPracticePlanArchive(parsed);
    revalidatePath("/training");
    revalidatePath(`/training/practice-plans/${saved.id}`);
    return {
      status: "success",
      message: "Practice plan restored as a private draft.",
      value: { id: saved.id },
    };
  } catch (error) {
    return { status: "error", message: message(error) };
  }
}

export async function restoreTrainingPracticePlanVersionAction(input: {
  readonly practicePlanId: string;
  readonly versionId: string;
}): Promise<
  TrainingStudioResult<{ readonly id: string; readonly versionId: string }>
> {
  try {
    const parsed = restoreTrainingPracticePlanVersionInputSchema.parse({
      ...input,
      idempotencyKey: crypto.randomUUID(),
    });
    const caller = await getServerCaller();
    const saved =
      await caller.operator.restoreTrainingPracticePlanVersion(parsed);
    revalidatePath("/training");
    revalidatePath(`/training/practice-plans/${saved.id}`);
    return {
      status: "success",
      message:
        "Earlier practice-plan version restored as a new current version. Assigned sessions stayed untouched.",
      value: saved,
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
