/**
 * Router seam: training-scene-ai (owner: B6d). "Create with AI" for drill
 * scenes. Shapes are frozen in ../contracts/training-scene-ai.ts (W3-0).
 *
 * Mounted once in ../router.ts as `operator.trainingSceneAi`
 * (organizationProcedure "training:read" | "training:write").
 *
 * Every procedure returns its fixture from @duna/core/demo/training-scene-ai
 * in demo mode and throws `notImplementedYet` otherwise until B6d lands the
 * pipeline in ../services/training-scene-ai/. A coach accepts every scene;
 * nothing the model drafts is saved without that.
 */
import {
  trainingSceneAiDemo,
  trainingSceneAiDemoIds,
} from "@duna/core/demo/training-scene-ai";
import {
  trainingDrillsDemoIds,
  trainingDrillsDemoScenes,
} from "@duna/core/demo/training-drills";
import { TRPCError } from "@trpc/server";
import { organizationProcedure, router } from "../auth";
import {
  trainingSceneAiAcceptInputSchema,
  trainingSceneAiAcceptResultSchema,
  trainingSceneAiRejectInputSchema,
  trainingSceneAiRunInputSchema,
  trainingSceneAiRunSchema,
  trainingSceneAiRunsInputSchema,
  trainingSceneAiRunsSchema,
  trainingSceneAiStartInputSchema,
} from "../contracts/training-scene-ai";
import { usesDemoData } from "../services/data-source";
import { notImplementedYet } from "./not-implemented";
import { domainSeamStatus, domainSeamStatusSchema } from "./seam-status";

const DOMAIN = "training-scene-ai";
const read = organizationProcedure("training:read");
const write = organizationProcedure("training:write");
const demo = trainingSceneAiDemo;
const FINISHED = "2026-11-27T18:01:00.000Z";

function demoRun(runId: string) {
  const run = demo.runs.find((item) => item.id === runId);
  if (!run) throw new TRPCError({ code: "NOT_FOUND" });
  return run;
}

export const trainingSceneAiOperatorRouter = router({
  status: read
    .output(domainSeamStatusSchema)
    .query(() => domainSeamStatus(DOMAIN)),

  /** Start a run from the coach's description (DL-Studio). */
  start: write
    .input(trainingSceneAiStartInputSchema)
    .output(trainingSceneAiRunSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return {
          ...demoRun(trainingSceneAiDemoIds.queuedRun),
          prompt: input.prompt,
          ...(input.drillId ? { drillId: input.drillId } : {}),
        };
      }
      return notImplementedYet(DOMAIN, "start");
    }),

  /** Poll one run through queued → … → ready-for-review. */
  run: read
    .input(trainingSceneAiRunInputSchema)
    .output(trainingSceneAiRunSchema)
    .query(({ input }) => {
      if (usesDemoData()) return demoRun(input.runId);
      return notImplementedYet(DOMAIN, "run");
    }),

  runs: read
    .input(trainingSceneAiRunsInputSchema)
    .output(trainingSceneAiRunsSchema)
    .query(({ input }) => {
      if (usesDemoData()) {
        return {
          items: demo.runs.filter(
            (run) =>
              !input.drillId ||
              ("drillId" in run && run.drillId === input.drillId),
          ),
        };
      }
      return notImplementedYet(DOMAIN, "runs");
    }),

  /** ready-for-review → accepted: saves the scene as a new drill version. */
  accept: write
    .input(trainingSceneAiAcceptInputSchema)
    .output(trainingSceneAiAcceptResultSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        const run = demoRun(input.runId);
        if (run.status !== "ready-for-review") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Only a scene ready for review can be accepted.",
          });
        }
        const accepted = demoRun(trainingSceneAiDemoIds.acceptedRun);
        return {
          run: {
            ...run,
            status: "accepted" as const,
            finishedAt: FINISHED,
            resultSceneId: accepted.resultSceneId!,
          },
          drillId: trainingDrillsDemoIds.personalDrill,
          drillVersionId: trainingDrillsDemoScenes[1]!.drillVersionId,
          sceneId: accepted.resultSceneId!,
        };
      }
      return notImplementedYet(DOMAIN, "accept");
    }),

  /** ready-for-review → rejected. */
  reject: write
    .input(trainingSceneAiRejectInputSchema)
    .output(trainingSceneAiRunSchema)
    .mutation(({ input }) => {
      if (usesDemoData()) {
        return {
          ...demoRun(input.runId),
          status: "rejected" as const,
          finishedAt: FINISHED,
        };
      }
      return notImplementedYet(DOMAIN, "reject");
    }),
});
