/**
 * Concierge (B7) against every real migration in in-memory Postgres:
 * existing conversations read as threads; the Send review follows the live
 * roster (a cancelled booking leaves, a junior's guardian is contacted);
 * a stale review is refused; confirming twice sends once; one delivery per
 * person on one frozen channel; outside channels answer "not configured"
 * without an HTTP call; recorded provider fixtures for the configured path;
 * signed, idempotent webhooks; inbound routing, quarantine and STOP;
 * permissions; PART-B's cancellation notes become Send reviews; and the
 * thread list takes a fixed number of queries whatever its size.
 */
import { createHmac } from "node:crypto";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const state = vi.hoisted(() => ({ db: null as unknown, queries: 0 }));
// PGlite is one session: a transaction that also reads through the plain
// handle (as the existing messaging send does) would wait on itself. Run
// transaction callbacks on the same handle; the service code is unchanged.
vi.mock("@duna/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDatabase: () => state.db,
  getTransactionalDatabase: () =>
    new Proxy(state.db as object, {
      get(target, property, receiver) {
        if (property === "transaction")
          return (callback: (tx: unknown) => unknown) => callback(state.db);
        return Reflect.get(target, property, receiver);
      },
    }),
}));

import {
  academy,
  applyAllMigrations,
  createCatalogTestDatabase,
  seedAcademy,
  testActor,
} from "../../catalog-booking.test-support";
import { startCatalogCheckout } from "../../catalog-checkout";
import type { ApiActor } from "../../context";
import { createApiContext } from "../../context";
import { createCaller } from "../../router";
import { setConciergeFetchForTests } from "./adapters";
import {
  applyConciergeDeliveryStatus,
  processConciergeDelivery,
} from "./delivery";
import { receiveConciergeWhatsappWebhook } from "./inbound";
import { listConciergeThreads } from "./threads";

const { pg, db } = createCatalogTestDatabase();
state.db = db;
const { org, coach, owner, players, item, variant, occurrence, now } = academy;
const guardian = players[0]!;
const child = "31000000-0000-4000-8000-000000000001";
const otherOrg = "11000000-0000-4000-8000-000000000001";
const legacyThread = "71000000-0000-4000-8000-000000000001";
const otherThread = "71000000-0000-4000-8000-000000000002";
const whatsappNumber = "+13105550142";
const webhookSecret = `whsec_${Buffer.from("b7-test-secret-0123456789abcdef").toString("base64")}`;

const staff = (personId: string, role: "coach" | "owner"): ApiActor => ({
  ...testActor(personId, org),
  roles: [role],
  scopes:
    role === "owner"
      ? ["*"]
      : [
          "messages:read",
          "messages:propose",
          "messages:write",
          "sessions:read",
        ],
});
const coachActor = staff(coach, "coach");
const ownerActor = staff(owner, "owner");
const api = (actor: ApiActor, at = now) =>
  createCaller(createApiContext({ actor, now: at }));
const key = () => crypto.randomUUID();

function book(personId: string, participantPersonId?: string) {
  return startCatalogCheckout({
    actor: testActor(personId),
    catalogItemId: item,
    catalogVariantId: variant,
    paymentMethod: "credit",
    quantity: 1,
    catalogSessionOccurrenceId: occurrence,
    ...(participantPersonId ? { participantPersonId } : {}),
    successUrl: "",
    cancelUrl: "",
    idempotencyKey: key(),
    requestId: key(),
    now,
  });
}

async function rows<T>(sql: string, parameters: unknown[] = []) {
  return (await pg.query<T>(sql, parameters)).rows;
}

async function connectWhatsapp(personId: string, preferred = true) {
  await pg.exec(`
    INSERT INTO person_channel_endpoints (person_id, channel, destination, status, verified_at)
      VALUES ('${personId}', 'whatsapp', '${whatsappNumber}', 'connected', '${now.toISOString()}');
    ${preferred ? `INSERT INTO person_channel_preferences (person_id, preferred_channel) VALUES ('${personId}', 'whatsapp');` : ""}
  `);
}

