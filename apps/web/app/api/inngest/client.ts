import { processWorkflowJobById, recoverReadyWorkflowJobs } from "@duna/api";
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

export const dunaInngestFunctions = [
  processWorkflowJob,
  recoverWorkflowJobs,
] as const;
