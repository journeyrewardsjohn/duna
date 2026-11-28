/**
 * The legend, generated from what is actually in the scene: only the marks
 * and line styles this drill uses appear, each with its words. Server-safe.
 */
import { TRAINING_SCENE_VERBS } from "@duna/core/training-scene";
import type { ReactNode } from "react";
import { type ContactKind, contactKind } from "./flight";
import {
  BallMark,
  CartMark,
  EquipmentMark,
  equipmentName,
  PersonShape,
} from "./marks";
import type { Timeline } from "./timeline";

export type LegendGlyph =
  | {
      readonly kind: "person";
      readonly look: "a" | "b" | "coach" | "neutral";
      readonly waiting: boolean;
    }
  | { readonly kind: "path"; readonly path: ContactKind }
  | { readonly kind: "move" | "rotation" | "badge" | "ball" | "cart" | "zone" }
  | { readonly kind: "equipment"; readonly equipment: string };

export interface LegendEntry {
  readonly id: string;
  readonly glyph: LegendGlyph;
  readonly text: string;
}

const kindWords: Record<ContactKind, string> = {
  driven: "Driven ball",
  lofted: "Lofted ball",
  placed: "Placed ball",
};

export function legendEntries(
  timeline: Timeline,
  options: { readonly rotation?: boolean } = {},
): LegendEntry[] {
  const { resolved } = timeline.scene;
  const entries: LegendEntry[] = [];
  const players = resolved.slots.filter(
    (slot) => slot.occupant && slot.kind !== "coach",
  );
  const active = players.filter((slot) => !slot.waiting);
  if (active.some((slot) => slot.side === "A")) {
    entries.push({
      id: "side-a",
      glyph: { kind: "person", look: "a", waiting: false },
      text: "Side A player",
    });
  }
  if (active.some((slot) => slot.side === "B")) {
    entries.push({
      id: "side-b",
      glyph: { kind: "person", look: "b", waiting: false },
      text: "Side B player",
    });
  }
  if (active.some((slot) => slot.side === "neutral")) {
    entries.push({
      id: "neutral",
      glyph: { kind: "person", look: "neutral", waiting: false },
      text: "Player",
    });
  }
  const waiting = players.find((slot) => slot.waiting);
  if (waiting) {
    entries.push({
      id: "waiting",
      glyph: {
        kind: "person",
        look:
          waiting.side === "B" ? "b" : waiting.side === "A" ? "a" : "neutral",
        waiting: true,
      },
      text: "Waiting to come in",
    });
  }
  if (resolved.slots.some((slot) => slot.occupant && slot.kind === "coach")) {
    entries.push({
      id: "coach",
      glyph: { kind: "person", look: "coach", waiting: false },
      text: "Coach or feeder",
    });
  }
  const verbs = new Map<ContactKind, string[]>();
  for (const step of resolved.steps) {
    for (const action of step.actions) {
      if (action.group !== "contact") continue;
      const kind = contactKind(action.verb);
      const label = (
        TRAINING_SCENE_VERBS[action.verb]?.label ?? action.verb
      ).toLowerCase();
      const list = verbs.get(kind) ?? [];
      if (!list.includes(label)) list.push(label);
      verbs.set(kind, list);
    }
  }
  for (const kind of ["driven", "lofted", "placed"] as const) {
    const list = verbs.get(kind);
    if (!list) continue;
    entries.push({
      id: `path-${kind}`,
      glyph: { kind: "path", path: kind },
      text: `${kindWords[kind]}: ${list.join(", ")}`,
    });
  }
  if (verbs.size > 0) {
    entries.push({
      id: "badge",
      glyph: { kind: "badge" },
      text: "Order of contacts",
    });
  }
  if (timeline.reps[0]?.moves.some((move) => move.from && move.to)) {
    entries.push({ id: "move", glyph: { kind: "move" }, text: "Player moves" });
  }
  if (resolved.balls.length > 0) {
    entries.push({ id: "ball", glyph: { kind: "ball" }, text: "Ball" });
  }
  if (resolved.supply.length > 0) {
    entries.push({ id: "cart", glyph: { kind: "cart" }, text: "Ball cart" });
  }
  const kinds = [...new Set(resolved.equipment.map((thing) => thing.kind))];
  for (const kind of kinds) {
    entries.push({
      id: `equipment-${kind}`,
      glyph: { kind: "equipment", equipment: kind },
      text: equipmentName(kind),
    });
  }
  if (resolved.zones.length > 0) {
    entries.push({ id: "zone", glyph: { kind: "zone" }, text: "Target area" });
  }
  if (options.rotation && timeline.rotation) {
    entries.push({
      id: "rotation",
      glyph: { kind: "rotation" },
      text: "Rotation after the rep",
    });
  }
  return entries;
}

function Glyph({ glyph }: { glyph: LegendGlyph }): ReactNode {
  switch (glyph.kind) {
    case "person":
      return (
        <g transform="translate(18 12)">
          <PersonShape look={glyph.look} r={8} waiting={glyph.waiting} />
        </g>
      );
    case "path":
      return (
        <path
          className={`td-scene__path td-scene__path--${glyph.path}`}
          d={
            glyph.path === "driven" ? "M3,15 Q18,12 31,9" : "M3,18 Q17,0 31,14"
          }
        />
      );
    case "move":
      return (
        <>
          <path className="td-scene__move" d="M3,12 L28,12" />
          <path className="td-scene__head-open" d="M24,7.5 L31,12 L24,16.5" />
        </>
      );
    case "rotation":
      return (
        <>
          <path className="td-scene__rotation-path" d="M3,12 L27,12" />
          <path
            className="td-scene__head-rotation"
            d="M25,7.5 L33,12 L25,16.5 Z"
          />
        </>
      );
    case "badge":
      return (
        <g transform="translate(18 12)">
          <circle className="td-scene__badge-dot" r={8} />
          <text
            className="td-scene__badge-text"
            dominantBaseline="central"
            fontSize={10}
            textAnchor="middle"
            y={0.5}
          >
            1
          </text>
        </g>
      );
    case "ball":
      return (
        <g transform="translate(18 12)">
          <BallMark r={6} />
        </g>
      );
    case "cart":
      return (
        <g transform="translate(18 12) scale(0.8)">
          <CartMark />
        </g>
      );
    case "zone":
      return (
        <rect
          className="td-scene__zone-edge td-scene__zone-swatch"
          height={14}
          width={26}
          x={5}
          y={5}
        />
      );
    case "equipment":
      return (
        <g transform="translate(18 12) scale(0.75)">
          <EquipmentMark kind={glyph.equipment} />
        </g>
      );
  }
}

export function SceneLegend({
  entries,
  className,
}: {
  entries: readonly LegendEntry[];
  className?: string;
}): ReactNode {
  if (entries.length === 0) return null;
  return (
    <ul aria-label="Key" className={className ?? "td-scene__legend"}>
      {entries.map((entry) => (
        <li className="td-scene__key" data-key={entry.id} key={entry.id}>
          <svg
            aria-hidden="true"
            className="td-scene__key-glyph"
            focusable="false"
            height={24}
            viewBox="0 0 36 24"
            width={36}
          >
            <Glyph glyph={entry.glyph} />
          </svg>
          <span>{entry.text}</span>
        </li>
      ))}
    </ul>
  );
}
