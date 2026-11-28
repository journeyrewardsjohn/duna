/**
 * The native wallet (WALLET-2): the card's state → parts mapping through the
 * shared helpers, the carousel ↔ stack rule, the accessible names, the pass
 * text (the longest fixtures never truncate), the native art and the QR
 * drawn from the exact payload.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { act, type ReactTestInstance } from "react-test-renderer";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DUNA_ART_SET,
  encodeQr,
  qrPath,
  type CardArtSource,
} from "@duna/tideline-core";
import { MotionPreference } from "../motion";
import { render } from "../test-support/render";
import { testAnimations, testEnvironment } from "../test-support/react-native";
import {
  artPainting,
  cardContrast,
  cardFaceParts,
  cardGeometry,
  carouselGeometry,
  carouselIndexAt,
  carouselInterpolation,
  carouselValue,
  flipAnnouncement,
  passText,
  scalePath,
  type NativeWalletCard,
} from "./index";
import { CardFlip, FLIP_MS, FLIP_REDUCED_MS } from "./CardFlip";
import { MembershipCard } from "./MembershipCard";
import { MembershipPass, QrCode } from "./MembershipPass";
import { WalletActions } from "./WalletActions";
import { WalletBand } from "./Wallet";

const card = (over: Partial<NativeWalletCard> = {}): NativeWalletCard => ({
  id: "c1",
  club: { name: "Saltline Beach Club" },
  member: "Noa Williams",
  plan: "Annual member",
  chip: "Annual",
  kind: "member",
  status: "active",
  validThrough: "Nov 30, 2027",
  fact: { kind: "credits", text: "8 credits" },
  art: { source: "set", key: "golden-dune" },
  pass: {
    code: "duna:member:v1:7K2Q9D-sample",
    rotation: "static",
    reference: "Duna ID 7K2Q9D",
  },
  ...over,
});

const texts = (root: ReactTestInstance) =>
  root
    .findAll((node) => (node.type as unknown) === "Text")
    .map((node) =>
      ([] as unknown[])
        .concat(node.props.children as unknown)
        .filter((part) => typeof part === "string" || typeof part === "number")
        .join(""),
    )
    .filter(Boolean);

/** Host views with a test id (the composite carries the same props). */
const byId = (root: ReactTestInstance, id: string) =>
  root.findAll(
    (node) => typeof node.type === "string" && node.props.testID === id,
  );

beforeEach(() => {
  testAnimations.length = 0;
  testEnvironment.reduceMotion = false;
  testEnvironment.announcements.length = 0;
});

describe("the face for each state", () => {
  it("active: the plan chip and the live fact", () => {
    const parts = cardFaceParts(card());
    expect(parts.corner).toEqual({ kind: "plan", text: "Annual" });
    expect(parts.fact?.text).toBe("8 credits");
    expect(parts.held).toBeNull();
  });

  it("paused: a Salt state chip with the date; the fact stays", () => {
    const parts = cardFaceParts(card({ status: "paused", until: "Jan 4" }));
    expect(parts.corner).toMatchObject({
      kind: "state",
      tone: "paused",
      icon: "pause",
      text: "Paused to Jan 4",
    });
    expect(parts.fact?.text).toBe("8 credits");
    expect(parts.meta).toBe("Annual");
  });

  it("pending: no fact, no number yet", () => {
    const parts = cardFaceParts(card({ status: "pending", number: null }));
    expect(parts.corner).toMatchObject({ text: "Pending approval" });
    expect(parts.fact).toBeNull();
    expect(parts.meta).toBe("Annual · No. —");
  });

  it("ended: the end date, no fact", () => {
    const parts = cardFaceParts(card({ status: "expired", until: "Oct 31" }));
    expect(parts.corner).toMatchObject({ text: "Ended Oct 31", icon: "alert" });
    expect(parts.fact).toBeNull();
  });

  it("a junior's card says who holds it", () => {
    const parts = cardFaceParts(
      card({ kind: "junior", chip: "Junior", heldBy: "Sam Rivera" }),
    );
    expect(parts.held).toBe("Held by Sam Rivera, guardian");
  });

  it("a club that turns the chip off shows none (active only)", () => {
    expect(cardFaceParts(card({ face: { chip: false } })).corner).toBeNull();
  });

  it("the art is never faded: every state draws the same art layer", () => {
    for (const status of ["active", "paused", "pending", "expired"] as const) {
      const tree = render(
        createElement(MembershipCard, { card: card({ status }), width: 372 }),
      );
      const art = tree.root.findAll(
        (node) => (node.type as unknown) === "Svg" && node.props.width === 372,
      )[0]!;
      expect(art.props.opacity).toBeUndefined();
    }
  });
});

