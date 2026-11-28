import { createElement, type ReactElement } from "react";
import { act, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { MotionPreference } from "../motion/reduced-motion";
import { render } from "../test-support/render";
import { testAnimations } from "../test-support/react-native";
import {
  nextRange,
  searchBarSummary,
  toggleWhat,
  whatColumns,
  whereMessage,
} from "./logic";
import { SearchBar, type SearchBarProps } from "./SearchBar";
import { SearchSection } from "./SearchSection";
import { WhatPicker } from "./WhatPicker";
import { WhenPicker } from "./WhenPicker";
import { WherePicker, type WhereOption } from "./WherePicker";

const pressables = (renderer: ReactTestRenderer) =>
  renderer.root.findAll(
    (node) =>
      typeof node.type !== "string" &&
      typeof node.props.onPress === "function" &&
      typeof node.props.accessibilityLabel === "string",
  );
const byLabel = (renderer: ReactTestRenderer, label: string) => {
  const found = pressables(renderer).find(
    (node) => node.props.accessibilityLabel === label,
  );
  if (!found) {
    throw new Error(
      `No pressable "${label}" in ${pressables(renderer)
        .map((n) => n.props.accessibilityLabel)
        .join(" | ")}`,
    );
  }
  return found;
};
const text = (renderer: ReactTestRenderer) => JSON.stringify(renderer.toJSON());

describe("nextRange", () => {
  it("first tap sets the start", () => {
    expect(nextRange({ start: null, end: null }, "2026-12-03")).toEqual({
      start: "2026-12-03",
      end: null,
    });
  });
  it("a second tap on or after the start sets the end", () => {
    expect(nextRange({ start: "2026-12-03", end: null }, "2026-12-06")).toEqual(
      {
        start: "2026-12-03",
        end: "2026-12-06",
      },
    );
    expect(nextRange({ start: "2026-12-03", end: null }, "2026-12-03")).toEqual(
      {
        start: "2026-12-03",
        end: "2026-12-03",
      },
    );
  });
  it("a tap before the start is a new start", () => {
    expect(nextRange({ start: "2026-12-03", end: null }, "2026-12-01")).toEqual(
      {
        start: "2026-12-01",
        end: null,
      },
    );
  });
  it("a tap once both are set starts again", () => {
    expect(
      nextRange({ start: "2026-12-03", end: "2026-12-06" }, "2026-12-10"),
    ).toEqual({ start: "2026-12-10", end: null });
  });
});

describe("toggleWhat", () => {
  it("choosing the exclusive one clears the others", () => {
    expect(toggleWhat(["courts", "lessons"], "for-you")).toEqual(["for-you"]);
  });
  it("choosing another clears the exclusive one", () => {
    expect(toggleWhat(["for-you"], "courts")).toEqual(["courts"]);
    expect(toggleWhat(["courts"], "lessons")).toEqual(["courts", "lessons"]);
  });
  it("clearing everything returns to the exclusive one", () => {
    expect(toggleWhat(["courts"], "courts")).toEqual(["for-you"]);
    expect(toggleWhat(["courts", "lessons"], "courts")).toEqual(["lessons"]);
  });
  it("takes another exclusive key", () => {
    expect(toggleWhat(["all"], "courts", "all")).toEqual(["courts"]);
  });
  it("one column at large text", () => {
    expect(whatColumns(1)).toBe(2);
    expect(whatColumns(3.1)).toBe(1);
  });
});

describe("SearchBar", () => {
  const base: SearchBarProps = {
    where: null,
    when: null,
    what: null,
    collapsed: false,
    onOpen: () => undefined,
  };

  it("summarises empty values", () => {
    const summary = searchBarSummary({ where: null, when: null, what: null });
    expect(summary.lead).toBe("Where to?");
    expect(summary.detail).toBe("Any time · For you");
    expect(summary.chips.map((c) => c.value)).toEqual([
      "Anywhere",
      "Any time",
      "For you",
    ]);
  });

  it("expanded: three chips, clears and the find button", () => {
    const onOpen = vi.fn();
    const onClear = vi.fn();
    const renderer = render(
      createElement(SearchBar, {
        ...base,
        where: "Santa Monica",
        onOpen,
        onClear,
        size: "large",
      }),
    );
    act(() => byLabel(renderer, "Change When: Any time").props.onPress());
    expect(onOpen).toHaveBeenCalledWith("when");
    act(() => byLabel(renderer, "Clear Where").props.onPress());
    expect(onClear).toHaveBeenCalledWith("where");
    expect(() => byLabel(renderer, "Clear When")).toThrow();
    byLabel(renderer, "Change Where: Santa Monica");
    byLabel(renderer, "Edit search");
    expect(text(renderer)).toContain("Where");
  });

  it("collapsed: one button, then a 200 ms cross-fade on change", () => {
    const onOpen = vi.fn();
    const tree = (props: SearchBarProps): ReactElement =>
      createElement(
        MotionPreference,
        { reduceMotion: true },
        createElement(SearchBar, props),
      );
    const renderer = render(
      tree({ ...base, collapsed: true, when: "This weekend", onOpen }),
    );
    expect(pressables(renderer)).toHaveLength(1);
    expect(text(renderer)).toContain("Where to?");
    expect(text(renderer)).toContain("This weekend · For you");
    act(() => byLabel(renderer, "Edit search").props.onPress());
    expect(onOpen).toHaveBeenCalledWith("where");
    testAnimations.length = 0;
    act(() => renderer.update(tree({ ...base, collapsed: false, onOpen })));
    expect(
      testAnimations.some(
        (a) => a.kind === "timing" && a.config?.duration === 200,
      ),
    ).toBe(true);
  });
});

describe("SearchSection", () => {
  it("closed shows the value; open shows the question and children", () => {
    const onToggle = vi.fn();
    const closed = render(
      createElement(SearchSection, {
        step: "where",
        label: "Where",
        value: "Anywhere",
        question: "Where to?",
        open: false,
        onToggle,
        children: createElement("Child"),
      }),
    );
    const head = byLabel(closed, "Where: Anywhere");
    expect(head.props.accessibilityState.expanded).toBe(false);
    expect(text(closed)).not.toContain("Child");
    act(() => head.props.onPress());
    expect(onToggle).toHaveBeenCalled();
    const open = render(
      createElement(SearchSection, {
        step: "where",
        label: "Where",
        value: "Anywhere",
        question: "Where to?",
        open: true,
        onToggle,
        children: createElement("Child"),
      }),
    );
    expect(text(open)).toContain("Child");
    expect(byLabel(open, "Where to?").props.accessibilityState.expanded).toBe(
      true,
    );
  });
});

describe("WherePicker", () => {
  const club: WhereOption = {
    id: "c1",
    kind: "club",
    title: "Santa Monica Beach Club",
    subtitle: "Santa Monica, CA",
    markColor: "#007e5e",
    yours: true,
  };
  const recent: WhereOption = { id: "r1", kind: "recent", title: "Venice" };
  const props = {
    query: "",
    onQueryChange: () => undefined,
    status: "idle" as const,
    nearMe: { label: "Current location", onPress: () => undefined },
    clubs: [club],
    places: [{ id: "p1", kind: "place" as const, title: "Malibu, CA" }],
    recents: [recent],
    onSelect: () => undefined,
  };

  it("draws the groups in order with marks and tags", () => {
    const onSelect = vi.fn();
    const onRemoveRecent = vi.fn();
    const renderer = render(
      createElement(WherePicker, { ...props, onSelect, onRemoveRecent }),
    );
    const body = text(renderer);
    const order = ["Near you", "On Duna", "Places", "Recent"].map((h) =>
      body.indexOf(`"${h}"`),
    );
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(body).toContain("Your club");
    expect(body).toContain('"SM"');
    act(() =>
      byLabel(
        renderer,
        "Santa Monica Beach Club, Your club, Santa Monica, CA",
      ).props.onPress(),
    );
    expect(onSelect).toHaveBeenCalledWith(club);
    act(() => byLabel(renderer, "Remove Venice from recent").props.onPress());
    expect(onRemoveRecent).toHaveBeenCalledWith(recent);
  });

  it("says why location is off and clears the query", () => {
    const onQueryChange = vi.fn();
    const renderer = render(
      createElement(WherePicker, {
        ...props,
        query: "mal",
        onQueryChange,
        nearMe: { ...props.nearMe, denied: true },
      }),
    );
    expect(text(renderer)).toContain("Location is off. Type a place instead.");
    act(() => byLabel(renderer, "Clear where").props.onPress());
    expect(onQueryChange).toHaveBeenCalledWith("");
  });

  it("every status says something honest", () => {
    expect(whereMessage("empty", " zz ")).toBe(
      'No places or clubs match "zz".',
    );
    expect(whereMessage("error", "")).toBe(
      "Location search is unavailable. Try again.",
    );
    expect(whereMessage("offline", "")).toBe(
      "You're offline. Type a place you know, or try again later.",
    );
    expect(whereMessage("not-configured", "")).toBe(
      "Place search isn't set up yet. Clubs on Duna and places you type still work.",
    );
    expect(whereMessage("ready", "x")).toBeNull();
    const onPress = vi.fn();
    const renderer = render(
      createElement(WherePicker, {
        ...props,
        query: "zz",
        status: "empty",
        emptyAction: { label: "Search all of Duna", onPress },
      }),
    );
    expect(text(renderer)).toContain('No places or clubs match \\"zz\\".');
    act(() => byLabel(renderer, "Search all of Duna").props.onPress());
    expect(onPress).toHaveBeenCalled();
    const loading = render(
      createElement(WherePicker, { ...props, query: "mal", status: "loading" }),
    );
    expect(text(loading)).toContain("Loading");
  });
});

describe("WhenPicker", () => {
  it("presets, then start and end from two taps", () => {
    const onPreset = vi.fn();
    const onRange = vi.fn();
    const onDone = vi.fn();
    const props = {
      value: { preset: "any" },
      presets: [
        { key: "any", label: "Any time" },
        { key: "weekend", label: "This weekend" },
      ],
      onPreset,
      onRange,
      today: "2026-11-28",
      label: "Any time",
      onClear: () => undefined,
      onDone,
      testID: "when",
    };
    const renderer = render(createElement(WhenPicker, props));
    const days = renderer.root.findAll(
      (node) =>
        typeof node.type !== "string" &&
        node.props.accessibilityRole === "radio" &&
        String(node.props.testID ?? "").includes("strip-"),
    );
    expect(days).toHaveLength(42);
    act(() => byLabel(renderer, "This weekend").props.onPress());
    expect(onPreset).toHaveBeenCalledWith("weekend");

    const tap = (date: string) =>
      act(() =>
        renderer.root
          .find(
            (node) =>
              typeof node.type !== "string" &&
              node.props.testID === `when-strip-${date}`,
          )
          .props.onPress(),
      );
    const tree = (value: {
      preset: string;
      startsAt?: string;
      endsAt?: string;
    }) => createElement(WhenPicker, { ...props, value, testID: "when" });
    act(() => renderer.update(tree({ preset: "any" })));
    tap("2026-12-03");
    expect(onRange).toHaveBeenLastCalledWith("2026-12-03", "2026-12-03");
    act(() =>
      renderer.update(
        tree({ preset: "range", startsAt: "2026-12-03", endsAt: "2026-12-03" }),
      ),
    );
    tap("2026-12-06");
    expect(onRange).toHaveBeenLastCalledWith("2026-12-03", "2026-12-06");
    act(() => byLabel(renderer, "Done").props.onPress());
    expect(onDone).toHaveBeenCalled();
  });
});

describe("WhatPicker", () => {
  it("multi-selects with the exclusive rule", () => {
    const onChange = vi.fn();
    const renderer = render(
      createElement(WhatPicker, {
        options: [
          { value: "for-you", label: "For you", icon: "find" },
          { value: "courts", label: "Courts", icon: "court", count: 12 },
        ],
        value: ["for-you"],
        onChange,
      }),
    );
    const forYou = byLabel(renderer, "For you");
    expect(forYou.props.accessibilityState.checked).toBe(true);
    act(() => byLabel(renderer, "Courts, 12").props.onPress());
    expect(onChange).toHaveBeenCalledWith(["courts"]);
  });
});
