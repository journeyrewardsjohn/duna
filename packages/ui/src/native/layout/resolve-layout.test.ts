import { describe, expect, it } from "vitest";
import {
  resolveLayout,
  widthClassFor,
  type LayoutInput,
  type ResolvedLayout,
} from "./resolve-layout";

// Window sizes in points. The Duo outer window (466 × 678) was measured on the
// Xcode 27.2 simulator; the inner windows and the 25 pt fold bands are still
// the design boards' placeholders (docs/mobile/ADAPTIVE.md, "Measured").
const DUO_OPEN_FOLD = { x: 463, y: 0, width: 25, height: 669 };
const DUO_HALF_FOLD = { x: 0, y: 463, width: 669, height: 25 };

type Row = {
  readonly name: string;
  readonly input: LayoutInput;
  readonly widthClass: ResolvedLayout["widthClass"];
  readonly paneCount: ResolvedLayout["paneCount"];
  readonly mode: ResolvedLayout["mode"];
};

const matrix: readonly Row[] = [
  {
    name: "iPhone 17 Pro portrait",
    input: { width: 402, height: 874 },
    widthClass: "compact",
    paneCount: 1,
    mode: "stack",
  },
  {
    name: "iPhone 17 Pro landscape",
    input: { width: 874, height: 402 },
    widthClass: "regular",
    paneCount: 2,
    mode: "split",
  },
  {
    name: "Duo outer (closed)",
    input: {
      width: 466,
      height: 678,
      posture: "closed",
      foldRect: DUO_OPEN_FOLD,
    },
    widthClass: "compact",
    paneCount: 1,
    mode: "stack",
  },
  {
    name: "Duo outer landscape (closed)",
    input: { width: 678, height: 466, posture: "closed" },
    widthClass: "regular",
    paneCount: 2,
    mode: "split",
  },
  {
    name: "Duo inner open flat",
    input: {
      width: 951,
      height: 669,
      posture: "open",
      foldRect: DUO_OPEN_FOLD,
    },
    widthClass: "regular",
    paneCount: 2,
    mode: "split",
  },
  {
    name: "Duo inner open like a book (half-open, vertical fold)",
    input: {
      width: 951,
      height: 669,
      posture: "half-open",
      foldRect: DUO_OPEN_FOLD,
    },
    widthClass: "regular",
    paneCount: 2,
    mode: "split",
  },
  {
    name: "Duo inner rotated flat",
    input: {
      width: 669,
      height: 951,
      posture: "open",
      foldRect: DUO_HALF_FOLD,
    },
    widthClass: "regular",
    paneCount: 2,
    mode: "split",
  },
  {
    name: "Duo half-open propped",
    input: {
      width: 669,
      height: 951,
      posture: "half-open",
      foldRect: DUO_HALF_FOLD,
    },
    widthClass: "regular",
    paneCount: 2,
    mode: "tabletop",
  },
  {
    name: "iPad mini portrait",
    input: { width: 744, height: 1133 },
    widthClass: "expanded",
    paneCount: 2,
    mode: "split",
  },
  {
    name: "iPad mini landscape",
    input: { width: 1133, height: 744 },
    widthClass: "expanded",
    paneCount: 3,
    mode: "split",
  },
  {
    name: "iPad 11-inch portrait",
    input: { width: 834, height: 1210 },
    widthClass: "expanded",
    paneCount: 2,
    mode: "split",
  },
  {
    name: "iPad 11-inch landscape",
    input: { width: 1210, height: 834 },
    widthClass: "expanded",
    paneCount: 3,
    mode: "split",
  },
  {
    name: "iPad 13-inch portrait",
    input: { width: 1032, height: 1376 },
    widthClass: "expanded",
    paneCount: 3,
    mode: "split",
  },
  {
    name: "iPad 13-inch landscape",
    input: { width: 1376, height: 1032 },
    widthClass: "expanded",
    paneCount: 3,
    mode: "split",
  },
  {
    name: "iPad 13-inch landscape half split",
    input: { width: 678, height: 1032 },
    widthClass: "regular",
    paneCount: 2,
    mode: "split",
  },
  {
    name: "iPad 13-inch landscape two-thirds split",
    input: { width: 904, height: 1032 },
    widthClass: "expanded",
    paneCount: 2,
    mode: "split",
  },
  {
    name: "iPad 13-inch landscape one-third split",
    input: { width: 438, height: 1032 },
    widthClass: "compact",
    paneCount: 1,
    mode: "stack",
  },
  {
    name: "iPad 13-inch portrait half split",
    input: { width: 506, height: 1376 },
    widthClass: "compact",
    paneCount: 1,
    mode: "stack",
  },
  {
    name: "iPad 11-inch landscape half split",
    input: { width: 595, height: 834 },
    widthClass: "regular",
    paneCount: 1,
    mode: "stack",
  },
  {
    name: "iPad 11-inch landscape one-third split",
    input: { width: 375, height: 834 },
    widthClass: "compact",
    paneCount: 1,
    mode: "stack",
  },
  {
    name: "iPhone at the largest text size",
    input: { width: 402, height: 874, fontScale: 3.1 },
    widthClass: "compact",
    paneCount: 1,
    mode: "stack",
  },
  {
    name: "Duo open flat at the largest text size",
    input: {
      width: 951,
      height: 669,
      fontScale: 3.1,
      posture: "open",
      foldRect: DUO_OPEN_FOLD,
    },
    widthClass: "regular",
    paneCount: 1,
    mode: "stack",
  },
  {
    name: "Duo book half-open at the largest text size keeps the fold seam",
    input: {
      width: 951,
      height: 669,
      fontScale: 3.1,
      posture: "half-open",
      foldRect: DUO_OPEN_FOLD,
    },
    widthClass: "regular",
    paneCount: 2,
    mode: "split",
  },
  {
    name: "Duo half-open propped at the largest text size",
    input: {
      width: 669,
      height: 951,
      fontScale: 3.1,
      posture: "half-open",
      foldRect: DUO_HALF_FOLD,
    },
    widthClass: "regular",
    paneCount: 2,
    mode: "tabletop",
  },
  {
    name: "iPad 13-inch landscape at the largest text size",
    input: { width: 1376, height: 1032, fontScale: 3.1 },
    widthClass: "expanded",
    paneCount: 2,
    mode: "split",
  },
];

