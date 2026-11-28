import { createElement } from "react";
import { act, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HapticsProvider, type HapticsAdapter } from "../motion/haptics";
import { render } from "../test-support/render";
import { testEnvironment, testWindow } from "../test-support/react-native";
import { DayStrip } from "./DayStrip";
import { DurationCrests, durationOptionLabel } from "./DurationCrests";
import {
  chipMinWidth,
  dayCells,
  inRange,
  minuteLabel,
  slotGridColumns,
} from "./layout";
import { timeSlotGroups } from "./slot-chips";
import { TimeSlots, type TimeSlotsProps } from "./TimeSlots";

const sun = {
  sunrise: Date.UTC(2026, 10, 26, 14, 38),
  sunset: Date.UTC(2026, 10, 27, 0, 45),
  civilDawn: Date.UTC(2026, 10, 26, 14, 10),
  civilDusk: Date.UTC(2026, 10, 27, 1, 12),
  goldenHourStart: Date.UTC(2026, 10, 26, 23, 45),
  solarNoon: Date.UTC(2026, 10, 26, 19, 41),
  daylight: "normal" as const,
  whiteNight: false,
};
const timeZone = "America/Los_Angeles";
const date = "2026-11-26";

const byRole = (renderer: ReactTestRenderer, role: string) =>
  renderer.root.findAll(
    (node) =>
      typeof node.type !== "string" &&
      node.props.accessibilityRole === role &&
      typeof node.props.onPress === "function",
  );

beforeEach(() => {
  testEnvironment.announcements.length = 0;
  testWindow.fontScale = 1;
});

describe("slot containment", () => {
  const longest = "12:30 PM".length;

  it.each([1, 2, 3.1])(
    "every chip holds 12:30 PM at font scale %s",
    (scale) => {
      const grid = slotGridColumns({
        containerWidth: 370,
        longestLabelChars: longest,
        fontScale: scale,
        gap: 8,
      });
      expect(grid.chipWidth).toBeGreaterThanOrEqual(
        chipMinWidth(longest, scale),
      );
      expect(grid.minWidth).toBe(chipMinWidth(longest, scale));
      if (grid.columns > 1) {
        expect(
          grid.columns * grid.chipWidth + (grid.columns - 1) * 8,
        ).toBeLessThanOrEqual(370);
      }
    },
  );

  it("falls back to fewer columns as text grows, down to one", () => {
    const at = (fontScale: number) =>
      slotGridColumns({
        containerWidth: 370,
        longestLabelChars: longest,
        fontScale,
        gap: 8,
      }).columns;
    expect(at(1)).toBe(3);
    expect(at(2)).toBeLessThanOrEqual(at(1));
    expect(at(2)).toBeGreaterThanOrEqual(1);
    expect(at(3.1)).toBe(1);
  });

  it("chip widths grow with the text and never drop under 44 pt", () => {
    expect(chipMinWidth(longest, 1)).toBe(115);
    expect(chipMinWidth(longest, 2)).toBeGreaterThan(chipMinWidth(longest, 1));
    expect(chipMinWidth(longest, 3.1)).toBeGreaterThan(
      chipMinWidth(longest, 2),
    );
    expect(chipMinWidth(1, 1, { withMark: false })).toBeGreaterThanOrEqual(44);
  });

  it("an unmeasured row still gives one whole chip", () => {
    const grid = slotGridColumns({
      containerWidth: 0,
      longestLabelChars: longest,
      fontScale: 1,
      gap: 8,
    });
    expect(grid.columns).toBe(1);
    expect(grid.chipWidth).toBe(grid.minWidth);
  });
});

describe("dayCells", () => {
  it("counts days from start, names month starts and today", () => {
    const cells = dayCells({
      start: "2026-11-29",
      count: 4,
      today: "2026-11-30",
    });
    expect(cells.map((c) => c.date)).toEqual([
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
    ]);
    expect(cells.map((c) => c.startsMonth)).toEqual([true, false, true, false]);
    expect(cells[1]?.today).toBe(true);
  });

  it("in range is strictly between", () => {
    expect(inRange("2026-12-02", "2026-12-01", "2026-12-04")).toBe(true);
    expect(inRange("2026-12-01", "2026-12-01", "2026-12-04")).toBe(false);
    expect(inRange("2026-12-02", "2026-12-01", null)).toBe(false);
  });
});

