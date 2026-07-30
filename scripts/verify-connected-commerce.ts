import { loadEnvFile } from "node:process";
import { and, eq, inArray } from "drizzle-orm";
import {
  auditLog,
  consents,
  courtBookings,
  formResponses,
  forms,
  getDatabase,
  idempotencyRecords,
  orders,
  people,
  rateLimitBuckets,
  registrations,
  sessions,
  ticketScanEvents,
  tickets,
  ticketTypes,
  waitlistEntries,
} from "../packages/db/src";
import {
  createApiContext,
  createCaller,
  createDemoActor,
  scopesForRoles,
  type ApiActor,
} from "../packages/api/src";
import { stableHash } from "../packages/api/src/canonical";

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
  const actor = createDemoActor(["player", "manager"]);
  assert(actor.organizationId, "Demo actor organization is required");
  const suffix = crypto.randomUUID();
  const secondPersonId = crypto.randomUUID();
  const sessionId = crypto.randomUUID();
  const formId = crypto.randomUUID();
  const orderId = crypto.randomUUID();
  const ticketTypeId = crypto.randomUUID();
  const ticketId = crypto.randomUUID();
  const ticketToken = `duna-commerce-verification-${suffix}`;
  const requestIds = Array.from({ length: 12 }, () => crypto.randomUUID());
  const keys = Array.from({ length: 10 }, () => crypto.randomUUID());
  const secondActor: ApiActor = {
    personId: secondPersonId,
    displayName: "Duna Verification Player",
    roles: ["player"],
    organizationId: actor.organizationId,
    scopes: scopesForRoles(["player"]),
    ageBand: "adult",
    isDemo: true,
  };
  const createdBookingIds: string[] = [];
  const createdRegistrationIds: string[] = [];
  const createdResponseIds: string[] = [];
  const createdConsentIds: string[] = [];
  const createdScanIds: string[] = [];

  try {
    await database.insert(people).values({
      id: secondPersonId,
      displayName: secondActor.displayName,
      handle: `commerce-${suffix}`.slice(0, 48),
      ageBand: "adult",
      isMinor: false,
      profileVisibility: "private",
    });
    await database.insert(sessions).values({
      id: sessionId,
      venueId: "10000000-0000-4000-8000-000000000002",
      title: "Connected commerce capacity verification",
      slug: `commerce-capacity-${suffix}`,
      startsAt: new Date("2030-08-04T01:00:00.000Z"),
      endsAt: new Date("2030-08-04T03:00:00.000Z"),
      timezone: "America/Los_Angeles",
      status: "registration-open",
      capacity: 1,
      minimumCapacity: 1,
      publishedAt: new Date("2026-07-30T20:00:00.000Z"),
    });

    const firstCaller = createCaller(
      createApiContext({
        actor,
        requestId: requestIds[0],
        now: new Date("2026-07-30T20:00:00.000Z"),
      }),
    );
    const secondCaller = createCaller(
      createApiContext({
        actor: secondActor,
        requestId: requestIds[1],
        now: new Date("2026-07-30T20:00:00.000Z"),
      }),
    );
    const [firstRegistration, secondRegistration] = await Promise.all([
      firstCaller.player.registerForSession({
        sessionId,
        idempotencyKey: keys[0],
      }),
      secondCaller.player.registerForSession({
        sessionId,
        idempotencyKey: keys[1],
      }),
    ]);
    const statuses = [
      firstRegistration.status,
      secondRegistration.status,
    ].sort();
    assert(
      statuses[0] === "confirmed" && statuses[1] === "waitlisted",
      `Capacity race was not serialized: ${statuses.join(", ")}`,
    );
    const registrationRows = await database
      .select({ id: registrations.id })
      .from(registrations)
      .where(eq(registrations.sessionId, sessionId));
    createdRegistrationIds.push(...registrationRows.map((row) => row.id));
    assert(
      registrationRows.length === 2,
      "Capacity race did not persist both registration decisions",
    );

    const bookingStart = "2026-08-06T18:00:00.000Z";
    const bookingEnd = "2026-08-06T19:00:00.000Z";
    const firstHold = await firstCaller.player.createCourtHold({
      courtId: "10000000-0000-4000-8000-000000000003",
      startsAt: bookingStart,
      endsAt: bookingEnd,
      idempotencyKey: keys[2],
    });
    assert(
      firstHold.success && firstHold.bookingId,
      "Court hold was not placed",
    );
    createdBookingIds.push(firstHold.bookingId);
    const competingHold = await secondCaller.player.createCourtHold({
      courtId: "10000000-0000-4000-8000-000000000003",
      startsAt: bookingStart,
      endsAt: bookingEnd,
      idempotencyKey: keys[3],
    });
    assert(
      !competingHold.success &&
        competingHold.status === "unavailable" &&
        competingHold.alternatives.length === 3,
      "Competing court hold did not return instant alternatives",
    );

    const waiverText =
      "Verification waiver text. The signer must see this exact version.";
    const waiverHash = stableHash(waiverText);
    await database.insert(forms).values({
      id: formId,
      organizationId: actor.organizationId,
      name: "Connected form verification",
      version: 1,
      schema: {
        title: "Connected form verification",
        fields: [
          {
            id: "emergencyPhone",
            type: "phone",
            label: "Emergency phone",
            required: true,
          },
        ],
      },
      documentText: waiverText,
      documentTextHash: waiverHash,
      publishedAt: new Date("2026-07-30T20:00:00.000Z"),
    });
    const submitted = await firstCaller.player.submitForm({
      formId,
      formVersion: 1,
      answers: { emergencyPhone: "+13105550123" },
      signatureValue: "Duna Verification Signer",
      idempotencyKey: keys[4],
    });
    createdResponseIds.push(submitted.responseId);
    assert(
      submitted.signed && submitted.documentTextHash === waiverHash,
      "Signed form was not bound to the exact document hash",
    );

    const consent = await firstCaller.player.recordConsent({
      scope: "marketing-email",
      granted: false,
      disclosureText:
        "Duna verification preference: promotional email remains disabled.",
      idempotencyKey: keys[5],
    });
    createdConsentIds.push(consent.consentId);
    assert(
      !consent.granted && consent.disclosureTextHash.length === 64,
      "Consent ledger did not persist an exact-text revocation",
    );

    await database.insert(orders).values({
      id: orderId,
      organizationId: actor.organizationId,
      buyerPersonId: actor.personId,
      status: "paid",
      currency: "USD",
      subtotalMinor: 0,
      feeTotalMinor: 0,
      taxTotalMinor: 0,
      totalMinor: 0,
      idempotencyKey: `commerce-order-${suffix}`,
    });
    await database.insert(ticketTypes).values({
      id: ticketTypeId,
      sessionId,
      name: "Verification admission",
      priceMinor: 0,
      currency: "USD",
      quantity: 1,
      minimumPerOrder: 1,
      maximumPerOrder: 1,
    });
    await database.insert(tickets).values({
      id: ticketId,
      ticketTypeId,
      orderId,
      ownerPersonId: actor.personId,
      token: ticketToken,
      status: "issued",
    });
    const firstScan = await firstCaller.operator.scanTicket({
      ticketToken,
      deviceId: "verification-gate-a",
      scannedAt: "2030-08-04T00:55:00.000Z",
      offline: false,
      idempotencyKey: keys[6],
    });
    createdScanIds.push(firstScan.scanEventId);
    assert(firstScan.accepted, "Issued ticket was not admitted");
    const duplicateScan = await firstCaller.operator.scanTicket({
      ticketToken,
      deviceId: "verification-gate-b",
      scannedAt: "2030-08-04T00:55:01.000Z",
      offline: true,
      idempotencyKey: keys[7],
    });
    createdScanIds.push(duplicateScan.scanEventId);
    assert(
      !duplicateScan.accepted &&
        duplicateScan.duplicate &&
        duplicateScan.reason === "already-scanned",
      "Second gate scan was not surfaced as a duplicate conflict",
    );

    process.stdout.write(
      `${JSON.stringify(
        {
          capacityRace: statuses,
          courtHold: firstHold.status,
          competingHold: competingHold.status,
          alternativeCount: competingHold.alternatives.length,
          formSigned: submitted.signed,
          formDocumentBound: submitted.documentTextHash === waiverHash,
          consentRevocationStored: !consent.granted,
          firstTicketScanAccepted: firstScan.accepted,
          duplicateTicketScanDetected: duplicateScan.duplicate,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await database
      .delete(auditLog)
      .where(inArray(auditLog.traceId, requestIds));
    await database
      .delete(idempotencyRecords)
      .where(inArray(idempotencyRecords.key, keys));
    await database
      .delete(rateLimitBuckets)
      .where(
        inArray(rateLimitBuckets.key, [
          `authenticated:${actor.personId}`,
          `authenticated:${secondActor.personId}`,
          `organization:${actor.organizationId}`,
          `session-registration:${actor.personId}`,
          `session-registration:${secondActor.personId}`,
          `court-hold:${actor.personId}`,
          `court-hold:${secondActor.personId}`,
          `form-submission:${actor.personId}`,
          `consent-write:${actor.personId}`,
          `ticket-scan:${actor.organizationId}`,
        ]),
      );
    if (createdScanIds.length > 0) {
      await database
        .delete(ticketScanEvents)
        .where(inArray(ticketScanEvents.id, createdScanIds));
    }
    await database.delete(tickets).where(eq(tickets.id, ticketId));
    await database.delete(ticketTypes).where(eq(ticketTypes.id, ticketTypeId));
    await database.delete(orders).where(eq(orders.id, orderId));
    if (createdConsentIds.length > 0) {
      await database
        .delete(consents)
        .where(inArray(consents.id, createdConsentIds));
    }
    if (createdResponseIds.length > 0) {
      await database
        .delete(formResponses)
        .where(inArray(formResponses.id, createdResponseIds));
    }
    await database.delete(forms).where(eq(forms.id, formId));
    if (createdBookingIds.length > 0) {
      await database
        .delete(courtBookings)
        .where(inArray(courtBookings.id, createdBookingIds));
    }
    await database
      .delete(waitlistEntries)
      .where(eq(waitlistEntries.sessionId, sessionId));
    if (createdRegistrationIds.length > 0) {
      await database
        .delete(registrations)
        .where(inArray(registrations.id, createdRegistrationIds));
    }
    await database.delete(sessions).where(eq(sessions.id, sessionId));
    await database.delete(people).where(eq(people.id, secondPersonId));
  }
}

void main();
