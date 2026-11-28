/**
 * INVITE-SMS against every real migration in in-memory Postgres: preview →
 * send for a court booking (a new invitee becomes a booking participant), a
 * session (the sender's share link), the idempotent send, the stale preview,
 * an opt-out arriving by signed webhook, a junior's number, the per-number
 * limit, and another person's booking answering "not found". The provider is
 * a recorded fake: nothing here calls a real provider.
 */
import { generateKeyPairSync, sign, constants } from "node:crypto";
import * as schema from "@duna/db/schema";
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

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@duna/db", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getDatabase: () => state.db,
  getTransactionalDatabase: () => state.db,
}));

import {
  academy,
  applyAllMigrations,
  createCatalogTestDatabase,
  seedAcademy,
  testActor,
} from "../../catalog-booking.test-support";
import { startCatalogCheckout } from "../../catalog-checkout";
import { createApiContext } from "../../context";
import { createCaller } from "../../router";
import type { InviteSmsSendRequest, InviteSmsSendResult } from "./sms-provider";
import { setInviteSmsProviderForTests } from "./sms-provider";
import { previewInviteSms, sendInviteSms, InviteSmsError } from "./sms-invites";
import { receiveInviteSmsWebhook } from "./webhook";

void schema;
const { pg, db } = createCatalogTestDatabase();
state.db = db;
const { org, players, item, variant, occurrence, now } = academy;
const host = players[0]!;
const stranger = players[1]!;
const venue = "61000000-0000-4000-8000-0000000000a1";
const court = "62000000-0000-4000-8000-0000000000a1";
const booking = "63000000-0000-4000-8000-0000000000a1";
const junior = "31000000-0000-4000-8000-0000000000a1";
const JUNIOR_PHONE = "+13104820188";

const sent: InviteSmsSendRequest[] = [];
let nextOutcome: (request: InviteSmsSendRequest) => InviteSmsSendResult = (
  request,
) => ({ kind: "sent", providerMessageId: `tx_${request.correlationId}` });

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

function signed(body: unknown) {
  const raw = Buffer.from(JSON.stringify(body));
  const signature = sign("sha256", raw, {
    key: privateKey,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: constants.RSA_PSS_SALTLEN_MAX_SIGN,
  }).toString("base64url");
  return {
    rawBody: new Uint8Array(raw),
    signature: `rsassa-pss-sha256=${signature}`,
  };
}

const recipients = [
  { name: "Sam Beach", phoneE164: "+1 (310) 482-0142" },
  { name: "Jordan", phoneE164: "3104820177" },
];

beforeAll(() => applyAllMigrations(pg), 120_000);
afterAll(() => pg.close());
afterEach(() => {
  setInviteSmsProviderForTests(undefined);
  delete process.env.PRELUDE_WEBHOOK_PUBLIC_KEY;
});
beforeEach(async () => {
  await seedAcademy(pg);
  await pg.exec(`
    TRUNCATE invite_sms_messages, sms_suppressions, rate_limit_buckets, idempotency_records, webhook_events;
    UPDATE people SET given_name = 'Alex', family_name = 'Rivera', phone_e164 = '+13104820100' WHERE id = '${host}';
    INSERT INTO people (id, display_name, handle, is_minor, birth_date, age_band, phone_e164)
      VALUES ('${junior}', 'Mia Junior', 'mia-junior', true, '2014-05-01', 'under-13', '${JUNIOR_PHONE}');
    INSERT INTO venues (id, organization_id, slug, name, status, timezone)
      VALUES ('${venue}', '${org}', 'demo-beach', 'Sunset Beach Courts', 'active', 'America/Los_Angeles');
    INSERT INTO courts (id, venue_id, name, qr_token) VALUES ('${court}', '${venue}', 'Court 1', 'qr-invite-sms-test');
    INSERT INTO court_bookings (id, organization_id, venue_id, court_id, person_id, starts_at, ends_at, status, idempotency_key)
      VALUES ('${booking}', '${org}', '${venue}', '${court}', '${host}', '2026-12-06T17:00:00Z', '2026-12-06T18:30:00Z', 'confirmed', 'invite-sms-booking');
  `);
  sent.length = 0;
  nextOutcome = (request) => ({
    kind: "sent",
    providerMessageId: `tx_${request.correlationId}`,
  });
  setInviteSmsProviderForTests({
    isConfigured: () => true,
    send: async (request) => {
      sent.push(request);
      return nextOutcome(request);
    },
  });
}, 60_000);

const preview = (personId = host, list = recipients) =>
  previewInviteSms({
    actor: testActor(personId),
    request: {
      inviteKind: "court-booking",
      subjectId: booking,
      recipients: list,
    },
    sendState: "ready",
    now,
  });