describe("DayStrip", () => {
  it("names each day, picks a day, refuses a faded one", () => {
    const onValueChange = vi.fn();
    const renderer = render(
      createElement(DayStrip, {
        label: "Day",
        value: "2026-11-28",
        onValueChange,
        days: [
          { date: "2026-11-28", count: 3, isToday: true },
          { date: "2026-11-29", count: 0, faded: true },
          { date: "2026-11-30", count: 1 },
        ],
      }),
    );
    const days = byRole(renderer, "radio");
    expect(days[0]?.props.accessibilityLabel).toBe(
      "Saturday, November 28, today, 3 games",
    );
    expect(days[0]?.props.accessibilityState.selected).toBe(true);
    expect(days[1]?.props.accessibilityLabel).toContain("nothing open");
    expect(days[1]?.props.accessibilityState.disabled).toBe(true);
    act(() => days[1]?.props.onPress());
    expect(onValueChange).not.toHaveBeenCalled();
    act(() => days[2]?.props.onPress());
    expect(onValueChange).toHaveBeenCalledWith("2026-11-30");
  });

  it("shows the range end as chosen", () => {
    const renderer = render(
      createElement(DayStrip, {
        label: "Dates",
        value: "2026-12-01",
        rangeEnd: "2026-12-03",
        onValueChange: () => undefined,
        start: "2026-12-01",
        count: 4,
      }),
    );
    const selected = byRole(renderer, "radio").map(
      (day) => day.props.accessibilityState.selected,
    );
    expect(selected).toEqual([true, false, true, false]);
  });
});