function signed(body: unknown, at = now) {
  const raw = JSON.stringify(body);
  const id = `msg_${key()}`;
  const timestamp = String(Math.floor(at.getTime() / 1000));
  const signature = `v1,${createHmac(
    "sha256",
    Buffer.from(webhookSecret.slice(6), "base64"),
  )
    .update(`${id}.${timestamp}.${raw}`)
    .digest("base64")}`;
  return {
    rawBody: raw,
    headers: new Headers({
      "webhook-id": id,
      "webhook-timestamp": timestamp,
      "webhook-signature": signature,
    }),
  };
}

beforeAll(() => applyAllMigrations(pg), 180_000);
afterAll(() => pg.close());
beforeEach(async () => {
  vi.useFakeTimers({ now, toFake: ["Date"] });
  vi.stubEnv("SENT_DM_API", "");
  vi.stubEnv("SENT_DM_API_KEY", "");
  vi.stubEnv("SENT_DM_WEBHOOK_SECRET", webhookSecret);
  await seedAcademy(pg);
  await pg.exec(`
    INSERT INTO people (id, display_name, handle, is_minor)
      VALUES ('${child}', 'Mia Junior', 'mia-junior', true);
    INSERT INTO guardianships (guardian_id, minor_id, relationship, verified, review_status, can_approve_spending)
      VALUES ('${guardian}', '${child}', 'parent', true, 'verified', true);
    INSERT INTO organizations (id, slug, name, currency, timezone)
      VALUES ('${otherOrg}', 'other-club', 'Other Club', 'USD', 'UTC');
    -- An existing (pre-Concierge) club conversation with one message.
    INSERT INTO messaging_conversations (id, organization_id, type, title, created_by_principal_type, created_by_principal_id, last_message_sequence, last_message_at)
      VALUES ('${legacyThread}', '${org}', 'dm', 'Player 2', 'organization', '${org}', 1, '${now.toISOString()}'),
             ('${otherThread}', '${otherOrg}', 'dm', 'Other', 'organization', '${otherOrg}', 0, NULL);
    INSERT INTO messaging_conversation_participants (conversation_id, principal_type, principal_id, organization_id, person_id)
      VALUES ('${legacyThread}', 'organization', '${org}', '${org}', NULL),
             ('${legacyThread}', 'user', '${players[2]}', NULL, '${players[2]}'),
             ('${otherThread}', 'organization', '${otherOrg}', '${otherOrg}', NULL);
    INSERT INTO conversation_messages (conversation_id, sequence, client_message_id, sender_principal_type, sender_principal_id, sender_person_id, kind, body, status, published_at, created_at)
      VALUES ('${legacyThread}', 1, '${key()}', 'user', '${players[2]}', '${players[2]}', 'text', 'Is the clinic still on?', 'published', '${now.toISOString()}', '${now.toISOString()}');
  `);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  setConciergeFetchForTests(undefined);
});

