/**
 * INVITE-SMS pure parts: phone normalisation, the text in several time
 * zones, names, cleaning, blocks and limits, the provider client against
 * recorded answers (never the real provider) and the webhook signature.
 */
import { constants, generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PRELUDE_NOTIFY_URL,
  preludeInviteSmsProvider,
  setInviteSmsFetchForTests,
} from "./sms-provider";
import {
  INVITE_SMS_TEMPLATE_TEXT,
  clean,
  destinationHash,
  inviteDetails,
  inviterShortName,
  normalisePhone,
  renderInviteSms,
  venueTimePhrase,
} from "./sms-text";
import {
  INVITE_SMS_LIMITS,
  planRecipients,
  readRecipients,
} from "./sms-invites";
import { verifyPreludeSignature } from "./webhook";

describe("normalisePhone", () => {
  it.each([
    ["+1 (310) 482-0142", "+13104820142"],
    ["310.482.0142", "+13104820142"],
    ["1 310 482 0142", "+13104820142"],
    ["+44 20 7946 0958", "+442079460958"],
    ["+33 6 12 34 56 78", "+33612345678"],
  ])("reads %s", (raw, e164) => {
    expect(normalisePhone(raw)).toEqual({ ok: true, e164 });
  });

  it.each([
    "",
    "12345",
    "020 7946 0958", // no country code outside North America: never guessed
    "+0 123 456 789",
    "+1 011 482 0142", // area code starting 0
    "+1 310 111 0142", // exchange starting 1
    "+1 411 482 0142", // N11
    "+1 310 555 0142", // fiction range
    "+1 310 482 0142 ext 3",
    "++13104820142",
    "+1234567890123456",
  ])("refuses %s", (raw) => {
    expect(normalisePhone(raw)).toEqual({ ok: false });
  });

  it("hashes the same number the same way and never returns the number", () => {
    const hash = destinationHash("+13104820142");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(destinationHash("+13104820142"));
    expect(hash).not.toBe(destinationHash("+13104820143"));
  });
});

describe("the text", () => {
  const startsAt = new Date("2026-12-06T17:00:00.000Z");

  it("states the time in the venue's own zone", () => {
    expect(venueTimePhrase(startsAt, "America/Los_Angeles")).toBe(
      "Sun, Dec 6 at 9:00 AM PST",
    );
    expect(venueTimePhrase(startsAt, "America/New_York")).toBe(
      "Sun, Dec 6 at 12:00 PM EST",
    );
    expect(venueTimePhrase(startsAt, "Europe/Paris")).toMatch(
      /^Sun, Dec 6 at 6:00 PM (GMT\+1|CET)$/,
    );
    expect(venueTimePhrase(startsAt, "Australia/Sydney")).toMatch(
      /^Mon, Dec 7 at 4:00 AM (GMT\+11|AEDT)$/,
    );
    expect(venueTimePhrase(startsAt, "Not/AZone")).toBe(
      "Sun, Dec 6 at 5:00 PM UTC",
    );
  });

  it("renders exactly the registered template", () => {
    const text = renderInviteSms({
      inviter: "Alex R.",
      details: inviteDetails({
        kind: "pickup",
        place: "Sunset Beach",
        startsAt,
        timeZone: "America/Los_Angeles",
      }),
      link: "https://duna.coach/events/pickup-1",
    });
    expect(text).toBe(
      "Duna: Alex R. invited you to a pickup game at Sunset Beach on Sun, Dec 6 at 9:00 AM PST. Join here: https://duna.coach/events/pickup-1 Reply STOP to opt out.",
    );
    expect(INVITE_SMS_TEMPLATE_TEXT.match(/\{\{\w+\}\}/g)).toEqual([
      "{{inviter}}",
      "{{details}}",
      "{{link}}",
    ]);
    expect(inviteDetails({ kind: "club", place: "Demo Beach Club" })).toBe(
      "join Demo Beach Club on Duna",
    );
  });

  it("names the inviter by first name and last initial", () => {
    expect(
      inviterShortName({
        givenName: "Alex",
        familyName: "rivera",
        displayName: "x",
      }),
    ).toBe("Alex R.");
    expect(inviterShortName({ displayName: "Jordan Lee Smith" })).toBe(
      "Jordan S.",
    );
    expect(inviterShortName({ displayName: "Kai" })).toBe("Kai");
    expect(inviterShortName({ displayName: "  " })).toBe("A Duna player");
  });

  it("flattens people's text: no links, no new lines, bounded", () => {
    expect(clean("Big game!\nhttps://spam.example/x www.spam.io now", 60)).toBe(
      "Big game! now",
    );
    expect([...clean("x".repeat(100), 40)]).toHaveLength(40);
  });
});

