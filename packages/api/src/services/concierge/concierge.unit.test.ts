/**
 * Concierge pure rules (B7): channel choice (every rule and every "cannot be
 * reached" reason), quiet hours across time zones, review staleness (the
 * content hash follows the roster, seeded property test), webhook
 * signatures, reply tokens, and the adapters' typed outcomes against
 * recorded fixtures (never a real provider).
 */
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emailAdapter,
  imessageAdapter,
  setConciergeFetchForTests,
  whatsappAdapter,
} from "./adapters";
import {
  canRequestChannel,
  chooseChannel,
  isWithinQuietHours,
  type ChannelAvailability,
  type RecipientChannelFacts,
} from "./channel-choice";
import { deliveryIdFromReplyToken, replyTokenFor } from "./delivery";
import {
  OPT_OUT_KEYWORDS,
  stripQuotedReply,
  verifySvixSignature,
} from "./inbound";
import { conciergeContentHash } from "./recipients";
import type { ConciergeChannel } from "./types";

const noon = new Date("2026-12-01T20:00:00.000Z"); // 12:00 in Los Angeles
const facts = (
  over: Partial<RecipientChannelFacts> = {},
): RecipientChannelFacts => ({
  isMinor: false,
  hasAccount: true,
  blockedClub: false,
  mutedClub: false,
  mutedThread: false,
  preferredChannel: "whatsapp",
  operationalChannel: null,
  connectedChannels: new Set<ConciergeChannel>(["whatsapp", "email"]),
  optedOutChannels: new Set<ConciergeChannel>(),
  ...over,
});
const all =
  (value: ChannelAvailability = "available") =>
  (channel: ConciergeChannel): ChannelAvailability =>
    channel === "duna" ? "available" : value;
const choose = (
  over: Partial<RecipientChannelFacts> = {},
  extra: Partial<Parameters<typeof chooseChannel>[0]> = {},
) =>
  chooseChannel({
    facts: facts(over),
    kind: "conversation",
    availability: all(),
    now: noon,
    ...extra,
  });

describe("channel choice: one channel or one reason, per rule", () => {
  it("a profile nobody signs in to cannot be reached", () => {
    expect(choose({ hasAccount: false })).toEqual({ reason: "no-channel" });
  });
  it("a person who blocked the club is not contacted", () => {
    expect(choose({ blockedClub: true })).toEqual({ reason: "blocked" });
  });
  it("a junior is only ever in-app, whatever is asked", () => {
    expect(choose({ isMinor: true })).toEqual({ channel: "duna" });
    expect(
      canRequestChannel({
        facts: facts({ isMinor: true }),
        kind: "conversation",
        availability: all(),
        now: noon,
        channel: "whatsapp",
      }),
    ).toBe(false);
  });
  it("muting the club or the thread keeps it in-app", () => {
    expect(choose({ mutedClub: true })).toEqual({ channel: "duna" });
    expect(choose({ mutedThread: true })).toEqual({ channel: "duna" });
  });
  it("the default is in-app: a preference never implies consent", () => {
    expect(choose({ preferredChannel: "duna" })).toEqual({ channel: "duna" });
    expect(choose({ connectedChannels: new Set() })).toEqual({
      channel: "duna",
    });
  });
  it("an opted-out channel is no consent", () => {
    expect(
      choose({
        connectedChannels: new Set(),
        optedOutChannels: new Set<ConciergeChannel>(["whatsapp"]),
      }),
    ).toEqual({ reason: "no-consent" });
  });
  it("a switched-off or unconfigured channel says so", () => {
    expect(choose({}, { availability: all("not-enabled") })).toEqual({
      reason: "channel-not-enabled",
    });
    expect(
      choose({}, { availability: all("provider-not-configured") }),
    ).toEqual({
      reason: "provider-not-configured",
    });
  });
  it("quiet hours hold conversation, not operational notices", () => {
    const night = new Date("2026-12-02T06:30:00.000Z"); // 22:30 in Los Angeles
    const quiet = {
      quietHours: {
        start: "21:00",
        end: "07:00",
        timezone: "America/Los_Angeles",
      },
    };
    expect(choose(quiet, { now: night })).toEqual({ reason: "quiet-hours" });
    expect(choose(quiet, { now: night, kind: "operational" })).toEqual({
      channel: "whatsapp",
    });
    expect(choose(quiet)).toEqual({ channel: "whatsapp" });
  });
  it("operational notices use the operational channel", () => {
    expect(
      choose({ operationalChannel: "email" }, { kind: "operational" }),
    ).toEqual({ channel: "email" });
    expect(choose({ operationalChannel: "email" })).toEqual({
      channel: "whatsapp",
    });
  });
  it("a sender may only switch to a channel the rules would deliver on", () => {
    const base = {
      facts: facts(),
      kind: "conversation" as const,
      availability: all(),
      now: noon,
    };
    expect(canRequestChannel({ ...base, channel: "duna" })).toBe(true);
    expect(canRequestChannel({ ...base, channel: "email" })).toBe(true);
    expect(canRequestChannel({ ...base, channel: "imessage" })).toBe(false);
  });
});

