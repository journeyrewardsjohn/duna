import { describe, expect, it } from "vitest";
import { resolveLayout } from "../../../../packages/ui/src/native/layout/resolve-layout";
import { actionColumnsFor, dayArrangement, shellPlan } from "./layout-plan";
import {
  INITIAL_TAB,
  ROUTES,
  TABS,
  audienceForRole,
  routesForTab,
  tabTitle,
  type RouteKey,
} from "./router";
import {
  initialShellState,
  isRouteActive,
  shellReducer,
  visibleRoute,
  type ShellAction,
} from "./shell-state";

const run = (...actions: ShellAction[]) =>
  actions.reduce(shellReducer, initialShellState());

describe("route table", () => {
  it("has the five coach tabs in order with symbols for the Duo's vertical bar", () => {
    expect(TABS.map((tab) => tab.key)).toEqual([
      "today",
      "schedule",
      "people",
      "inbox",
      "money",
    ]);
    for (const tab of TABS) expect(tab.systemImage.length).toBeGreaterThan(0);
    expect(INITIAL_TAB).toBe("today");
  });

  it("labels the tabs by role (board P00-NavMap)", () => {
    expect(TABS.map((tab) => tabTitle(tab.key, "coach"))).toEqual([
      "Today",
      "Schedule",
      "Students",
      "Threads",
      "Earnings",
    ]);
    expect(TABS.map((tab) => tabTitle(tab.key, "owner"))).toEqual([
      "Today",
      "Schedule",
      "People",
      "Inbox",
      "Money",
    ]);
    expect(audienceForRole("owner")).toBe("owner");
    expect(audienceForRole("org_admin")).toBe("owner");
    expect(audienceForRole("Manager")).toBe("owner");
    expect(audienceForRole("coach")).toBe("coach");
    expect(audienceForRole("member")).toBe("coach");
    expect(audienceForRole(undefined)).toBe("coach");
  });

  it("every route has a tab or opens in the current one; titles have no numerals", () => {
    const tabs = TABS.map((tab) => tab.key);
    for (const [key, route] of Object.entries(ROUTES)) {
      if (route.tab !== null) expect(tabs).toContain(route.tab);
      expect(route.title, key).not.toMatch(/\d/);
      expect(route.summary.length, key).toBeGreaterThan(0);
    }
    for (const tab of TABS) {
      if (tab.defaultRoute) {
        expect(ROUTES[tab.defaultRoute].tab).toBe(tab.key);
        expect(ROUTES[tab.defaultRoute].presentation).toBe("pane");
      }
    }
  });

  it("keeps every pre-shell Pro feature reachable (nothing dropped)", () => {
    const legacy: RouteKey[] = [
      "calendar",
      "people",
      "messages",
      "ai",
      "courtside",
      "checkin",
      "events",
      "film",
      "notes",
      "money",
      "getPaid",
      "create",
      "tools",
    ];
    for (const key of legacy) expect(ROUTES[key].legacy, key).toBe(true);
    expect(ROUTES.account.legacy).toBe(false);
    // Courtside and check-in are the Live zone, full window.
    expect(ROUTES.courtside).toMatchObject({
      presentation: "window",
      live: true,
    });
    expect(ROUTES.checkin).toMatchObject({
      presentation: "window",
      live: true,
    });
    // Hubs list their routes; Account and Club tools come from the top bar.
    expect(routesForTab("people")).toEqual(["people", "film"]);
    expect(routesForTab("inbox")).toEqual(["messages", "ai"]);
    expect(routesForTab("money")).toEqual(["money", "getPaid"]);
    expect(routesForTab("schedule")).toEqual([
      "calendar",
      "checkin",
      "events",
      "availability",
      "timeAway",
      "cover",
    ]);
  });

  it("my working life (M-R5) lives in Schedule; Earnings is the money tab's root", () => {
    for (const key of ["availability", "timeAway", "cover"] as const) {
      expect(ROUTES[key]).toMatchObject({
        tab: "schedule",
        presentation: "pane",
        legacy: false,
      });
    }
    // Earnings is the tab's root: nothing is pushed beside it by default.
    expect(TABS.find((tab) => tab.key === "money")?.defaultRoute).toBeNull();
  });

  it("the session (M-R2) opens where it was chosen; attendance covers the window, not live", () => {
    expect(ROUTES.session).toMatchObject({
      tab: null,
      presentation: "pane",
      legacy: false,
      listed: false,
    });
    expect(ROUTES.attendance).toMatchObject({
      tab: null,
      presentation: "window",
      legacy: false,
      live: false,
    });
    let state = shellReducer(initialShellState(), {
      type: "select-tab",
      tab: "schedule",
    });
    state = shellReducer(state, {
      type: "open",
      route: "session",
      entryId: "s1",
    });
    expect(state.tab).toBe("schedule");
    expect(state.stacks.schedule).toMatchObject({
      key: "session",
      entryId: "s1",
    });
    state = shellReducer(state, {
      type: "open",
      route: "attendance",
      entryId: "s1",
    });
    expect(state.window).toMatchObject({
      from: "schedule",
      entry: { key: "attendance", entryId: "s1" },
    });
    // Closing attendance returns to the session it came from.
    state = shellReducer(state, { type: "close-window" });
    expect(state.window).toBeNull();
    expect(state.stacks.schedule?.key).toBe("session");
  });
});

