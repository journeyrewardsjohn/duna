/**
 * Fixtures are built by hand from the English table in
 * `packages/core/src/participation/copy.ts` (`@duna/core` is not a
 * dependency of `@duna/ui`): every display state the API can send.
 */
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { render } from "../test-support/render";
import {
  ParticipationChip,
  ParticipationLine,
  PriceLadder,
} from "./Participation";
import {
  participationView,
  type ParticipationTone,
  type ParticipationViewInput,
} from "./view";

const numbers = (
  booked: number,
  over: Partial<ParticipationViewInput["display"]["numbers"]> = {},
) => ({
  booked,
  capacity: 8,
  minimum: 4,
  needed: Math.max(0, 4 - booked),
  spotsLeft: Math.max(0, 8 - booked),
  waiting: 0,
  ...over,
});

const ladderRows = (current: number) =>
  [
    { minParticipants: 1, maxParticipants: 3, creditsPerPlayer: 12 },
    { minParticipants: 4, maxParticipants: 5, creditsPerPlayer: 9 },
    { minParticipants: 6, maxParticipants: 8, creditsPerPlayer: 7 },
  ].map((row, index) => ({ ...row, current: index === current }));
const ladderCopy = [
  "1 to 3 players · 12 credits each",
  "4 to 5 players · 9 credits each",
  "6 or more · 7 credits each",
];

function fixture(
  displayState: string,
  tone: ParticipationTone,
  copy: Partial<ParticipationViewInput["copy"]> & { status: string },
  options: {
    booked?: number;
    current?: number | null;
    waiting?: number;
    allowed?: boolean;
    free?: boolean;
  } = {},
): ParticipationViewInput {
  const booked = options.booked ?? 3;
  const priced = options.current !== undefined && options.current !== null;
  return {
    displayState,
    display: {
      tone,
      numbers: numbers(booked, { waiting: options.waiting ?? 0 }),
      ...(priced
        ? { price: { maxCharge: 12, ladder: ladderRows(options.current!) } }
        : {}),
      cancellation: {
        allowed: options.allowed ?? true,
        free: options.free ?? true,
      },
    },
    copy: {
      ladder: priced ? ladderCopy : [],
      a11y: `Sunset Clinic. ${copy.status}.${copy.line ? ` ${copy.line}.` : ""} ${booked} of 8 places booked.`,
      ...copy,
    },
  };
}

const FIXTURES: Record<string, ParticipationViewInput> = {
  open: fixture("open", "neutral", { status: "5 spots left" }),
  "needs-players": fixture(
    "needs-players",
    "caution",
    {
      status: "Needs 1 more",
      line: "Confirms Thu 6:00 PM if 1 more joins",
      price:
        "12 credits now. If more join by Thu 6:00 PM, the difference comes back.",
      cancellation: "Free cancellation until Thu 6:00 PM",
    },
    { current: 0 },
  ),
  "minimum-reached": fixture(
    "minimum-reached",
    "positive",
    { status: "Minimum reached", line: "Confirms Thu 6:00 PM" },
    { booked: 4, current: 1 },
  ),
  full: fixture(
    "full",
    "neutral",
    { status: "Full", line: "2 waiting" },
    { booked: 8, waiting: 2, current: 2 },
  ),
  confirmed: fixture(
    "confirmed",
    "positive",
    {
      status: "Confirmed · 6 players",
      price: "Group confirmed · you pay 7 credits",
      cancellation:
        "Cancelling now costs 7 credits. You get them back if someone takes your place.",
    },
    { booked: 6, current: 2, free: false },
  ),
  "running-small": fixture(
    "running-small",
    "positive",
    { status: "Confirmed · small group" },
    { booked: 2 },
  ),
  "cancelled-low": fixture(
    "cancelled-low",
    "critical",
    { status: "Cancelled · not enough players" },
    { booked: 2, current: 0, allowed: false },
  ),
  "cancelled-club": fixture(
    "cancelled-club",
    "critical",
    { status: "Cancelled by Santa Monica Beach Club" },
    { allowed: false },
  ),
  done: fixture(
    "done",
    "neutral",
    {
      status: "Done",
      line: "You were marked absent",
      cancellation: "Cancellation closed when this session started.",
    },
    { allowed: false, free: false },
  ),
  settled: fixture(
    "settled",
    "neutral",
    { status: "Done" },
    { allowed: false },
  ),
};

