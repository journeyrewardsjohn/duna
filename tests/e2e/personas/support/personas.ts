/**
 * The six personas of docs/plan/persona-journeys.md and how a test becomes
 * one in demo mode.
 *
 * Demo mode signs every request in as one synthetic actor (Mara Lewis, roles
 * player + manager of the demo organisation). The servers started by
 * playwright.config.ts set DUNA_DEMO_PERSONAS=enabled, which lets the
 * `duna-demo-persona` cookie choose the roles instead
 * (packages/api/src/demo-persona.ts). The person and organisation stay the
 * demo ones; only the roles, and so the scopes, change. `visitor` has no actor.
 */
export const DEMO_PERSONA_COOKIE = "duna-demo-persona";

export type PersonaId =
  "club-owner" | "coach" | "parent" | "player" | "facility-owner" | "visitor";

export interface Persona {
  readonly id: PersonaId;
  /** Spec file prefix and the journey id prefix in persona-journeys.md. */
  readonly code: "CO" | "CH" | "PA" | "PL" | "FO" | "VI";
  readonly label: string;
  /** Roles the demo actor carries (mirror of demoPersonaRoles). */
  readonly roles: readonly string[];
}

export const personas: Readonly<Record<PersonaId, Persona>> = {
  "club-owner": {
    id: "club-owner",
    code: "CO",
    label: "Club owner / director",
    roles: ["owner", "player"],
  },
  coach: { id: "coach", code: "CH", label: "Coach", roles: ["coach"] },
  parent: {
    id: "parent",
    code: "PA",
    label: "Parent or guardian with a junior",
    roles: ["guardian", "player"],
  },
  player: {
    id: "player",
    code: "PL",
    label: "Adult player",
    roles: ["player"],
  },
  "facility-owner": {
    id: "facility-owner",
    code: "FO",
    label: "Facility owner",
    roles: ["owner"],
  },
  visitor: {
    id: "visitor",
    code: "VI",
    label: "New visitor (no account)",
    roles: [],
  },
};

export const personaIds = Object.keys(personas) as PersonaId[];
