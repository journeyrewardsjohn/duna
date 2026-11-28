import { describe, expect, it } from "vitest";
import { parsePlayerDeepLink } from "./deep-links";

describe("parsePlayerDeepLink", () => {
  it("ignores missing and unrecognised URLs", () => {
    expect(parsePlayerDeepLink(null)).toBeUndefined();
    expect(parsePlayerDeepLink("")).toBeUndefined();
    expect(parsePlayerDeepLink("duna://auth/callback?code=1")).toBeUndefined();
    expect(
      parsePlayerDeepLink("https://duna.example/events/1"),
    ).toBeUndefined();
    // A live link needs a trailing segment after its kind.
    expect(parsePlayerDeepLink("duna://live/upload")).toBeUndefined();
  });

  it("routes a Vision remote token", () => {
    expect(parsePlayerDeepLink("duna://vision/remote/abc%20123?x=1")).toEqual({
      kind: "vision-remote",
      token: "abc%20123",
    });
  });

  it("routes match details from the app scheme and from web links", () => {
    expect(parsePlayerDeepLink("duna://matches/m_1")).toEqual({
      kind: "match",
      matchId: "m_1",
    });
    expect(parsePlayerDeepLink("duna://matches/m_1?notes=tok")).toEqual({
      kind: "match",
      matchId: "m_1",
      shareToken: "tok",
    });
    expect(
      parsePlayerDeepLink("https://duna.example/matches/m%2F2?notes=tok#top"),
    ).toEqual({ kind: "match", matchId: "m%2F2", shareToken: "tok" });
    expect(parsePlayerDeepLink("http://localhost:3000/matches/m_3")).toEqual({
      kind: "match",
      matchId: "m_3",
    });
  });

  it("routes a match claim before any broader rule", () => {
    expect(parsePlayerDeepLink("duna://join/match/claim%2Btoken")).toEqual({
      kind: "match-claim",
      token: "claim%2Btoken",
    });
  });

  it("keeps the waiver completion query intact", () => {
    expect(
      parsePlayerDeepLink("duna://waiver/complete?token=a&signer=b"),
    ).toEqual({ kind: "waiver", query: "token=a&signer=b" });
    expect(parsePlayerDeepLink("duna://waiver/complete")).toEqual({
      kind: "waiver",
      query: "",
    });
  });

  it("routes Duna AI", () => {
    expect(parsePlayerDeepLink("duna://ai")).toEqual({ kind: "ai" });
    expect(parsePlayerDeepLink("duna://ai/anything")).toEqual({ kind: "ai" });
  });

  it("routes the inbox, a conversation, and support", () => {
    expect(parsePlayerDeepLink("duna://messages")).toEqual({
      kind: "messages",
    });
    expect(parsePlayerDeepLink("duna://messages/")).toEqual({
      kind: "messages",
    });
    expect(parsePlayerDeepLink("duna://messages/conv%201?from=push")).toEqual({
      kind: "messages",
      conversationId: "conv%201",
    });
    expect(parsePlayerDeepLink("duna://messages/support")).toEqual({
      kind: "messages",
      conversationId: "support",
    });
  });

  it("routes a booking", () => {
    expect(parsePlayerDeepLink("duna://booking/bk_9?source=push")).toEqual({
      kind: "booking",
      bookingId: "bk_9",
    });
    expect(parsePlayerDeepLink("duna://booking/")).toBeUndefined();
  });

  it("maps Live Activity links to their destination", () => {
    expect(parsePlayerDeepLink("duna://live/upload/v_1")).toEqual({
      kind: "live-activity",
      tab: "video",
    });
    expect(parsePlayerDeepLink("duna://live/upcoming/b_1")).toEqual({
      kind: "live-activity",
      tab: "home",
    });
    expect(parsePlayerDeepLink("duna://live/match/m_1")).toEqual({
      kind: "live-activity",
      tab: "discover",
    });
  });
});