describe("participationView", () => {
  it.each(Object.entries(FIXTURES))(
    "%s renders the backend's words",
    (state, input) => {
      const view = participationView(input);
      expect(view.chip).toEqual({
        label: input.copy.status,
        tone: input.display.tone,
      });
      expect(view.line).toBe(input.copy.line);
      expect(view.priceLine).toBe(input.copy.price);
      expect(view.cancelLine).toBe(input.copy.cancellation);
      expect(view.a11y).toBe(input.copy.a11y);
      expect(view.ladder.map((row) => row.label)).toEqual(input.copy.ladder);
      expect(view.full).toBe(state === "full");
      expect(view.needsPlayers).toBe(state === "needs-players");

      const chip = render(createElement(ParticipationChip, view.chip));
      expect(JSON.stringify(chip.toJSON())).toContain(input.copy.status);
      const line = render(
        createElement(ParticipationLine, {
          status: view.chip.label,
          line: view.line,
          tone: view.chip.tone,
          compact: true,
        }),
      );
      const compact = line.root.find(
        (node) =>
          typeof node.type !== "string" && node.props.numberOfLines === 2,
      );
      expect(compact.props.accessibilityLabel).toBe(
        view.line ? `${view.chip.label} · ${view.line}` : view.chip.label,
      );
    },
  );

  it("pairs each ladder row with the backend's current flag", () => {
    const view = participationView(FIXTURES["minimum-reached"]!);
    expect(view.ladder).toEqual([
      { label: ladderCopy[0], current: false },
      { label: ladderCopy[1], current: true },
      { label: ladderCopy[2], current: false },
    ]);
    expect(view.showLadder).toBe(true);
    expect(participationView(FIXTURES["cancelled-low"]!).showLadder).toBe(
      false,
    );
    expect(participationView(FIXTURES.open!).showLadder).toBe(false);
  });
});

describe("ParticipationChip", () => {
  const styleOf = (tree: ReturnType<typeof render>) => {
    const node = tree.root.find(
      (n) => typeof n.type !== "string" && n.props.accessibilityRole === "text",
    );
    return Object.assign({}, ...[node.props.style].flat(2)) as Record<
      string,
      unknown
    >;
  };

  it("holds the longest label with padding and never clips it", () => {
    const tree = render(
      createElement(ParticipationChip, {
        label: "Cancelled · not enough players",
        tone: "critical",
      }),
    );
    const style = styleOf(tree);
    expect(style.paddingHorizontal).toBeGreaterThan(0);
    expect(style.maxWidth).toBe("100%");
    expect(style.overflow).toBeUndefined();
    const label = tree.root.find(
      (n) =>
        typeof n.type !== "string" &&
        n.props.children === "Cancelled · not enough players",
    );
    expect(label.props.numberOfLines).toBeUndefined();
  });

  it("uses Solar only when live", () => {
    const calm = JSON.stringify(
      render(
        createElement(ParticipationChip, { label: "Full", tone: "neutral" }),
      ).toJSON(),
    );
    const live = JSON.stringify(
      render(
        createElement(ParticipationChip, {
          label: "Full",
          tone: "neutral",
          live: true,
        }),
      ).toJSON(),
    );
    expect(calm).not.toMatch(/#f2542d/i);
    expect(live).toMatch(/#f2542d/i);
  });
});

describe("PriceLadder", () => {
  it("is a list with the current row named", () => {
    const view = participationView(FIXTURES["needs-players"]!);
    const tree = render(
      createElement(PriceLadder, {
        rows: view.ladder,
        currentLabel: "Now (3 booked)",
        maxLine: view.priceLine,
      }),
    );
    const body = JSON.stringify(tree.toJSON());
    expect(body).toContain("What you pay at each group size");
    expect(body).toContain("Now (3 booked)");
    expect(body).toContain(view.priceLine!);
    tree.root.find(
      (n) => typeof n.type !== "string" && n.props.accessibilityRole === "list",
    );
    const current = tree.root.find(
      (n) =>
        typeof n.type !== "string" &&
        n.props.accessibilityState?.selected === true,
    );
    expect(current.props.accessibilityLabel).toBe(
      `${ladderCopy[0]}, Now (3 booked)`,
    );
  });
});