describe("blocks and limits", () => {
  const facts = {
    suppressed: new Set<string>(),
    juniors: new Set<string>(),
    alreadyInvited: new Set<string>(),
    senderSentToday: 0,
    destinationSentToday: new Map<string, number>(),
  };
  const plan = (
    list: { name: string; phoneE164: string }[],
    overrides: Partial<typeof facts> & { ownNumber?: string } = {},
  ) =>
    planRecipients({
      recipients: readRecipients(list),
      facts: { ...facts, ...overrides },
      linkFor: () => ({ kind: "existing", path: "/i/abc", invitationRef: "x" }),
      tokens: new Map(),
      inviter: "Alex R.",
      details: "a court booking",
    });

  it("removes duplicates, own number, opted-out and juniors", () => {
    const result = plan(
      [
        { name: "A", phoneE164: "+13104820142" },
        { name: "A again", phoneE164: "310-482-0142" },
        { name: "Me", phoneE164: "+13104820100" },
        { name: "Stopped", phoneE164: "+13104820101" },
        { name: "Junior", phoneE164: "+13104820102" },
      ],
      {
        ownNumber: "+13104820100",
        suppressed: new Set([destinationHash("+13104820101")]),
        juniors: new Set(["+13104820102"]),
      },
    );
    expect(result.map((r) => r.block)).toEqual([
      undefined,
      "already-invited",
      "own-number",
      "opted-out",
      "junior",
    ]);
  });

  it("stops at the sender's daily limit and the number's daily limit", () => {
    const sender = plan(
      [
        { name: "A", phoneE164: "+13104820142" },
        { name: "B", phoneE164: "+13104820143" },
      ],
      { senderSentToday: INVITE_SMS_LIMITS.perSenderPerDay - 1 },
    );
    expect(sender.map((r) => r.block)).toEqual([undefined, "rate-limited"]);
    const destination = plan([{ name: "A", phoneE164: "+13104820142" }], {
      destinationSentToday: new Map([
        [
          destinationHash("+13104820142"),
          INVITE_SMS_LIMITS.perDestinationPerDay,
        ],
      ]),
    });
    expect(destination[0]!.block).toBe("rate-limited");
  });
});

describe("provider client (recorded answers)", () => {
  afterEach(() => {
    setInviteSmsFetchForTests(undefined);
    vi.unstubAllEnvs();
  });
  const request = {
    to: "+13104820142",
    variables: { inviter: "Alex R.", details: "a game", link: "https://x" },
    correlationId: "0b8f3a4e-6c1d-4f5e-9a2b-3c4d5e6f7a8b",
    callbackUrl: "https://duna.coach/api/invites/sms/webhook",
    expiresAt: new Date("2026-12-01T13:00:00.000Z"),
  };
  const configure = () => {
    vi.stubEnv("PRELUDE_API_KEY", "test-key-value");
    vi.stubEnv("PRELUDE_INVITE_TEMPLATE_ID", "template_01");
  };
  const answer = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("answers not configured without the key or template and makes no call", async () => {
    vi.stubEnv("PRELUDE_API_KEY", "");
    const fetchMock = answer(200, {});
    setInviteSmsFetchForTests(fetchMock);
    expect(preludeInviteSmsProvider.isConfigured()).toBe(false);
    expect(await preludeInviteSmsProvider.send(request)).toEqual({
      kind: "not-configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the documented body with a bearer key and reads the id", async () => {
    configure();
    vi.stubEnv("PRELUDE_SENDER_ID", "Duna");
    vi.stubEnv("PRELUDE_PREFERRED_CHANNEL", "rcs");
    const fetchMock = answer(200, {
      id: "tx_01k8ap1btqf5r9fq2c8ax5fhc9",
      to: request.to,
      template_id: "template_01",
      variables: request.variables,
      expires_at: "2026-12-01T13:00:00Z",
      created_at: "2026-12-01T12:00:00Z",
    });
    setInviteSmsFetchForTests(fetchMock);
    expect(await preludeInviteSmsProvider.send(request)).toEqual({
      kind: "sent",
      providerMessageId: "tx_01k8ap1btqf5r9fq2c8ax5fhc9",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(PRELUDE_NOTIFY_URL);
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer test-key-value",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      to: request.to,
      template_id: "template_01",
      variables: request.variables,
      correlation_id: request.correlationId,
      expires_at: "2026-12-01T13:00:00.000Z",
      from: "Duna",
      callback_url: request.callbackUrl,
      preferred_channel: "rcs",
    });
  });

  it("maps refusals, limits and unknown outcomes", async () => {
    configure();
    setInviteSmsFetchForTests(
      answer(400, {
        code: "unsubscribed",
        message: "The recipient opted out",
        type: "bad_request",
      }),
    );
    expect(await preludeInviteSmsProvider.send(request)).toEqual({
      kind: "rejected",
      code: "unsubscribed",
    });
    setInviteSmsFetchForTests(answer(429, { code: "too_many_requests" }));
    expect((await preludeInviteSmsProvider.send(request)).kind).toBe(
      "transient",
    );
    setInviteSmsFetchForTests(answer(502, {}));
    expect(await preludeInviteSmsProvider.send(request)).toEqual({
      kind: "outcome-unknown",
      code: "http-502",
    });
    setInviteSmsFetchForTests(
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await preludeInviteSmsProvider.send(request)).toEqual({
      kind: "outcome-unknown",
      code: "network",
    });
  });
});

describe("webhook signature", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const body = Buffer.from('{"id":"evt_1","type":"x","payload":{}}');
  const signature = sign("sha256", body, {
    key: privateKey,
    padding: constants.RSA_PKCS1_PSS_PADDING,
    saltLength: constants.RSA_PSS_SALTLEN_MAX_SIGN,
  }).toString("base64url");

  it("accepts the provider's RSASSA-PSS signature over the raw bytes only", () => {
    expect(
      verifyPreludeSignature(body, `rsassa-pss-sha256=${signature}`, pem),
    ).toBe(true);
    expect(
      verifyPreludeSignature(
        Buffer.from('{"id":"evt_1","type":"y","payload":{}}'),
        `rsassa-pss-sha256=${signature}`,
        pem,
      ),
    ).toBe(false);
    expect(verifyPreludeSignature(body, signature, pem)).toBe(false);
    expect(verifyPreludeSignature(body, null, pem)).toBe(false);
  });
});
