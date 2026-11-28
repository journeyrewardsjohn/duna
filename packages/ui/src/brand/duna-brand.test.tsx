import type { ReactElement, ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { DunaLogo } from "./duna-logo";
import { DunaMark } from "./duna-mark";
import {
  CLEAR_SPACE_UNITS,
  CRESTS,
  HORIZONTAL,
  MARK_VIEWBOX,
  MICRO_BELOW_PX,
  NET,
  STACKED,
  WORDMARK_SHAPES,
} from "./geometry";

type Node = ReactElement<Record<string, unknown> & { children?: ReactNode }>;

/** Flatten an element tree (function components here return plain SVG). */
function walk(node: ReactNode, found: Node[] = []): Node[] {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, found);
  } else if (node && typeof node === "object" && "props" in node) {
    const element = node as Node;
    if (typeof element.type === "function") {
      walk(
        (element.type as (props: unknown) => ReactNode)(element.props),
        found,
      );
    } else {
      found.push(element);
      walk(element.props.children, found);
    }
  }
  return found;
}

const tags = (nodes: Node[], tag: string) =>
  nodes.filter((node) => node.type === tag);

function render(element: ReactElement) {
  const nodes = walk(element);
  const root = nodes[0];
  if (!root) throw new Error("Nothing rendered");
  return { root, nodes };
}

describe("DunaMark", () => {
  it("renders the net and three crests in currentColor with an accessible name", () => {
    const { root, nodes } = render(<DunaMark size={32} />);
    expect(root.type).toBe("svg");
    expect(root.props.role).toBe("img");
    expect(root.props["aria-label"]).toBe("Duna");
    expect(root.props.fill).toBe("currentColor");
    expect(root.props["data-duna-mark"]).toBe("full");
    expect(tags(nodes, "rect")).toHaveLength(1);
    expect(tags(nodes, "path").map((path) => path.props.d)).toEqual([
      ...CRESTS,
    ]);
    expect(tags(nodes, "title")[0]?.props.children).toBe("Duna");
  });

  it("uses a custom title as the accessible name", () => {
    const { root } = render(<DunaMark title="Duna home" />);
    expect(root.props["aria-label"]).toBe("Duna home");
  });

  it("is hidden from assistive technology when decorative", () => {
    const { root, nodes } = render(<DunaMark decorative />);
    expect(root.props["aria-hidden"]).toBe(true);
    expect(root.props.role).toBeUndefined();
    expect(root.props["aria-label"]).toBeUndefined();
    expect(tags(nodes, "title")).toHaveLength(0);
  });

  it("switches to the micro mark below the brand book's 20 px", () => {
    const small = render(<DunaMark size={MICRO_BELOW_PX - 1} />);
    expect(small.root.props["data-duna-mark"]).toBe("micro");
    expect(tags(small.nodes, "path")).toHaveLength(1);
    const edge = render(<DunaMark size={MICRO_BELOW_PX} />);
    expect(edge.root.props["data-duna-mark"]).toBe("full");
    expect(tags(edge.nodes, "path")).toHaveLength(3);
    const forced = render(<DunaMark micro size={48} />);
    expect(forced.root.props["data-duna-mark"]).toBe("micro");
  });

  it("keeps the 59:74 ratio and the brand book viewBox", () => {
    const { root } = render(<DunaMark size={74} />);
    expect(root.props.height).toBe(74);
    expect(root.props.width).toBe(59);
    expect(root.props.viewBox).toBe(
      `${MARK_VIEWBOX.x} ${MARK_VIEWBOX.y} ${MARK_VIEWBOX.width} ${MARK_VIEWBOX.height}`,
    );
  });

  it("adds three line-widths of clear space on every side when asked", () => {
    expect(CLEAR_SPACE_UNITS).toBe(3 * NET.width);
    const { root } = render(<DunaMark clearSpace size={134} />);
    expect(root.props.viewBox).toBe(
      `${MARK_VIEWBOX.x - 30} ${MARK_VIEWBOX.y - 30} ${MARK_VIEWBOX.width + 60} ${MARK_VIEWBOX.height + 60}`,
    );
    // 119 x 134 units rendered 134 px tall: width is 119 px.
    expect(root.props.width).toBe(119);
  });
});

describe("DunaLogo", () => {
  it("draws the horizontal lockup: mark plus the drawn wordmark, no text", () => {
    const { root, nodes } = render(<DunaLogo size={37} />);
    expect(root.props["data-duna-logo"]).toBe("horizontal");
    expect(root.props.role).toBe("img");
    expect(root.props["aria-label"]).toBe("Duna");
    expect(root.props.viewBox).toBe(
      `0 0 ${HORIZONTAL.width} ${HORIZONTAL.height}`,
    );
    expect(tags(nodes, "circle")).toHaveLength(WORDMARK_SHAPES.circles.length);
    expect(tags(nodes, "text")).toHaveLength(0);
    // Wordmark strokes use currentColor, never a hard-coded colour.
    const strokes = nodes.map((node) => node.props.stroke).filter(Boolean);
    expect(new Set(strokes)).toEqual(new Set(["currentColor"]));
  });

  it("draws the stacked lockup with the wordmark as wide as the mark", () => {
    const { root } = render(<DunaLogo size={106} variant="stacked" />);
    expect(root.props["data-duna-logo"]).toBe("stacked");
    expect(root.props.viewBox).toBe(`0 0 ${STACKED.width} ${STACKED.height}`);
    // 306 wordmark units * scale equals the mark's 59 units.
    expect(306 * STACKED.wordmarkScale).toBeCloseTo(MARK_VIEWBOX.width, 0);
  });

  it("uses the micro mark inside small logos only", () => {
    expect(render(<DunaLogo size={16} />).root.props["data-duna-mark"]).toBe(
      "micro",
    );
    expect(render(<DunaLogo size={24} />).root.props["data-duna-mark"]).toBe(
      "full",
    );
  });

  it("is decorative on request and respects clear space padding", () => {
    const decorative = render(<DunaLogo decorative />);
    expect(decorative.root.props["aria-hidden"]).toBe(true);
    expect(decorative.root.props.role).toBeUndefined();
    const padded = render(<DunaLogo clearSpace size={134} />);
    expect(padded.root.props.viewBox).toBe(
      `-30 -30 ${HORIZONTAL.width + 60} ${HORIZONTAL.height + 60}`,
    );
  });
});
