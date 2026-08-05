import {
  grantDueMonthlyPredictionCredits,
  processWorkflowJobById,
  queueDuePlayerSourceRefreshes,
  recoverReadyWorkflowJobs,
  settleResolvedPredictionMarkets,
} from "@duna/api";
import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "duna-platform" });

export const processWorkflowJob = inngest.createFunction(
  {
    id: "process-workflow-job",
    name: "Process durable Duna workflow",
    triggers: [{ event: "duna/workflow.enqueued" }],
    retries: 4,
  },
  async ({ event, step }) => {
    const jobId = event.data?.jobId;
    if (typeof jobId !== "string" || jobId.length === 0) {
      throw new Error("Workflow event is missing jobId");
    }
    return step.run("claim-and-process", () => processWorkflowJobById(jobId));
  },
);

export const recoverWorkflowJobs = inngest.createFunction(
  {
    id: "recover-workflow-jobs",
    name: "Recover queued and retryable Duna workflows",
    triggers: [{ cron: "*/1 * * * *" }],
    retries: 2,
  },
  async ({ step }) =>
    step.run("recover-ready-jobs", () =>
      recoverReadyWorkflowJobs({ limit: 50 }),
    ),
);

export const refreshPlayerSources = inngest.createFunction(
  {
    id: "refresh-player-sources",
    name: "Refresh linked player source profiles",
    triggers: [{ cron: "15 */6 * * *" }],
    retries: 2,
  },
  async ({ step }) => {
    const queued = await step.run("queue-due-player-sources", () =>
      queueDuePlayerSourceRefreshes({ limit: 25 }),
    );
    if (queued.queued > 0) {
      await step.run("process-player-source-refreshes", () =>
        recoverReadyWorkflowJobs({ limit: queued.queued }),
      );
    }
    return queued;
  },
);

export const grantPredictionCredits = inngest.createFunction(
  {
    id: "grant-monthly-prediction-credits",
    name: "Grant monthly non-cash prediction credits",
    triggers: [{ cron: "17 4 * * *" }],
    retries: 3,
  },
  async ({ step }) =>
    step.run("grant-due-prediction-credits", () =>
      grantDueMonthlyPredictionCredits({ limit: 2_000 }),
    ),
);

export const settlePredictionMarkets = inngest.createFunction(
  {
    id: "settle-resolved-prediction-markets",
    name: "Settle resolved Duna prediction markets",
    triggers: [{ cron: "*/2 * * * *" }],
    retries: 3,
  },
  async ({ step }) =>
    step.run("settle-resolved-markets", () =>
      settleResolvedPredictionMarkets({ limit: 1_000 }),
    ),
);

export const dunaInngestFunctions = [
  processWorkflowJob,
  recoverWorkflowJobs,
  refreshPlayerSources,
  grantPredictionCredits,
  settlePredictionMarkets,
] as const;