describe("court booking invitations by text", () => {
  it("previews the exact text in the venue's time and sends one text per person", async () => {
    const result = await preview();
    expect(result.readyCount).toBe(2);
    const first = result.recipients[0]!;
    expect(first.maskedNumber).toBe("•••• 0142");
    expect(first.text).toMatch(
      /^Duna: Alex R\. invited you to a court booking at Sunset Beach Courts on Sun, Dec 6 at 9:00 AM PST\. Join here: https?:\/\/\S+\/app\/booking-invite\/[0-9a-f-]{36} Reply STOP to opt out\.$/,
    );
    const stored = await pg.query<{ phone: string | null }>(
      `select invited_phone_e164 as phone from court_booking_participants`,
    );
    expect(stored.rows).toHaveLength(0); // the preview creates no invitation

    const outcome = await sendInviteSms({
      actor: testActor(host),
      request: {
        inviteKind: "court-booking",
        subjectId: booking,
        recipients,
        previewHash: result.previewHash,
        confirmed: true,
        idempotencyKey: "send-0001",
      },
      requestId: "req",
      now,
    });
    expect(outcome.sentCount).toBe(2);
    expect(sent).toHaveLength(2);
    expect(sent[0]!.to).toBe("+13104820142");
    expect(sent[0]!.variables.link).toBe(
      first.text!.match(/Join here: (\S+)/)![1],
    );
    const participants = await pg.query<{ phone: string; status: string }>(
      `select invited_phone_e164 as phone, status from court_booking_participants order by invited_phone_e164`,
    );
    expect(participants.rows).toEqual([
      { phone: "+13104820142", status: "invited" },
      { phone: "+13104820177", status: "invited" },
    ]);
    // No number is stored on the text records, only a hash and last four.
    const columns = await pg.query<{ row: string }>(
      `select row_to_json(m)::text as row from invite_sms_messages m`,
    );
    for (const { row } of columns.rows) expect(row).not.toContain("4820142");
  });

  it("is idempotent: the same key replays the first answer and sends nothing more", async () => {
    const result = await preview();
    const caller = createCaller(
      createApiContext({ actor: testActor(host), now }),
    );
    const input = {
      inviteKind: "court-booking" as const,
      subjectId: booking,
      recipients,
      previewHash: result.previewHash,
      confirmed: true as const,
      idempotencyKey: "send-idem-0001",
    };
    const first = await caller.player.invites.sendSms(input);
    const second = await caller.player.invites.sendSms(input);
    expect(second).toEqual(first);
    expect(sent).toHaveLength(2);
    const status = await caller.player.invites.smsStatus({
      inviteKind: "court-booking",
      subjectId: booking,
    });
    expect(status.recipients.map((r) => r.state).sort()).toEqual([
      "sent",
      "sent",
    ]);
  });

  it("refuses a stale preview (the list changed) and an already-used preview", async () => {
    const result = await preview();
    await expect(
      sendInviteSms({
        actor: testActor(host),
        request: {
          inviteKind: "court-booking",
          subjectId: booking,
          recipients: [recipients[0]!],
          previewHash: result.previewHash,
          confirmed: true,
          idempotencyKey: "send-stale-1",
        },
        requestId: "req",
        now,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(sent).toHaveLength(0);
    await sendInviteSms({
      actor: testActor(host),
      request: {
        inviteKind: "court-booking",
        subjectId: booking,
        recipients,
        previewHash: result.previewHash,
        confirmed: true,
        idempotencyKey: "send-stale-2",
      },
      requestId: "req",
      now,
    });
    await expect(
      sendInviteSms({
        actor: testActor(host),
        request: {
          inviteKind: "court-booking",
          subjectId: booking,
          recipients,
          previewHash: result.previewHash,
          confirmed: true,
          idempotencyKey: "send-stale-3",
        },
        requestId: "req",
        now,
      }),
    ).rejects.toBeInstanceOf(InviteSmsError);
    // A new preview now lists both as already invited.
    const again = await preview();
    expect(again.recipients.map((r) => r.reason)).toEqual([
      "already-invited",
      "already-invited",
    ]);
  });

  it("honours STOP from the signed webhook, delivery receipts and duplicates", async () => {
    process.env.PRELUDE_WEBHOOK_PUBLIC_KEY = publicKey
      .export({ type: "spki", format: "pem" })
      .toString();
    const result = await preview(host, [recipients[0]!]);
    await sendInviteSms({
      actor: testActor(host),
      request: {
        inviteKind: "court-booking",
        subjectId: booking,
        recipients: [recipients[0]!],
        previewHash: result.previewHash,
        confirmed: true,
        idempotencyKey: "send-webhook-1",
      },
      requestId: "req",
      now,
    });
    const messageId = `tx_${sent[0]!.correlationId}`;
    const delivered = signed({
      id: "evt_delivered_1",
      type: "transactional.message.delivered",
      payload: {
        id: "att_1",
        message_id: messageId,
        status: "delivered",
        channel: "sms",
        correlation_id: sent[0]!.correlationId,
      },
      created_at: now.toISOString(),
    });
    expect((await receiveInviteSmsWebhook({ ...delivered, now })).status).toBe(
      200,
    );
    expect(
      (await receiveInviteSmsWebhook({ ...delivered, now })).duplicate,
    ).toBe(true);
    // A late "failed" never overwrites "delivered".
    const failed = signed({
      id: "evt_failed_1",
      type: "transactional.message.failed",
      payload: { message_id: messageId, status: "failed", reason: "network" },
      created_at: now.toISOString(),
    });
    await receiveInviteSmsWebhook({ ...failed, now });
    const row = await pg.query<{ status: string; channel: string }>(
      `select status, channel from invite_sms_messages where status <> 'previewed'`,
    );
    expect(row.rows[0]).toEqual({ status: "delivered", channel: "sms" });

    const bad = signed({
      id: "evt_x",
      type: "marketing.subscription.stop",
      payload: {},
    });
    expect(
      (
        await receiveInviteSmsWebhook({
          rawBody: bad.rawBody,
          signature: "rsassa-pss-sha256=AAAA",
          now,
        })
      ).status,
    ).toBe(401);

    const stop = signed({
      id: "evt_stop_1",
      type: "marketing.subscription.stop",
      payload: {
        action: "STOP",
        from: "+13104820177",
        to: "36184",
        received_at: now.toISOString(),
      },
      created_at: now.toISOString(),
    });
    expect((await receiveInviteSmsWebhook({ ...stop, now })).status).toBe(200);
    const after = await preview(host, [recipients[1]!]);
    expect(after.recipients[0]).toMatchObject({
      state: "blocked",
      reason: "opted-out",
    });
    expect(after.recipients[0]!.text).toBeUndefined();
  });

  it("never texts a junior's number or the sender's own, and limits texts per number", async () => {
    const result = await preview(host, [
      { name: "Mia", phoneE164: JUNIOR_PHONE },
      { name: "Me", phoneE164: "+13104820100" },
      { name: "Typo", phoneE164: "12345" },
    ]);
    expect(result.recipients.map((r) => r.reason)).toEqual([
      "junior",
      "own-number",
      "invalid-number",
    ]);
    expect(result.readyCount).toBe(0);

    // Three texts to one number in a day (from anyone) is the limit.
    await pg.exec(`
      INSERT INTO invite_sms_messages (sender_person_id, invite_kind, subject_id, preview_hash, destination_hash, destination_last4, recipient_name, status, preview_expires_at, sent_at)
      SELECT '${stranger}', 'court-booking', gen_random_uuid(), md5(random()::text) || md5(random()::text),
        encode(sha256(convert_to('duna.invite-sms.destination.v1:+13104820142', 'UTF8')), 'hex'), '0142', 'Sam', 'sent', now(), '${now.toISOString()}'
      FROM generate_series(1, 3);
    `);
    const limited = await preview(host, [recipients[0]!]);
    expect(limited.recipients[0]!.reason).toBe("rate-limited");
  });

  it("answers not found for someone else's booking", async () => {
    await expect(preview(stranger)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("records a provider refusal and suppresses an unsubscribed number", async () => {
    nextOutcome = () => ({ kind: "rejected", code: "unsubscribed" });
    const result = await preview(host, [recipients[0]!]);
    const outcome = await sendInviteSms({
      actor: testActor(host),
      request: {
        inviteKind: "court-booking",
        subjectId: booking,
        recipients: [recipients[0]!],
        previewHash: result.previewHash,
        confirmed: true,
        idempotencyKey: "send-refused-1",
      },
      requestId: "req",
      now,
    });
    expect(outcome.recipients[0]).toMatchObject({
      state: "failed",
      failureCode: "unsubscribed",
    });
    const suppressed = await pg.query(`select source from sms_suppressions`);
    expect(suppressed.rows).toEqual([{ source: "provider-unsubscribed" }]);
  });
});

describe("session invitations by text", () => {
  it("carries the sender's share link once they hold a place", async () => {
    const request = {
      inviteKind: "session" as const,
      subjectId: occurrence,
      recipients: [recipients[0]!],
    };
    await expect(
      previewInviteSms({
        actor: testActor(host),
        request,
        sendState: "ready",
        now,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await startCatalogCheckout({
      actor: testActor(host),
      catalogItemId: item,
      catalogVariantId: variant,
      paymentMethod: "credit",
      quantity: 1,
      catalogSessionOccurrenceId: occurrence,
      successUrl: "",
      cancelUrl: "",
      idempotencyKey: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      now,
    });
    const result = await previewInviteSms({
      actor: testActor(host),
      request,
      sendState: "ready",
      now,
    });
    expect(result.recipients[0]!.text).toMatch(
      /^Duna: Alex R\. invited you to Group training at Beach Test Academy on Thu, Dec 10 at 5:00 PM UTC\. Join here: \S+\/i\/[A-Za-z0-9_-]+ Reply STOP to opt out\.$/,
    );
  });
});
