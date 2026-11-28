import { readFileSync } from "node:fs";
import { NET_SCORE_STATUSES, MATCH_STATUSES } from "@duna/tideline-core";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { NET_SCORE_LOOK, netScoreModel } from "./net-score-model";
import { NetScore, type NetScoreProps } from "./net-score";
import { RatingRing } from "./rating-ring";

// React's act() environment flag for the test renderer.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const teams = ["Williams / Lewis", "Park / Stone"] as const;
const three: NetScoreProps["sets"] = [
  [21, 18],
  [19, 21],
  [15, 12],
];

function render(element: React.ReactElement): ReactTestRenderer {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(element);
  });
  return renderer!;
}

function classesOf(renderer: ReactTestRenderer): string[] {
  return renderer.root
    .findAll((node) => typeof node.props.className === "string")
    .flatMap((node) => (node.props.className as string).split(/\s+/));
}

function srText(renderer: ReactTestRenderer): string {
  const sentence = renderer.root.find(
    (node) => node.type === "p" && node.props.className === "td-sr",
  );
  return sentence.children.join("");
}

describe("NetScore states", () => {
  it("designs every match_status plus not-finished, and nothing else", () => {
    // A new enum value lands in MATCH_STATUSES (tested against the schema)
    // and fails here until NET_SCORE_LOOK designs it.
    expect(Object.keys(NET_SCORE_LOOK).sort()).toEqual(
      [...NET_SCORE_STATUSES].sort(),
    );
    for (const status of MATCH_STATUSES)
      expect(NET_SCORE_LOOK[status]).toBeDefined();
  });

  it("only live uses the live tone (Solar)", () => {
    for (const status of NET_SCORE_STATUSES) {
      expect(NET_SCORE_LOOK[status].tone === "live").toBe(status === "live");
    }
  });

  it("an unknown status is an error, never a guess", () => {
    expect(() =>
      netScoreModel({ teams: [...teams] as never, status: "abandoned" }),
    ).toThrow(/unknown match status/);
  });

  it("every status renders in every layout, with one sentence and a hidden drawing", () => {
    for (const status of NET_SCORE_STATUSES) {
      for (const layout of ["net", "rows", "compact", "auto"] as const) {
        const renderer = render(
          <NetScore
            announce={false}
            bestOf={3}
            layout={layout}
            sets={
              status === "live"
                ? [
                    [21, 18],
                    [9, 11],
                  ]
                : three
            }
            status={status}
            teams={teams}
          />,
        );
        const sentence = srText(renderer);
        expect(sentence).toContain("Williams / Lewis");
        expect(sentence).toContain("Park / Stone");
        const body = renderer.root.find(
          (node) => node.props.className === "td-ns__body",
        );
        expect(body.props["aria-hidden"]).toBe("true");
        const classes = classesOf(renderer);
        expect(classes.includes("td-chip--live")).toBe(status === "live");
        // Scheduled, warm-up and cancelled never print a number.
        if (["scheduled", "warmup", "cancelled"].includes(status)) {
          expect(classes).not.toContain("td-ns__num");
        }
      }
    }
  });

  it("the screen-reader sentence: who played, who won, the sets, the state", () => {
    const renderer = render(
      <NetScore bestOf={3} sets={three} status="verified" teams={teams} />,
    );
    expect(srText(renderer)).toBe(
      "Williams / Lewis beat Park / Stone 2 sets to 1, 21–18, 19–21, 15–12. Verified.",
    );
  });

  it("winner gets a check, a title match a trophy, a provisional winner a hollow check", () => {
    const won = classesOf(
      render(<NetScore sets={three} status="complete" teams={teams} />),
    );
    expect(won).toContain("td-ns__badge");
    expect(won).not.toContain("td-ns__badge--trophy");
    const title = classesOf(
      render(
        <NetScore
          sets={three}
          status="verified"
          teams={teams}
          title="King of the Beach final"
        />,
      ),
    );
    expect(title).toContain("td-ns__badge--trophy");
    const pending = classesOf(
      render(
        <NetScore sets={three} status="pending_verification" teams={teams} />,
      ),
    );
    expect(pending).toContain("td-ns__badge--hollow");
    const disputed = classesOf(
      render(<NetScore sets={three} status="disputed" teams={teams} />),
    );
    expect(disputed).not.toContain("td-ns__badge");
  });

  it("five sets, 31–29, retired mid-set and a forfeit with no score", () => {
    const five = render(
      <NetScore
        bestOf={5}
        layout="rows"
        sets={[
          [21, 19],
          [29, 31],
          [21, 18],
          [17, 21],
          [15, 13],
        ]}
        status="complete"
        teams={[
          { players: ["A. Featherstonehaugh", "B. Vanderhoeven-Smythe"] },
          { players: ["C. Montgomery-Clarke", "D. Abernathy"] },
        ]}
      />,
    );
    expect(srText(five)).toBe(
      "A. Featherstonehaugh / B. Vanderhoeven-Smythe beat C. Montgomery-Clarke / D. Abernathy 3 sets to 2, 21–19, 29–31, 21–18, 17–21, 15–13. Final.",
    );
    // Long names keep the full name as a title.
    const titles = five.root
      .findAll((node) => node.props.className === "td-ns__name")
      .map((node) => node.props.title);
    expect(titles).toContain("A. Featherstonehaugh / B. Vanderhoeven-Smythe");
    // The deciding fifth set is marked.
    expect(classesOf(five)).toContain("td-ns__col--decider");

    const retired = render(
      <NetScore
        reason="Park / Stone retired: injury"
        sets={[
          [21, 18],
          [9, 7],
        ]}
        status="not-finished"
        teams={teams}
      />,
    );
    expect(srText(retired)).toBe(
      "Williams / Lewis against Park / Stone, stopped at 21–18, 9–7, set 2 unfinished. Not finished: Park / Stone retired: injury.",
    );
    const forfeit = render(
      <NetScore
        forfeitedBy={0}
        reason="Williams / Lewis did not show"
        sets={[]}
        status="forfeit"
        teams={teams}
      />,
    );
    expect(srText(forfeit)).toBe(
      "Park / Stone won by forfeit against Williams / Lewis. Forfeit: Williams / Lewis did not show.",
    );
  });

  it("live: in the live zone, with a polite region; the first render says nothing", () => {
    const renderer = render(
      <NetScore
        serving={1}
        sets={[
          [21, 18],
          [9, 11],
        ]}
        status="live"
        teams={teams}
      />,
    );
    const root = renderer.root.find((node) => node.type === "section");
    expect(root.props["data-zone"]).toBe("live");
    const region = renderer.root.find(
      (node) => node.props["aria-live"] === "polite",
    );
    expect(region.children.join("")).toBe("");
    act(() => {
      renderer.update(
        <NetScore
          serving={1}
          sets={[
            [21, 18],
            [9, 12],
          ]}
          status="live"
          teams={teams}
        />,
      );
    });
    expect(region.children.join("")).toBe("Point Park / Stone. Set 2, 9–12.");
  });
});

