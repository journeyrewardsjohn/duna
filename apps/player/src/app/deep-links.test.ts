import { describe, expect, it } from "vitest";
import {
  deepLinkNavigation,
  internalPathTarget,
  parseDevShellUrl,
  parsePlayerDeepLink,
} from "./deep-links";
import { ROUTES } from "./router";
import { initialShellState, shellReducer } from "./shell-state";

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

/**
 * Every link the app has shipped (scheme links, Live Activity links, web
 * links) and where it lands in the new shell. "effect" links open a sheet or
 * the in-app browser from the shell instead of navigating.
 */
const SHIPPED_LINKS: readonly [url: string, lands: string][] = [
  ["duna://ai", "window:ai"],
  ["duna://messages", "window:messages"],
  ["duna://messages/conv_1", "window:messages"],
  ["duna://messages/support", "window:messages"],
  ["duna://booking/bk_1", "play:plans"],
  ["duna://live/upload/v_1", "improve:video"],
  ["duna://live/upcoming/b_1", "play:root"],
  ["duna://live/match/m_1", "find:discover"],
  ["duna://matches/m_1", "effect"],
  ["https://duna.coach/matches/m_1?notes=t", "effect"],
  ["duna://join/match/tok", "effect"],
  ["duna://waiver/complete?token=a", "effect"],
  ["duna://vision/remote/tok", "effect"],
];

describe("deep links in the new shell", () => {
  it.each(SHIPPED_LINKS)("%s lands on %s", (url, lands) => {
    const link = parsePlayerDeepLink(url);
    expect(link).toBeDefined();
    const navigation = deepLinkNavigation(link!);
    if (lands === "effect") {
      expect(navigation).toBeNull();
      return;
    }
    expect(navigation).not.toBeNull();
    const state = shellReducer(
      shellReducer(initialShellState("find"), {
        type: "open",
        route: "wallet",
      }),
      navigation!,
    );
    if (lands.startsWith("window:")) {
      expect(`window:${state.window?.entry.key}`).toBe(lands);
      return;
    }
    const [tab, place] = lands.split(":") as [string, string];
    expect(state.tab).toBe(tab);
    if (place === "root") {
      expect(state.stacks.play).toBeNull();
    } else {
      expect(state.stacks[state.tab]?.key).toBe(place);
      expect(ROUTES[place as keyof typeof ROUTES].tab).toBe(tab);
    }
  });

  it("opens the right thread, or support", () => {
    expect(
      deepLinkNavigation(parsePlayerDeepLink("duna://messages/conv%201")!),
    ).toEqual({ type: "open", route: "messages", conversationId: "conv 1" });
  });
});

describe("Duna web paths inside the app", () => {
  it.each([
    ["/events/summer-open", { kind: "event", identifier: "summer-open" }],
    ["https://duna.coach/venues/v%201", { kind: "venue", venueId: "v 1" }],
    ["/clubs/south-bay", { kind: "club", slug: "south-bay" }],
    ["/app/bookings/bk_2", { kind: "booking", bookingId: "bk_2" }],
    ["/booking/bk_3", { kind: "booking", bookingId: "bk_3" }],
    [
      "/matches/m_2?notes=abc",
      { kind: "match", matchId: "m_2", shareToken: "abc" },
    ],
    [
      "/app/matches",
      { kind: "navigate", action: { type: "open", route: "performance" } },
    ],
    [
      "/discover/courts",
      { kind: "navigate", action: { type: "open", route: "discover" } },
    ],
    [
      "/app/play",
      { kind: "navigate", action: { type: "open", route: "plans" } },
    ],
    ["/app", { kind: "navigate", action: { type: "select-tab", tab: "play" } }],
    ["/pricing", { kind: "browser" }],
  ] as const)("%s", (href, target) => {
    expect(internalPathTarget(href)).toEqual(target);
  });
});

describe("preview shell links", () => {
  it("drives tabs, routes, the New sheet and the theme", () => {
    expect(
      parseDevShellUrl(
        "duna://dev/shell?tab=find&route=coaches&theme=dark&sheet=new",
      ),
    ).toEqual({
      actions: [
        { type: "select-tab", tab: "find" },
        { type: "open", route: "coaches" },
        { type: "open-sheet" },
      ],
      theme: "dark",
    });
    expect(parseDevShellUrl("duna://dev/shell?tab=nope&route=nope")).toEqual({
      actions: [],
    });
    expect(parseDevShellUrl("duna://ai")).toBeNull();
  });
});
