import { trainingSceneExamples } from "@duna/core/training-scene";
import { SceneDiagram, ScenePlayer } from "@duna/ui/tideline/training-scene";
import { type GalleryExample, type GalleryGroup } from "../gallery";
import styles from "../gallery.module.css";

const group: GalleryGroup = {
  id: "training-scene",
  title: "Training scene: court drawings and the drill player",
  order: 570,
};

type Scene = Record<string, unknown>;
const byId = (id: string): Scene =>
  trainingSceneExamples.find((scene) => scene.id === id) ??
  trainingSceneExamples[0]!;
const titleOf = (scene: Scene) =>
  typeof scene.title === "string" ? scene.title : "Drill";

/** A scene that does not validate: an unknown slot and an unknown area. */
function brokenScene(): Scene {
  const scene = structuredClone(byId("serve-receive-sideout")) as {
    rep: { steps: { actions: Record<string, unknown>[] }[] };
  } & Scene;
  scene.rep.steps[0]!.actions[0]!.actor = "server-two";
  scene.rep.steps[3]!.actions[0]!.to = { area: "the-far-corner", side: "B" };
  return scene;
}

const examples: GalleryExample[] = [
  {
    group,
    order: 10,
    title:
      "SceneDiagram · every example drill, the whole rep (portrait below 560 px)",
    wide: true,
    content: (
      <div className={styles.grid} data-scene-gallery="diagrams">
        {trainingSceneExamples.map((scene) => (
          <div data-scene-example={String(scene.id)} key={String(scene.id)}>
            <SceneDiagram label={titleOf(scene)} scene={scene} />
          </div>
        ))}
      </div>
    ),
  },
  {
    group,
    order: 20,
    title:
      "SceneDiagram · step 3 of 4, with the step-by-step captions (earlier steps fade, later ones wait)",
    content: (
      <div data-scene-example="step">
        <SceneDiagram
          captions
          label="Serve receive to side-out"
          scene={byId("serve-receive-sideout")}
          step={3}
        />
      </div>
    ),
  },
  {
    group,
    order: 30,
    title: "SceneDiagram · the rotation after the rep, drawn",
    content: (
      <div data-scene-example="rotation">
        <SceneDiagram
          label="Dig to transition attack"
          rotation
          scene={byId("dig-to-transition")}
        />
      </div>
    ),
  },
  {
    group,
    order: 40,
    title: "SceneDiagram · a scene that does not validate",
    content: (
      <div data-scene-example="problem">
        <SceneDiagram label="Broken drill" scene={brokenScene()} />
      </div>
    ),
  },
  {
    group,
    order: 50,
    title: "ScenePlayer · beach serve receive (2D, switch to 3D)",
    wide: true,
    content: (
      <div data-scene-player="beach">
        <ScenePlayer
          label="Serve receive to side-out"
          scene={byId("serve-receive-sideout")}
        />
      </div>
    ),
  },
  {
    group,
    order: 60,
    title: "ScenePlayer · indoor three-lane receive, from step 2",
    wide: true,
    content: (
      <div data-scene-player="indoor">
        <ScenePlayer
          label="Three-lane receive to outside attack"
          scene={byId("indoor-receive-outside")}
          step={2}
        />
      </div>
    ),
  },
];

export default examples;