describe("quiet hours across time zones", () => {
  const window = { start: "21:00", end: "07:00" };
  it.each([
    ["America/Los_Angeles", "2026-12-02T06:00:00Z", true], // 22:00
    ["America/Los_Angeles", "2026-12-01T20:00:00Z", false], // 12:00
    ["Europe/Berlin", "2026-12-01T21:30:00Z", true], // 22:30
    ["Europe/Berlin", "2026-12-01T06:30:00Z", false], // 07:30
    ["Asia/Tokyo", "2026-12-01T13:00:00Z", true], // 22:00
    ["Australia/Sydney", "2026-12-01T19:59:00Z", true], // 06:59 (summer time)
    ["Australia/Sydney", "2026-12-01T20:00:00Z", false], // 07:00
  ])("%s at %s → %s", (timezone, at, expected) => {
    expect(isWithinQuietHours(new Date(at), { ...window, timezone })).toBe(
      expected,
    );
  });
  it("a same-day window and an empty window", () => {
    const at = new Date("2026-12-01T13:00:00Z");
    expect(
      isWithinQuietHours(at, { start: "12:00", end: "14:00", timezone: "UTC" }),
    ).toBe(true);
    expect(
      isWithinQuietHours(at, { start: "12:00", end: "12:00", timezone: "UTC" }),
    ).toBe(false);
  });
});

describe("review staleness: the hash follows the roster (seeded property)", () => {
  function random(seed: number) {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) % 2 ** 31;
      return state / 2 ** 31;
    };
  }
  const channels: ConciergeChannel[] = [
    "duna",
    "email",
    "imessage",
    "whatsapp",
  ];
  it("joins, cancellations and channel changes all change it; order never does", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const next = random(seed);
      const size = 1 + Math.floor(next() * 12);
      const roster = Array.from({ length: size }, (_, index) => ({
        personId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
        channel: channels[Math.floor(next() * 4)]!,
      }));
      const hash = (list: typeof roster) =>
        conciergeContentHash({
          body: "Hi",
          kind: "conversation",
          recipients: list,
        });
      const original = hash(roster);
      expect(hash([...roster].reverse())).toBe(original);
      const leaver = Math.floor(next() * size);
      if (size > 1)
        expect(hash(roster.filter((_, index) => index !== leaver))).not.toBe(
          original,
        );
      expect(
        hash([
          ...roster,
          { personId: "ffffffff-0000-4000-8000-000000000000", channel: "duna" },
        ]),
      ).not.toBe(original);
      const changed = roster.map((entry, index) =>
        index === leaver
          ? {
              ...entry,
              channel:
                entry.channel === "duna"
                  ? ("email" as const)
                  : ("duna" as const),
            }
          : entry,
      );
      expect(hash(changed)).not.toBe(original);
      expect(
        conciergeContentHash({
          body: "Hi!",
          kind: "conversation",
          recipients: roster,
        }),
      ).not.toBe(original);
    }
  });
});