describe("existing conversations are threads (compatibility read, no copy)", () => {
  it("lists and opens a pre-Concierge conversation for the club and the person", async () => {
    const page = await api(coachActor).operator.concierge.threads({
      filter: "all",
      limit: 25,
    });
    const legacy = page.items.find((t) => t.conversationId === legacyThread);
    expect(legacy).toMatchObject({ kind: "club", unreadCount: 1 });
    expect(page.counts).toMatchObject({ all: 1, unread: 1 });
    const unread = await api(coachActor).operator.concierge.threads({
      filter: "unread",
      limit: 25,
      queue: "unassigned",
    });
    expect(unread.items).toHaveLength(1);
    const thread = await api(coachActor).operator.concierge.thread({
      conversationId: legacyThread,
    });
    expect(thread.messages[0]).toMatchObject({
      kind: "person",
      body: "Is the clinic still on?",
    });
    const mine = await api(testActor(players[2]!)).player.concierge.thread({
      conversationId: legacyThread,
    });
    expect(mine.messages[0]?.kind).toBe("mine");
    // Nothing was copied: Concierge has no thread table of its own.
    expect(
      await rows("select count(*)::int as n from messaging_conversations"),
    ).toEqual([{ n: 2 }]);
  });

  it("answers not found for another club's thread and for non-participants", async () => {
    await expect(
      api(coachActor).operator.concierge.thread({
        conversationId: otherThread,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      api(testActor(players[3]!)).player.concierge.thread({
        conversationId: legacyThread,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      api(coachActor).operator.concierge.draftSend({
        conversationId: otherThread,
        body: "Hello",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("takes the same number of queries for 1 thread and for 30", async () => {
    const count = async () => {
      state.queries = 0;
      const original = pg.query.bind(pg);
      const spy = vi
        .spyOn(pg, "query")
        .mockImplementation((...args: Parameters<typeof pg.query>) => {
          state.queries += 1;
          return original(...args);
        });
      await listConciergeThreads(
        { kind: "club", organizationId: org, personId: coach },
        { filter: "all", limit: 50 },
      );
      spy.mockRestore();
      return state.queries;
    };
    const one = await count();
    for (let index = 0; index < 29; index += 1) {
      const id = key();
      await pg.exec(`
        INSERT INTO messaging_conversations (id, organization_id, type, title, created_by_principal_type, created_by_principal_id)
          VALUES ('${id}', '${org}', 'dm', 'Thread ${index}', 'organization', '${org}');
        INSERT INTO messaging_conversation_participants (conversation_id, principal_type, principal_id, organization_id)
          VALUES ('${id}', 'organization', '${org}', '${org}');
      `);
    }
    expect(await count()).toBe(one);
  });
});

describe("the Send review follows the roster and sends exactly what was reviewed", () => {
  it("resolves the booked people, contacts the junior's guardian, refuses a stale review and sends once", async () => {
    await book(players[1]!);
    await book(players[2]!);
    await book(guardian, child);
    const handoff = await api(
      coachActor,
    ).operator.concierge.drafts.createFromHandoff({
      source: "hq.offerings.session",
      contextType: "lesson",
      contextId: occurrence,
      suggestedText: "Bring water: it will be hot.",
    });
    const review = handoff.proposal!;
    expect(review.status).toBe("ready");
    const byName = Object.fromEntries(
      review.recipients.map((r) => [r.person.displayName, r]),
    );
    expect(byName["Player 2"]?.channel).toBe("duna");
    expect(byName["Player 3"]?.channel).toBe("duna");
    expect(byName["Mia Junior"]?.channel).toBe("duna");
    expect(byName["Player 1"]).toMatchObject({
      channel: "duna",
      guardianOf: { displayName: "Mia Junior" },
    });
    expect(review.guardianNote).toBeTruthy();
    expect(review.recipients.some((r) => r.person.personId === coach)).toBe(
      false,
    );

    // Player 3 cancels: the reviewed hash no longer matches the roster.
    await pg.exec(
      `UPDATE catalog_fulfillments SET status = 'cancelled' WHERE person_id = '${players[2]}'`,
    );
    await expect(
      api(coachActor).operator.concierge.confirmSend({
        proposalId: review.proposalId,
        contentHash: review.contentHash,
        idempotencyKey: key(),
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const refreshed = await api(coachActor).operator.concierge.proposal({
      proposalId: review.proposalId,
    });
    expect(refreshed.recipients.map((r) => r.person.displayName)).not.toContain(
      "Player 3",
    );

    const idempotencyKey = key();
    const sent = await api(coachActor).operator.concierge.confirmSend({
      proposalId: review.proposalId,
      contentHash: refreshed.contentHash,
      idempotencyKey,
    });
    const again = await api(coachActor).operator.concierge.confirmSend({
      proposalId: review.proposalId,
      contentHash: refreshed.contentHash,
      idempotencyKey: key(),
    });
    expect(again.messageId).toBe(sent.messageId);
    expect(sent.confirmedBy?.personId).toBe(coach);
    const messages = await rows<{ n: number }>(
      `select count(*)::int as n from conversation_messages where conversation_id = $1`,
      [handoff.conversationId],
    );
    expect(messages[0]!.n).toBe(1);
    const deliveries = await api(coachActor).operator.concierge.deliveries({
      proposalId: review.proposalId,
    });
    expect(deliveries.deliveries).toHaveLength(refreshed.recipients.length);
    expect(
      new Set(deliveries.deliveries.map((d) => d.person.personId)).size,
    ).toBe(deliveries.deliveries.length);
    // A junior is in the thread, so the club message is held for screening.
    expect(deliveries.deliveries.every((d) => d.status === "queued")).toBe(
      true,
    );
    // Audit rows carry counts, never the text.
    const audit = await rows<{ reason: string }>(
      `select reason from audit_log where entity_id = $1`,
      [review.proposalId],
    );
    expect(audit.length).toBeGreaterThan(0);
    expect(audit.every((row) => !row.reason.includes("Bring water"))).toBe(
      true,
    );
  });

  it("an outside channel says not configured with no HTTP call, then delivers once configured", async () => {
    await book(players[1]!);
    await connectWhatsapp(players[1]!);
    const fetches: string[] = [];
    setConciergeFetchForTests(async (url) => {
      fetches.push(String(url));
      return new Response(
        JSON.stringify({ data: [{ message_id: "sentdm-msg-1" }] }),
        { status: 200 },
      );
    });
    const blocked = await api(
      coachActor,
    ).operator.concierge.drafts.createFromHandoff({
      source: "hq.offerings.session",
      contextType: "lesson",
      contextId: occurrence,
      suggestedText: "Court 2 today.",
    });
    expect(blocked.proposal!.recipients[0]).toMatchObject({
      unreachableReason: "provider-not-configured",
    });
    expect(fetches).toEqual([]);

    vi.stubEnv("SENT_DM_API", "test-key-for-recorded-fixture");
    const review = await api(coachActor).operator.concierge.draftSend({
      conversationId: blocked.conversationId,
      body: "Court 2 today.",
    });
    expect(review.recipients[0]?.channel).toBe("whatsapp");
    await api(coachActor).operator.concierge.confirmSend({
      proposalId: review.proposalId,
      contentHash: review.contentHash,
      idempotencyKey: key(),
    });
    const [delivery] = await rows<{ id: string }>(
      `select id from concierge_deliveries where proposal_id = $1`,
      [review.proposalId],
    );
    const jobs = await rows<{ kind: string }>(
      `select kind from workflow_jobs where kind = 'concierge.deliver'`,
    );
    expect(jobs).toHaveLength(1);
    expect(
      await processConciergeDelivery({ deliveryId: delivery!.id }, now),
    ).toBe("sent");
    expect(fetches).toEqual(["https://api.sent.dm/v3/messages"]);
    // Replays never send again.
    expect(
      await processConciergeDelivery({ deliveryId: delivery!.id }, now),
    ).toBe("already-settled");
    expect(fetches).toHaveLength(1);
    // Signed status webhook moves it forward; a replay is ignored.
    const status = signed({
      field: "message",
      event: "message.delivered",
      payload: {
        message_id: "sentdm-msg-1",
        channel: "whatsapp",
        message_status: "DELIVERED",
      },
    });
    expect(
      await receiveConciergeWhatsappWebhook({ ...status, now }),
    ).toMatchObject({ status: 200, disposition: "status-applied" });
    expect(
      await applyConciergeDeliveryStatus({
        channel: "whatsapp",
        handle: "sentdm-msg-1",
        status: "sent",
        now,
      }),
    ).toBe("ignored");
    const settled = await api(coachActor).operator.concierge.proposal({
      proposalId: review.proposalId,
    });
    expect(settled.status).toBe("sent");
  });

  it("retries a transient failure on the same channel and never switches", async () => {
    await book(players[1]!);
    await connectWhatsapp(players[1]!);
    vi.stubEnv("SENT_DM_API", "test-key-for-recorded-fixture");
    setConciergeFetchForTests(
      async () => new Response(JSON.stringify({}), { status: 503 }),
    );
    const { proposal } = await api(
      coachActor,
    ).operator.concierge.drafts.createFromHandoff({
      source: "test",
      contextType: "lesson",
      contextId: occurrence,
      suggestedText: "Hello",
    });
    await api(coachActor).operator.concierge.confirmSend({
      proposalId: proposal!.proposalId,
      contentHash: proposal!.contentHash,
      idempotencyKey: key(),
    });
    const [delivery] = await rows<{ id: string }>(
      `select id from concierge_deliveries`,
    );
    await expect(
      processConciergeDelivery({ deliveryId: delivery!.id }, now),
    ).rejects.toThrow(/http-503/);
    expect(
      await processConciergeDelivery(
        { deliveryId: delivery!.id, jobAttempts: 8, maximumAttempts: 8 },
        now,
      ),
    ).toBe("failed");
    const [row] = await rows<{ channel: string; attempts: number }>(
      `select channel, attempts from concierge_deliveries`,
    );
    expect(row).toEqual({ channel: "whatsapp", attempts: 2 });
  });
});

describe("inbound replies", () => {
  async function sentWhatsapp() {
    await book(players[1]!);
    await connectWhatsapp(players[1]!);
    vi.stubEnv("SENT_DM_API", "test-key-for-recorded-fixture");
    setConciergeFetchForTests(
      async () =>
        new Response(JSON.stringify({ data: [{ message_id: "m-1" }] }), {
          status: 200,
        }),
    );
    const { proposal, conversationId } = await api(
      coachActor,
    ).operator.concierge.drafts.createFromHandoff({
      source: "test",
      contextType: "lesson",
      contextId: occurrence,
      suggestedText: "See you at 9.",
    });
    await api(coachActor).operator.concierge.confirmSend({
      proposalId: proposal!.proposalId,
      contentHash: proposal!.contentHash,
      idempotencyKey: key(),
    });
    return conversationId;
  }
  const inbound = (text: string, from = whatsappNumber) =>
    signed({
      field: "message",
      event: "message.received",
      payload: {
        message_id: key(),
        inbound_number: from,
        outbound_number: "+18885550100",
        text,
        channel: "whatsapp",
      },
    });

  it("posts a reply as that person in the right thread, once", async () => {
    const conversationId = await sentWhatsapp();
    const event = inbound("Thanks, see you there");
    expect(
      await receiveConciergeWhatsappWebhook({ ...event, now }),
    ).toMatchObject({ disposition: "posted" });
    expect(
      await receiveConciergeWhatsappWebhook({ ...event, now }),
    ).toMatchObject({ disposition: "duplicate" });
    const thread = await api(coachActor).operator.concierge.thread({
      conversationId,
    });
    const reply = thread.messages.find(
      (m) => m.body === "Thanks, see you there",
    );
    expect(reply).toMatchObject({ kind: "person", channel: "whatsapp" });
  });

  it("quarantines unknown senders and rejects a bad signature", async () => {
    await sentWhatsapp();
    expect(
      await receiveConciergeWhatsappWebhook({
        ...inbound("who is this", "+13105559999"),
        now,
      }),
    ).toMatchObject({ disposition: "quarantined-unknown-sender" });
    const event = inbound("hello");
    event.headers.set("webhook-signature", "v1,AAAA");
    expect(await receiveConciergeWhatsappWebhook({ ...event, now })).toEqual({
      status: 401,
    });
  });

  it("honours STOP at once: the next review says no consent", async () => {
    const conversationId = await sentWhatsapp();
    expect(
      await receiveConciergeWhatsappWebhook({ ...inbound("STOP"), now }),
    ).toMatchObject({ disposition: "opted-out" });
    const review = await api(coachActor).operator.concierge.draftSend({
      conversationId,
      body: "Another update",
    });
    expect(review.recipients[0]).toMatchObject({
      unreachableReason: "no-consent",
    });
    const [endpoint] = await rows<{ status: string; revoked_reason: string }>(
      `select status, revoked_reason from person_channel_endpoints`,
    );
    expect(endpoint).toEqual({ status: "revoked", revoked_reason: "opt-out" });
  });
});

describe("PART-B hand-offs create Send reviews, never sends", () => {
  it("a cancellation note becomes a review for the people it cancelled", async () => {
    await book(players[1]!);
    const result = await api(ownerActor).operator.participation.cancelSession({
      subjectType: "catalog-session-occurrence",
      subjectId: occurrence,
      reason: "weather",
      note: "Sorry, rain. Credits are back in your wallet.",
      confirmed: true,
      idempotencyKey: key(),
    });
    expect(result.conciergeDraft?.proposalId).toBeTruthy();
    const proposal = await api(ownerActor).operator.concierge.proposal({
      proposalId: result.conciergeDraft!.proposalId!,
    });
    expect(proposal.status).toBe("ready");
    expect(proposal.recipients.map((r) => r.person.personId)).toContain(
      players[1],
    );
    expect(await rows(`select id from concierge_deliveries`)).toEqual([]);
  });

  it("declining a coach's request opens a thread with the coach and a review of the note", async () => {
    await book(players[1]!);
    const { requestId } = await api(
      coachActor,
    ).operator.participation.requestCancel({
      subjectType: "catalog-session-occurrence",
      subjectId: occurrence,
      reason: "weather",
      idempotencyKey: key(),
    });
    const resolved = await api(
      ownerActor,
    ).operator.participation.resolveCancelRequest({
      requestId,
      decision: "decline",
      note: "Forecast cleared; let's run it.",
      confirmed: true,
      idempotencyKey: key(),
    });
    expect(resolved.coachNotified).toBe(false);
    const proposal = await api(ownerActor).operator.concierge.proposal({
      proposalId: resolved.conciergeDraft!.proposalId!,
    });
    expect(proposal.recipients.map((r) => r.person.personId)).toEqual([coach]);
  });
});

describe("B4 hand-off: notify athletes prepares a review in the program thread", () => {
  it("cancelling a program with notifyAthletes returns a Send review for its athletes", async () => {
    const program = "60000000-0000-4000-8000-0000000000a1";
    await pg.exec(`
      INSERT INTO training_programs (id, organization_id, slug, title, purpose, target_audience, approach, start_date, end_date, timezone)
        VALUES ('${program}', '${org}', 'winter', 'Winter juniors', '', '', '', '2026-11-01', '2027-01-31', 'UTC');
      INSERT INTO training_program_participants (program_id, person_id, role, status)
        VALUES ('${program}', '${players[3]}', 'athlete', 'active'),
               ('${program}', '${players[4]}', 'athlete', 'removed');
    `);
    const result = await api(ownerActor).operator.trainingPrograms.cancel({
      programId: program,
      reason: "Gym closed for repairs.",
      notifyAthletes: true,
    });
    expect(result.status).toBe("cancelled");
    const proposal = await api(ownerActor).operator.concierge.proposal({
      proposalId: result.conciergeDraft!.proposalId!,
    });
    expect(proposal.body).toContain("Gym closed for repairs.");
    expect(proposal.recipients.map((r) => r.person.personId)).toEqual([
      players[3],
    ]);
    expect(await rows(`select id from concierge_deliveries`)).toEqual([]);
  });
});

describe("channels", () => {
  it("connecting while unavailable never calls a provider; juniors cannot connect", async () => {
    const fetches: string[] = [];
    setConciergeFetchForTests(async (url) => {
      fetches.push(String(url));
      return new Response("{}");
    });
    const result = await api(
      testActor(players[1]!),
    ).player.concierge.connectChannel({
      channel: "whatsapp",
      destination: whatsappNumber,
    });
    expect(result).toEqual({ availability: "provider-not-configured" });
    expect(fetches).toEqual([]);
    await expect(
      api(testActor(players[1]!)).player.concierge.setPreference({
        preferredChannel: "whatsapp",
      }),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    vi.stubEnv("SENT_DM_API", "test-key-for-recorded-fixture");
    await expect(
      api(testActor(child, undefined, "teen")).player.concierge.connectChannel({
        channel: "whatsapp",
        destination: whatsappNumber,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("verifies with the code sent through the channel, then prefers it", async () => {
    vi.stubEnv("SENT_DM_API", "test-key-for-recorded-fixture");
    let code = "";
    setConciergeFetchForTests(async (_url, init) => {
      code = JSON.parse(String(init?.body)).template.parameters.code;
      return new Response(JSON.stringify({ data: [{ id: "v-1" }] }));
    });
    const player = api(testActor(players[1]!)).player.concierge;
    const started = await player.connectChannel({
      channel: "whatsapp",
      destination: whatsappNumber,
    });
    expect(started.endpoint?.status).toBe("pending-verification");
    expect(started.endpoint?.destinationHint).toBe("••• 0142");
    await expect(
      player.verifyChannel({
        endpointId: started.endpoint!.endpointId,
        code: code === "000000" ? "111111" : "000000",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const verified = await player.verifyChannel({
      endpointId: started.endpoint!.endpointId,
      code,
    });
    expect(verified.status).toBe("connected");
    const channels = await player.setPreference({
      preferredChannel: "whatsapp",
      operationalChannel: "duna",
      quietHours: {
        start: "21:00",
        end: "07:00",
        timezone: "America/Los_Angeles",
      },
    });
    expect(channels).toMatchObject({
      preferredChannel: "whatsapp",
      operationalChannel: "duna",
    });
    const stored = await rows<{ code_hash: string }>(
      `select code_hash from concierge_channel_verifications`,
    );
    expect(stored[0]!.code_hash).not.toContain(code);
  });
});
