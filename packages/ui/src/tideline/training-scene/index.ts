/**
 * Training scene: the court drawing and the 2D / 3D drill player for a
 * `duna.drill/2` scene (`@duna/core/training-scene`). The 3D engine is not
 * exported: `ScenePlayer` loads it on demand. Guide:
 * docs/design/training-scene-player.md.
 */
export { SceneDiagram, type SceneDiagramProps } from "./scene-diagram";
export {
  ScenePlayer,
  type ScenePlayerProps,
  type ScenePlayerStep,
  type ScenePlayerView,
} from "./scene-player";
export { SceneProblem, type SceneProblemProps } from "./scene-problem";
export { SceneLegend, legendEntries, type LegendEntry } from "./legend";
export {
  prepareTrainingScene,
  type PreparedScene,
  type PrepareResult,
  type SceneCameraPreset,
} from "./prepare";
export {
  buildTimeline,
  itemIndexAt,
  sampleTimeline,
  stillTime,
  type Frame,
  type Timeline,
  type TimelineItem,
} from "./timeline";
export { sceneDescription, stepSentence } from "./sentences";