describe("webhooks and reply tokens", () => {
  const secret = `whsec_${Buffer.from("0123456789abcdef0123456789abcdef").toString("base64")}`;
  const now = new Date("2026-12-01T12:00:00Z");
  const sign = (id: string, timestamp: string, body: string) =>
    `v1,${createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
      .update(`${id}.${timestamp}.${body}`)
      .digest("base64")}`;
  const timestamp = String(now.getTime() / 1000);
  it("accepts the right signature, rejects tampering, old and missing", () => {
    const body = '{"event":"message.received"}';
    const good = sign("msg_1", timestamp, body);
    const check = (over: Partial<Parameters<typeof verifySvixSignature>[0]>) =>
      verifySvixSignature({
        secret,
        id: "msg_1",
        timestamp,
        signature: good,
        rawBody: body,
        now,
        ...over,
      });
    expect(check({})).toBe(true);
    expect(check({ signature: `v1,rotated ${good}` })).toBe(true);
    expect(check({ rawBody: `${body} ` })).toBe(false);
    expect(check({ timestamp: String(now.getTime() / 1000 - 301) })).toBe(
      false,
    );
    expect(check({ secret: undefined })).toBe(false);
    expect(check({ signature: null })).toBe(false);
  });
  it("reply tokens round-trip and cannot be forged", () => {
    vi.stubEnv("CONCIERGE_REPLY_SECRET", "x".repeat(40));
    const id = "6ba7b810-9dad-41d1-80b4-00c04fd430c8";
    const token = replyTokenFor(id)!;
    expect(deliveryIdFromReplyToken(token)).toBe(id);
    expect(deliveryIdFromReplyToken(`${id}.0000000000000000`)).toBeUndefined();
    vi.unstubAllEnvs();
    expect(replyTokenFor(id)).toBeUndefined();
  });
  it("opt-out keywords and quoted replies", () => {
    for (const word of ["STOP", "stop", "Unsubscribe", "opt out", "QUIT"])
      expect(OPT_OUT_KEYWORDS.test(word)).toBe(true);
    expect(OPT_OUT_KEYWORDS.test("stop by court 2")).toBe(false);
    expect(
      stripQuotedReply("See you there\n\nOn Tue, Coach wrote:\n> Court 2"),
    ).toBe("See you there");
  });
});

describe("adapters: typed outcomes, never a call without credentials", () => {
  afterEach(() => {
    setConciergeFetchForTests(undefined);
    vi.unstubAllEnvs();
  });
  const message = {
    to: "+13105550142",
    text: "Club: hi",
    subject: "Club: thread",
    idempotencyKey: "concierge-delivery-1",
    template: "message" as const,
    templateParameters: {
      club: "Club",
      author: "Coach",
      message: "hi",
      link: "https://duna.coach",
    },
  };
  it("answers not-configured with no HTTP call for every outside channel", async () => {
    for (const name of [
      "RESEND_API_KEY",
      "RESEND_FROM_EMAIL",
      "SENDBLUE_API_KEY",
      "SENDBLUE_API_SECRET",
      "SENDBLUE_PHONE_NUMBERS",
      "SENT_DM_API",
      "SENT_DM_API_KEY",
    ])
      vi.stubEnv(name, "");
    const fetch = vi.fn();
    setConciergeFetchForTests(fetch);
    for (const adapter of [emailAdapter, imessageAdapter, whatsappAdapter]) {
      expect(await adapter.send(message)).toEqual({ kind: "not-configured" });
      expect(adapter.isConfigured()).toBe(false);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("maps recorded provider answers to sent / rejected / transient / outcome-unknown", async () => {
    vi.stubEnv("SENDBLUE_API_KEY", "fixture");
    vi.stubEnv("SENDBLUE_API_SECRET", "fixture");
    vi.stubEnv("SENDBLUE_PHONE_NUMBERS", "+18885550100");
    vi.stubEnv("SENT_DM_API", "fixture");
    const answer = (status: number, body: unknown) =>
      setConciergeFetchForTests(
        async () => new Response(JSON.stringify(body), { status }),
      );
    answer(200, { message_handle: "sb-1", status: "QUEUED" });
    expect(await imessageAdapter.send(message)).toEqual({
      kind: "sent",
      handle: "sb-1",
    });
    answer(400, { error_code: "invalid_number" });
    expect(await imessageAdapter.send(message)).toEqual({
      kind: "rejected",
      errorCode: "invalid_number",
    });
    // Sendblue has no idempotency key: a 5xx may have been accepted.
    answer(502, {});
    expect(await imessageAdapter.send(message)).toEqual({
      kind: "outcome-unknown",
      errorCode: "http-502",
    });
    // Sent.dm honours Idempotency-Key: a 5xx is safe to retry.
    answer(502, {});
    expect(await whatsappAdapter.send(message)).toEqual({
      kind: "transient",
      errorCode: "http-502",
    });
    setConciergeFetchForTests(async () => {
      throw new TypeError("network down");
    });
    expect(await whatsappAdapter.send(message)).toEqual({
      kind: "transient",
      errorCode: "network",
    });
    expect(await imessageAdapter.send(message)).toEqual({
      kind: "outcome-unknown",
      errorCode: "network",
    });
  });
});
