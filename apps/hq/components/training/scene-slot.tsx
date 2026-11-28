import { Icon } from "@duna/ui/icons";
import { readScene, sceneDescription, sceneIssueWords } from "./drill-model";

/**
 * The one place Training shows a drill's drawing. The design system's
 * scene player (`SceneDiagram` for the static and stepped 2D court,
 * `ScenePlayer` for the animated one, from `@duna/ui/tideline`) is being
 * built as its own component family; until it lands, this slot shows what
 * that drawing says in words: the court, who stands where, the objective,
 * and every step in order. Swap the body for the real component here and
 * nothing else in Training changes.
 */
export interface SceneSlotProps {
  /** The scene document (model v2); validated and resolved here, never executed. */
  readonly scene: unknown;
  /** The step to mark as current (0-based), for a stepped diagram. */
  readonly step?: number;
  readonly mode: "diagram" | "player";
  /** What the drawing shows, for assistive technology: "Serve-receive triangle". */
  readonly label: string;
  /** A smaller version for cards and plan blocks. */
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
  const { validation, resolved } = readScene(scene);
  if (!resolved) {
    const issues = sceneIssueWords(validation);
    return (
      <figure
        aria-label={`${label}: the drawing can't be shown`}
        className="tr-scene"
        data-compact={compact || undefined}
        data-invalid=""
      >
        <figcaption className="tr-scene__caption">
          <Icon name="alert" size="inline" />
          {`The drawing can't be shown: ${issues.length} ${issues.length === 1 ? "problem" : "problems"} to fix.`}
        </figcaption>
        {compact ? null : (
          <ul className="tr-scene__issues">
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
      </figure>
    );
  }
  const description = sceneDescription(resolved, scene);
  return (
    <figure
      aria-label={label}
      className="tr-scene"
      data-compact={compact || undefined}
      data-mode={mode}
    >
      <span className="tr-scene__head">
        <Icon name="court" size="inline" />
        {`${resolved.slots.filter((slot) => !slot.waiting).length} on court · ${resolved.steps.length} ${resolved.steps.length === 1 ? "step" : "steps"}`}
      </span>
      <figcaption className="tr-scene__caption">{description}</figcaption>
      {compact ? null : (
        <ol aria-label={`${label}: steps`} className="tr-scene__steps">
          {resolved.steps.map((row, index) => (
            <li aria-current={index === step ? "step" : undefined} key={row.id}>
              {row.caption}
            </li>
          ))}
        </ol>
      )}
    </figure>
  );
}