describe("resolveLayout device matrix", () => {
  for (const row of matrix) {
    it(row.name, () => {
      const layout = resolveLayout(row.input);
      expect(layout.widthClass).toBe(row.widthClass);
      expect(layout.paneCount).toBe(row.paneCount);
      expect(layout.mode).toBe(row.mode);
      expect(layout.panes).toHaveLength(
        row.mode === "stack" ? 1 : row.paneCount,
      );
      // Panes never overlap and never leave the window.
      for (const pane of layout.panes) {
        expect(pane.frame.x).toBeGreaterThanOrEqual(0);
        expect(pane.frame.y).toBeGreaterThanOrEqual(0);
        expect(pane.frame.x + pane.frame.width).toBeLessThanOrEqual(
          row.input.width + 0.001,
        );
        expect(pane.frame.y + pane.frame.height).toBeLessThanOrEqual(
          row.input.height + 0.001,
        );
      }
    });
  }
});

describe("width classes reproduce the boards", () => {
  it("places the open Duo in regular and every full-screen iPad in expanded", () => {
    expect(widthClassFor(951, 669)).toBe("regular");
    expect(widthClassFor(669, 951)).toBe("regular");
    expect(widthClassFor(466, 678)).toBe("compact");
    expect(widthClassFor(744, 1133)).toBe("expanded");
    expect(widthClassFor(756, 1158)).toBe("expanded");
    expect(widthClassFor(834, 1210)).toBe("expanded");
    expect(widthClassFor(1210, 834)).toBe("expanded");
  });

  it("uses exact boundaries", () => {
    expect(widthClassFor(559.5, 900)).toBe("compact");
    expect(widthClassFor(560, 900)).toBe("regular");
    expect(widthClassFor(740, 719)).toBe("regular");
    expect(widthClassFor(740, 720)).toBe("expanded");
  });
});

describe("the fold", () => {
  it("splits two panes at an active vertical fold and leaves the band empty", () => {
    const layout = resolveLayout({
      width: 951,
      height: 669,
      posture: "half-open",
      foldRect: DUO_OPEN_FOLD,
    });
    const [primary, secondary] = layout.panes;
    expect(layout.fold).toMatchObject({ axis: "vertical", active: true });
    expect(primary?.frame).toEqual({ x: 0, y: 0, width: 463, height: 669 });
    expect(secondary?.frame).toEqual({ x: 488, y: 0, width: 463, height: 669 });
  });

  it("meets at the fold's centre when the Duo lies flat", () => {
    const layout = resolveLayout({
      width: 951,
      height: 669,
      posture: "open",
      foldRect: DUO_OPEN_FOLD,
    });
    expect(layout.fold?.active).toBe(false);
    expect(layout.panes[0]?.frame.width).toBe(475.5);
    expect(layout.panes[1]?.frame.x).toBe(475.5);
  });

  it("puts watching above and touch below when propped half-open", () => {
    const layout = resolveLayout({
      width: 669,
      height: 951,
      posture: "half-open",
      foldRect: DUO_HALF_FOLD,
      safeArea: { top: 24, left: 0, bottom: 20, right: 0 },
    });
    const [top, bottom] = layout.panes;
    expect(top).toMatchObject({ id: "top", frame: { y: 0, height: 463 } });
    expect(bottom).toMatchObject({
      id: "bottom",
      frame: { y: 488, height: 463 },
    });
    expect(top?.insets).toEqual({ top: 24, left: 0, bottom: 0, right: 0 });
    expect(bottom?.insets).toEqual({ top: 0, left: 0, bottom: 20, right: 0 });
  });

  it("ignores the fold when closed", () => {
    const layout = resolveLayout({
      width: 466,
      height: 678,
      posture: "closed",
      foldRect: DUO_OPEN_FOLD,
      foldActive: true,
    });
    expect(layout.fold).toBeNull();
    expect(layout.mode).toBe("stack");
  });
});

describe("insets", () => {
  it("applies each safe-area edge only to the panes that touch it", () => {
    const layout = resolveLayout({
      width: 1210,
      height: 834,
      safeArea: { top: 24, left: 10, bottom: 20, right: 12 },
    });
    const [primary, secondary, inspector] = layout.panes;
    expect(primary?.insets).toEqual({
      top: 24,
      left: 10,
      bottom: 20,
      right: 0,
    });
    expect(secondary?.insets).toEqual({
      top: 24,
      left: 0,
      bottom: 20,
      right: 0,
    });
    expect(inspector?.insets).toEqual({
      top: 24,
      left: 0,
      bottom: 20,
      right: 12,
    });
  });

  it("raises the inset where the camera occludes a pane", () => {
    const layout = resolveLayout({
      width: 951,
      height: 669,
      posture: "open",
      foldRect: DUO_OPEN_FOLD,
      safeArea: { top: 0, left: 0, bottom: 0, right: 0 },
      occlusions: [{ x: 900, y: 0, width: 51, height: 40 }],
    });
    expect(layout.panes[0]?.insets.top).toBe(0);
    expect(layout.panes[1]?.insets.top).toBe(40);
  });
});
