import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { describe, expect, it } from "vitest";
import {
  Icon,
  glyphAliasNames,
  glyphFamilies,
  glyphNames,
  iconSizes,
  iconStroke,
  registerIcons,
  type IconName,
  type IconSize,
} from "./index";

/** A plain tree of what `Icon` draws: tag, props and children, components resolved. */
interface Node {
  tag: string;
  props: Record<string, unknown>;
  children: Node[];
}

function draw(element: ReactNode): Node | null {
  if (!isValidElement(element)) return null;
  const el = element as ReactElement<
    Record<string, unknown> & { children?: ReactNode }
  >;
  if (typeof el.type === "function") {
    return draw((el.type as (props: unknown) => ReactNode)(el.props));
  }
  const kids = ([] as ReactNode[]).concat(el.props.children ?? []);
  const props: Record<string, unknown> = { ...el.props };
  delete props.children;
  return {
    tag: String(el.type),
    props,
    children: kids.map(draw).filter((node): node is Node => node !== null),
  };
}

function svgOf(
  name: IconName,
  extra: { size?: IconSize; label?: string } = {},
) {
  const node = draw(Icon({ name, ...extra }));
  if (!node) throw new Error(`${name} did not render`);
  return node;
}

const sizes = Object.keys(iconSizes) as IconSize[];
const everyName = [...glyphNames, ...glyphAliasNames] as IconName[];

