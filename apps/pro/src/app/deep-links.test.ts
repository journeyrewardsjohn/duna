import { describe, expect, it } from "vitest";
import {
  deepLinkNavigation,
  organizationSlug,
  parseDevShellUrl,
  parseProDeepLink,
} from "./deep-links";
import { initialShellState, shellReducer } from "./shell-state";

/** Where a link lands: the route (or tab) the shell shows afterwards. */
function land(url: string) {
  const link = parseProDeepLink(url);
  if (!link) return undefined;
  const state = shellReducer(initialShellState(), deepLinkNavigation(link));
  return {
    tab: state.tab,
    window: state.window?.entry ?? null,
    pane: state.stacks[state.tab],
  };
}

describe("parseProDeepLink", () => {
  it("ignores missing, foreign and unknown links", () => {
    expect(parseProDeepLink(null)).toBeUndefined();
    expect(parseProDeepLink("")).toBeUndefined();
    expect(parseProDeepLink("duna://messages/c1")).toBeUndefined();
    expect(parseProDeepLink("https://duna.example/session/1")).toBeUndefined();
    expect(parseProDeepLink("duna-pro://auth/callback?code=1")).toBeUndefined();
    expect(parseProDeepLink("duna-pro://session/")).toBeUndefined();
    expect(parseProDeepLink("duna-pro://todays")).toBeUndefined();
  });

  it("reads every shipped link, decoding its segment", () => {
    expect(parseProDeepLink("duna-pro://messages")).toEqual({
      kind: "messages",
    });
    expect(parseProDeepLink("duna-pro://messages/")).toEqual({
      kind: "messages",
    });
    expect(parseProDeepLink("duna-pro://messages/conv%201?from=push")).toEqual({
      kind: "messages",
      conversationId: "conv 1",
    });
    expect(parseProDeepLink("duna-pro://session/s%2F1")).toEqual({
      kind: "session",
      sessionId: "s/1",
    });
    expect(parseProDeepLink("duna-pro://match/m_1#score")).toEqual({
      kind: "match",
      matchId: "m_1",
    });
    expect(
      parseProDeepLink("duna-pro://organization/sunset-beach-club"),
    ).toEqual({
      kind: "organization",
      slug: "sunset-beach-club",
    });
    expect(parseProDeepLink("duna-pro://ai")).toEqual({ kind: "ai" });
    expect(parseProDeepLink("duna-pro://today")).toEqual({
      kind: "tab",
      tab: "today",
    });
    expect(parseProDeepLink("duna-pro://schedule?day=1")).toEqual({
      kind: "tab",
      tab: "schedule",
    });
  });

  it("keeps a malformed escape instead of throwing", () => {
    expect(parseProDeepLink("duna-pro://session/%E0%A4%A")).toEqual({
      kind: "session",
      sessionId: "%E0%A4%A",
    });
  });
});

describe("every link lands in the new shell", () => {
  it("message pushes open Messages over the window, on the conversation", () => {
    expect(land("duna-pro://messages/c1")).toMatchObject({
      tab: "today",
      window: { key: "messages", conversationId: "c1" },
    });
    expect(land("duna-pro://messages")?.window?.key).toBe("messages");
  });

  it("the coach-day Live Activity opens the session in Schedule", () => {
    expect(land("duna-pro://session/s1")).toMatchObject({
      tab: "schedule",
      window: null,
      pane: { key: "calendar", entryId: "s1" },
    });
  });

  it("a match link opens Courtside on that match", () => {
    expect(land("duna-pro://match/m1")).toMatchObject({
      window: { key: "courtside", matchId: "m1" },
    });
  });

  it("an organisation link shows Today (the switch happens in ProApp)", () => {
    expect(land("duna-pro://organization/sunset-beach-club")).toMatchObject({
      tab: "today",
      window: null,
      pane: null,
    });
    expect(organizationSlug("Sunset Beach Club")).toBe("sunset-beach-club");
    expect(organizationSlug("  Beach Elite / Volleyball! ")).toBe(
      "beach-elite-volleyball",
    );
  });

  it("Ask Duna and the home tabs", () => {
    expect(land("duna-pro://ai")?.window?.key).toBe("ai");
    expect(land("duna-pro://schedule")).toMatchObject({
      tab: "schedule",
      window: null,
    });
    expect(land("duna-pro://today")).toMatchObject({
      tab: "today",
      window: null,
    });
  });
});

describe("parseDevShellUrl (preview builds only)", () => {
  it("is not an app link and ignores other URLs", () => {
    expect(parseDevShellUrl(null)).toBeNull();
    expect(parseDevShellUrl("duna-pro://messages")).toBeNull();
    expect(
      parseProDeepLink("duna-pro://dev/shell?tab=schedule"),
    ).toBeUndefined();
  });

  it("drives tabs, routes with params, sheets and the theme", () => {
    expect(
      parseDevShellUrl(
        "duna-pro://dev/shell?tab=schedule&route=calendar&entry=s1&theme=dark&sheet=new",
      ),
    ).toEqual({
      actions: [
        { type: "select-tab", tab: "schedule" },
        { type: "open", route: "calendar", entryId: "s1" },
        { type: "open-sheet" },
      ],
      theme: "dark",
    });
    expect(parseDevShellUrl("duna-pro://dev/shell?sheet=conditions")).toEqual({
      actions: [],
      conditions: true,
    });
    expect(
      parseDevShellUrl("duna-pro://dev/shell?route=courtside&match=m1"),
    ).toEqual({
      actions: [{ type: "open", route: "courtside", matchId: "m1" }],
    });
  });

  it("ignores unknown tabs, routes and themes", () => {
    expect(
      parseDevShellUrl("duna-pro://dev/shell?tab=more&route=nope&theme=blue"),
    ).toEqual({ actions: [] });
  });
});
