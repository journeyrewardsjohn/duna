import { loadEnvFile } from "node:process";
import { and, eq, inArray } from "drizzle-orm";
import type Stripe from "stripe";
import {
  agentDrafts,
  auditLog,
  getDatabase,
  idempotencyRecords,
  pickupSessions,
  rateLimitBuckets,
  webhookEvents,
  workflowJobs,
} from "../packages/db/src";
import {
  createApiContext,
  createCaller,
  createDemoActor,
  consumeRateLimit,
  processStripeWebhook,
  processWorkflowJobById,
} from "../packages/api/src";

try {
  loadEnvFile(".env.local");
} catch {
  // CI and deployment checks may provide configuration through the environment.
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const database = getDatabase();
  const idempotencyKey = crypto.randomUUID();
  const proposalKey = crypto.randomUUID();
  const confirmationKey = crypto.randomUUID();
  const webhookEventId = `evt_duna_repository_${crypto.randomUUID()}`;
  const requestId = crypto.randomUUID();
  const title = `Repository verification ${idempotencyKey}`;
  const actor = createDemoActor(["player", "manager"]);
  const liveRateLimitKey = `repository-verification:${crypto.randomUUID()}`;
  const rateLimitKeys = [
    "public:anonymous",
    `authenticated:${actor.personId}`,
    `organization:${actor.organizationId}`,
    `pickup-create:${actor.personId}`,
    `message-proposal:${actor.personId}`,
    `agent-confirmation:${actor.personId}`,
    liveRateLimitKey,
  ];
  const caller = createCaller(
    createApiContext({
      actor,
      requestId,
      now: new Date("2026-07-30T20:00:00.000Z"),
    }),
  );
  let createdPickupIds: string[] = [];
  let createdDraftIds: string[] = [];
  let createdWorkflowJobIds: string[] = [];

  try {
    const [events, venues, profile, wallet, operator] = await Promise.all([
      caller.public.events(),
      caller.public.venues(),
      caller.public.playerProfile({ handle: "maralewis" }),
      caller.player.wallet(),
      caller.operator.dashboard(),
    ]);
    assert(events.length > 0, "No connected events were returned");
    assert(venues.length > 0, "No connected venues were returned");
    assert(profile.id === actor.personId, "Connected profile did not resolve");
    assert(wallet.entries.length > 0, "Connected wallet ledger was empty");
    assert(
      operator.organization.id === actor.organizationId,
      "Operator organization scope was not enforced",
    );

    const input = {
      title,
      startsAt: "2030-08-01T22:00:00.000Z",
      endsAt: "2030-08-02T00:00:00.000Z",
      venueName: "Repository verification beach",
      capacity: 12,
      ratingMinimum: 3.5,
      ratingMaximum: 5,
      idempotencyKey,
    };
    const first = await caller.player.createPickup(input);
    const replay = await caller.player.createPickup(input);
    assert(first.id === replay.id, "Idempotent replay returned a new pickup");

    const created = await database
      .select({ id: pickupSessions.id })
      .from(pickupSessions)
      .where(eq(pickupSessions.title, title));
    createdPickupIds = created.map((row) => row.id);
    assert(
      createdPickupIds.length === 1,
      `Expected one persisted pickup, found ${createdPickupIds.length}`,
    );

    const proposedMessage = await caller.operator.proposeMessage({
      recipientCount: 2,
      segment: "Repository verification",
      channel: "email",
      subject: "Verification only",
      body: "This draft is never sent.",
      idempotencyKey: proposalKey,
    });
    createdDraftIds = [proposedMessage.id];
    assert(
      proposedMessage.confirmationNonce,
      "Confirm-always draft did not issue a fresh nonce",
    );
    const confirmedMessage = await caller.agent.confirmAction({
      draftId: proposedMessage.id,
      confirmationNonce: proposedMessage.confirmationNonce,
      idempotencyKey: confirmationKey,
    });
    const confirmedReplay = await caller.agent.confirmAction({
      draftId: proposedMessage.id,
      confirmationNonce: proposedMessage.confirmationNonce,
      idempotencyKey: confirmationKey,
    });
    assert(
      confirmedMessage.id === confirmedReplay.id,
      "Agent confirmation replay was not stable",
    );
    const persistedDrafts = await database
      .select({ id: agentDrafts.id, status: agentDrafts.status })
      .from(agentDrafts)
      .where(eq(agentDrafts.id, proposedMessage.id));
    assert(
      persistedDrafts[0]?.status === "confirmed",
      "Agent draft was not persisted as confirmed",
    );
    const draftAudit = await database
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityType, "agent-draft"),
          eq(auditLog.entityId, proposedMessage.id),
        ),
      );
    assert(
      draftAudit.length === 2,
      "Agent proposal audit trail was incomplete",
    );

    const syntheticEvent = {
      id: webhookEventId,
      object: "event",
      api_version: "2026-06-30.basil",
      created: Math.floor(Date.now() / 1_000),
      data: { object: { id: `obj_${crypto.randomUUID()}` } },
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: "duna.repository_verification",
    } as unknown as Stripe.Event;
    const queuedWebhook = await processStripeWebhook(syntheticEvent);
    assert(
      queuedWebhook.workflowJobId,
      "Signed event was not durably enqueued",
    );
    createdWorkflowJobIds = [queuedWebhook.workflowJobId];
    const processedWorkflow = await processWorkflowJobById(
      queuedWebhook.workflowJobId,
    );
    assert(
      processedWorkflow?.status === "succeeded",
      `Durable webhook workflow did not complete: ${JSON.stringify(processedWorkflow)}`,
    );
    const duplicateWebhook = await processStripeWebhook(syntheticEvent);
    assert(duplicateWebhook.duplicate, "Webhook deduplication did not hold");
    const rateInput = {
      key: liveRateLimitKey,
      capacity: 1,
      refillPerMinute: 1,
      now: new Date("2026-07-30T20:00:00.000Z"),
    };
    const firstRateDecision = await consumeRateLimit(rateInput);
    const deniedRateDecision = await consumeRateLimit(rateInput);
    assert(firstRateDecision.allowed, "Initial rate-limit token was denied");
    assert(
      !deniedRateDecision.allowed &&
        deniedRateDecision.retryAfterSeconds === 60,
      "Connected rate-limit bucket did not reject exhaustion",
    );

    const adminCaller = createCaller(
      createApiContext({
        actor: createDemoActor(["super-admin"]),
        requestId: crypto.randomUUID(),
      }),
    );
    const admin = await adminCaller.admin.overview();
    assert(
      admin.metrics.some((metric) => metric.label === "Active operators"),
      "Admin metrics were not ledger/database derived",
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          events: events.length,
          venues: venues.length,
          walletEntries: wallet.entries.length,
          organization: operator.organization.slug,
          pickupReplayStable: first.id === replay.id,
          persistedPickupCount: createdPickupIds.length,
          agentDraftStatus: persistedDrafts[0]?.status,
          agentAuditEvents: draftAudit.length,
          confirmationReplayStable: confirmedMessage.id === confirmedReplay.id,
          webhookWorkflowStatus: processedWorkflow.status,
          webhookDuplicateRejected: duplicateWebhook.duplicate,
          rateLimitDeniedAfterCapacity: !deniedRateDecision.allowed,
          adminMetrics: admin.metrics.length,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    if (createdPickupIds.length > 0) {
      await database
        .delete(auditLog)
        .where(
          and(
            eq(auditLog.entityType, "pickup-session"),
            inArray(auditLog.entityId, createdPickupIds),
          ),
        );
      await database
        .delete(pickupSessions)
        .where(inArray(pickupSessions.id, createdPickupIds));
    }
    if (createdDraftIds.length > 0) {
      await database
        .delete(auditLog)
        .where(
          and(
            eq(auditLog.entityType, "agent-draft"),
            inArray(auditLog.entityId, createdDraftIds),
          ),
        );
      await database
        .delete(agentDrafts)
        .where(inArray(agentDrafts.id, createdDraftIds));
    }
    if (createdWorkflowJobIds.length > 0) {
      await database
        .delete(workflowJobs)
        .where(inArray(workflowJobs.id, createdWorkflowJobIds));
    }
    await database
      .delete(webhookEvents)
      .where(
        and(
          eq(webhookEvents.provider, "stripe"),
          eq(webhookEvents.providerEventId, webhookEventId),
        ),
      );
    await database
      .delete(idempotencyRecords)
      .where(
        and(
          inArray(idempotencyRecords.procedure, [
            "player.createPickup",
            "operator.proposeMessage",
            "agent.confirmAction",
          ]),
          inArray(idempotencyRecords.key, [
            idempotencyKey,
            proposalKey,
            confirmationKey,
          ]),
        ),
      );
    await database
      .delete(rateLimitBuckets)
      .where(inArray(rateLimitBuckets.key, rateLimitKeys));
  }
}

void main();
