/**
 * The one door into a drill scene for the drawing and the player. A scene is
 * untrusted JSON: it is validated and resolved by `@duna/core/training-scene`
 * first, and only a scene that validates is drawn. The few authored details
 * the resolved scene does not carry (the objective, cues, step timing hints,
 * arc overrides, the default camera) are read here, defensively, by index:
 * a valid scene resolves one step per authored step and one action per
 * authored action, in order.
 *
 * Pure: no DOM, no clock. Server components call it.
 */
import {
  resolveTrainingScene,
  TRAINING_SCENE_MAX_BYTES,
  type ResolvedTrainingScene,
  type TrainingSceneIssue,
  validateTrainingScene,
} from "@duna/core/training-scene";

export type SceneCameraPreset = "server" | "sideline" | "top" | "follow";

export interface SceneActionExtras {
  /** Authored duration of a move or hold, in seconds (capped). */
  readonly duration?: number;
  /** Authored arc override: kept exactly, as the validator does. */
  readonly arc?: { readonly apex?: number; readonly speed?: number };
}

export interface SceneStepExtras {
  /** "after: previous": wait for everything before this step to end. */
  readonly after: boolean;
  /** Seconds after the previous step ends, when `after` is set. */
  readonly gap: number;
  /** The authored caption with its `{slot}` placeholders, for later reps. */
  readonly caption: string;
  readonly actions: readonly SceneActionExtras[];
}

export interface PreparedScene {
  readonly resolved: ResolvedTrainingScene;
  readonly objective?: string;
  /** Coaching cue per step id. */
  readonly cues: Readonly<Record<string, string>>;
  readonly steps: readonly SceneStepExtras[];
  /** Pepper-style drills keep the ball alive from one rep to the next. */
  readonly continuous: boolean;
  /** Where each action's `to` named a slot: "s1.1" → slot id. */
  readonly targetSlots: Readonly<Record<string, string>>;
  /** Default 3D camera from the scene's `view.camera`. */
  readonly camera: SceneCameraPreset;
}

export type PrepareResult =
  | { readonly ok: true; readonly scene: PreparedScene }
  | {
      readonly ok: false;
      readonly issues: readonly TrainingSceneIssue[];
      readonly errors: number;
    };

type Rec = Record<string, unknown>;

const isRecord = (value: unknown): value is Rec =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const finite = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

const text = (value: unknown, max: number): string | undefined => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
};

const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(value, low), high);

/** The prototype's camera names, mapped onto the player's presets. */
function cameraOf(view: unknown): SceneCameraPreset {
  const name = isRecord(view) ? view.camera : undefined;
  switch (name) {
    case "server":
      return "server";
    case "broadcast":
      return "sideline";
    case "top":
      return "top";
    default:
      return "server";
  }
}

/**
 * A string scene (stored JSON) is parsed, within the size cap; anything else
 * is passed to the validator as is.
 */
function readDocument(scene: unknown): unknown {
  if (typeof scene !== "string") return scene;
  // Characters, not bytes: a cheap bound before parsing; the validator
  // measures the real size.
  if (scene.length > TRAINING_SCENE_MAX_BYTES * 4) return scene;
  try {
    return JSON.parse(scene) as unknown;
  } catch {
    return scene;
  }
}

export function prepareTrainingScene(scene: unknown): PrepareResult {
  const document = readDocument(scene);
  const validation = validateTrainingScene(document);
  const resolved = validation.ok ? resolveTrainingScene(document) : undefined;
  if (!validation.ok || !resolved || !isRecord(document)) {
    const issues = validation.issues.length
      ? validation.issues
      : [
          {
            level: "error" as const,
            code: "SCHEMA",
            rule: "schema",
            message: "The scene could not be read.",
          },
        ];
    return {
      ok: false,
      issues,
      errors: Math.max(validation.errors, 1),
    };
  }
  const teaching = isRecord(document.teaching) ? document.teaching : {};
  const cues: Record<string, string> = {};
  if (Array.isArray(teaching.cues)) {
    for (const cue of teaching.cues.slice(0, 120)) {
      if (!isRecord(cue)) continue;
      const step = text(cue.step, 64);
      const words = text(cue.text, 240);
      if (!step || !words) continue;
      cues[step] = cues[step] ? `${cues[step]} ${words}` : words;
    }
  }
  const rep = isRecord(document.rep) ? document.rep : {};
  const stepDocs = Array.isArray(rep.steps) ? rep.steps : [];
  const targetSlots: Record<string, string> = {};
  const steps = resolved.steps.map((step, stepIndex): SceneStepExtras => {
    const source = isRecord(stepDocs[stepIndex]) ? stepDocs[stepIndex] : {};
    const actionDocs = Array.isArray(source.actions) ? source.actions : [];
    const actions = step.actions.map((action, actionIndex) => {
      const authored = isRecord(actionDocs[actionIndex])
        ? actionDocs[actionIndex]
        : {};
      if (isRecord(authored.to) && typeof authored.to.slot === "string") {
        targetSlots[action.id] = authored.to.slot;
      }
      const duration = finite(authored.duration);
      const arc = isRecord(authored.arc) ? authored.arc : undefined;
      const apex = arc ? finite(arc.apex) : undefined;
      const speed = arc ? finite(arc.speed) : undefined;
      return {
        ...(duration !== undefined && duration > 0
          ? { duration: clamp(duration, 0.1, 20) }
          : {}),
        ...(apex !== undefined || speed !== undefined
          ? {
              arc: {
                ...(apex !== undefined ? { apex: clamp(apex, 0.2, 15) } : {}),
                ...(speed !== undefined
                  ? { speed: clamp(speed, 0.5, 40) }
                  : {}),
              },
            }
          : {}),
      };
    });
    const gap = finite(source.gap);
    return {
      after: source.after === "previous",
      gap: gap === undefined ? 0.4 : clamp(gap, 0, 10),
      caption:
        typeof source.caption === "string" ? source.caption.slice(0, 500) : "",
      actions,
    };
  });
  const objective = text(teaching.objective, 400);
  return {
    ok: true,
    scene: {
      resolved,
      ...(objective ? { objective } : {}),
      cues,
      steps,
      continuous: rep.ballsBetweenReps === "continuous",
      targetSlots,
      camera: cameraOf(document.view),
    },
  };
}
