import {
  getDatabase,
  isDatabaseConfigured,
  webhookEvents,
  workflowJobs,
} from "@duna/db";
import { and, asc, eq, lte, or, sql } from "drizzle-orm";

export type WorkflowStatus =
  "queued" | "running" | "retry" | "succeeded" | "failed";

export interface WorkflowJobResult {
  readonly id: string;
  readonly kind: string;
  readonly status: WorkflowStatus;
  readonly attempts: number;
  readonly completedAt?: string;
}

export function retryDelayMilliseconds(attempt: number): number {
  if (!Number.isSafeInteger(attempt) || attempt < 1) {
    throw new Error("Workflow attempt must be a positive integer");
  }
  return Math.min(15 * 60_000, 5_000 * 2 ** Math.min(attempt - 1, 12));
}

function workflowStatus(value: string): WorkflowStatus {
  if (
    value === "queued" ||
    value === "running" ||
    value === "retry" ||
    value === "succeeded" ||
    value === "failed"
  ) {
    return value;
  }
  throw new Error(`Invalid workflow status: ${value}`);
}

function stringField(
  value: Readonly<Record<string, unknown>>,
  key: string,
): string {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    throw new Error(`Workflow payload is missing ${key}`);
  }
  return field;
}

async function processStripeWorkflow(
  payload: Readonly<Record<string, unknown>>,
): Promise<void> {
  const webhookEventId = stringField(payload, "webhookEventId");
  const database = getDatabase();
  const webhook = await database.query.webhookEvents.findFirst({
    where: eq(webhookEvents.id, webhookEventId),
  });
  if (!webhook) throw new Error("Persisted Stripe webhook was not found");

  // Domain projection handlers are intentionally isolated from webhook ingress.
  // Each event is retained in full so projection logic can be replayed after
  // adding or correcting a handler without asking Stripe to resend the event.
  await database
    .update(webhookEvents)
    .set({
      status: "processed",
      attempts: sql`${webhookEvents.attempts} + 1`,
      processedAt: new Date(),
      error: null,
    })
    .where(eq(webhookEvents.id, webhook.id));
}

async function claimWorkflowJob(
  id: string,
  now: Date,
): Promise<
  | {
      readonly id: string;
      readonly kind: string;
      readonly payload: Readonly<Record<string, unknown>>;
      readonly attempts: number;
      readonly maximumAttempts: number;
      readonly lockToken: string;
    }
  | undefined
> {
  const database = getDatabase();
  const lockToken = crypto.randomUUID();
  const [claimed] = await database
    .update(workflowJobs)
    .set({
      status: "running",
      attempts: sql`${workflowJobs.attempts} + 1`,
      lockedAt: now,
      lockToken,
      updatedAt: now,
    })
    .where(
      and(
        eq(workflowJobs.id, id),
        or(
          eq(workflowJobs.status, "queued"),
          and(
            eq(workflowJobs.status, "retry"),
            lte(workflowJobs.availableAt, now),
          ),
        ),
      ),
    )
    .returning({
      id: workflowJobs.id,
      kind: workflowJobs.kind,
      payload: workflowJobs.payload,
      attempts: workflowJobs.attempts,
      maximumAttempts: workflowJobs.maximumAttempts,
      lockToken: workflowJobs.lockToken,
    });
  if (!claimed?.lockToken) return undefined;
  return { ...claimed, lockToken: claimed.lockToken };
}

export async function processWorkflowJobById(
  id: string,
  now = new Date(),
): Promise<WorkflowJobResult | undefined> {
  if (!isDatabaseConfigured()) return undefined;
  const database = getDatabase();
  const claimed = await claimWorkflowJob(id, now);
  if (!claimed) {
    const existing = await database.query.workflowJobs.findFirst({
      where: eq(workflowJobs.id, id),
    });
    if (!existing) return undefined;
    return {
      id: existing.id,
      kind: existing.kind,
      status: workflowStatus(existing.status),
      attempts: existing.attempts,
      completedAt: existing.completedAt?.toISOString(),
    };
  }

  try {
    if (claimed.kind.startsWith("stripe.")) {
      await processStripeWorkflow(claimed.payload);
    } else {
      throw new Error(`No workflow handler is registered for ${claimed.kind}`);
    }
    const completedAt = new Date();
    await database
      .update(workflowJobs)
      .set({
        status: "succeeded",
        completedAt,
        lockedAt: null,
        lockToken: null,
        lastError: null,
        updatedAt: completedAt,
      })
      .where(
        and(
          eq(workflowJobs.id, claimed.id),
          eq(workflowJobs.lockToken, claimed.lockToken),
          eq(workflowJobs.status, "running"),
        ),
      );
    return {
      id: claimed.id,
      kind: claimed.kind,
      status: "succeeded",
      attempts: claimed.attempts,
      completedAt: completedAt.toISOString(),
    };
  } catch (error) {
    const terminal = claimed.attempts >= claimed.maximumAttempts;
    const message =
      error instanceof Error ? error.message : "Unknown workflow failure";
    await database
      .update(workflowJobs)
      .set({
        status: terminal ? "failed" : "retry",
        availableAt: terminal
          ? now
          : new Date(now.getTime() + retryDelayMilliseconds(claimed.attempts)),
        lockedAt: null,
        lockToken: null,
        lastError: message,
        updatedAt: now,
      })
      .where(
        and(
          eq(workflowJobs.id, claimed.id),
          eq(workflowJobs.lockToken, claimed.lockToken),
          eq(workflowJobs.status, "running"),
        ),
      );
    throw error;
  }
}

export async function recoverReadyWorkflowJobs(input?: {
  readonly limit?: number;
  readonly now?: Date;
}): Promise<readonly WorkflowJobResult[]> {
  if (!isDatabaseConfigured()) return [];
  const database = getDatabase();
  const now = input?.now ?? new Date();
  const candidates = await database
    .select({ id: workflowJobs.id })
    .from(workflowJobs)
    .where(
      and(
        or(
          eq(workflowJobs.status, "queued"),
          and(
            eq(workflowJobs.status, "retry"),
            lte(workflowJobs.availableAt, now),
          ),
        ),
      ),
    )
    .orderBy(asc(workflowJobs.availableAt), asc(workflowJobs.createdAt))
    .limit(Math.min(100, Math.max(1, input?.limit ?? 25)));
  const settled = await Promise.allSettled(
    candidates.map(({ id }) => processWorkflowJobById(id, now)),
  );
  return settled.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : [],
  );
}