describe("shell reducer", () => {
  it("opens a route in its own tab and switches to that tab", () => {
    const state = run({
      type: "open",
      route: "calendar",
      entryId: "s1",
      nonce: 1,
    });
    expect(state.tab).toBe("schedule");
    expect(state.stacks.schedule).toEqual({
      key: "calendar",
      entryId: "s1",
      nonce: 1,
    });
    expect(isRouteActive(state, "calendar")).toBe(true);
  });

  it("opens Account and Club tools in the tab that is showing", () => {
    const fromMoney = run(
      { type: "select-tab", tab: "money" },
      { type: "open", route: "account", nonce: 1 },
    );
    expect(fromMoney.tab).toBe("money");
    expect(fromMoney.stacks.money?.key).toBe("account");
    expect(isRouteActive(fromMoney, "account")).toBe(true);
    const tools = shellReducer(fromMoney, {
      type: "open",
      route: "tools",
      nonce: 2,
    });
    expect(tools.stacks.money?.key).toBe("tools");
  });

  it("keeps each tab's place when switching tabs", () => {
    const state = run(
      { type: "open", route: "money", nonce: 1 },
      { type: "select-tab", tab: "today" },
      { type: "select-tab", tab: "money" },
    );
    expect(state.stacks.money?.key).toBe("money");
  });

  it("reselecting the current tab returns it to its root", () => {
    const state = run(
      { type: "open", route: "calendar", nonce: 1 },
      { type: "select-tab", tab: "schedule" },
    );
    expect(state.stacks.schedule).toBeNull();
  });

  it("window routes cover the window and return where they came from", () => {
    const opened = run(
      { type: "select-tab", tab: "people" },
      { type: "open", route: "messages", personId: "p1", nonce: 2 },
    );
    expect(opened.window?.entry).toEqual({
      key: "messages",
      personId: "p1",
      nonce: 2,
    });
    expect(opened.window?.from).toBe("people");
    const courtside = run(
      { type: "select-tab", tab: "schedule" },
      { type: "open", route: "courtside", matchId: "m1", nonce: 3 },
    );
    expect(courtside.window?.from).toBe("schedule");
    const closed = shellReducer(courtside, { type: "close-window" });
    expect(closed.window).toBeNull();
    expect(closed.tab).toBe("schedule");
  });

  it("Create opens over the tab you are in and returns there", () => {
    const state = run(
      { type: "select-tab", tab: "money" },
      { type: "open-sheet" },
      { type: "open", route: "create", nonce: 4 },
    );
    expect(state.sheet).toBeNull();
    expect(state.window?.entry.key).toBe("create");
    expect(shellReducer(state, { type: "close-window" }).tab).toBe("money");
  });

  it("a window opened from a window returns to the first tab", () => {
    const state = run(
      { type: "select-tab", tab: "people" },
      { type: "open", route: "create", nonce: 1 },
      { type: "open", route: "getPaid", nonce: 2 },
    );
    expect(state.window?.entry.key).toBe("getPaid");
    expect(state.window?.from).toBe("people");
  });

  it("re-opening the same route re-applies its params", () => {
    const first = run({ type: "open", route: "calendar", entryId: "a" });
    const second = shellReducer(first, {
      type: "open",
      route: "calendar",
      entryId: "b",
    });
    expect(second.stacks.schedule?.entryId).toBe("b");
    expect(second.stacks.schedule?.nonce).not.toBe(
      first.stacks.schedule?.nonce,
    );
  });

  it("back returns a tab to its root", () => {
    const state = run(
      { type: "open", route: "film", nonce: 1 },
      { type: "close-window" },
      { type: "open", route: "people", nonce: 2 },
      { type: "back", tab: "people" },
    );
    expect(state.stacks.people).toBeNull();
  });

  it("shows a tab's default route only when there is a second pane", () => {
    const state = initialShellState();
    expect(visibleRoute(state, "people", 1)).toBeNull();
    expect(visibleRoute(state, "people", 2)?.key).toBe("people");
    expect(visibleRoute(state, "money", 2)).toBeNull();
    expect(visibleRoute(state, "today", 2)).toBeNull();
    expect(visibleRoute(state, "inbox", 2)).toBeNull();
  });
});

