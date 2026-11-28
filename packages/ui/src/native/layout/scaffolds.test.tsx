import { createElement, useEffect, useState } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, describe, expect, it } from "vitest";
import { UNAVAILABLE_POSTURE } from "@duna/expo-device-posture/posture";
import { AdaptiveScaffold } from "./AdaptiveScaffold";
import { FoldScaffold } from "./FoldScaffold";
import { sheetPresentation } from "./AdaptiveSheet";
import { testWindow } from "./test-support/react-native";
import { testPosture } from "./test-support/device-posture";

// react-test-renderer warns unless the environment opts into act().
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounts = { detail: 0, primary: 0, watched: 0 };
let setDraft: (value: string) => void = () => undefined;

/** A detail with local state (a typed draft) that counts its mounts. */
function Detail() {
  const [draft, set] = useState("");
  setDraft = set;
  useEffect(() => {
    mounts.detail += 1;
  }, []);
  return createElement("Text", { testID: "draft" }, draft);
}

function Primary() {
  useEffect(() => {
    mounts.primary += 1;
  }, []);
  return createElement("Text", null, "List");
}

function Watched() {
  useEffect(() => {
    mounts.watched += 1;
  }, []);
  return createElement("Text", null, "Score");
}

function setWindow(width: number, height: number, fontScale = 1) {
  testWindow.width = width;
  testWindow.height = height;
  testWindow.fontScale = fontScale;
}

function styleOf(renderer: ReactTestRenderer, testID: string) {
  const node = renderer.root.find(
    (candidate) =>
      candidate.props.testID === testID && String(candidate.type) === "View",
  );
  const style = node.props.style as unknown[];
  return Object.assign({}, ...style.flat(Infinity).filter(Boolean)) as Record<
    string,
    unknown
  >;
}

afterEach(() => {
  mounts.detail = 0;
  mounts.primary = 0;
  mounts.watched = 0;
  setWindow(402, 874);
  testPosture.current = UNAVAILABLE_POSTURE;
});

describe("AdaptiveScaffold continuity", () => {
  it("keeps the pushed detail mounted, with its state, across compact → regular → compact", () => {
    setWindow(466, 678); // Duo closed: compact
    let renderer!: ReactTestRenderer;
    const tree = () =>
      createElement(AdaptiveScaffold, {
        detail: createElement(Detail),
        onDismissDetail: () => undefined,
        primary: createElement(Primary),
      });
    act(() => {
      renderer = create(tree());
    });
    expect(styleOf(renderer, "adaptive-scaffold-primary").display).toBe("none");
    act(() => setDraft("Serve to zone 1"));

    setWindow(951, 669); // Duo open: regular, two panes
    act(() => renderer.update(tree()));
    expect(
      styleOf(renderer, "adaptive-scaffold-primary").display,
    ).toBeUndefined();
    expect(
      styleOf(renderer, "adaptive-scaffold-detail").display,
    ).toBeUndefined();

    setWindow(669, 951); // rotated / half-open
    act(() => renderer.update(tree()));
    setWindow(466, 678); // closed again
    act(() => renderer.update(tree()));

    expect(mounts.detail).toBe(1);
    expect(mounts.primary).toBe(1);
    expect(
      renderer.root.find((node) => node.props.testID === "draft").props
        .children,
    ).toBe("Serve to zone 1");
    // Compact again: the detail is pushed over the list with a Back control.
    expect(styleOf(renderer, "adaptive-scaffold-primary").display).toBe("none");
    expect(
      renderer.root.findAll(
        (node) =>
          String(node.type) === "Pressable" &&
          node.props.accessibilityLabel === "Back",
      ),
    ).toHaveLength(1);
    act(() => renderer.unmount());
  });

  it("shows the inspector only when three panes fit", () => {
    setWindow(1210, 834);
    let renderer!: ReactTestRenderer;
    const tree = () =>
      createElement(AdaptiveScaffold, {
        detail: createElement(Detail),
        inspector: createElement("Text", null, "Conditions"),
        primary: createElement(Primary),
      });
    act(() => {
      renderer = create(tree());
    });
    expect(
      styleOf(renderer, "adaptive-scaffold-inspector").display,
    ).toBeUndefined();
    setWindow(834, 1210);
    act(() => renderer.update(tree()));
    expect(styleOf(renderer, "adaptive-scaffold-inspector").display).toBe(
      "none",
    );
    expect(mounts.detail).toBe(1);
    act(() => renderer.unmount());
  });
});

describe("FoldScaffold", () => {
  const halfOpen = {
    ...UNAVAILABLE_POSTURE,
    isAvailable: true,
    posture: "half-open" as const,
    fold: {
      axis: "horizontal" as const,
      rect: { x: 0, y: 463, width: 669, height: 25 },
      margins: { top: 0, left: 0, bottom: 0, right: 0 },
      active: true,
    },
  };

  it("enters the full-screen half-open mode, offers Done, and keeps the watched content mounted", () => {
    const changes: boolean[] = [];
    setWindow(951, 669);
    testPosture.current = {
      ...UNAVAILABLE_POSTURE,
      isAvailable: true,
      posture: "open",
    };
    let renderer!: ReactTestRenderer;
    const tree = () =>
      createElement(FoldScaffold, {
        onTabletopChange: (active: boolean) => changes.push(active),
        primary: createElement(Watched),
        secondary: createElement("Text", null, "Controls"),
      });
    act(() => {
      renderer = create(tree());
    });
    expect(changes).toEqual([false]);

    setWindow(669, 951);
    testPosture.current = halfOpen;
    act(() => renderer.update(tree()));
    expect(changes).toEqual([false, true]);
    const done = renderer.root.find(
      (node) =>
        String(node.type) === "Pressable" &&
        node.props.accessibilityLabel === "Done",
    );
    expect(styleOf(renderer, "fold-scaffold-primary").height).toBe(463);

    act(() => (done.props.onPress as () => void)());
    expect(changes).toEqual([false, true, false]);

    setWindow(466, 678);
    testPosture.current = {
      ...UNAVAILABLE_POSTURE,
      isAvailable: true,
      posture: "closed",
    };
    act(() => renderer.update(tree()));
    expect(mounts.watched).toBe(1);
    act(() => renderer.unmount());
  });
});

describe("sheetPresentation", () => {
  it("is a bottom sheet when compact, pane-sized when regular, side or centred when expanded", () => {
    expect(sheetPresentation("compact", "panel", true)).toBe("bottom");
    expect(sheetPresentation("regular", "panel", true)).toBe("pane");
    expect(sheetPresentation("regular", "panel", false)).toBe("bottom");
    expect(sheetPresentation("regular", "dialog", true)).toBe("centered");
    expect(sheetPresentation("expanded", "panel", true)).toBe("side");
    expect(sheetPresentation("expanded", "dialog", false)).toBe("centered");
  });
});
