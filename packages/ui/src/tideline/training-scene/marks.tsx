/**
 * The marks of a drill drawing, centred on (0, 0) in page units: people,
 * the ball, the ball cart and equipment. Shared by the drawing, the 2D
 * player and the legend, so a mark always means the same thing. Team is
 * shape AND tone (side A a circle, side B a hexagon, a coach a square,
 * waiting players dashed), never colour alone. Colours come from the
 * family stylesheet (`training-scene.css`), so themes and print just work.
 */
import type { ReactNode } from "react";

export type PersonLook = "a" | "b" | "coach" | "neutral";

export function lookOf(person: {
  readonly side: string;
  readonly kind: string;
}): PersonLook {
  if (person.kind === "coach") return "coach";
  if (person.side === "B") return "b";
  if (person.side === "A") return "a";
  return "neutral";
}

const round = (value: number) => Math.round(value * 10) / 10;

export function hexagonPoints(r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    points.push(`${round(Math.cos(angle) * r)},${round(Math.sin(angle) * r)}`);
  }
  return points.join(" ");
}

export function PersonShape({
  look,
  waiting,
  r,
}: {
  look: PersonLook;
  waiting: boolean;
  r: number;
}): ReactNode {
  const className = `td-scene__dot td-scene__dot--${look}${waiting ? " td-scene__dot--waiting" : ""}`;
  if (look === "b") {
    return <polygon className={className} points={hexagonPoints(r * 1.1)} />;
  }
  if (look === "coach") {
    const side = r * 1.7;
    return (
      <rect
        className={className}
        height={side}
        rx={r * 0.22}
        width={side}
        x={-side / 2}
        y={-side / 2}
      />
    );
  }
  return <circle className={className} r={r} />;
}

export function PersonMark({
  look,
  waiting,
  label,
  r,
  fontSize,
}: {
  look: PersonLook;
  waiting: boolean;
  label: string;
  r: number;
  fontSize: number;
}): ReactNode {
  const text = label.slice(0, 3);
  const size = text.length > 2 ? fontSize * 0.82 : fontSize;
  return (
    <>
      <PersonShape look={look} r={r} waiting={waiting} />
      <text
        className={`td-scene__dot-label td-scene__dot-label--${look}${waiting ? " td-scene__dot-label--waiting" : ""}`}
        dominantBaseline="central"
        fontSize={size}
        textAnchor="middle"
        y={0.5}
      >
        {text}
      </text>
    </>
  );
}

export function BallMark({ r }: { r: number }): ReactNode {
  return (
    <>
      <circle className="td-scene__ball" r={r} />
      <path
        className="td-scene__ball-seam"
        d={`M${-r * 0.75},${-r * 0.45} Q0,${r * 0.35} ${r * 0.75},${-r * 0.45}`}
      />
    </>
  );
}

export function CartMark(): ReactNode {
  return (
    <>
      <rect
        className="td-scene__cart"
        height={18}
        rx={3}
        width={32}
        x={-16}
        y={-9}
      />
      {[-8, 0, 8].map((dx) => (
        <circle className="td-scene__ball" cx={dx} key={dx} r={3.4} />
      ))}
    </>
  );
}

export function EquipmentMark({ kind }: { kind: string }): ReactNode {
  switch (kind) {
    case "target":
      return (
        <>
          <circle className="td-scene__kit-line" r={12} />
          <circle className="td-scene__kit-line" r={6} />
          <circle className="td-scene__kit" r={2.4} />
        </>
      );
    case "cone":
      return <path className="td-scene__kit" d="M0,-9 L7.5,7 L-7.5,7 Z" />;
    case "hoop":
      return (
        <circle
          className="td-scene__kit-line td-scene__kit-line--heavy"
          r={13}
        />
      );
    case "box":
      return (
        <>
          <rect
            className="td-scene__kit-line"
            height={22}
            width={22}
            x={-11}
            y={-11}
          />
          <path
            className="td-scene__kit-line"
            d="M-11,-11 L11,11 M11,-11 L-11,11"
          />
        </>
      );
    default:
      return <path className="td-scene__kit" d="M0,-8 L8,0 L0,8 L-8,0 Z" />;
  }
}

/** Half-size equipment marks for words: "Target", "Cone". */
export function equipmentName(kind: string): string {
  switch (kind) {
    case "target":
      return "Target";
    case "cone":
      return "Cone";
    case "hoop":
      return "Hoop";
    case "box":
      return "Box to stand on";
    default:
      return "Marker";
  }
}
