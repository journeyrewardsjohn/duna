import { readFileSync } from "node:fs";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { ClubLockup, ClubMark } from "./club-mark";
import { MembershipCard } from "./membership-card";
import { WalletStack, type WalletCard } from "./wallet-stack";

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

function text(renderer: ReactTestRenderer): string {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === "string") out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object" && "children" in node)
      walk((node as { children: unknown }).children);
  };
  walk(renderer.toJSON());
  return out.join(" ");
}

describe("ClubMark", () => {
  it("is an image named for the club; the state is said, not drawn", () => {
    const renderer = render(
      <ClubMark color="#1E5AA8" name="Sunset Beach Club" state="pending" />,
    );
    const img = renderer.root.find((node) => node.props.role === "img");
    expect(img.props["aria-label"]).toBe("Sunset Beach Club, pending");
    expect(img.props["data-form"]).toBe("monogram");
    expect(img.props.style["--td-clubmark-bg"]).toBe("#1E5AA8");
    expect(img.props.style["--td-clubmark-fg"]).toBe("var(--td-brand-salt)");
    expect(text(renderer)).toContain("SB");
  });

  it("a light club colour gets Night Court type", () => {
    const renderer = render(<ClubMark color="#E9D8B4" name="Cove Volley" />);
    const img = renderer.root.find((node) => node.props.role === "img");
    expect(img.props.style["--td-clubmark-fg"]).toBe(
      "var(--td-brand-night-court)",
    );
  });

  it("no usable name draws the Duna micro mark, never an empty square", () => {
    const renderer = render(<ClubMark name="🏐" />);
    expect(renderer.root.findAll((node) => node.type === "svg")).toHaveLength(
      1,
    );
  });

  it("ClubLockup leads with the facility and says pending in a chip", () => {
    const renderer = render(
      <ClubLockup
        facility="North courts"
        location="Santa Monica, CA"
        name="Sunset Beach Club"
        state="pending"
      />,
    );
    const words = text(renderer);
    expect(words).toContain("North courts");
    expect(words).toContain("Sunset Beach Club · Santa Monica, CA");
    expect(words).toContain("Pending");
  });

  it("the stylesheet never desaturates, fades or rings a club's brand", () => {
    const css = readFileSync(
      new URL("./identity.css", import.meta.url),
      "utf8",
    );
    expect(css).not.toMatch(/grayscale|saturate\(/);
    expect(css).not.toMatch(/\[data-state[^\]]*\][^{]*\{[^}]*(opacity|filter)/);
    expect(css).not.toMatch(
      /td-clubmark[^{]*\{[^}]*(border:\s*\d|box-shadow:[^;]*(white|#fff))/i,
    );
  });
});

describe("MembershipCard", () => {
  const club = { name: "Sunset Beach Club", color: "#1E5AA8" };
  it("shows the code only when an active membership has one", () => {
    const active = text(
      render(
        <MembershipCard
          club={club}
          code="SBC-0148"
          member="Noa Williams"
          status="active"
        />,
      ),
    );
    expect(active).toContain("SBC-0148");
    const pending = text(
      render(
        <MembershipCard
          club={club}
          code="SBC-0148"
          member="Noa Williams"
          status="pending"
        />,
      ),
    );
    expect(pending).not.toContain("SBC-0148");
    expect(pending).toContain("Your pass appears when the club approves you.");
    const none = text(
      render(
        <MembershipCard club={club} member="Noa Williams" status="active" />,
      ),
    );
    expect(none).toContain("No pass to scan yet.");
  });

  it("names the card for screen readers and says validity", () => {
    const renderer = render(
      <MembershipCard
        club={club}
        member="Noa Williams"
        status="expired"
        validThrough="Oct 31, 2026"
      />,
    );
    const card = renderer.root.find((node) => node.type === "article");
    expect(card.props["aria-label"]).toBe(
      "Sunset Beach Club membership card for Noa Williams, expired",
    );
    expect(text(renderer)).toContain("Ended Oct 31, 2026");
  });
});

describe("WalletStack", () => {
  const cards: WalletCard[] = [
    {
      id: "a",
      club: { name: "Sunset Beach Club" },
      member: "Noa",
      status: "active",
    },
    {
      id: "b",
      club: { name: "Harbor Sand Club" },
      member: "Noa",
      status: "paused",
    },
  ];
  it("opens the first card and shows the rest as strips; a strip opens its card", () => {
    const changes: string[] = [];
    const renderer = render(
      <WalletStack cards={cards} onChange={(id) => changes.push(id)} />,
    );
    const open = () =>
      renderer.root.find((node) => node.type === "article").props[
        "aria-label"
      ] as string;
    expect(open()).toContain("Sunset Beach Club");
    const strip = renderer.root.find(
      (node) =>
        node.props["aria-label"] === "Open Harbor Sand Club card, paused" &&
        typeof node.props.onClick === "function",
    );
    act(() => strip.props.onClick());
    expect(changes).toEqual(["b"]);
    expect(open()).toContain("Harbor Sand Club");
  });

  it("an empty wallet says why, never an empty frame", () => {
    expect(text(render(<WalletStack cards={[]} />))).toContain(
      "No club cards yet.",
    );
  });
});
