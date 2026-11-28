import { readFileSync } from "node:fs";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { ClubLockup, ClubMark } from "./club-mark";
import { MembershipCard } from "./membership-card";
import type { WalletCard } from "./membership-card-types";
import { Wallet, WalletActions } from "./wallet";
import { WalletStack } from "./wallet-stack";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
// The card's motion hooks read media queries; Node has none.
(globalThis as { matchMedia?: unknown }).matchMedia = () => ({
  matches: false,
  addEventListener() {},
  removeEventListener() {},
});

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
  const pass = { code: "duna:member:v1:abc", rotation: "static" as const };

  it("names the card, shows one chip and one live fact", () => {
    const renderer = render(
      <MembershipCard
        art={{ source: "set", key: "ocean-teal" }}
        chip="Annual"
        club={club}
        fact={{ kind: "credits", text: "8 credits" }}
        member="Noa Williams"
        number="0412"
        plan="Annual member"
        since="Mar 2024"
        status="active"
      />,
    );
    const card = renderer.root.find((node) => node.type === "article");
    expect(card.props["aria-label"]).toBe(
      "Sunset Beach Club, Annual member, active, 8 credits",
    );
    expect(card.props["data-text"]).toBe("salt");
    const words = text(renderer);
    expect(words).toContain("Annual");
    expect(words).toContain("8 credits");
    expect(words).toContain("No. 0412 · Since Mar 2024");
    // The back is not rendered until the card has turned over.
    expect(words).not.toContain("Check-in pass");
  });

  it("state is a chip in words; pending has no fact and no number", () => {
    const paused = text(
      render(
        <MembershipCard
          chip="Monthly"
          club={club}
          fact={{ kind: "valid", text: "To Jan 2027" }}
          member="Noa"
          status="paused"
          until="Jan 4"
        />,
      ),
    );
    expect(paused).toContain("Paused to Jan 4");
    expect(paused).toContain("To Jan 2027");
    const pending = text(
      render(
        <MembershipCard
          chip="Social"
          club={club}
          fact={{ kind: "credits", text: "3 credits" }}
          member="Noa"
          status="pending"
        />,
      ),
    );
    expect(pending).toContain("Pending approval");
    expect(pending).toContain("Social · No. —");
    expect(pending).not.toContain("3 credits");
  });

  it("a junior's card says who holds it", () => {
    const words = text(
      render(
        <MembershipCard
          chip="Junior"
          club={club}
          heldBy="Rae Castillo"
          kind="junior"
          member="Maya Castillo"
          status="active"
        />,
      ),
    );
    expect(words).toContain("Held by Rae Castillo, guardian");
  });

  it("the back shows the server's code, honestly labelled, as text and a named image", () => {
    const renderer = render(
      <MembershipCard
        club={club}
        flipped
        member="Noa Williams"
        number="0412"
        pass={{ ...pass, reference: "7K2Q9D" }}
        plan="Annual member"
        status="active"
        validThrough="Nov 30, 2027"
      />,
    );
    const words = text(renderer);
    expect(words).toContain("Check-in pass");
    expect(words).toContain("Active member");
    expect(words).toContain("Duna member credential");
    expect(words).toContain("Valid to Nov 30, 2027");
    const qr = renderer.root.find(
      (node) => node.type === "svg" && node.props.role === "img",
    );
    expect(qr.props["aria-label"]).toBe("Check-in code for Noa Williams");
  });

  it("pending, ended and passless backs say why and draw no code", () => {
    for (const [status, words] of [
      ["pending", "No pass yet"],
      ["expired", "This membership ended Oct 31"],
    ] as const) {
      const renderer = render(
        <MembershipCard
          club={club}
          flipped
          member="Noa"
          pass={pass}
          status={status}
          until="Oct 31"
        />,
      );
      expect(text(renderer)).toContain(words);
      expect(
        renderer.root.findAll(
          (node) => node.props.role === "img" && node.type === "svg",
        ),
      ).toHaveLength(0);
    }
    expect(
      text(
        render(
          <MembershipCard club={club} flipped member="Noa" status="active" />,
        ),
      ),
    ).toContain("Passes are not set up for Sunset Beach Club yet.");
  });

  it("with onFlip the card itself turns over by keyboard", () => {
    const flips: boolean[] = [];
    const renderer = render(
      <MembershipCard
        club={club}
        member="Noa"
        onFlip={(next) => flips.push(next)}
        status="active"
      />,
    );
    const card = renderer.root.find((node) => node.type === "article");
    expect(card.props.role).toBe("button");
    act(() => card.props.onKeyDown({ key: "Enter", preventDefault() {} }));
    expect(flips).toEqual([true]);
  });
});