/** Windows measured on the Xcode 27.2 simulators (docs/mobile/ADAPTIVE.md). */
const windows = {
  iPhone: { width: 402, height: 874 },
  duoClosed: { width: 466, height: 678, posture: "closed" as const },
  duoOpen: {
    width: 951,
    height: 669,
    posture: "open" as const,
    foldRect: { x: 463, y: 0, width: 25, height: 669 },
  },
  duoHalfOpen: {
    width: 669,
    height: 951,
    posture: "half-open" as const,
    foldRect: { x: 0, y: 463, width: 669, height: 25 },
  },
  iPadPortrait: { width: 834, height: 1210 },
  iPadLarge: { width: 1032, height: 1376 },
  iPadHalf: { width: 678, height: 1376 },
  iPadSlideOver: { width: 400, height: 1376 },
};

describe("layout plan per size class and posture", () => {
  it.each([
    ["iPhone", "stack", false],
    ["duoClosed", "stack", false],
    ["iPadSlideOver", "stack", false],
    ["duoOpen", "split", true],
    ["iPadHalf", "split", true],
    ["iPadPortrait", "split", true],
    ["iPadLarge", "dashboard", true],
    ["duoHalfOpen", "tabletop", false],
  ] as const)("%s: Today and Schedule are %s", (name, day, sideBySide) => {
    const layout = resolveLayout(windows[name]);
    const plan = shellPlan(layout);
    expect(plan.day).toBe(day);
    expect(plan.sideBySide).toBe(sideBySide);
    expect(plan.showBack).toBe(!sideBySide);
    expect(plan.showDefaultDetail).toBe(sideBySide);
    expect(plan.courtsInInspector).toBe(day === "dashboard");
  });

  it("the half-open Duo puts the top pane above the fold and the controls below it", () => {
    const layout = resolveLayout(windows.duoHalfOpen);
    const [top, bottom] = layout.panes;
    expect(top!.id).toBe("top");
    expect(bottom!.id).toBe("bottom");
    expect(top!.frame.y + top!.frame.height).toBeLessThanOrEqual(463);
    expect(bottom!.frame.y).toBeGreaterThanOrEqual(488);
  });

  it("quick actions go four across only when the pane has room or on the half-open Duo", () => {
    expect(actionColumnsFor(402, "stack")).toBe(2);
    expect(actionColumnsFor(475, "split")).toBe(2);
    expect(actionColumnsFor(669, "tabletop")).toBe(4);
    expect(actionColumnsFor(640, "split")).toBe(4);
  });

  it("Dynamic Type at the largest size collapses to one pane before panes get too narrow", () => {
    expect(
      dayArrangement(resolveLayout({ ...windows.iPadHalf, fontScale: 3 })),
    ).toBe("stack");
    expect(
      dayArrangement(resolveLayout({ ...windows.duoOpen, fontScale: 3 })),
    ).not.toBe("dashboard");
  });
});
