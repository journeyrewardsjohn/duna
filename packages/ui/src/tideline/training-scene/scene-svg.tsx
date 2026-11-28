/**
 * The court drawing as SVG: maps a `Drawing` (drawing.ts) to elements. No
 * hooks and no client code, so a server component renders it; the 2D player
 * passes ref callbacks to move people and balls without re-rendering.
 */
import type { ReactNode } from "react";
import type { Drawing } from "./drawing";
import { BallMark, CartMark, EquipmentMark, PersonMark } from "./marks";

export interface SceneSvgRefs {
  readonly person: (id: string, element: SVGGElement | null) => void;
  readonly ball: (id: string, element: SVGGElement | null) => void;
}

export interface SceneSvgProps {
  readonly drawing: Drawing;
  /** Unique per instance: marker and pattern ids. */
  readonly idPrefix: string;
  readonly className?: string;
  /** Animated: people and balls get refs and every ball is drawn. */
  readonly refs?: SceneSvgRefs;
  /** Ball ids to draw (animated mode draws them all, hidden until used). */
  readonly ballIds?: readonly string[];
}

const r1 = (value: number) => Math.round(value * 10) / 10;

export function SceneSvg({
  drawing,
  idPrefix,
  className,
  refs,
  ballIds,
}: SceneSvgProps): ReactNode {
  const { projection, sizes } = drawing;
  const head = `${idPrefix}-head`;
  const headMove = `${idPrefix}-move`;
  const headRotation = `${idPrefix}-rot`;
  const hatch = `${idPrefix}-hatch`;
  const width = r1(projection.width);
  const height = r1(projection.height);
  return (
    <svg
      aria-hidden="true"
      className={className}
      data-orientation={projection.orientation}
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
      viewBox={`0 0 ${width} ${height}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <marker
          id={head}
          markerHeight={10}
          markerUnits="userSpaceOnUse"
          markerWidth={10}
          orient="auto-start-reverse"
          refX={8}
          refY={5}
          viewBox="0 0 10 10"
        >
          <path className="td-scene__head" d="M0,0.5 L10,5 L0,9.5 Z" />
        </marker>
        <marker
          id={headMove}
          markerHeight={11}
          markerUnits="userSpaceOnUse"
          markerWidth={11}
          orient="auto-start-reverse"
          refX={8.5}
          refY={5.5}
          viewBox="0 0 11 11"
        >
          <path
            className="td-scene__head-open"
            d="M1.5,1.5 L8.5,5.5 L1.5,9.5"
          />
        </marker>
        <marker
          id={headRotation}
          markerHeight={10}
          markerUnits="userSpaceOnUse"
          markerWidth={10}
          orient="auto-start-reverse"
          refX={8}
          refY={5}
          viewBox="0 0 10 10"
        >
          <path className="td-scene__head-rotation" d="M0,0.5 L10,5 L0,9.5 Z" />
        </marker>
        <pattern
          height={7}
          id={hatch}
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
          width={7}
        >
          <line className="td-scene__hatch" x1={0} x2={0} y1={0} y2={7} />
        </pattern>
      </defs>

      <rect
        className={`td-scene__frame td-scene__frame--${drawing.surface}`}
        height={height}
        width={width}
        x={0}
        y={0}
      />
      {drawing.court ? (
        <rect
          className={`td-scene__court td-scene__court--${drawing.surface}`}
          height={r1(drawing.court.h)}
          width={r1(drawing.court.w)}
          x={r1(drawing.court.x - drawing.court.w / 2)}
          y={r1(drawing.court.y - drawing.court.h / 2)}
        />
      ) : null}
      <g className="td-scene__lines">
        {drawing.lines.map((line, index) => (
          <line
            className={`td-scene__line td-scene__line--${line.kind}`}
            key={index}
            x1={r1(line.a.x)}
            x2={r1(line.b.x)}
            y1={r1(line.a.y)}
            y2={r1(line.b.y)}
          />
        ))}
      </g>

      {drawing.zones.map((zone) => (
        <g className="td-scene__zone" key={zone.id}>
          <rect
            fill={`url(#${hatch})`}
            height={r1(zone.box.h)}
            width={r1(zone.box.w)}
            x={r1(zone.box.x - zone.box.w / 2)}
            y={r1(zone.box.y - zone.box.h / 2)}
          />
          <rect
            className="td-scene__zone-edge"
            height={r1(zone.box.h)}
            width={r1(zone.box.w)}
            x={r1(zone.box.x - zone.box.w / 2)}
            y={r1(zone.box.y - zone.box.h / 2)}
          />
        </g>
      ))}

      {drawing.net ? (
        <g className="td-scene__net">
          <line
            className="td-scene__net-line"
            x1={r1(drawing.net.a.x)}
            x2={r1(drawing.net.b.x)}
            y1={r1(drawing.net.a.y)}
            y2={r1(drawing.net.b.y)}
          />
          {drawing.net.posts.map((post, index) => (
            <rect
              className="td-scene__post"
              height={8}
              key={index}
              width={8}
              x={r1(post.x - 4)}
              y={r1(post.y - 4)}
            />
          ))}
        </g>
      ) : null}

      {drawing.equipment.map((thing) => (
        <g
          className="td-scene__equipment"
          key={thing.id}
          transform={`translate(${r1(thing.at.x)} ${r1(thing.at.y)})`}
        >
          <EquipmentMark kind={thing.kind} />
        </g>
      ))}
      {drawing.supply.map((thing) => (
        <g
          className="td-scene__supply"
          key={thing.id}
          transform={`translate(${r1(thing.at.x)} ${r1(thing.at.y)})`}
        >
          <CartMark />
        </g>
      ))}

      <g className="td-scene__rotation">
        {drawing.rotation.map((path) => (
          <path
            className="td-scene__rotation-path"
            d={path.d}
            key={path.id}
            markerEnd={`url(#${headRotation})`}
          />
        ))}
      </g>

      <g className="td-scene__moves">
        {drawing.moves.map((move) => (
          <path
            className="td-scene__move"
            d={move.d}
            data-state={move.state}
            key={move.id}
            markerEnd={`url(#${headMove})`}
          />
        ))}
      </g>

      <g className="td-scene__paths">
        {drawing.paths.map((path) => (
          <path
            className={`td-scene__path td-scene__path--${path.kind}`}
            d={path.d}
            data-state={path.state}
            data-verb={path.verb}
            key={path.id}
            markerEnd={`url(#${head})`}
          />
        ))}
      </g>

      <g className="td-scene__texts">
        {[
          ...drawing.zones.flatMap((zone) =>
            zone.label
              ? [{ key: `z-${zone.id}`, label: zone.label, kind: "zone" }]
              : [],
          ),
          ...drawing.equipment.flatMap((thing) =>
            thing.label
              ? [{ key: `e-${thing.id}`, label: thing.label, kind: "thing" }]
              : [],
          ),
          ...drawing.supply.map((thing) => ({
            key: `s-${thing.id}`,
            label: thing.label,
            kind: "thing",
          })),
          ...(drawing.netLabel
            ? [{ key: "net", label: drawing.netLabel, kind: "thing" }]
            : []),
          ...drawing.sideLabels.map((label) => ({
            key: `side-${label.text}`,
            label,
            kind: "side",
          })),
        ].map(({ key, label, kind }) => (
          <text
            className={`td-scene__text td-scene__text--${kind}`}
            dominantBaseline="central"
            fontSize={sizes.role}
            key={key}
            textAnchor={label.anchor}
            x={label.at.x}
            y={label.at.y}
          >
            {kind === "side" ? label.text.toUpperCase() : label.text}
          </text>
        ))}
      </g>

      <g className="td-scene__badges">
        {drawing.paths.map((path) => (
          <g
            className="td-scene__badge"
            data-state={path.state}
            key={path.id}
            transform={`translate(${path.badge.x} ${path.badge.y})`}
          >
            <circle className="td-scene__badge-dot" r={sizes.badge * 0.9} />
            <text
              className="td-scene__badge-text"
              dominantBaseline="central"
              fontSize={sizes.badge}
              textAnchor="middle"
              y={0.5}
            >
              {path.number}
            </text>
          </g>
        ))}
      </g>

      <g className="td-scene__people">
        {drawing.people.map((person) => (
          <g key={person.person}>
            {person.roleAt ? (
              <text
                className="td-scene__role"
                dominantBaseline="central"
                fontSize={sizes.role}
                textAnchor="middle"
                x={person.roleAt.x}
                y={person.roleAt.y}
              >
                {person.role}
              </text>
            ) : null}
            <g
              className="td-scene__person"
              data-person={person.person}
              ref={
                refs
                  ? (element) => refs.person(person.person, element)
                  : undefined
              }
              transform={`translate(${r1(person.at.x)} ${r1(person.at.y)})`}
            >
              <ellipse
                className="td-scene__shadow"
                cx={0}
                cy={sizes.dot * 0.35}
                rx={sizes.dot * 0.9}
                ry={sizes.dot * 0.45}
              />
              <g className="td-scene__lift">
                <PersonMark
                  fontSize={sizes.label}
                  label={person.label}
                  look={person.look}
                  r={sizes.dot}
                  waiting={person.waiting}
                />
              </g>
            </g>
          </g>
        ))}
      </g>

      <g className="td-scene__balls">
        {refs
          ? (ballIds ?? []).map((id) => {
              const start = drawing.balls.find((ball) => ball.id === id);
              return (
                <g
                  className="td-scene__ball-group"
                  data-ball={id}
                  key={id}
                  ref={(element) => refs.ball(id, element)}
                  style={start ? undefined : { opacity: 0 }}
                  transform={`translate(${r1(start?.at.x ?? 0)} ${r1(start?.at.y ?? 0)})`}
                >
                  <ellipse
                    className="td-scene__shadow"
                    cx={0}
                    cy={0}
                    rx={sizes.ball}
                    ry={sizes.ball * 0.5}
                  />
                  <g className="td-scene__lift">
                    <BallMark r={sizes.ball} />
                  </g>
                </g>
              );
            })
          : drawing.balls.map((ball) => (
              <g
                className="td-scene__ball-group"
                key={ball.id}
                transform={`translate(${r1(ball.at.x)} ${r1(ball.at.y)})`}
              >
                <BallMark r={sizes.ball} />
              </g>
            ))}
      </g>
    </svg>
  );
}