function cardsOf(count: number): WalletCard[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `c${i}`,
    club: { name: `Club ${i}` },
    member: "Noa",
    chip: "Annual",
    status: i === 1 ? ("paused" as const) : ("active" as const),
  }));
}

describe("Wallet", () => {
  it("is a carousel (tablist) up to six cards and a stack (listbox) from seven", () => {
    const five = render(<Wallet cards={cardsOf(5)} />);
    expect(five.root.findAll((n) => n.props.role === "tablist")).toHaveLength(
      1,
    );
    expect(five.root.findAll((n) => n.props.role === "tab")).toHaveLength(5);
    const twelve = render(<Wallet cards={cardsOf(12)} />);
    expect(twelve.root.findAll((n) => n.props.role === "listbox")).toHaveLength(
      1,
    );
    expect(text(twelve)).toContain("12 cards · draw one out");
  });

  it("the person can switch presentation from three cards; two cannot", () => {
    const renderer = render(
      <Wallet cards={cardsOf(4)} rememberPresentation={false} />,
    );
    const toggle = renderer.root.find(
      (n) =>
        n.props["aria-label"] === "Stack the cards" &&
        typeof n.props.onClick === "function",
    );
    act(() => toggle.props.onClick());
    expect(
      renderer.root.findAll((n) => n.props.role === "listbox"),
    ).toHaveLength(1);
    const two = render(<Wallet cards={cardsOf(2)} />);
    expect(
      two.root.findAll((n) => n.props["aria-label"] === "Stack the cards"),
    ).toHaveLength(0);
  });

  it("tapping a neighbour selects it; tapping the selected card shows its pass", () => {
    const changes: string[] = [];
    const renderer = render(
      <Wallet cards={cardsOf(3)} onChange={(id) => changes.push(id)} />,
    );
    const tab = (i: number) =>
      renderer.root.findAll((n) => n.props.role === "tab")[i]!;
    expect(tab(0).props["aria-selected"]).toBe(true);
    expect(tab(1).props["aria-label"]).toBe("Club 1, paused. Card 2 of 3");
    act(() => tab(0).props.onClick());
    expect(text(renderer)).toContain("Showing Club 0 pass. Noa, active.");
    expect(text(renderer)).toContain("Tap again for the card");
    act(() => tab(2).props.onClick());
    expect(changes).toEqual(["c2"]);
    expect(tab(2).props["aria-selected"]).toBe(true);
  });

  it("an empty wallet shows the empty content, never an empty frame", () => {
    expect(
      text(render(<Wallet cards={[]} empty={<p>No club cards yet</p>} />)),
    ).toContain("No club cards yet");
  });

  it("actions are links or buttons; a disabled one says why", () => {
    const renderer = render(
      <WalletActions
        items={[
          {
            key: "pass",
            label: "Show pass",
            icon: "pass",
            onClick: () => {},
            pressed: true,
          },
          { key: "book", label: "Book", icon: "calendar", href: "/clubs/x" },
          {
            key: "benefits",
            label: "Benefits",
            icon: "verified",
            disabled: true,
            reason: "Ended",
          },
        ]}
      />,
    );
    expect(renderer.root.find((n) => n.type === "a").props.href).toBe(
      "/clubs/x",
    );
    expect(text(renderer)).toContain("Ended");
  });
});

describe("WalletStack", () => {
  it("Enter draws the selected card, arrows move, Escape puts it back", () => {
    const renderer = render(<WalletStack cards={cardsOf(7)} />);
    const list = () => renderer.root.find((n) => n.props.role === "listbox");
    const key = (k: string) =>
      act(() => list().props.onKeyDown({ key: k, preventDefault() {} }));
    key("ArrowDown");
    expect(list().props["aria-activedescendant"]).toContain("c1");
    key("Enter");
    expect(text(renderer)).toContain("Back to stack");
    key("Escape");
    expect(text(renderer)).toContain("7 cards · draw one out");
  });

  it("an empty stack says why", () => {
    expect(text(render(<WalletStack cards={[]} />))).toContain(
      "No club cards yet.",
    );
  });
});