describe("accessible names", () => {
  const five = ["A", "B", "C", "D", "E"].map((letter, index) =>
    card({
      id: letter,
      club: { name: index === 1 ? "Saltline Beach Club" : `Club ${letter}` },
    }),
  );

  it("the carousel's value names the card and its place", () => {
    expect(carouselValue(five, 1)).toBe(
      "Card 2 of 5, Saltline Beach Club, Annual member, active, 8 credits",
    );
  });

  it("the flip is announced", () => {
    expect(flipAnnouncement(card(), true)).toBe(
      "Showing Saltline Beach Club pass. Noa Williams, active.",
    );
    expect(flipAnnouncement(card({ status: "pending" }), true)).toBe(
      "Showing Saltline Beach Club pass. No pass yet.",
    );
    expect(flipAnnouncement(card(), false)).toBe("Saltline Beach Club card");
  });

  it("the carousel is one adjustable element", () => {
    const tree = render(
      createElement(WalletBand, {
        cards: five,
        flipped: false,
        onChange: () => undefined,
        onFlip: () => undefined,
        value: "B",
        width: 402,
      }),
    );
    const carousel = tree.root.findByProps({ testID: "wallet-carousel" });
    expect(carousel.props.accessibilityRole).toBe("adjustable");
    expect(carousel.props.accessibilityValue.text).toContain("Card 2 of 5");
  });

  it("turning over announces the pass", () => {
    let flipped = false;
    const tree = render(
      createElement(WalletBand, {
        cards: five,
        flipped,
        onChange: () => undefined,
        onFlip: (next: boolean) => {
          flipped = next;
        },
        value: "B",
        width: 402,
      }),
    );
    const carousel = tree.root.findByProps({ testID: "wallet-carousel" });
    carousel.props.onAccessibilityAction({
      nativeEvent: { actionName: "activate" },
    });
    expect(flipped).toBe(true);
    expect(testEnvironment.announcements.at(-1)).toContain(
      "Showing Saltline Beach Club pass",
    );
  });
});

describe("carousel or stack (the shared rule)", () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, index) =>
      card({ id: `card-${index}`, club: { name: `Club ${index}` } }),
    );
  const band = (count: number, presentation?: "carousel" | "stack") =>
    render(
      createElement(WalletBand, {
        cards: many(count),
        flipped: false,
        onChange: () => undefined,
        onFlip: () => undefined,
        value: "card-0",
        width: 402,
        ...(presentation ? { presentation } : {}),
      }),
    ).root;

  it("up to six cards is a carousel; seven is a stack", () => {
    expect(byId(band(6), "wallet-carousel")).toHaveLength(1);
    expect(byId(band(7), "wallet-stack")).toHaveLength(1);
  });

  it("the person's choice wins from three cards; one or two never switch", () => {
    expect(byId(band(7, "carousel"), "wallet-carousel")).toHaveLength(1);
    expect(byId(band(3, "stack"), "wallet-stack")).toHaveLength(1);
    expect(byId(band(2, "stack"), "wallet-carousel")).toHaveLength(1);
    expect(byId(band(2), "wallet-switch")).toHaveLength(0);
    expect(byId(band(3), "wallet-switch")).toHaveLength(1);
  });

  it("one card: no dots", () => {
    const root = band(1);
    expect(root.findAll((node) => node.props.hitSlop === 8)).toHaveLength(0);
  });

  it("the stack draws a card out on tap", () => {
    let drawnId = "";
    const root = render(
      createElement(WalletBand, {
        cards: many(8),
        flipped: false,
        onChange: (id: string) => {
          drawnId = id;
        },
        onFlip: () => undefined,
        value: "card-0",
        width: 402,
      }),
    ).root;
    act(() => {
      root.findByProps({ testID: "stack-card-3" }).props.onPress();
    });
    expect(drawnId).toBe("card-3");
    expect(texts(root)).toContain("Tap the card for your pass");
  });
});

