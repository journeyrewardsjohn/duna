import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, Fragment } from "react";
import { act, create } from "react-test-renderer";
import { render } from "../test-support/render";
import { beforeEach, describe, expect, it } from "vitest";
import { devWarnings } from "../dev";
import { nativeTokens, type NativeFontFamily } from "../tokens";
import { fontFace, TIDELINE_FONT_FACES, TIDELINE_FONT_FILES } from "./fonts";
import {
  fontScaleCap,
  LARGEST_ACCESSIBILITY_SCALE,
  scaledFontSize,
} from "./scale";
import { Text, textStyleFor } from "./Text";
import { Title, titleHasDigit, titleSize } from "./Title";
import { TitleRegion } from "./title-region";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const repo = join(import.meta.dirname, "../../../../..");

beforeEach(() => {
  devWarnings.length = 0;
});

function styleOf(node: { props: { style?: unknown } }) {
  return Object.assign(
    {},
    ...[node.props.style].flat(3).filter(Boolean),
  ) as Record<string, unknown>;
}

describe("Title", () => {
  it("is Jost Medium, never below 22 pt, tracking -0.015em", () => {
    const renderer = render(
      createElement(Title, { size: 18, children: "Find your game" }),
    );
    const style = styleOf(renderer.root.findByType("Text" as never));
    expect(style.fontFamily).toBe("Jost-Medium");
    expect(style.fontSize).toBe(22);
    expect(style.letterSpacing).toBeCloseTo(-0.33, 3);
    expect(titleSize(undefined)).toBe(28);
    expect(devWarnings.some((w) => w.includes("never below 22"))).toBe(true);
  });

  it("warns in development when the text contains a numeral", () => {
    expect(titleHasDigit("Court 3")).toBe(true);
    expect(titleHasDigit("Golden hour")).toBe(false);
    render(createElement(Title, null, "Court 3"));
    expect(devWarnings.some((w) => w.includes("numeral"))).toBe(true);
  });

  it("warns when a second Title mounts in the same region, not in separate regions", async () => {
    await act(async () => {
      create(
        createElement(
          TitleRegion,
          { name: "screen" },
          createElement(Title, null, "First"),
          createElement(Title, null, "Second"),
        ),
      );
    });
    expect(devWarnings.some((w) => w.includes('"screen" region'))).toBe(true);
    devWarnings.length = 0;
    await act(async () => {
      create(
        createElement(
          Fragment,
          null,
          createElement(
            TitleRegion,
            { name: "list" },
            createElement(Title, null, "Courts"),
          ),
          createElement(
            TitleRegion,
            { name: "detail" },
            createElement(Title, null, "Booking"),
          ),
        ),
      );
    });
    expect(devWarnings).toEqual([]);
  });
});

describe("Text", () => {
  it("renders Geist from the face, not a synthesized weight", () => {
    const style = textStyleFor("phone-title", { color: "#000" });
    expect(style.fontFamily).toBe("Geist-SemiBold");
    expect(style.fontWeight).toBe("normal");
    expect(textStyleFor("code", { color: "#000" }).fontFamily).toBe(
      "GeistMono-Regular",
    );
    expect(textStyleFor("figure", { color: "#000" }).fontVariant).toEqual([
      "tabular-nums",
    ]);
  });

  it("never renders below the 12 pt floor", () => {
    const renderer = render(
      createElement(Text, { style: { fontSize: 9 } }, "Tiny"),
    );
    expect(styleOf(renderer.root.findByType("Text" as never)).fontSize).toBe(
      12,
    );
    expect(devWarnings.some((w) => w.includes("readability floor"))).toBe(true);
  });

  it("caps Dynamic Type by role: body grows to the largest size, titles stop at 2x", () => {
    expect(fontScaleCap(16)).toBe(LARGEST_ACCESSIBILITY_SCALE);
    expect(fontScaleCap(22)).toBe(2.5);
    expect(fontScaleCap(28)).toBe(2);
    expect(fontScaleCap(56)).toBe(1.5);
    expect(scaledFontSize(16, 3.12)).toBeCloseTo(49.92);
    expect(scaledFontSize(28, 3.12)).toBe(56);
    const renderer = render(
      createElement(Text, { variant: "figure-xl" }, "21"),
    );
    expect(
      renderer.root.findByType("Text" as never).props.maxFontSizeMultiplier,
    ).toBe(1.5);
  });
});

describe("fonts", () => {
  it("has an exact face for every family and weight the type scale uses", () => {
    for (const [family, weights] of Object.entries(nativeTokens.fontWeights)) {
      for (const weight of weights) {
        const face = fontFace(family as NativeFontFamily, weight);
        const faces = Object.values(TIDELINE_FONT_FACES).flatMap((set) =>
          Object.entries(set),
        );
        expect(
          faces.some(([w, name]) => name === face && Number(w) === weight),
          `${family} ${weight}`,
        ).toBe(true);
      }
    }
  });

  it("maps legacy weights to the nearest shipped face", () => {
    expect(fontFace("ui", 300)).toBe("Geist-Regular");
    expect(fontFace("ui", 900)).toBe("Geist-Bold");
    expect(fontFace("ui", "bold")).toBe("Geist-Bold");
    expect(fontFace("brand", 700)).toBe("Jost-Medium");
  });

  it("ships every face as a file and embeds it in both apps", () => {
    for (const file of TIDELINE_FONT_FILES) {
      const path = join(repo, "packages/ui/assets/fonts", file);
      expect(existsSync(path), file).toBe(true);
    }
    for (const app of ["player", "pro"]) {
      const config = JSON.parse(
        readFileSync(join(repo, `apps/${app}/app.json`), "utf8"),
      ) as {
        expo: { plugins: unknown[] };
      };
      const plugin = config.expo.plugins.find(
        (entry): entry is [string, { fonts: string[] }] =>
          Array.isArray(entry) && entry[0] === "expo-font",
      );
      expect(
        plugin,
        `${app} embeds fonts with the expo-font plugin`,
      ).toBeDefined();
      expect(
        [...plugin![1].fonts].map((path) => path.split("/").pop()).sort(),
      ).toEqual([...TIDELINE_FONT_FILES].sort());
    }
  });

  it("records the licences", () => {
    for (const name of ["Geist-OFL-1.1.txt", "Jost-OFL-1.1.txt"]) {
      expect(readFileSync(join(repo, "docs/licenses", name), "utf8")).toMatch(
        /SIL OPEN FONT LICENSE/i,
      );
    }
  });
});
