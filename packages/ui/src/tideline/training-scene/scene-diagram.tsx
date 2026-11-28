/**
 * `SceneDiagram`: the court drawing of a drill, server-rendered SVG. Players
 * as labelled marks (team by shape and tone), the coach, carts and targets,
 * ball paths by kind of contact with their order, player moves, a legend
 * built from the scene and a full text alternative. `step` shows one step:
 * earlier steps fade, the current one is emphasised, later ones wait.
 *
 * Never trusts the scene: it is validated first, and a scene that does not
 * validate shows `SceneProblem` with the validator's messages.
 */
import { type ReactNode, useId } from "react";
import { buildDrawing } from "./drawing";
import type { Orientation } from "./geometry";
import { legendEntries, SceneLegend } from "./legend";
import { prepareTrainingScene } from "./prepare";
import { SceneProblem } from "./scene-problem";
import { SceneSvg } from "./scene-svg";
import { sceneDescription } from "./sentences";
import { buildTimeline, type Timeline } from "./timeline";

export interface SceneDiagramProps {
  /** The drill scene document (`duna.drill/2`), as stored. Untrusted. */
  readonly scene: unknown;
  /** The drawing's accessible name, usually the drill's title. */
  readonly label: string;
  /**
   * The step to show, as a coach counts them: 1 is the first step. Omitted
   * (or 0) draws the whole rep.
   */
  readonly step?: number;
  /** `auto` switches to portrait in narrow containers (phones). */
  readonly orientation?: "auto" | Orientation;
  /** Show the step-by-step text below the drawing. */
  readonly captions?: boolean;
  /** Show the key. Default true. */
  readonly legend?: boolean;
  /** Draw where people go after the rep. Default false. */
  readonly rotation?: boolean;
  readonly className?: string;
}

/** Timeline item index for a 1-based step of the first rep, if any. */
export function itemForStep(
  timeline: Timeline,
  step: number | undefined,
): number | undefined {
  if (step === undefined || !Number.isFinite(step) || step < 1)
    return undefined;
  const steps = timeline.items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.kind === "step" && item.rep === 0);
  if (steps.length === 0) return undefined;
  const wanted = Math.min(Math.round(step), steps.length);
  return steps[wanted - 1]!.index;
}

export function SceneDiagram({
  scene,
  label,
  step,
  orientation = "auto",
  captions = false,
  legend = true,
  rotation = false,
  className,
}: SceneDiagramProps): ReactNode {
  const id = useId().replaceAll(":", "");
  const prepared = prepareTrainingScene(scene);
  if (!prepared.ok) {
    return (
      <SceneProblem
        className={className}
        issues={prepared.issues}
        label={label}
      />
    );
  }
  const timeline = buildTimeline(prepared.scene);
  const item = itemForStep(timeline, step);
  const current = item === undefined ? undefined : timeline.items[item];
  const descriptionId = `${id}-text`;
  const titleId = `${id}-title`;
  const lines = sceneDescription(prepared.scene);
  const orientations: Orientation[] =
    orientation === "auto" ? ["landscape", "portrait"] : [orientation];
  const steps = timeline.items.filter(
    (entry) => entry.kind === "step" && entry.rep === 0,
  );
  return (
    <figure
      aria-labelledby={titleId}
      className={`td-scene td-scene--diagram${className ? ` ${className}` : ""}`}
      data-orientation={orientation}
      data-scene-state="ready"
      data-step={current?.number}
      data-surface={prepared.scene.resolved.court.surface}
    >
      <div
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        className="td-scene__canvas"
        role="img"
      >
        {orientations.map((name) => (
          <SceneSvg
            className={`td-scene__svg td-scene__svg--${name}`}
            drawing={buildDrawing(timeline, {
              orientation: name,
              ...(item === undefined ? {} : { item }),
              rotation,
            })}
            idPrefix={`${id}-${name}`}
            key={name}
          />
        ))}
      </div>
      <span className="td-sr" id={titleId}>
        {current
          ? `${label}, step ${current.number} of ${current.of}`
          : `${label}, court drawing`}
      </span>
      <div hidden id={descriptionId}>
        {current ? (
          <p>{current.sentence}</p>
        ) : (
          lines.map((line, index) => <p key={index}>{line}</p>)
        )}
      </div>
      <figcaption className="td-scene__caption">
        {current ? (
          <p className="td-scene__step-caption">
            <span className="td-scene__step-number">
              Step {current.number} of {current.of}
            </span>{" "}
            {current.caption || current.sentence}
          </p>
        ) : null}
        {legend ? (
          <SceneLegend entries={legendEntries(timeline, { rotation })} />
        ) : null}
        {captions ? (
          <ol className="td-scene__captions">
            {steps.map((entry) => (
              <li
                aria-current={entry === current ? "step" : undefined}
                key={entry.stepIndex}
              >
                <span className="td-scene__captions-caption">
                  {entry.caption || `Step ${entry.number}`}
                </span>
                <span className="td-scene__captions-sentence">
                  {entry.sentence}
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </figcaption>
    </figure>
  );
}