describe("geometry", () => {
  it("an ID-1 card that leaves the neighbours a peek", () => {
    const phone = carouselGeometry(402);
    expect(phone.card.width).toBe(350);
    expect(phone.card.height).toBe(Math.round(350 / 1.586));
    expect(phone.peek).toBe(14);
    expect(cardGeometry(1200).width).toBe(396);
    expect(cardGeometry(1200, "hero").width).toBe(420);
  });

  it("neighbours are 94 % from their inner edge", () => {
    const motion = carouselInterpolation(2, 362, 350);
    expect(motion.inputRange).toEqual([362, 724, 1086]);
    expect(motion.scale).toEqual([0.94, 1, 0.94]);
    expect(motion.translateX[0]).toBeCloseTo(-10.5);
    expect(motion.translateX[2]).toBeCloseTo(10.5);
  });

  it("settles on the nearest card", () => {
    expect(carouselIndexAt(540, 362, 5)).toBe(1);
    expect(carouselIndexAt(99999, 362, 5)).toBe(4);
    expect(carouselIndexAt(-40, 362, 5)).toBe(0);
  });
});

describe("the pass", () => {
  const longest = card({
    member: "Maximiliana Alexandra Okonkwo-Vanderbilt de la Fuente",
    plan: "Annual family plan with junior squad access and court priority",
    validThrough: "September 30, 2027",
    heldBy: "Christopher Jonathan Okonkwo-Vanderbilt",
    kind: "junior",
  });

  it("text first, the full validity date, nothing truncated", () => {
    const text = passText(longest);
    expect(text.lines).toContain("Valid to September 30, 2027");
    expect(text.lines).toContain(
      "Guardian Christopher Jonathan Okonkwo-Vanderbilt",
    );
    const tree = render(
      createElement(MembershipPass, {
        card: longest,
        width: 350,
        minHeight: 221,
        radius: 18,
      }),
    );
    const nodes = tree.root.findAll(
      (node) => (node.type as unknown) === "Text",
    );
    expect(nodes.length).toBeGreaterThan(4);
    for (const node of nodes) expect(node.props.numberOfLines).toBeUndefined();
    expect(texts(tree.root)).toContain("Valid to September 30, 2027");
    expect(texts(tree.root)).toContain(longest.member);
  });

  it("a paused card keeps its code; pending and ended say why", () => {
    expect(
      passText(card({ status: "paused", until: "Jan 4, 2027" })).back,
    ).toMatchObject({
      kind: "code",
      statusLine: "Paused until Jan 4, 2027",
    });
    expect(passText(card({ status: "pending" })).back).toMatchObject({
      kind: "message",
      title: "No pass yet",
    });
    expect(
      passText(card({ status: "expired", until: "Oct 31, 2026" })).back,
    ).toMatchObject({
      kind: "message",
      title: "This membership ended Oct 31, 2026",
    });
    expect(passText(card({ pass: null })).back).toMatchObject({
      reason: "no-pass",
    });
  });

  it("a pass saved on this phone says so", () => {
    expect(passText(card({ passSaved: true })).note).toBe(
      "Duna member credential · saved on this phone",
    );
  });

  it("the code is the exact server payload through the shared encoder", () => {
    const payload = "duna:member:v1:7K2Q9D-sample";
    const tree = render(
      createElement(QrCode, {
        value: payload,
        label: "Check-in code",
        size: 132,
      }),
    );
    const path = tree.root.findByType("Path" as never);
    expect(path.props.d).toBe(qrPath(encodeQr(payload, "M")));
    expect(
      tree.root.findByProps({ accessibilityRole: "image" }).props
        .accessibilityLabel,
    ).toBe("Check-in code");
  });
});