describe("the name list", () => {
  it("is a snapshot, so adding or removing a glyph is a visible change", () => {
    expect({ glyphs: glyphNames, aliases: glyphAliasNames }).toMatchSnapshot();
  });

  it("groups every glyph exactly once", () => {
    const grouped = Object.values(glyphFamilies).flat().sort();
    expect(grouped).toEqual([...glyphNames]);
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("keeps the names the system and the designs lead with", () => {
    for (const name of [
      "find",
      "play",
      "improve",
      "connect",
      "first-light",
      "golden-hour",
      "under-lights",
      "full-sun",
      "too-dark",
      "wind",
      "gust",
      "rain",
      "uv",
      "court",
      "net",
      "serve",
      "rally",
      "film",
      "rating",
      "wallet",
      "member-card",
      "thread",
      "schedule",
      "locate",
      "map",
      "satellite",
      "map-style",
      "media-play",
    ]) {
      expect(glyphNames, name).toContain(name);
    }
  });

  it("resolves older names to the glyph that replaced them", () => {
    expect(svgOf("calendar").children).toEqual(svgOf("schedule").children);
    expect(svgOf("video").children).toEqual(svgOf("film").children);
    expect(svgOf("sunset").children).toEqual(svgOf("golden-hour").children);
  });
});

describe.each(sizes)("size %s", (size) => {
  it.each(everyName)("%s renders at the role's pixel size", (name) => {
    const svg = svgOf(name, { size });
    expect(svg.tag).toBe("svg");
    expect(svg.props.width).toBe(iconSizes[size]);
    expect(svg.props.height).toBe(iconSizes[size]);
    expect(svg.props.viewBox).toBe("0 0 24 24");
    expect(svg.children.length).toBeGreaterThan(0);
    for (const child of svg.children) {
      expect(child.tag).toBe("path");
      expect(String(child.props.d).length).toBeGreaterThan(3);
    }
  });
});

describe("the four sizes", () => {
  it("are 14, 16, 20 and 24, chip / inline / control / nav", () => {
    expect(iconSizes).toEqual({ chip: 14, inline: 16, control: 20, nav: 24 });
  });

  it("default to control (20), and the older sm / md / lg still map", () => {
    expect(svgOf("plus").props.width).toBe(20);
    expect(svgOf("plus", { size: "sm" as IconSize }).props.width).toBe(16);
    expect(svgOf("plus", { size: "md" as IconSize }).props.width).toBe(20);
    expect(svgOf("plus", { size: "lg" as IconSize }).props.width).toBe(24);
  });
});

describe("stroke and colour", () => {
  const lineNames = everyName.filter((name) => {
    const node = svgOf(name);
    return node.props.stroke === "currentColor";
  });

  it("draws every glyph as a line glyph or a mark, nothing else", () => {
    for (const name of everyName) {
      const svg = svgOf(name);
      const line = svg.props.stroke === "currentColor";
      const mark =
        svg.props.fill === "currentColor" && svg.props.stroke === "none";
      expect(line || mark, name).toBe(true);
    }
  });

  it.each(lineNames)(
    "%s uses 1.75, square ends, mitred joins and no fill",
    (name) => {
      const svg = svgOf(name);
      expect(svg.props.strokeWidth).toBe(iconStroke.width);
      expect(iconStroke).toEqual({
        width: 1.75,
        linecap: "square",
        linejoin: "miter",
      });
      expect(svg.props.strokeLinecap).toBe("square");
      expect(svg.props.strokeLinejoin).toBe("miter");
      expect(svg.props.fill).toBe("none");
      // inline style beats a page reset such as `svg { fill: currentColor }`
      expect(svg.props.style).toMatchObject({
        fill: "none",
        stroke: "currentColor",
      });
    },
  );

  it("has no hard-coded colour in any glyph", () => {
    const colour =
      /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(black|white|red|blue|green|orange)\b/i;
    for (const name of everyName) {
      const markup = JSON.stringify(svgOf(name));
      expect(markup, name).not.toMatch(colour);
    }
  });

  it("draws golden hour's disc from a token, falling back to the ink", () => {
    const golden = svgOf("golden-hour");
    const style = golden.children[0]!.props.style as { fill: string };
    expect(style.fill).toBe("var(--td-hardwood-400, currentColor)");
  });

  it("draws the too-dark outline with the family stroke", () => {
    const dark = svgOf("too-dark").children[1]!;
    expect(dark.props).toMatchObject({
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "square",
      strokeLinejoin: "miter",
      strokeWidth: 1.75,
    });
  });
});

describe("the two reported defects", () => {
  it("keeps the Play verb and adds a true play triangle for media", () => {
    const verb = svgOf("play")
      .children.map((p) => p.props.d)
      .join("");
    const media = svgOf("media-play").children.map((p) => p.props.d);
    expect(media).toEqual(["M7 4.5V19.5L19.5 12Z"]);
    expect(verb).not.toContain("M7 4.5V19.5L19.5 12Z");
    // the verb is the net-and-ball tab icon: a stem, an arch and a ball
    expect(svgOf("play").children).toHaveLength(3);
  });

  it("draws the map, satellite and map-style glyphs (no blank circle)", () => {
    for (const name of ["map", "satellite", "map-style"] as const) {
      const svg = svgOf(name);
      expect(svg.children.length, name).toBeGreaterThan(0);
      expect(svg.props.style, name).toMatchObject({
        fill: "none",
        stroke: "currentColor",
      });
    }
  });
});

describe("accessibility", () => {
  it("is decorative by default", () => {
    const svg = svgOf("wind");
    expect(svg.props["aria-hidden"]).toBe(true);
    expect(svg.props.role).toBeUndefined();
    expect(svg.props["aria-label"]).toBeUndefined();
    expect(svg.props.focusable).toBe("false");
  });

  it("becomes a named image when it has a label", () => {
    const svg = svgOf("wind", { label: "Windy" });
    expect(svg.props.role).toBe("img");
    expect(svg.props["aria-label"]).toBe("Windy");
    expect(svg.props["aria-hidden"]).toBeUndefined();
  });

  it("labels marks the same way", () => {
    const svg = svgOf("golden-hour", { label: "Golden hour" });
    expect(svg.props.role).toBe("img");
    expect(svg.props["aria-label"]).toBe("Golden hour");
  });
});

describe("other icon sets", () => {
  it("renders nothing for an unknown name and a registered component for a known one", () => {
    expect(Icon({ name: "not-a-real-icon" as IconName })).toBeNull();
    const Fake = () => null;
    registerIcons({ "fake-external": Fake, court: Fake });
    const node = Icon({ name: "fake-external" as IconName, size: "nav" });
    expect(isValidElement(node) && node.type).toBe(Fake);
    expect(svgOf("court").tag).toBe("svg"); // a custom glyph always wins
  });
});

describe("web only", () => {
  it("is not imported by the mobile entry", () => {
    const mobile = readFileSync(`${import.meta.dirname}/../mobile.ts`, "utf8");
    expect(mobile).not.toMatch(/icons/);
  });
});
