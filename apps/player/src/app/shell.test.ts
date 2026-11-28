import { describe, expect, it } from "vitest";
import { resolveLayout } from "../../../../packages/ui/src/native/layout/resolve-layout";
import { swipeCompletes } from "./edge-swipe";
import { homeArrangement, shellPlan } from "./layout-plan";
import {
  INITIAL_TAB,
  NEW_ACTION,
  ROUTES,
  TABS,
  routesForTab,
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
  it("has the four verbs in order with symbols for the Duo's vertical bar", () => {
    expect(TABS.map((tab) => tab.key)).toEqual([
      "find",
      "play",
      "improve",
      "connect",
    ]);
    for (const tab of TABS) expect(tab.systemImage.length).toBeGreaterThan(0);
    expect(INITIAL_TAB).toBe("play");
    expect(NEW_ACTION.systemImage).toBe("plus");
  });

  it("every route belongs to a tab, and every tab's default is its own", () => {
    for (const [key, route] of Object.entries(ROUTES)) {
      expect(TABS.map((tab) => tab.key)).toContain(route.tab);
      expect(route.title).not.toMatch(/\d/); // titles are Jost: no numerals
      expect(route.summary.length, key).toBeGreaterThan(0);
    }
    for (const tab of TABS) {
      if (tab.defaultRoute) expect(ROUTES[tab.defaultRoute].tab).toBe(tab.key);
    }
  });

  it("keeps every pre-shell screen reachable (no function dropped)", () => {
    // Find (discover) was rebuilt by M-P1 and is no longer legacy; scoring,
    // results and the Sand Rating home by M-P4a.
    expect(ROUTES.discover.legacy).toBe(false);
    for (const key of ["score", "result", "live", "performance"] as const)
      expect(ROUTES[key].legacy).toBe(false);
    // The wallet was rebuilt by WALLET-2 and draws its own title.
    expect(ROUTES.wallet).toMatchObject({ legacy: false, ownTitle: true });
    // The profile was rebuilt by M-P5; the person's name is its title.
    expect(ROUTES.you).toMatchObject({ legacy: false, ownTitle: true });
    const legacy: RouteKey[] = [
      "coaches",
      "plans",
      "insights",
      "video",
      "health",
      "training",
      "messages",
      "ai",
      "predictions",
    ];
    for (const key of legacy) expect(ROUTES[key].legacy).toBe(true);
    // The scorekeeper covers the window; a result opens from a list.
    expect(ROUTES.live.presentation).toBe("window");
    expect(routesForTab("play")).not.toContain("result");
    expect(routesForTab("improve")).toContain("performance");
    expect(routesForTab("improve")).not.toContain("insights");
    // Predictions is reached from Wallet and Performance, not a hub row.
    expect(routesForTab("connect")).not.toContain("predictions");
    expect(routesForTab("connect")).toContain("account");
  });
});

