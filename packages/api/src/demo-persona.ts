import type { PersonRole } from "@duna/core";

/**
 * Test-only persona switch for demo mode (Q0).
 *
 * Demo mode signs every request in as one synthetic actor (`createDemoActor()`,
 * roles player + manager). The persona end-to-end suite needs to be a club
 * owner, a coach, a parent, a player, a facility owner or a signed-out visitor.
 * A test sets the `duna-demo-persona` cookie; the request context then builds
 * the demo actor with that persona's roles (or no actor for `visitor`).
 *
 * It is honoured only when every one of these holds, so it can never change who
 * a real person is:
 * - the caller has already decided there are no WorkOS credentials (the only
 *   place this is read is the credential-less branch of
 *   `createApiContextFromRequest`);
 * - demo mode is on (`NEXT_PUBLIC_DEMO_MODE` is not `"false"`);
 * - the server was started with `DUNA_DEMO_PERSONAS=enabled` (only the
 *   Playwright web servers set it);
 * - it is not a production deployment (`VERCEL_ENV` is not `"production"`).
 */
export const DUNA_DEMO_PERSONA_COOKIE = "duna-demo-persona";

export const demoPersonaRoles = {
  "club-owner": ["owner", "player"],
  coach: ["coach"],
  parent: ["guardian", "player"],
  player: ["player"],
  // No facility-owner role exists yet (B9 adds facility access); an owner of
  // the demo organization is the closest honest stand-in.
  "facility-owner": ["owner"],
  // Signed out: no actor at all.
  visitor: [],
} as const satisfies Record<string, readonly PersonRole[]>;

export type DemoPersona = keyof typeof demoPersonaRoles;

export function isDemoPersonaSwitchEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (
    env.DUNA_DEMO_PERSONAS === "enabled" &&
    env.NEXT_PUBLIC_DEMO_MODE !== "false" &&
    env.VERCEL_ENV !== "production"
  );
}

export function demoPersonaFromCookie(
  cookieHeader: string | null | undefined,
): DemoPersona | undefined {
  const value = cookieHeader
    ?.split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === DUNA_DEMO_PERSONA_COOKIE)?.[1];
  return value && Object.hasOwn(demoPersonaRoles, value)
    ? (value as DemoPersona)
    : undefined;
}

/**
 * The roles the demo actor should carry for this request: `undefined` keeps
 * the default demo actor, an empty list means signed out.
 */
export function requestedDemoPersonaRoles(
  cookieHeader: string | null | undefined,
  env: Readonly<Record<string, string | undefined>> = process.env,
): readonly PersonRole[] | undefined {
  if (!isDemoPersonaSwitchEnabled(env)) return undefined;
  const persona = demoPersonaFromCookie(cookieHeader);
  return persona ? demoPersonaRoles[persona] : undefined;
}
