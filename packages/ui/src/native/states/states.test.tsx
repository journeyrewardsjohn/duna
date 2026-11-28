import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { render } from "../test-support/render";
import { describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  NotConfiguredState,
  OfflineState,
  PermissionDeniedState,
  lastFreshText,
} from "./states";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const text = (renderer: ReturnType<typeof create>) =>
  renderer.root
    .findAll((node) => (node.type as unknown) === "Text")
    .flatMap((node) => [node.props.children].flat())
    .filter((child) => typeof child === "string")
    .join(" | ");

describe("state parts", () => {
  it("empty: a title, one line and one action", () => {
    const onPress = vi.fn();
    const renderer = render(
      createElement(EmptyState, {
        title: "No games yet",
        text: "Games you join show up here.",
        action: { label: "Find a game", onPress },
      }),
    );
    expect(text(renderer)).toContain("No games yet");
    renderer.root
      .findByProps({ accessibilityLabel: "Find a game" })
      .props.onPress();
    expect(onPress).toHaveBeenCalled();
  });

  it("error: Try again, and the reference behind Details", async () => {
    const onRetry = vi.fn();
    const renderer = render(
      createElement(ErrorState, { reference: "err_123", onRetry }),
    );
    expect(text(renderer)).not.toContain("err_123");
    await act(async () =>
      renderer.root
        .findByProps({ accessibilityHint: "Shows the error reference" })
        .props.onPress(),
    );
    expect(text(renderer)).toContain("Reference: err_123");
    renderer.root
      .findByProps({ accessibilityLabel: "Try again" })
      .props.onPress();
    expect(onRetry).toHaveBeenCalled();
  });

  it("offline says how fresh the data is and what is queued", () => {
    const now = new Date("2026-11-27T12:00:00Z");
    expect(lastFreshText(new Date("2026-11-27T11:48:00Z"), now)).toBe(
      "This may be out of date. Updated 12 min ago.",
    );
    expect(lastFreshText(null, now)).toBe("This may be out of date.");
    const renderer = render(
      createElement(OfflineState, { lastFreshAt: null, queued: 2, now }),
    );
    expect(text(renderer)).toContain("2 changes are saved");
  });

  it("not configured and permission denied explain themselves", () => {
    expect(
      text(render(createElement(NotConfiguredState, { feature: "Payments" }))),
    ).toContain("Payments isn't configured yet");
    expect(
      text(
        render(
          createElement(PermissionDeniedState, {
            what: "payouts",
            who: "an owner",
          }),
        ),
      ),
    ).toContain("Ask an owner");
  });

  it("loading shows nothing for 250 ms, then the loader", async () => {
    vi.useFakeTimers();
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(createElement(LoadingState, { loading: true }, "Done"));
    });
    expect(renderer.toJSON()).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(260);
    });
    expect(
      renderer.root.findAllByProps({ accessibilityRole: "progressbar" }).length,
    ).toBeGreaterThan(0);
    vi.useRealTimers();
  });

  it("the boundary reports and shows the error state with a reference", async () => {
    const quiet = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    function Broken(): never {
      throw new Error("boom");
    }
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(
        createElement(
          AppErrorBoundary,
          { name: "test.root" },
          createElement(Broken),
        ),
      );
    });
    expect(
      renderer.root.findByProps({ testID: "duna-error-state" }),
    ).toBeDefined();
    quiet.mockRestore();
  });
});