describe("motion", () => {
  it("the flip is a 620 ms turn; reduced motion cross-fades in 200 ms", () => {
    render(
      createElement(CardFlip, {
        front: null,
        back: null,
        flipped: true,
        height: 220,
      }),
    );
    expect(testAnimations.at(-1)?.config?.duration).toBe(FLIP_MS);
    render(
      createElement(
        MotionPreference,
        { reduceMotion: true },
        createElement(CardFlip, {
          front: null,
          back: null,
          flipped: true,
          height: 220,
        }),
      ),
    );
    expect(testAnimations.at(-1)?.config?.duration).toBe(FLIP_REDUCED_MS);
  });

  it("only the selected card's art breathes, and never under reduced motion", () => {
    const loops = () =>
      testAnimations.filter((item) => item.kind === "loop").length;
    render(createElement(MembershipCard, { card: card(), width: 350 }));
    expect(loops()).toBe(0);
    render(
      createElement(MembershipCard, {
        animate: true,
        card: card(),
        width: 350,
      }),
    );
    expect(loops()).toBe(1);
    render(
      createElement(
        MotionPreference,
        { reduceMotion: true },
        createElement(MembershipCard, {
          animate: true,
          card: card(),
          width: 350,
        }),
      ),
    );
    expect(loops()).toBe(1);
  });
});

describe("the actions", () => {
  it("an unavailable action keeps its place and says why", () => {
    const reasons: string[] = [];
    let booked = false;
    const tree = render(
      createElement(WalletActions, {
        items: [
          {
            key: "book",
            label: "Book",
            icon: "calendar",
            onPress: () => {
              booked = true;
            },
            disabled: true,
            reason: "This membership has ended",
          },
        ],
        label: "Actions",
        onUnavailable: (reason: string) => reasons.push(reason),
      }),
    );
    tree.root.findByProps({ testID: "wallet-action-book" }).props.onPress();
    expect(booked).toBe(false);
    expect(reasons).toEqual(["This membership has ended"]);
  });
});

describe("the art", () => {
  const sources: CardArtSource[] = [
    ...DUNA_ART_SET.map((piece) => ({
      source: "set" as const,
      key: piece.key,
    })),
    { source: "colour", color: "#1F4E5A" },
    { source: "colour", color: "#C2410C" },
  ];

  it("every piece paints from its own palette and keeps type at 5:1", () => {
    for (const art of sources) {
      const painting = artPainting(art)!;
      expect(painting.layers.length).toBeGreaterThan(3);
      const colours = new Set(painting.palette);
      for (const layer of painting.layers) {
        const used =
          layer.kind === "path"
            ? [
                layer.stroke?.color,
                ...(layer.fade?.stops.map((s) => s.color) ?? []),
              ]
            : layer.stops.map((s) => s.color);
        for (const colour of used.filter(Boolean))
          expect(colours.has(colour!)).toBe(true);
      }
      expect(cardContrast({ art }).ratio).toBeGreaterThanOrEqual(5);
    }
  });

  it("an upload has no painting (its poster is the art)", () => {
    expect(
      artPainting({ source: "upload", poster: "https://x/p.jpg" }),
    ).toBeNull();
  });

  it("paths scale from card fractions to points", () => {
    expect(scalePath("M0 0.5 L1 1 Z", 300, 200)).toBe("M0 100 L300 200 Z");
  });
});

describe("Solar", () => {
  it("appears nowhere in the wallet", () => {
    const here = import.meta.dirname;
    for (const name of readdirSync(here)) {
      if (name.endsWith(".test.tsx")) continue;
      const source = readFileSync(join(here, name), "utf8");
      expect(source, name).not.toMatch(/solar|#f2542d/i);
    }
  });
});