describe("RatingRing", () => {
  it("has a text alternative and draws no Solar by default", () => {
    const renderer = render(
      <RatingRing delta={0.08} reliability={3} size="hero" value={3.42} />,
    );
    const img = renderer.root.find((node) => node.props.role === "img");
    expect(img.props["aria-label"]).toBe(
      "Sand Rating 3.42, up 0.08. 84% of the way to 3.50. Reliability 3 of 3.",
    );
    const classes = classesOf(renderer);
    expect(classes).toContain("td-ring__tick");
    expect(classes).toContain("td-ring__label");
  });

  it("sizes: card hides the label, inline puts the number beside the ring", () => {
    expect(
      classesOf(
        render(<RatingRing reliability={2} size="card" value={3.42} />),
      ),
    ).not.toContain("td-ring__label");
    const inline = classesOf(
      render(<RatingRing reliability={2} size="inline" value={3.42} />),
    );
    expect(inline).toContain("td-ring__beside");
    expect(inline).not.toContain("td-ring__band");
  });

  it("provisional: an em dash, a dotted track and what is still needed", () => {
    const renderer = render(
      <RatingRing matchesLeft={3} reliability={0} size="card" value={null} />,
    );
    expect(classesOf(renderer)).toContain("td-ring__track--dotted");
    const number = renderer.root.find(
      (node) => node.props.className === "td-ring__number",
    );
    expect(number.children.join("")).toBe("—");
  });
});

describe("gallery", () => {
  it("shows every NetScore status", () => {
    const gallery = readFileSync(
      new URL(
        "../../../../../apps/hq/app/(next)/tideline/sections/score.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    for (const status of NET_SCORE_STATUSES) {
      expect(gallery, `gallery is missing ${status}`).toContain(`"${status}"`);
    }
  });
});
