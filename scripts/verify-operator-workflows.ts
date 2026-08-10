import { loadEnvFile } from "node:process";
import { and, eq, inArray, or } from "drizzle-orm";
import type Stripe from "stripe";
import {
  auditLog,
  consents,
  courts,
  eventTypes,
  getDatabase,
  guardianships,
  idempotencyRecords,
  messages,
  organizationInvitations,
  organizationMemberships,
  organizationParticipants,
  organizations,
  people,
  programs,
  ratePlans,
  registrations,
  sessions,
  venues,
  webhookEvents,
  workflowJobs,
} from "../packages/db/src";
import {
  createApiContext,
  createCaller,
  createProgramSession,
  loadOperatorWorkspace,
  OperatorServiceError,
  publishSession,
  processStripeWebhook,
  processWorkflowJobById,
  saveMessageDraft,
  scopesForRoles,
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

async function main() {
  assert(process.env.DATABASE_URL, "DATABASE_URL is required");
  const database = getDatabase();
  const suffix = crypto.randomUUID();
  const organizationId = crypto.randomUUID();
  const otherOrganizationId = crypto.randomUUID();
  const actorPersonId = crypto.randomUUID();
  const adultPersonId = crypto.randomUUID();
  const minorPersonId = crypto.randomUUID();
  const guardianPersonId = crypto.randomUUID();
  const requestIds = Array.from({ length: 12 }, () => crypto.randomUUID());
  const idempotencyKeys = Array.from({ length: 12 }, () => crypto.randomUUID());
  const now = new Date("2026-07-30T21:00:00.000Z");
  const connectWebhookId = `evt_connect_operator_${suffix}`;
  const actor: ApiActor = {
    personId: actorPersonId,
    displayName: "Operator Verification Owner",
    roles: ["owner"],
    organizationId,
    scopes: scopesForRoles(["owner"]),
    ageBand: "adult",
    isDemo: false,
  };
  let sessionIds: string[] = [];
  let programIds: string[] = [];
  let eventTypeIds: string[] = [];
  let invitedMinorPersonId: string | undefined;

  try {
    await database.batch([
      database.insert(organizations).values({
        id: organizationId,
        slug: `operator-verification-${suffix}`.slice(0, 64),
        name: "Operator Verification Club",
        legalName: "Operator Verification Club LLC",
        plan: "club",
        timezone: "America/Los_Angeles",
        currency: "USD",
        countryCode: "US",
      }),
      database.insert(organizations).values({
        id: otherOrganizationId,
        slug: `other-verification-${suffix}`.slice(0, 64),
        name: "Other Verification Club",
        plan: "club",
        timezone: "America/New_York",
        currency: "USD",
      }),
      database.insert(people).values({
        id: actorPersonId,
        displayName: actor.displayName,
        handle: `operator-owner-${suffix}`.slice(0, 48),
        ageBand: "adult",
        profileVisibility: "private",
      }),
      database.insert(people).values({
        id: adultPersonId,
        displayName: "Operator Verification Adult",
        handle: `operator-adult-${suffix}`.slice(0, 48),
        email: `adult-${suffix}@example.test`,
        ageBand: "adult",
        profileVisibility: "private",
      }),
      database.insert(people).values({
        id: minorPersonId,
        displayName: "Operator Verification Minor",
        handle: `operator-minor-${suffix}`.slice(0, 48),
        email: `minor-${suffix}@example.test`,
        isMinor: true,
        ageBand: "teen",
        profileVisibility: "private",
      }),
      database.insert(people).values({
        id: guardianPersonId,
        displayName: "Operator Verification Guardian",
        handle: `operator-guardian-${suffix}`.slice(0, 48),
        email: `guardian-${suffix}@example.test`,
        ageBand: "adult",
        profileVisibility: "private",
      }),
    ]);
    await database.insert(organizationMemberships).values({
      organizationId,
      personId: actorPersonId,
      role: "owner",
      scopes: [],
    });

    const caller = createCaller(
      createApiContext({
        actor,
        requestId: requestIds[0],
        now,
      }),
    );
    const rateInput = {
      name: "Verification public rate",
      baseAmountMinor: 6_000,
      memberAmountMinor: 5_000,
      nonMemberAmountMinor: 6_500,
      rateUnitMinutes: 60,
      confirmed: true as const,
      idempotencyKey: idempotencyKeys[0],
    };
    const rate = await caller.operator.createRatePlan(rateInput);
    const repeatedRate = await caller.operator.createRatePlan(rateInput);
    assert(
      rate.id === repeatedRate.id,
      "Rate plan idempotency did not replay the stored result",
    );

    const venue = await caller.operator.createVenue({
      name: "Verification Beach",
      locationKind: "public-location",
      environment: "outdoor",
      addressLine1: "1 Verification Way",
      locality: "Hermosa Beach",
      administrativeArea: "CA",
      postalCode: "90254",
      countryCode: "US",
      timezone: "America/Los_Angeles",
      temporary: false,
      idempotencyKey: idempotencyKeys[1],
    });
    const court = await caller.operator.createCourt({
      venueId: venue.id,
      name: "Verification Court",
      surface: "sand",
      lit: true,
      bookingPolicy: "public",
      ratePlanId: rate.id,
      minimumDurationMinutes: 60,
      maximumDurationMinutes: 120,
      bufferBeforeMinutes: 15,
      bufferAfterMinutes: 15,
      minimumNoticeMinutes: 60,
      maximumAdvanceDays: 90,
      idempotencyKey: idempotencyKeys[2],
    });
    await caller.operator.activateCourt({
      courtId: court.id,
      confirmed: true,
      idempotencyKey: idempotencyKeys[3],
    });
    await caller.operator.publishVenue({
      venueId: venue.id,
      confirmed: true,
      idempotencyKey: idempotencyKeys[4],
    });
    await caller.operator.replaceCourtSchedule({
      courtId: court.id,
      blocks: [
        {
          weekday: 1,
          startsAtMinute: 8 * 60,
          endsAtMinute: 20 * 60,
          mode: "rentals-only",
        },
        {
          weekday: 3,
          startsAtMinute: 8 * 60,
          endsAtMinute: 20 * 60,
          mode: "open",
        },
        {
          weekday: 6,
          startsAtMinute: 9 * 60,
          endsAtMinute: 18 * 60,
          mode: "members-only",
        },
      ],
      confirmed: true,
      idempotencyKey: idempotencyKeys[10],
    });

    const otherVenueId = crypto.randomUUID();
    await database.insert(venues).values({
      id: otherVenueId,
      organizationId: otherOrganizationId,
      slug: `other-venue-${suffix}`.slice(0, 64),
      name: "Other Venue",
      status: "draft",
      timezone: "America/New_York",
    });
    let crossTenantBlocked = false;
    try {
      await caller.operator.createCourt({
        venueId: otherVenueId,
        name: "Cross-tenant Court",
        surface: "sand",
        lit: false,
        bookingPolicy: "none",
        minimumDurationMinutes: 60,
        maximumDurationMinutes: 120,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        minimumNoticeMinutes: 0,
        maximumAdvanceDays: 30,
        idempotencyKey: idempotencyKeys[5],
      });
    } catch (error) {
      crossTenantBlocked =
        error instanceof Error &&
        error.message.includes("another organization");
    }
    assert(crossTenantBlocked, "Cross-tenant court creation was not blocked");

    const freeSession = await caller.operator.createProgramSession({
      title: "Verification Open Play",
      description: "Connected operator workflow verification.",
      kind: "open-play",
      venueId: venue.id,
      courtId: court.id,
      localStartsAt: "2031-08-02T09:00",
      localEndsAt: "2031-08-02T11:00",
      capacity: 16,
      minimumCapacity: 4,
      priceMinor: 0,
      confirmedPrice: true,
      idempotencyKey: idempotencyKeys[6],
    });
    await caller.operator.publishSession({
      sessionId: freeSession.id,
      confirmed: true,
      idempotencyKey: idempotencyKeys[7],
    });

    const paidSession = await createProgramSession({
      actor,
      title: "Verification Paid Clinic",
      kind: "clinic",
      venueId: venue.id,
      courtId: court.id,
      localStartsAt: "2031-08-03T09:00",
      localEndsAt: "2031-08-03T11:00",
      capacity: 12,
      minimumCapacity: 4,
      priceMinor: 7_500,
      confirmedPrice: true,
      requestId: requestIds[1],
      now,
    });
    let paidPublishBlocked = false;
    try {
      await publishSession({
        actor,
        sessionId: paidSession.id,
        confirmed: true,
        requestId: requestIds[2],
        now,
      });
    } catch (error) {
      paidPublishBlocked =
        error instanceof OperatorServiceError &&
        error.code === "PAYMENTS_NOT_READY";
    }
    assert(
      paidPublishBlocked,
      "Paid publishing was not blocked before Stripe Connect",
    );
    const connectProjection = await processStripeWebhook({
      id: connectWebhookId,
      object: "event",
      api_version: "2026-06-30.basil",
      created: Math.floor(now.getTime() / 1_000),
      data: {
        object: {
          id: `acct_operator_${suffix}`.replaceAll("-", "").slice(0, 64),
          object: "account",
          type: "express",
          charges_enabled: true,
          metadata: {
            dunaEntityId: organizationId,
            dunaPartyType: "club",
          },
        },
      },
      livemode: false,
      pending_webhooks: 0,
      request: null,
      type: "account.updated",
    } as unknown as Stripe.Event);
    assert(
      connectProjection.workflowJobId,
      "Connect synchronization workflow was not queued",
    );
    const connectJob = await processWorkflowJobById(
      connectProjection.workflowJobId,
      now,
    );
    assert(
      connectJob?.status === "succeeded",
      "Connect synchronization workflow did not succeed",
    );
    const connectedOrganization = await database.query.organizations.findFirst({
      where: eq(organizations.id, organizationId),
    });
    assert(
      connectedOrganization?.stripeChargesEnabled,
      "Connect workflow did not enable the organization",
    );
    await publishSession({
      actor,
      sessionId: paidSession.id,
      confirmed: true,
      requestId: requestIds[6],
      now,
    });

    await database.batch([
      database.insert(registrations).values({
        sessionId: freeSession.id,
        personId: adultPersonId,
        status: "confirmed",
        eligibilityDecision: {
          status: "eligible",
          reasons: [],
          overrideAllowed: false,
        },
        eligibilityRuleVersion: 0,
      }),
      database.insert(registrations).values({
        sessionId: freeSession.id,
        personId: minorPersonId,
        status: "confirmed",
        eligibilityDecision: {
          status: "eligible",
          reasons: [],
          overrideAllowed: false,
        },
        eligibilityRuleVersion: 0,
      }),
      database.insert(consents).values({
        personId: adultPersonId,
        scope: "transactional",
        granted: true,
        disclosureText: "Verification transactional disclosure.",
        disclosureTextHash: `hash-${suffix}`,
      }),
      database.insert(consents).values({
        personId: minorPersonId,
        scope: "transactional",
        granted: true,
        disclosureText: "Verification transactional disclosure.",
        disclosureTextHash: `hash-minor-${suffix}`,
      }),
    ]);

    const adultDraft = await saveMessageDraft({
      actor,
      recipientPersonId: adultPersonId,
      channel: "email",
      classification: "transactional",
      subject: "Verification update",
      body: "Your session details are ready.",
      requestId: requestIds[3],
      now,
    });
    let minorGuardianGateBlocked = false;
    try {
      await saveMessageDraft({
        actor,
        recipientPersonId: minorPersonId,
        channel: "email",
        classification: "transactional",
        subject: "Verification update",
        body: "Your session details are ready.",
        requestId: requestIds[4],
        now,
      });
    } catch (error) {
      minorGuardianGateBlocked =
        error instanceof OperatorServiceError &&
        error.code === "RECIPIENT_NOT_ELIGIBLE";
    }
    assert(
      minorGuardianGateBlocked,
      "Minor message draft was not blocked without a verified guardian",
    );
    await database.insert(guardianships).values({
      guardianId: guardianPersonId,
      minorId: minorPersonId,
      relationship: "parent",
      verified: true,
      reviewStatus: "verified",
      reviewedByPersonId: actorPersonId,
      reviewedAt: now,
      verifiedAt: now,
    });
    const minorDraft = await saveMessageDraft({
      actor,
      recipientPersonId: minorPersonId,
      channel: "email",
      classification: "transactional",
      subject: "Verification update",
      body: "Your session details are ready.",
      requestId: requestIds[5],
      now,
    });
    const minorMessage = await database.query.messages.findFirst({
      where: eq(messages.id, minorDraft.id),
    });
    assert(
      minorMessage?.guardianCopyPersonIds.includes(guardianPersonId),
      "Verified guardian was not copied at the message storage boundary",
    );

    const playerInvitation = await caller.operator.createPlayerInvitation({
      invitedName: "Invited Verification Junior",
      relationship: "player",
      isMinor: true,
      guardianName: "Operator Verification Guardian",
      guardianEmail: `guardian-${suffix}@example.test`,
      confirmed: true,
      idempotencyKey: idempotencyKeys[8],
    });
    const invitationRow =
      await database.query.organizationInvitations.findFirst({
        where: eq(organizationInvitations.id, playerInvitation.id),
      });
    assert(invitationRow, "Player invitation was not persisted");
    const publicInvitation = await caller.public.playerInvitation({
      inviteToken: invitationRow.inviteToken,
    });
    assert(
      publicInvitation.isMinor &&
        publicInvitation.organizationName === "Operator Verification Club",
      "Public invitation did not preserve the protected minor context",
    );
    const guardianActor: ApiActor = {
      personId: guardianPersonId,
      displayName: "Operator Verification Guardian",
      roles: ["player"],
      scopes: scopesForRoles(["player"]),
      ageBand: "adult",
      isDemo: false,
    };
    const guardianCaller = createCaller(
      createApiContext({
        actor: guardianActor,
        requestId: requestIds[8],
        now,
      }),
    );
    const claimedInvitation =
      await guardianCaller.player.claimOrganizationInvitation({
        inviteToken: invitationRow.inviteToken,
        idempotencyKey: idempotencyKeys[9],
      });
    invitedMinorPersonId = claimedInvitation.participantPersonId;
    const [invitedParticipant, invitedGuardianship] = await Promise.all([
      database.query.organizationParticipants.findFirst({
        where: and(
          eq(organizationParticipants.organizationId, organizationId),
          eq(organizationParticipants.personId, invitedMinorPersonId),
          eq(organizationParticipants.relationship, "player"),
        ),
      }),
      database.query.guardianships.findFirst({
        where: and(
          eq(guardianships.guardianId, guardianPersonId),
          eq(guardianships.minorId, invitedMinorPersonId),
        ),
      }),
    ]);
    assert(
      claimedInvitation.guardianReviewRequired &&
        invitedParticipant?.status === "active" &&
        invitedGuardianship?.reviewStatus === "pending" &&
        !invitedGuardianship.verified,
      "Minor invitation did not create a protected profile and pending guardian review",
    );

    const workspace = await loadOperatorWorkspace(organizationId);
    assert(
      workspace.venues.length === 1 &&
        workspace.venues[0]?.courts.length === 1 &&
        workspace.ratePlans.length === 1 &&
        workspace.venues[0].courts[0]?.schedule.length === 3,
      "Operator workspace did not project facility configuration",
    );
    assert(
      workspace.sessions.some(
        (session) =>
          session.id === freeSession.id &&
          session.status === "registration-open",
      ) &&
        workspace.sessions.some(
          (session) =>
            session.id === paidSession.id &&
            session.status === "registration-open",
        ),
      "Operator workspace did not preserve publish gates",
    );
    assert(
      workspace.messageDrafts.some((draft) => draft.id === adultDraft.id) &&
        workspace.messageDrafts.some(
          (draft) =>
            draft.id === minorDraft.id && draft.guardianCopyCount === 1,
        ),
      "Operator workspace did not project protected message drafts",
    );
    assert(
      workspace.participants.some(
        (participant) =>
          participant.personId === invitedMinorPersonId &&
          participant.guardianStatus === "pending",
      ) &&
        workspace.invitations.some(
          (invitation) =>
            invitation.id === playerInvitation.id &&
            invitation.status === "claimed",
        ),
      "Operator workspace did not project invited players and guardian review",
    );

    const auditRows = await database
      .select({ action: auditLog.action })
      .from(auditLog)
      .where(eq(auditLog.organizationId, organizationId));
    const auditedActions = new Set(auditRows.map((row) => row.action));
    for (const action of [
      "rate-plan.created",
      "venue.created",
      "court.created",
      "court.activated",
      "court.schedule_replaced",
      "venue.published",
      "session.draft_created",
      "session.published",
      "message.draft_saved",
      "player-invitation.created",
      "player-invitation.claimed",
    ]) {
      assert(auditedActions.has(action), `Missing audit action: ${action}`);
    }

    console.log(
      JSON.stringify(
        {
          ratePlanIdempotent: true,
          crossTenantBlocked,
          facilityPublished: workspace.venues[0]?.status === "active",
          courtActivated: workspace.venues[0]?.courts[0]?.status === "active",
          courtScheduleApplied:
            workspace.venues[0]?.courts[0]?.schedule.length === 3,
          freeSessionPublished: true,
          paidPublishBlocked,
          connectSynchronized: connectedOrganization.stripeChargesEnabled,
          paidPublishedAfterConnect: true,
          consentChecked: true,
          minorGuardianGateBlocked,
          guardianCopies: minorMessage.guardianCopyPersonIds.length,
          minorInvitationProtected: true,
          guardianReviewPending: true,
          protectedDrafts: workspace.messageDrafts.length,
          auditedActions: auditedActions.size,
        },
        null,
        2,
      ),
    );
  } finally {
    const tempSessions = await database
      .select({
        id: sessions.id,
        programId: sessions.programId,
        eventTypeId: sessions.eventTypeId,
      })
      .from(sessions)
      .leftJoin(programs, eq(sessions.programId, programs.id))
      .leftJoin(eventTypes, eq(sessions.eventTypeId, eventTypes.id))
      .leftJoin(venues, eq(sessions.venueId, venues.id))
      .where(
        or(
          eq(programs.organizationId, organizationId),
          eq(eventTypes.organizationId, organizationId),
          eq(venues.organizationId, organizationId),
        ),
      );
    sessionIds = tempSessions.map((row) => row.id);
    programIds = tempSessions.flatMap((row) =>
      row.programId ? [row.programId] : [],
    );
    eventTypeIds = tempSessions.flatMap((row) =>
      row.eventTypeId ? [row.eventTypeId] : [],
    );
    await database
      .delete(messages)
      .where(eq(messages.organizationId, organizationId));
    if (sessionIds.length > 0) {
      await database
        .delete(registrations)
        .where(inArray(registrations.sessionId, sessionIds));
      await database.delete(sessions).where(inArray(sessions.id, sessionIds));
    }
    if (eventTypeIds.length > 0) {
      await database
        .delete(eventTypes)
        .where(inArray(eventTypes.id, eventTypeIds));
    }
    if (programIds.length > 0) {
      await database.delete(programs).where(inArray(programs.id, programIds));
    }
    const venueRows = await database
      .select({ id: venues.id })
      .from(venues)
      .where(
        inArray(venues.organizationId, [organizationId, otherOrganizationId]),
      );
    if (venueRows.length > 0) {
      await database.delete(courts).where(
        inArray(
          courts.venueId,
          venueRows.map((row) => row.id),
        ),
      );
      await database.delete(venues).where(
        inArray(
          venues.id,
          venueRows.map((row) => row.id),
        ),
      );
    }
    await database
      .delete(ratePlans)
      .where(eq(ratePlans.organizationId, organizationId));
    await database
      .delete(workflowJobs)
      .where(eq(workflowJobs.traceId, connectWebhookId));
    await database
      .delete(webhookEvents)
      .where(eq(webhookEvents.providerEventId, connectWebhookId));
    await database
      .delete(guardianships)
      .where(
        and(
          eq(guardianships.guardianId, guardianPersonId),
          inArray(
            guardianships.minorId,
            invitedMinorPersonId
              ? [minorPersonId, invitedMinorPersonId]
              : [minorPersonId],
          ),
        ),
      );
    await database
      .delete(consents)
      .where(inArray(consents.personId, [adultPersonId, minorPersonId]));
    await database
      .delete(organizationMemberships)
      .where(eq(organizationMemberships.organizationId, organizationId));
    await database
      .delete(idempotencyRecords)
      .where(inArray(idempotencyRecords.key, idempotencyKeys));
    await database
      .delete(auditLog)
      .where(eq(auditLog.organizationId, organizationId));
    await database
      .delete(organizations)
      .where(inArray(organizations.id, [organizationId, otherOrganizationId]));
    await database
      .delete(people)
      .where(
        inArray(people.id, [
          actorPersonId,
          adultPersonId,
          minorPersonId,
          guardianPersonId,
          ...(invitedMinorPersonId ? [invitedMinorPersonId] : []),
        ]),
      );
  }
}

void main();
