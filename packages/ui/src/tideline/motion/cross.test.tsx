import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { Cross } from "./motion";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function className(renderer: ReactTestRenderer): string {
  const node = renderer.toJSON();
  if (!node || Array.isArray(node)) throw new Error("one element expected");
  return String(node.props.className ?? "");
}

describe("Cross", () => {
  it("keeps the first view still, even when the parent re-renders", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<Cross transitionKey="/money">page</Cross>);
    });
    expect(className(renderer)).not.toContain("td-cross");
    // The shell settling its layout after mount re-renders with the same key.
    act(() => {
      renderer.update(<Cross transitionKey="/money">page</Cross>);
    });
    expect(className(renderer)).not.toContain("td-cross");
  });

  it("crosses when the key changes, and back to an earlier key too", () => {
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<Cross transitionKey="/money">page</Cross>);
    });
    act(() => {
      renderer.update(<Cross transitionKey="/money/payouts">page</Cross>);
    });
    expect(className(renderer)).toContain("td-cross");
    act(() => {
      renderer.update(
        <Cross direction="back" transitionKey="/money">
          page
        </Cross>,
      );
    });
    expect(className(renderer)).toContain("td-cross--back");
  });
});
