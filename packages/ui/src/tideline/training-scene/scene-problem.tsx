/**
 * What a coach sees instead of a broken picture: the drawing has a problem,
 * with the validator's own readable messages (errors first). Server-safe.
 */
import type { TrainingSceneIssue } from "@duna/core/training-scene";
import type { ReactNode } from "react";

/** At most this many messages are listed; the rest are counted. */
export const SCENE_PROBLEM_LIMIT = 6;

export interface SceneProblemProps {
  readonly label: string;
  readonly issues: readonly TrainingSceneIssue[];
  readonly className?: string;
}

const levelWords = { error: "Fix", warning: "Check", info: "Note" } as const;

export function SceneProblem({
  label,
  issues,
  className,
}: SceneProblemProps): ReactNode {
  const ordered = [
    ...issues.filter((issue) => issue.level === "error"),
    ...issues.filter((issue) => issue.level === "warning"),
  ];
  const shown = ordered.slice(0, SCENE_PROBLEM_LIMIT);
  const more = ordered.length - shown.length;
  return (
    <section
      aria-label={`${label}: this drawing has a problem`}
      className={`td-scene td-scene--problem${className ? ` ${className}` : ""}`}
      data-scene-state="problem"
    >
      <div className="td-scene__problem" role="status">
        <svg
          aria-hidden="true"
          className="td-scene__problem-icon"
          focusable="false"
          height={20}
          viewBox="0 0 24 24"
          width={20}
        >
          <path d="M12 3 L22 20 H2 Z" />
          <path d="M12 9.5 V14" />
          <path d="M12 16.5 V17.5" />
        </svg>
        <div className="td-scene__problem-body">
          <p className="td-scene__problem-title">This drawing has a problem</p>
          <p className="td-scene__problem-lead">
            {`The drill can’t be drawn until ${shown.length === 1 ? "this is" : "these are"} fixed in the drill editor.`}
          </p>
          <ul className="td-scene__problem-list">
            {shown.map((issue, index) => (
              <li data-level={issue.level} key={`${issue.code}-${index}`}>
                <span className="td-scene__problem-level">
                  {levelWords[issue.level]}
                </span>{" "}
                {issue.message}
                {issue.repair ? (
                  <span className="td-scene__problem-repair">
                    {" "}
                    {issue.repair}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {more > 0 ? (
            <p className="td-scene__problem-more">
              {`And ${more} more ${more === 1 ? "message" : "messages"}.`}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
