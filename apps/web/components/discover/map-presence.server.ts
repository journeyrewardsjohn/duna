import "server-only";

import { usesDemoData } from "@duna/api";
import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { report } from "@duna/observability";
import { cookies } from "next/headers";
import {
  type MapPresence,
  mapPresenceFor,
  publicMapKeyConfigured,
} from "./map-presence";

/**
 * Test-only (demo mode with the persona switch, never in production): view
 * the find-a-game pages as a member of the public would without a map key.
 */
export const DEMO_VISITOR_COOKIE = "duna-demo-visitor";

let reported = false;

async function asPublicRequested(
  env: Readonly<Record<string, string | undefined>>,
): Promise<boolean> {
  if (
    isWorkOSAuthKitConfigured(env) ||
    env.DUNA_DEMO_PERSONAS !== "enabled" ||
    env.NEXT_PUBLIC_DEMO_MODE === "false" ||
    env.VERCEL_ENV === "production"
  ) {
    return false;
  }
  return (await cookies()).get(DEMO_VISITOR_COOKIE)?.value === "public";
}

export async function mapPresence(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<MapPresence> {
  const presence = mapPresenceFor({
    configured: publicMapKeyConfigured(env),
    demo: usesDemoData(),
    development: env.NODE_ENV === "development",
    asPublic: await asPublicRequested(env),
  });
  if (presence === "off" && !reported && env.NODE_ENV === "production") {
    reported = true;
    report(new Error("The public map key is not set"), {
      event: "web.discover.map.not_configured",
      level: "warning",
    });
  }
  return presence;
}
