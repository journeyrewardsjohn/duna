import type { TrainingDrill } from "@duna/api/training-contracts";

function project(x: number, y: number): readonly [number, number] {
  return [82 + x * 4.35 + (y - 50) * 0.62, 50 + y * 2.32];
}

export function TrainingCourtAnimation({
  compact = false,
  drill,
}: {
  readonly compact?: boolean;
  readonly drill: TrainingDrill;
}) {
  if (drill.animation.kind === "generated-image" && drill.animation.url) {
    return (
      <figure
        aria-label={drill.animation.altText}
        className={
          "training-court training-court--image" +
          (compact ? " training-court--compact" : "")
        }
      >
        {/* This is generated from the coach-reviewed structured scene. */}
        <img alt={drill.animation.altText} src={drill.animation.url} />
        {!compact ? (
          <figcaption>
            <small>
              {drill.animation.reviewed
                ? "Coach-reviewed drill storyboard"
                : "AI-generated storyboard · review before sharing"}
            </small>
          </figcaption>
        ) : null}
      </figure>
    );
  }

  if (drill.animation.kind === "generated-video" && drill.animation.url) {
    return (
      <figure
        aria-label={drill.animation.altText}
        className={
          "training-court training-court--video" +
          (compact ? " training-court--compact" : "")
        }
      >
        <video
          aria-label={drill.animation.altText}
          autoPlay
          loop
          muted
          playsInline
          src={drill.animation.url}
        />
        {!compact && (
          <figcaption>
            <small>
              {drill.animation.reviewed
                ? "Coach-reviewed drill animation"
                : "AI-generated animation · review before sharing"}
            </small>
          </figcaption>
        )}
      </figure>
    );
  }

  const positions = new Map(
    drill.scene.positions.map((position) => [position.id, position]),
  );
  return (
    <figure
      aria-label={drill.animation.altText}
      className={`training-court${compact ? " training-court--compact" : ""}`}
    >
      <svg
        aria-hidden="true"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        viewBox="0 0 600 350"
      >
        <defs>
          <pattern
            height="16"
            id={`sand-${drill.id}`}
            patternUnits="userSpaceOnUse"
            width="16"
          >
            <circle className="training-court__grain" cx="3" cy="4" r="1" />
            <circle className="training-court__grain" cx="12" cy="11" r="0.7" />
          </pattern>
          <marker
            id={`arrow-${drill.id}`}
            markerHeight="7"
            markerWidth="7"
            orient="auto-start-reverse"
            refX="5"
            refY="3.5"
          >
            <path className="training-court__arrow" d="M0,0 L7,3.5 L0,7 Z" />
          </marker>
        </defs>
        <path
          className="training-court__shadow"
          d="M73 175 L292 44 L543 184 L323 316 Z"
        />
        <path
          className="training-court__sand"
          d="M64 163 L288 32 L551 176 L326 307 Z"
        />
        <path
          className="training-court__sand-pattern"
          d="M64 163 L288 32 L551 176 L326 307 Z"
          fill={`url(#sand-${drill.id})`}
        />
        <path
          className="training-court__line"
          d="M99 163 L289 54 L515 178 L325 285 Z M99 163 L325 285 M289 54 L515 178"
        />
        <path className="training-court__net-shadow" d="M190 219 L415 88" />
        <path className="training-court__net" d="M185 210 L410 80" />
        <path
          className="training-court__post"
          d="M185 210 L185 176 M410 80 L410 46"
        />
        {drill.scene.movements.map((movement) => {
          const from = positions.get(movement.from);
          const to = positions.get(movement.to);
          if (!from || !to) return null;
          const [fromX, fromY] = project(from.x, from.y);
          const [toX, toY] = project(to.x, to.y);
          const middleX = (fromX + toX) / 2;
          const middleY =
            Math.min(fromY, toY) - (movement.kind === "ball" ? 34 : 12);
          return (
            <path
              className={`training-court__movement training-court__movement--${movement.kind}`}
              d={`M${fromX} ${fromY} Q${middleX} ${middleY} ${toX} ${toY}`}
              key={movement.id}
              markerEnd={`url(#arrow-${drill.id})`}
              pathLength="1"
              style={{ animationDelay: `${(movement.order - 1) * 220}ms` }}
            />
          );
        })}
        {drill.scene.positions.map((position, index) => {
          const [x, y] = project(position.x, position.y);
          return (
            <g
              className={`training-court__player training-court__player--${position.team}`}
              key={position.id}
              style={{ animationDelay: `${index * 90}ms` }}
              transform={`translate(${x} ${y})`}
            >
              <ellipse cx="0" cy="13" opacity="0.22" rx="12" ry="5" />
              <circle cx="0" cy="0" r="12" />
              <text dy="4" textAnchor="middle">
                {position.label}
              </text>
            </g>
          );
        })}
        {Array.from({ length: Math.min(4, drill.ballCount) }, (_, index) => (
          <g
            className="training-court__ball"
            key={`ball-${index}`}
            style={{ animationDelay: `${index * 380}ms` }}
            transform={`translate(${276 + index * 18} ${132 + index * 10})`}
          >
            <circle r="6" />
            <path d="M-5 -1 Q0 4 5 1 M0 -6 Q-2 0 0 6" />
          </g>
        ))}
      </svg>
      {!compact && (
        <figcaption>
          <span>
            <i className="training-court__legend-a" /> Working side
          </span>
          <span>
            <i className="training-court__legend-b" /> Defending side
          </span>
          <span>
            <i className="training-court__legend-ball" /> Ball path
          </span>
          <small>
            {drill.animation.reviewed
              ? "Coach-reviewed Duna scene"
              : "AI-interpreted scene · review before sharing"}{" "}
            · loops every {drill.scene.loopSeconds}s
          </small>
        </figcaption>
      )}
    </figure>
  );
}