describe("shell reducer", () => {
  it("opens a route in its own tab and switches to that tab", () => {
    const state = run({ type: "open", route: "coaches", nonce: 1 });
    expect(state.tab).toBe("find");
    expect(state.stacks.find).toEqual({ key: "coaches", nonce: 1 });
    expect(isRouteActive(state, "coaches")).toBe(true);
  });

  it("keeps each tab's place when switching tabs", () => {
    const state = run(
      { type: "open", route: "wallet", nonce: 1 },
      { type: "select-tab", tab: "find" },
      { type: "select-tab", tab: "connect" },
    );
    expect(state.stacks.connect?.key).toBe("wallet");
  });

  it("reselecting the current tab returns it to its root", () => {
    const state = run(
      { type: "open", route: "plans", nonce: 1 },
      { type: "select-tab", tab: "play" },
    );
    expect(state.stacks.play).toBeNull();
  });

  it("Concierge and Ask Duna cover the window and return where they came from", () => {
    const opened = run(
      { type: "select-tab", tab: "improve" },
      { type: "open", route: "messages", conversationId: "support", nonce: 2 },
    );
    expect(opened.window?.entry).toEqual({
      key: "messages",
      conversationId: "support",
      nonce: 2,
    });
    expect(opened.tab).toBe("improve");
    const closed = shellReducer(opened, { type: "close-window" });
    expect(closed.window).toBeNull();
    expect(closed.tab).toBe("improve");
  });

  it("carries Find's intent and re-applies it on every open", () => {
    const first = run({
      type: "open",
      route: "discover",
      intent: "find-match",
    });
    const second = shellReducer(first, {
      type: "open",
      route: "discover",
      intent: "find-match",
    });
    expect(second.stacks.find?.intent).toBe("find-match");
    expect(second.stacks.find?.nonce).not.toBe(first.stacks.find?.nonce);
  });

  it("the New sheet opens over any tab and closes on navigation", () => {
    const state = run(
      { type: "open-sheet" },
      { type: "open", route: "score", nonce: 3 },
    );
    expect(state.sheet).toBeNull();
    expect(state.tab).toBe("play");
  });

  it("back returns a tab to its hub", () => {
    const state = run(
      { type: "open", route: "health", nonce: 1 },
      { type: "back", tab: "improve" },
    );
    expect(state.stacks.improve).toBeNull();
  });

  it("shows a tab's default route only when there is a second pane", () => {
    const state = initialShellState();
    expect(visibleRoute(state, "improve", 1)).toBeNull();
    expect(visibleRoute(state, "improve", 2)?.key).toBe("performance");
    // Find's root is the search; its second pane is the map, not a route.
    expect(visibleRoute(state, "find", 2)).toBeNull();
    expect(visibleRoute(state, "play", 2)).toBeNull();
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
  ] as const)("%s: Home is %s", (name, home, sideBySide) => {
    const layout = resolveLayout(windows[name]);
    const plan = shellPlan(layout);
    expect(plan.home).toBe(home);
    expect(plan.sideBySide).toBe(sideBySide);
    expect(plan.showBack).toBe(!sideBySide);
    expect(plan.gameInInspector).toBe(home === "dashboard");
  });

  it("the open Duo splits at the fold, never across it", () => {
    const layout = resolveLayout(windows.duoOpen);
    const [primary, secondary] = layout.panes;
    expect(primary!.frame.x + primary!.frame.width).toBeLessThanOrEqual(476);
    expect(secondary!.frame.x).toBeGreaterThanOrEqual(463);
  });

  it("Dynamic Type at the largest size collapses to one pane before panes get too narrow", () => {
    expect(
      homeArrangement(resolveLayout({ ...windows.iPadHalf, fontScale: 3 })),
    ).toBe("stack");
    expect(
      homeArrangement(resolveLayout({ ...windows.duoOpen, fontScale: 3 })),
    ).not.toBe("dashboard");
    expect(
      homeArrangement(resolveLayout({ ...windows.iPadLarge, fontScale: 1.2 })),
    ).toBe("split");
  });
});

describe("scoring routes (M-P4a)", () => {
  it("opens the scorekeeper over the window and returns to the tab", () => {
    const opened = run(
      { type: "select-tab", tab: "improve" },
      { type: "open", route: "live", nonce: 3 },
    );
    expect(opened.window?.entry.key).toBe("live");
    expect(isRouteActive(opened, "live")).toBe(true);
    expect(shellReducer(opened, { type: "close-window" }).tab).toBe("improve");
  });

  it("opens a result in Play with its match", () => {
    const state = run({
      type: "open",
      route: "result",
      targetId: "m1",
      nonce: 4,
    });
    expect(state.tab).toBe("play");
    expect(state.stacks.play).toEqual({
      key: "result",
      targetId: "m1",
      nonce: 4,
    });
  });
});

describe("no dead ends (owner feedback 28 Nov)", () => {
  it("every route can be left: Back returns a pushed route to its tab, Close a window to where it came from", () => {
    for (const key of Object.keys(ROUTES) as RouteKey[]) {
      const route = ROUTES[key];
      const opened = run(
        { type: "select-tab", tab: "connect" },
        { type: "open", route: key },
      );
      const left =
        route.presentation === "window"
          ? shellReducer(opened, { type: "close-window" })
          : shellReducer(opened, { type: "back", tab: route.tab });
      expect(left.window, key).toBeNull();
      expect(left.stacks[route.tab], key).toBeNull();
      if (route.presentation === "window")
        expect(left.tab, key).toBe("connect");
    }
  });

  it("an edge swipe goes back past a third of the width or with a flick", () => {
    expect(swipeCompletes(140, 0, 390)).toBe(true);
    expect(swipeCompletes(80, 0, 390)).toBe(false);
    expect(swipeCompletes(60, 0.9, 390)).toBe(true);
    expect(swipeCompletes(10, 2, 390)).toBe(false);
    expect(swipeCompletes(200, 0, 0)).toBe(false);
  });
});
