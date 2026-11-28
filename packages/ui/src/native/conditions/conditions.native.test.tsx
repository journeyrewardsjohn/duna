import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "../test-support/render";
import { ConditionsLine, conditionsLineView } from "./ConditionsLine";

const at = Date.UTC(2026, 10, 26, 21, 45);
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

describe("conditionsLineView", () => {
  it("a good hour: temperature, wind and sunset, no call", () => {
    const view = conditionsLineView(
      { at, temperatureC: 18, windSpeedKph: 14.5, windFromDeg: 270 },
      { sun, timeZone },
    );
    expect(view.call).toBe("good");
    expect(view.items.map((item) => item.text)).toEqual([
      "64°F",
      "W 9 mph",
      "Sunset 4:45 PM",
    ]);
    expect(view.spoken).toBe("64°F, W 9 mph, Sunset 4:45 PM");
  });

  it("caution leads with words and an icon, never colour alone", () => {
    const view = conditionsLineView(
      { at, temperatureC: 18, windSpeedKph: 20, precipChancePct: 90 },
      { timeZone },
    );
    expect(view.call).not.toBe("good");
    const lead = view.items[0]!;
    expect(lead.key).toBe("call");
    expect(lead.icon).toBeDefined();
    expect(lead.text.length).toBeGreaterThan(3);
  });

  it("drops the sunset first and never the call", () => {
    const view = conditionsLineView(
      { at, temperatureC: 18, windSpeedKph: 14.5, windFromDeg: 270 },
      { sun, timeZone, maxParts: 2 },
    );
    expect(view.items.map((item) => item.key)).toEqual(["temp", "wind"]);
  });

  it("says how old a stale reading is", () => {
    const view = conditionsLineView(
      { at, temperatureC: 18 },
      { timeZone, readAt: at - 3 * 3_600_000, now: at },
    );
    expect(view.items.find((item) => item.key === "stale")?.text).toMatch(
      /ago$/,
    );
  });
});

describe("ConditionsLine", () => {
  it("honest states fit the same row", () => {
    const missing = render(
      createElement(ConditionsLine, { conditions: null, timeZone }),
    );
    expect(JSON.stringify(missing.toJSON())).toContain(
      "No weather for this location yet",
    );
    const off = render(
      createElement(ConditionsLine, { status: "not-configured", timeZone }),
    );
    expect(JSON.stringify(off.toJSON())).toContain("Weather isn't set up yet");
  });

  it("opens the full conditions when pressable and names itself", () => {
    const onPress = vi.fn();
    const renderer = render(
      createElement(ConditionsLine, {
        conditions: { at, temperatureC: 18, windSpeedKph: 14.5 },
        timeZone,
        onPress,
      }),
    );
    const button = renderer.root.findByProps({ accessibilityRole: "button" });
    expect(button.props.accessibilityLabel).toContain("64°F");
    button.props.onPress();
    expect(onPress).toHaveBeenCalled();
  });
});
