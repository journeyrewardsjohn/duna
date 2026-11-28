import { createElement } from "react";
import { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import { render } from "../test-support/render";
import {
  MapControls,
  MapLocateButton,
  MapPin,
  MapStyleToggle,
  mapStyleToggleView,
} from "./Map";
import { pinVisual } from "./pin";

describe("pinVisual", () => {
  it("a dot when zoomed out", () => {
    expect(pinVisual({ kind: "club", zoom: 9 })).toMatchObject({
      tier: "dot",
      diameter: 12,
      showIcon: false,
      showLabel: false,
      inverted: false,
      ring: null,
    });
  });
  it("the category icon from zoom 11", () => {
    expect(pinVisual({ kind: "lesson", zoom: 11 })).toMatchObject({
      tier: "icon",
      diameter: 28,
      showIcon: true,
      showLabel: false,
    });
  });
  it("icon and label from zoom 13", () => {
    expect(pinVisual({ kind: "tournament", zoom: 13 })).toMatchObject({
      tier: "icon-label",
      showIcon: true,
      showLabel: true,
    });
  });
  it("the club's mark and name from zoom 15 (clubs only)", () => {
    expect(pinVisual({ kind: "club", zoom: 15 })).toMatchObject({
      tier: "club-mark",
      showClubMark: true,
      showLabel: true,
      showIcon: false,
    });
    expect(pinVisual({ kind: "public", zoom: 16 }).tier).toBe("icon-label");
  });
  it("courts only appear from zoom 18", () => {
    expect(pinVisual({ kind: "court", zoom: 17 }).tier).toBe("hidden");
    expect(pinVisual({ kind: "court", zoom: 18 }).diameter).toBe(24);
  });
  it("clusters at low zoom", () => {
    expect(
      pinVisual({ kind: "club", zoom: 12, clusterCount: 5 }),
    ).toMatchObject({
      tier: "cluster",
      clusterCount: 5,
    });
  });
  it("yours is inverted; live rings in Solar; selected gets the selected ring", () => {
    expect(pinVisual({ kind: "club", zoom: 13, yours: true }).inverted).toBe(
      true,
    );
    expect(
      pinVisual({ kind: "match", zoom: 13, live: true, selected: true }).ring,
    ).toBe("live");
    expect(pinVisual({ kind: "match", zoom: 13, selected: true }).ring).toBe(
      "selected",
    );
  });
});

describe("MapPin", () => {
  it("names itself and shows the label from the label zoom", () => {
    const tree = render(
      createElement(MapPin, {
        kind: "club",
        zoom: 15,
        brandName: "Santa Monica Beach Club",
        accessibilityLabel: "Santa Monica Beach Club, your club",
        yours: true,
        selected: true,
      }),
    );
    const pin = tree.root.find(
      (n) =>
        typeof n.type !== "string" && n.props.accessibilityRole === "button",
    );
    expect(pin.props.accessibilityLabel).toBe(
      "Santa Monica Beach Club, your club",
    );
    expect(pin.props.accessibilityState.selected).toBe(true);
    const body = JSON.stringify(tree.toJSON());
    expect(body).toContain("Santa Monica Beach Club");
    expect(body).toContain('"SM"');
    expect(body).not.toMatch(/#f2542d/i);
  });

  it("only a live pin uses Solar, and a hidden court draws nothing", () => {
    const live = render(
      createElement(MapPin, {
        kind: "match",
        zoom: 13,
        live: true,
        accessibilityLabel: "Match in progress",
      }),
    );
    expect(JSON.stringify(live.toJSON())).toMatch(/#f2542d/i);
    const hidden = render(
      createElement(MapPin, {
        kind: "court",
        zoom: 12,
        accessibilityLabel: "Court 1",
      }),
    );
    expect(hidden.toJSON()).toBeNull();
  });
});

describe("map controls", () => {
  it("the toggle shows the look it switches to", () => {
    expect(mapStyleToggleView("standard")).toEqual({
      glyph: "satellite",
      label: "Show satellite",
    });
    expect(mapStyleToggleView("satellite")).toEqual({
      glyph: "map",
      label: "Show map",
    });
    const onToggle = vi.fn();
    const tree = render(
      createElement(
        MapControls,
        null,
        createElement(MapStyleToggle, {
          style: "satellite",
          onToggle,
          overSatellite: true,
        }),
        createElement(MapLocateButton, {
          onPress: () => undefined,
          denied: true,
        }),
      ),
    );
    const buttons = tree.root.findAll(
      (n) =>
        typeof n.type !== "string" &&
        n.props.accessibilityRole === "button" &&
        typeof n.props.onPress === "function",
    );
    expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual([
      "Show map",
      "Show my location",
    ]);
    act(() => buttons[0]?.props.onPress());
    expect(onToggle).toHaveBeenCalled();
  });
});
