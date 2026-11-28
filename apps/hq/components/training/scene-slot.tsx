import { Icon } from "@duna/ui/icons";
import { SceneDiagram, ScenePlayer } from "@duna/ui/tideline/training-scene";

/**
 * The one place Training shows a drill's drawing: the design system's
 * `SceneDiagram` (server-rendered SVG, prints in black and white) for cards,
 * plan blocks and the run sheet, and `ScenePlayer` (2D, with 3D loaded only
 * when the coach asks for it) on the drill page. Both validate the scene
 * themselves and show the validator's problems when it can't be drawn.
 */
export interface SceneSlotProps {
  /** The scene document (model v2); validated by the component, never executed. */
  readonly scene: unknown;
  /** The step to show (0-based); omitted draws the whole repetition. */
  readonly step?: number;
  readonly mode: "diagram" | "player";
  /** What the drawing shows, for assistive technology: "Serve-receive triangle". */
  readonly label: string;
  /** A smaller drawing for cards and plan blocks: no legend, no captions. */
  readonly compact?: boolean;
}

export function SceneSlot({
  scene,
  step,
  mode,
  label,
  compact = false,
}: SceneSlotProps) {
  if (scene === undefined || scene === null) {
    return (
      <figure
        aria-label={`${label}: no drawing yet`}
        className="tr-scene"
        data-compact={compact || undefined}
        data-empty=""
      >
        <span className="tr-scene__head">
          <Icon name="court" size="inline" />
          No drawing yet
        </span>
      </figure>
    );
  }
  const oneBased = step === undefined ? undefined : step + 1;
  return (
    <div className="tr-scene-slot" data-compact={compact || undefined}>
      {mode === "diagram" ? (
        <SceneDiagram
          captions={!compact}
          label={label}
          legend={!compact}
          scene={scene}
          step={oneBased}
        />
      ) : (
        <ScenePlayer label={label} scene={scene} step={oneBased} />
      )}
    </div>
  );
}