describe("timeSlotGroups", () => {
  it("groups by daypart with the light mark and marks an unlit court too dark", () => {
    const groups = timeSlotGroups({
      slots: [
        { startMinute: 9 * 60, available: true },
        { startMinute: 16 * 60, available: true, remaining: 1 },
        { startMinute: 18 * 60, available: true },
      ],
      selected: null,
      justTaken: new Set(),
      date,
      timeZone,
      locale: "en-US",
      sun,
      courtIsLit: false,
    });
    expect(groups.map((g) => g.daypart)).toEqual([
      "morning",
      "golden-hour",
      "evening",
    ]);
    expect(groups[0]?.glyph).toBe("first-light");
    expect(groups[1]?.chips[0]?.note).toBe("1 left");
    expect(groups[2]?.chips[0]?.state).toBe("too-dark");
    expect(groups[2]?.glyph).toBe("too-dark");
  });

  it("indoor (no sun) is one ungrouped list", () => {
    const groups = timeSlotGroups({
      slots: [{ startMinute: 600, available: false, reason: "booked" }],
      selected: null,
      justTaken: new Set(),
      date,
      timeZone,
      locale: "en-US",
      courtIsLit: true,
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.chips[0]?.state).toBe("taken");
  });
});

describe("TimeSlots", () => {
  const base: TimeSlotsProps = {
    label: "Court 3 start times",
    slots: [
      { startMinute: 17 * 60, available: true },
      { startMinute: 18 * 60 + 30, available: true },
      { startMinute: 19 * 60, available: false, reason: "booked" },
    ],
    value: null,
    onValueChange: () => undefined,
    date,
    timeZone,
  };

  it("chooses a start and names states in words", () => {
    const onValueChange = vi.fn();
    const renderer = render(
      createElement(TimeSlots, { ...base, onValueChange }),
    );
    const chips = renderer.root.findAll(
      (node) =>
        typeof node.type !== "string" &&
        node.props.accessibilityRole === "radio",
    );
    expect(chips.map((c) => c.props.accessibilityLabel)).toEqual([
      "5:00 PM",
      "6:30 PM",
      "7:00 PM, full",
    ]);
    expect(chips[2]?.props.accessibilityState.disabled).toBe(true);
    act(() => chips[1]?.props.onPress());
    expect(onValueChange).toHaveBeenCalledWith(18 * 60 + 30);
  });

  it("drops a selection that was just taken, once, and says so", () => {
    const onValueChange = vi.fn();
    const onStale = vi.fn();
    const adapter: HapticsAdapter = {
      selection: vi.fn(),
      impact: vi.fn(),
      notification: vi.fn(),
    };
    const props = { ...base, value: 18 * 60 + 30, onValueChange, onStale };
    const tree = (p: TimeSlotsProps) =>
      createElement(HapticsProvider, { adapter }, createElement(TimeSlots, p));
    const renderer = render(tree(props));
    expect(onValueChange).not.toHaveBeenCalled();

    const next = {
      ...props,
      slots: [
        { startMinute: 17 * 60, available: true },
        { startMinute: 18 * 60 + 30, available: true, stale: true },
        { startMinute: 19 * 60, available: false, reason: "booked" as const },
      ],
    };
    act(() => renderer.update(tree(next)));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(onValueChange).toHaveBeenCalledWith(null);
    expect(onStale).toHaveBeenCalledWith([18 * 60 + 30]);
    expect(testEnvironment.announcements).toEqual([
      "6:30 PM was just taken. Choose another time.",
    ]);
    expect(adapter.notification).toHaveBeenCalled();

    // The parent clears the value; the chip stays as just taken.
    act(() => renderer.update(tree({ ...next, value: null })));
    act(() => renderer.update(tree({ ...next, value: null })));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    const chip = renderer.root.find(
      (node) =>
        typeof node.type !== "string" &&
        node.props.accessibilityRole === "radio" &&
        String(node.props.accessibilityLabel).startsWith("6:30 PM"),
    );
    expect(chip.props.accessibilityLabel).toBe("6:30 PM, just taken");
    expect(chip.props.accessibilityState.disabled).toBe(true);
    expect(JSON.stringify(renderer.toJSON())).toContain("Just taken");
  });

  it("a chosen start that turns unavailable is also just taken", () => {
    const onValueChange = vi.fn();
    const props = { ...base, value: 17 * 60, onValueChange };
    const renderer = render(createElement(TimeSlots, props));
    act(() =>
      renderer.update(
        createElement(TimeSlots, {
          ...props,
          slots: [{ startMinute: 17 * 60, available: false, reason: "booked" }],
        }),
      ),
    );
    expect(onValueChange).toHaveBeenCalledWith(null);
    expect(testEnvironment.announcements.at(-1)).toBe(
      `${minuteLabel(17 * 60, "en-US")} was just taken. Choose another time.`,
    );
  });

  it("says when a day has no start times", () => {
    const renderer = render(createElement(TimeSlots, { ...base, slots: [] }));
    expect(JSON.stringify(renderer.toJSON())).toContain(
      "No start times on this day.",
    );
  });
});

describe("DurationCrests", () => {
  it("labels with durationLabel and refuses a length with no times", () => {
    const onValueChange = vi.fn();
    const renderer = render(
      createElement(DurationCrests, {
        label: "Booking length",
        value: 60,
        onValueChange,
        unavailable: [120],
      }),
    );
    const options = byRole(renderer, "radio");
    expect(options.map((o) => o.props.accessibilityLabel)).toEqual([
      "60 min",
      "90 min",
      "2 h, no times left this day",
    ]);
    expect(options[0]?.props.accessibilityState.selected).toBe(true);
    act(() => options[2]?.props.onPress());
    expect(onValueChange).not.toHaveBeenCalled();
    act(() => options[1]?.props.onPress());
    expect(onValueChange).toHaveBeenCalledWith(90);
    expect(durationOptionLabel(90, { note: "Quick game" })).toBe(
      "90 min, Quick game",
    );
  });
});
