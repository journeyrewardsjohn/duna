import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { ObjectHeader } from "./object-header";
import {
  sectionMarkLabel,
  sectionProgress,
  splitSubNav,
  type SubNavItem,
} from "./object-core";
import { SectionNav } from "./section-nav";
import { SubNav } from "./sub-nav";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function render(element: React.ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  return renderer!;
}

const tabs = (count: number): SubNavItem[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `t${i + 1}`,
    label: `Tab ${i + 1}`,
    href: `/area/t${i + 1}`,
  }));

describe("splitSubNav", () => {
  it("keeps up to six tabs in the row", () => {
    const { visible, overflow } = splitSubNav(tabs(6), "t1");
    expect(visible.map((t) => t.id)).toEqual([
      "t1",
      "t2",
      "t3",
      "t4",
      "t5",
      "t6",
    ]);
    expect(overflow).toEqual([]);
  });

  it("puts the rest under More, which takes a place itself", () => {
    const { visible, overflow } = splitSubNav(tabs(8), "t2");
    expect(visible.map((t) => t.id)).toEqual(["t1", "t2", "t3", "t4", "t5"]);
    expect(overflow.map((t) => t.id)).toEqual(["t6", "t7", "t8"]);
  });

  it("never hides the current tab under More", () => {
    const { visible, overflow } = splitSubNav(tabs(8), "t7");
    expect(visible.map((t) => t.id)).toEqual(["t1", "t2", "t3", "t4", "t7"]);
    expect(overflow.map((t) => t.id)).toEqual(["t5", "t6", "t8"]);
    // Nothing is lost or duplicated.
    expect([...visible, ...overflow].map((t) => t.id).sort()).toEqual(
      tabs(8)
        .map((t) => t.id)
        .sort(),
    );
  });
});

describe("SectionNav marks", () => {
  it("names every mark in words", () => {
    expect(sectionMarkLabel("done")).toBe("Done");
    expect(sectionMarkLabel("in-progress")).toBe("In progress");
    expect(sectionMarkLabel("not-started")).toBe("Not started");
    expect(sectionMarkLabel("attention")).toBe("Needs attention");
  });

  it("counts progress from the marks only", () => {
    expect(sectionProgress(["done", "attention", undefined, "done"])).toEqual({
      done: 2,
      total: 3,
      label: "2 of 3 done",
    });
    expect(sectionProgress([undefined])).toBeUndefined();
  });
});

describe("SubNav", () => {
  it("is a named nav of links with the current one marked", () => {
    const renderer = render(
      <SubNav current="t2" items={tabs(3)} label="Money" />,
    );
    const nav = renderer.root.findByType("nav");
    expect(nav.props["aria-label"]).toBe("Money");
    const links = renderer.root.findAll((node) => node.type === "a");
    expect(links.map((link) => link.props["data-nav-id"])).toEqual([
      "t1",
      "t2",
      "t3",
    ]);
    expect(links[1]!.props["aria-current"]).toBe("page");
    expect(links[0]!.props["aria-current"]).toBeUndefined();
  });

  it("renders the app's own link when given one", () => {
    const renderer = render(
      <SubNav
        current="t1"
        items={tabs(2)}
        label="Area"
        renderLink={({ children, ...props }) => (
          <span data-link={props.href} {...props}>
            {children}
          </span>
        )}
      />,
    );
    expect(
      renderer.root.findAll(
        (node) => node.type === "span" && node.props["data-link"],
      ),
    ).toHaveLength(2);
  });
});

describe("SectionNav", () => {
  it("says each mark in words and marks the current section", () => {
    const renderer = render(
      <SectionNav
        current="verify"
        groups={[
          {
            items: [
              { id: "business", label: "Business", href: "/b", mark: "done" },
              { id: "verify", label: "Verify", href: "/v", mark: "attention" },
            ],
          },
        ]}
        label="Setup"
        showProgress
      />,
    );
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Needs attention");
    expect(json).toContain("1 of 2 done");
    const links = renderer.root.findAll((node) => node.type === "a");
    expect(links[1]!.props["aria-current"]).toBe("page");
  });
});

describe("ObjectHeader", () => {
  it("has one level-1 title, a status in words and facts as a list", () => {
    const renderer = render(
      <ObjectHeader
        back={{ href: "/money/transactions", label: "Transactions" }}
        facts={[{ label: "Paid", value: "$48.00", numeric: true }]}
        status={{ label: "Refunded", tone: "info" }}
        title="Court rental"
      />,
    );
    expect(renderer.root.findAllByType("h1")).toHaveLength(1);
    expect(renderer.root.findByType("dl")).toBeTruthy();
    expect(JSON.stringify(renderer.toJSON())).toContain("Refunded");
  });
});
