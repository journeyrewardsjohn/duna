import {
  TRAINING_SCENE_MAX_BYTES,
  trainingSceneExamples,
} from "@duna/core/training-scene";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import { legendEntries } from "./legend";
import { prepareTrainingScene } from "./prepare";
import { SceneDiagram } from "./scene-diagram";
import { SCENE_PROBLEM_LIMIT } from "./scene-problem";
import { buildTimeline } from "./timeline";

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

const textOf = (renderer: ReactTestRenderer) =>
  JSON.stringify(renderer.toJSON());

function broken(): Record<string, unknown> {
  const scene = structuredClone(trainingSceneExamples[0]!) as {
    rep: { steps: { actions: Record<string, unknown>[] }[] };
  } & Record<string, unknown>;
  scene.rep.steps[0]!.actions[0]!.actor = "nobody";
  return scene;
}

describe("SceneDiagram", () => {
  it.each(
    trainingSceneExamples.map((example) => [String(example.id), example]),
  )(
    "%s draws, with a description and a legend from the scene",
    (_, example) => {
      const renderer = render(
        <SceneDiagram label={String(example.title)} scene={example} />,
      );
      const figure = renderer.root.findByType("figure");
      expect(figure.props["data-scene-state"]).toBe("ready");
      const image = renderer.root.findByProps({ role: "img" });
      const described = renderer.root.findByProps({
        id: image.props["aria-describedby"],
      });
      expect(described.props.hidden).toBe(true);
      const text = textOf(renderer);
      expect(text).toContain("Step 1 of");
      // Both orientations are drawn for the auto layout.
      expect(renderer.root.findAllByType("svg").length).toBeGreaterThanOrEqual(
        2,
      );
      const keys = renderer.root
        .findAll((node) => node.props["data-key"] !== undefined)
        .map((node) => node.props["data-key"]);
      expect(keys).toContain("badge");
      expect(keys.some((key) => key.startsWith("path-"))).toBe(true);
    },
  );

  it("shows one step: earlier steps fade, later ones wait", () => {
    const renderer = render(
      <SceneDiagram
        captions
        label="Serve receive"
        orientation="portrait"
        scene={trainingSceneExamples[0]}
        step={3}
      />,
    );
    const states = renderer.root
      .findAll(
        (node) =>
          node.type === "path" && typeof node.props["data-verb"] === "string",
      )
      .map((node) => [node.props["data-verb"], node.props["data-state"]]);
    expect(states).toEqual([
      ["serve", "done"],
      ["pass", "done"],
      ["set", "now"],
      ["attack", "next"],
    ]);
    expect(textOf(renderer)).toContain("Step 3 of 4");
    const current = renderer.root.findByProps({ "aria-current": "step" });
    const words = current
      .findAllByType("span")
      .map((span) => String(span.props.children))
      .join(" ");
    expect(words).toContain("sets the ball");
  });

  it("only lists what is in the scene", () => {
    const result = prepareTrainingScene(
      trainingSceneExamples.find((example) => example.id === "partner-pepper"),
    );
    if (!result.ok) throw new Error("pepper does not validate");
    const ids = legendEntries(buildTimeline(result.scene)).map(
      (entry) => entry.id,
    );
    expect(ids).toContain("side-a");
    expect(ids).not.toContain("side-b");
    expect(ids).not.toContain("coach");
    expect(ids).not.toContain("cart");
    expect(ids).not.toContain("zone");
  });

  it("shows the validator's messages instead of a broken picture", () => {
    const renderer = render(<SceneDiagram label="Broken" scene={broken()} />);
    expect(renderer.root.findAllByType("svg").length).toBe(1);
    const section = renderer.root.findByType("section");
    expect(section.props["data-scene-state"]).toBe("problem");
    const text = textOf(renderer);
    expect(text).toContain("This drawing has a problem");
    expect(text).toContain("is not a slot in this drill");
    expect(renderer.root.findByProps({ role: "status" })).toBeTruthy();
  });

  it("caps the messages it lists", () => {
    const scene = structuredClone(trainingSceneExamples[0]!) as {
      rep: { steps: { actions: Record<string, unknown>[] }[] };
    } & Record<string, unknown>;
    let ghost = 0;
    for (const step of scene.rep.steps) {
      for (const action of step.actions) action.actor = `ghost-${ghost++}`;
      step.actions.push({ actor: `ghost-${ghost++}`, verb: "hold" });
    }
    const renderer = render(<SceneDiagram label="Broken" scene={scene} />);
    const items = renderer.root.findAll(
      (node) => node.type === "li" && node.props["data-level"] !== undefined,
    );
    expect(items.length).toBe(SCENE_PROBLEM_LIMIT);
    expect(textOf(renderer)).toMatch(/And \d+ more messages/);
  });

  it("refuses a document that is too big, without trying to draw it", () => {
    const huge = {
      ...trainingSceneExamples[0]!,
      notes: [{ id: "n", text: "x".repeat(TRAINING_SCENE_MAX_BYTES) }],
    };
    const renderer = render(<SceneDiagram label="Huge" scene={huge} />);
    expect(textOf(renderer)).toContain("bytes; the most is");
  });

  it("reads a scene stored as JSON text, and rejects what is not a scene", () => {
    const fromText = render(
      <SceneDiagram
        label="Text"
        scene={JSON.stringify(trainingSceneExamples[1])}
      />,
    );
    expect(fromText.root.findByType("figure").props["data-scene-state"]).toBe(
      "ready",
    );
    for (const value of [
      null,
      42,
      "not json",
      [],
      { schema: "duna.drill/2" },
    ]) {
      const renderer = render(<SceneDiagram label="Nothing" scene={value} />);
      expect(textOf(renderer)).toContain("This drawing has a problem");
    }
  });
});
