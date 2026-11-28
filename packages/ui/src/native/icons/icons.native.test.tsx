import { createElement } from "react";
import { render } from "../test-support/render";
import { describe, expect, it } from "vitest";
import { glyphAliasNames, glyphNames } from "../../icons/index";
import { Icon } from "./Icon";
import {
  glyphNames as nativeNames,
  playerIconGlyphs,
  proLucideGlyphs,
} from "./index";
import { isGlyphName } from "../../icons/glyph-index";

describe("native icons", () => {
  it("draw exactly the web set, by name", () => {
    expect([...nativeNames]).toEqual([...glyphNames]);
  });

  it("render every name and alias with the brand stroke at every size", () => {
    for (const name of [...glyphNames, ...glyphAliasNames]) {
      for (const size of ["chip", "inline", "control", "nav"] as const) {
        const renderer = render(createElement(Icon, { name, size }));
        const svg = renderer.root.findByType("Svg" as never);
        expect(svg.props.width).toBe(
          { chip: 14, inline: 16, control: 20, nav: 24 }[size],
        );
        for (const path of renderer.root.findAllByType("Path" as never)) {
          if (path.props.stroke) {
            expect(path.props.strokeWidth).toBe(1.75);
            expect(path.props.strokeLinecap).toBe("square");
          }
        }
      }
    }
  });

  it("is decorative unless labelled", () => {
    const quiet = render(createElement(Icon, { name: "find" })).root.findByType(
      "Svg" as never,
    );
    expect(quiet.props.accessibilityElementsHidden).toBe(true);
    const named = render(
      createElement(Icon, { name: "find", label: "Find" }),
    ).root.findByType("Svg" as never);
    expect(named.props.accessibilityLabel).toBe("Find");
  });

  it("maps the apps' current icon names onto real glyphs (or null)", () => {
    for (const glyph of [
      ...Object.values(playerIconGlyphs),
      ...Object.values(proLucideGlyphs),
    ]) {
      if (glyph !== null) expect(isGlyphName(glyph), glyph).toBe(true);
    }
  });
});
