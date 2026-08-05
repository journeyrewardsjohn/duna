import { loadEnvFile } from "node:process";
import { randomBytes } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import type Stripe from "stripe";
import {
  auditLog,
  getDatabase,
  guardianConsents,
  guardianships,
  healthConnections,
  healthSamples,
  memberships,
  membershipTiers,
  people,
  privacyRequests,
  videos,
  webhookEvents,
  workflowJobs,
} from "../packages/db/src";
import {
  addDependent,
  buildPersonDataExport,
  cancelAccountDeletion,
  processStripeWebhook,
  processWorkflowJobById,
  recordOwnBirthDate,
  requestAccountDeletion,
  scopesForRoles,
  syncHealthSamples,
  updateOwnProfile,
  type ApiActor,
} from "../packages/api/src";

try {
  loadEnvFile(".env.local");
} catch {
  // CI and deployment checks may provide configuration through the environment.
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function projectEvent(event: Stripe.Event): Promise<{
  readonly duplicate: boolean;
  readonly workflowJobId?: string;
}> {
  const accepted = await processStripeWebhook(event);
  assert(
    accepted.workflowJobId,
    `No workflow job was created for ${event.type}`,
  );
  const projected = await processWorkflowJobById(accepted.workflowJobId);
  assert(
    projected?.status === "succeeded",
    `${event.type} was not projected successfully`,
  );
  return accepted;
}

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const database = getDatabase();
  const now = new Date();
  const personId = crypto.randomUUID();
  let dependentPersonId: string | undefined;
  const privacyRequestIds: string[] = [];
  const suffix = crypto.randomUUID();
  const subscriptionId = `sub_duna_verify_${suffix}`;
  const eventIds = {
    created: `evt_duna_membership_created_${suffix}`,
    updated: `evt_duna_membership_updated_${suffix}`,
    failed: `evt_duna_membership_failed_${suffix}`,
    deleted: `evt_duna_membership_deleted_${suffix}`,
  };
  const allEventIds = Object.values(eventIds);
  const actor: ApiActor = {
    personId,
    displayName: "Account Lifecycle Verification",
    roles: ["player"],
    scopes: scopesForRoles(["player"]),
    ageBand: "adult",
    isDemo: true,
  };

  const tier = await database.query.membershipTiers.findFirst({
    where: and(
      eq(membershipTiers.code, "duna-plus-monthly"),
      eq(membershipTiers.active, true),
    ),
  });
  assert(tier?.stripePriceId, "Configured Duna+ monthly tier is required");

  const periodStart = Math.floor(now.getTime() / 1_000);
  const periodEnd = periodStart + 30 * 24 * 60 * 60;
  const baseSubscription = {
    id: subscriptionId,
    object: "subscription",
    metadata: { dunaPersonId: personId },
    status: "active",
    cancel_at_period_end: false,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    pause_collection: null,
    items: {
      data: [
        {
          id: `si_duna_verify_${suffix}`,
          price: { id: tier.stripePriceId },
          current_period_start: periodStart,
          current_period_end: periodEnd,
        },
      ],
    },
  };
  const event = (
    id: string,
    type: Stripe.Event.Type,
    object: Record<string, unknown>,
    createdOffsetSeconds: number,
  ) =>
    ({
      id,
      object: "event",
      api_version: "2026-06-30.basil",
      created: periodStart + createdOffsetSeconds,
      data: { object },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type,
    }) as unknown as Stripe.Event;

  try {
    await database.insert(people).values({
      id: personId,
      email: `account-lifecycle-${suffix}@example.invalid`,
      displayName: actor.displayName,
      handle: `account-lifecycle-${suffix}`.slice(0, 48),
      ageBand: "unknown",
      isMinor: false,
      profileVisibility: "private",
    });

    const age = await recordOwnBirthDate({
      actor,
      birthDate: "1990-05-14",
      requestId: crypto.randomUUID(),
      now,
    });
    assert(
      age.ageBand === "adult" && !age.requiresGuardian,
      "Adult age setup was not recorded",
    );
    const profile = await updateOwnProfile({
      actor,
      displayName: "Account Lifecycle Verified",
      handle: `account-lifecycle-${suffix}`.slice(0, 48),
      email: `account-lifecycle-${suffix}@example.invalid`,
      phoneE164: null,
      homeMarket: "Verification Beach",
      visibility: "members",
      locale: "en-US",
      measurementSystem: "metric",
      requestId: crypto.randomUUID(),
      now,
    });
    assert(
      profile.visibility === "members",
      "Profile preferences were not persisted",
    );
    const dependent = await addDependent({
      actor,
      displayName: "Lifecycle Junior",
      birthDate: "2014-09-12",
      relationship: "Parent",
      emergencyContact: true,
      canApproveSpending: true,
      consentConfirmed: true,
      requestId: crypto.randomUUID(),
      now,
    });
    dependentPersonId = dependent.personId;
    const [relationship, guardianConsent] = await Promise.all([
      database.query.guardianships.findFirst({
        where: and(
          eq(guardianships.guardianId, personId),
          eq(guardianships.minorId, dependent.personId),
        ),
      }),
      database.query.guardianConsents.findFirst({
        where: and(
          eq(guardianConsents.guardianId, personId),
          eq(guardianConsents.minorId, dependent.personId),
        ),
      }),
    ]);
    assert(
      relationship &&
        !relationship.verified &&
        guardianConsent?.granted === true,
      "Dependent consent or pending guardianship was not persisted",
    );

    const exported = await buildPersonDataExport({ actor, now });
    assert(
      exported.person.id === personId,
      "Data export returned another user",
    );
    assert(
      exported.schema === "duna-personal-data-export/v1",
      "Data export schema is incorrect",
    );

    const firstRequest = await requestAccountDeletion({
      actor,
      reason: "Connected lifecycle verification",
      forfeitOrganizationCredits: false,
      requestId: crypto.randomUUID(),
      now,
    });
    const repeatedRequest = await requestAccountDeletion({
      actor,
      reason: "This should reuse the active request",
      forfeitOrganizationCredits: false,
      requestId: crypto.randomUUID(),
      now,
    });
    assert(
      firstRequest.id === repeatedRequest.id,
      "Deletion request was not idempotent while active",
    );
    const cancelled = await cancelAccountDeletion({
      actor,
      requestId: crypto.randomUUID(),
      now: new Date(now.getTime() + 1_000),
    });
    assert(
      cancelled.id === firstRequest.id && cancelled.status === "cancelled",
      "Deletion request was not cancelled",
    );
    privacyRequestIds.push(firstRequest.id);

    process.env.HEALTH_DATA_ENCRYPTION_KEY ??=
      randomBytes(32).toString("base64");
    await syncHealthSamples({
      actor,
      categories: ["heart"],
      timezone: "America/New_York",
      samples: [
        {
          externalId: `health-${suffix}`,
          metric: "heart-rate",
          kind: "quantity",
          startedAt: now.toISOString(),
          endedAt: new Date(now.getTime() + 10_000).toISOString(),
          value: 132,
          unit: "count/min",
        },
      ],
      deletedExternalIds: [],
      syncedAt: new Date(now.getTime() + 1_500),
      requestId: crypto.randomUUID(),
    });
    const videoId = crypto.randomUUID();
    await database.insert(videos).values({
      id: videoId,
      ownerPersonId: personId,
      source: "upload",
      category: "practice",
      title: "Account deletion verification video",
      status: "ready",
      liveVisibility: "public",
      recordingVisibility: "public",
      publishedToProfile: true,
      createdAt: now,
      updatedAt: now,
    });

    await projectEvent(
      event(
        eventIds.created,
        "customer.subscription.created",
        baseSubscription,
        2,
      ),
    );
    const duplicate = await processStripeWebhook(
      event(
        eventIds.created,
        "customer.subscription.created",
        baseSubscription,
        2,
      ),
    );
    assert(duplicate.duplicate, "Duplicate Stripe event was not rejected");

    const activeMembership = await database.query.memberships.findFirst({
      where: eq(memberships.stripeSubscriptionId, subscriptionId),
    });
    assert(
      activeMembership?.status === "active" &&
        activeMembership.tierId === tier.id,
      "Created subscription did not activate the mapped Duna+ tier",
    );

    const resumesAt = periodStart + 14 * 24 * 60 * 60;
    await projectEvent(
      event(
        eventIds.updated,
        "customer.subscription.updated",
        {
          ...baseSubscription,
          pause_collection: {
            behavior: "void",
            resumes_at: resumesAt,
          },
        },
        3,
      ),
    );
    const pausedMembership = await database.query.memberships.findFirst({
      where: eq(memberships.stripeSubscriptionId, subscriptionId),
    });
    assert(
      pausedMembership?.pausedUntil?.getTime() === resumesAt * 1_000,
      "Subscription pause was not projected",
    );

    await projectEvent(
      event(
        eventIds.failed,
        "invoice.payment_failed",
        {
          id: `in_duna_verify_${suffix}`,
          object: "invoice",
          subscription: subscriptionId,
        },
        4,
      ),
    );
    const pastDueMembership = await database.query.memberships.findFirst({
      where: eq(memberships.stripeSubscriptionId, subscriptionId),
    });
    assert(
      pastDueMembership?.status === "past_due",
      "Failed invoice did not mark the membership past due",
    );

    await projectEvent(
      event(
        eventIds.deleted,
        "customer.subscription.deleted",
        {
          ...baseSubscription,
          status: "canceled",
          cancel_at_period_end: true,
          pause_collection: null,
        },
        5,
      ),
    );
    const cancelledMembership = await database.query.memberships.findFirst({
      where: eq(memberships.stripeSubscriptionId, subscriptionId),
    });
    assert(
      cancelledMembership?.status === "canceled" &&
        cancelledMembership.cancelAtPeriodEnd,
      "Deleted subscription did not close the Duna+ membership",
    );

    const finalRequest = await requestAccountDeletion({
      actor,
      reason: "Verify permanent sensitive-data deletion",
      forfeitOrganizationCredits: false,
      requestId: crypto.randomUUID(),
      now: new Date(now.getTime() + 6_000),
    });
    privacyRequestIds.push(finalRequest.id);
    const [containedHealth, containedVideo] = await Promise.all([
      database.query.healthConnections.findFirst({
        where: eq(healthConnections.personId, personId),
      }),
      database.query.videos.findFirst({ where: eq(videos.id, videoId) }),
    ]);
    assert(
      containedHealth?.status === "revoked" &&
        containedVideo?.recordingVisibility === "private" &&
        !containedVideo.publishedToProfile,
      "Deletion request did not immediately contain Health and video access",
    );
    const [containmentJob, deletionJob] = await Promise.all([
      database.query.workflowJobs.findFirst({
        where: and(
          eq(workflowJobs.kind, "privacy.account-containment"),
          eq(workflowJobs.idempotencyKey, finalRequest.id),
        ),
      }),
      database.query.workflowJobs.findFirst({
        where: and(
          eq(workflowJobs.kind, "privacy.account-deletion"),
          eq(workflowJobs.idempotencyKey, finalRequest.id),
        ),
      }),
    ]);
    assert(containmentJob && deletionJob, "Privacy workflows were not queued");
    const contained = await processWorkflowJobById(
      containmentJob.id,
      new Date(now.getTime() + 7_000),
    );
    assert(contained?.status === "succeeded", "Containment workflow failed");
    const early = await processWorkflowJobById(
      deletionJob.id,
      new Date(now.getTime() + 24 * 60 * 60 * 1_000),
    );
    assert(
      early?.status === "queued" && early.attempts === 0,
      "Permanent deletion ran before the seven-day recovery window",
    );
    const deleted = await processWorkflowJobById(
      deletionJob.id,
      new Date(now.getTime() + 8 * 24 * 60 * 60 * 1_000),
    );
    assert(
      deleted?.status === "succeeded",
      "Permanent deletion workflow failed",
    );
    const [deletedPerson, deletedRequest, healthRows, deletedVideo] =
      await Promise.all([
        database.query.people.findFirst({ where: eq(people.id, personId) }),
        database.query.privacyRequests.findFirst({
          where: eq(privacyRequests.id, finalRequest.id),
        }),
        database
          .select({ id: healthSamples.id })
          .from(healthSamples)
          .where(eq(healthSamples.personId, personId)),
        database.query.videos.findFirst({ where: eq(videos.id, videoId) }),
      ]);
    assert(
      deletedPerson?.status === "deleted" &&
        deletedPerson.email === null &&
        deletedPerson.birthDate === null &&
        deletedPerson.displayName === "Deleted Duna Player",
      "Player identity was not de-identified",
    );
    assert(
      deletedRequest?.status === "completed" &&
        healthRows.length === 0 &&
        !deletedVideo,
      "Sensitive Health or video data survived permanent deletion",
    );

    console.log(
      JSON.stringify(
        {
          exportSchema: exported.schema,
          exportSections: Object.keys(exported).length,
          profileLifecycle: "age recorded -> profile updated",
          guardianLifecycle:
            "private dependent -> consent recorded -> relationship pending",
          deletionLifecycle:
            "queued -> cancelled -> immediate containment -> seven-day hold -> provider purge -> de-identification",
          deletionRequestReused: firstRequest.id === repeatedRequest.id,
          membershipLifecycle:
            "active -> paused projection -> past_due -> canceled",
          duplicateWebhookRejected: duplicate.duplicate,
          sensitiveDataDeleted: healthRows.length === 0 && !deletedVideo,
        },
        null,
        2,
      ),
    );
  } finally {
    await database
      .delete(auditLog)
      .where(
        or(
          eq(auditLog.actorPersonId, personId),
          inArray(auditLog.traceId, allEventIds),
          inArray(auditLog.entityId, [
            subscriptionId,
            personId,
            ...(dependentPersonId ? [dependentPersonId] : []),
            ...privacyRequestIds,
          ]),
        ),
      );
    await database
      .delete(privacyRequests)
      .where(eq(privacyRequests.personId, personId));
    await database
      .delete(memberships)
      .where(eq(memberships.personId, personId));
    await database
      .delete(workflowJobs)
      .where(
        or(
          inArray(workflowJobs.traceId, allEventIds),
          inArray(workflowJobs.idempotencyKey, privacyRequestIds),
        ),
      );
    await database
      .delete(webhookEvents)
      .where(inArray(webhookEvents.providerEventId, allEventIds));
    await database
      .delete(people)
      .where(
        inArray(
          people.id,
          dependentPersonId ? [dependentPersonId, personId] : [personId],
        ),
      );
  }
}

void main();
