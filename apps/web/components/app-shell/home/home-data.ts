import "server-only";

import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { log, report } from "@duna/observability";
import { cookies, headers } from "next/headers";
import { getServerCaller } from "@/lib/api";
import { getAppSession, loadDashboard, loadSettings } from "../session";
import type { AppSession } from "../session-types";
import {
  buildHomeModel,
  type HomeCatalogBooking,
  type HomeClubWallet,
  type HomeModel,
} from "./home-model";

/** One source Home reads: its data, or why it is missing. */
export type Loaded<T> =
  | { readonly state: "ok"; readonly data: T }
  | { readonly state: "not-configured" }
  | { readonly state: "error"; readonly reference: string };

async function load<T>(
  read: () => Promise<T>,
  block: string,
): Promise<Loaded<T>> {
  try {
    return { state: "ok", data: await read() };
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    if (code === "NOT_IMPLEMENTED") {
      log.info("web.home.block_not_configured", { block });
      return { state: "not-configured" };
    }
    const reference = report(error, {
      event: "web.home.block_failed",
      tags: { block },
    });
    return { state: "error", reference };
  }
}

/** The persona suite's "brand-new player" (demo only, the persona switch's guard). */
export const DEMO_PLAYER_COOKIE = "duna-demo-player";

async function demoFirstDayRequested(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<boolean> {
  if (
    isWorkOSAuthKitConfigured(env) ||
    env.DUNA_DEMO_PERSONAS !== "enabled" ||
    env.NEXT_PUBLIC_DEMO_MODE === "false" ||
    env.VERCEL_ENV === "production"
  ) {
    return false;
  }
  return (await cookies()).get(DEMO_PLAYER_COOKIE)?.value === "first-day";
}

export interface HomeData {
  readonly session: AppSession;
  readonly model: HomeModel;
  readonly catalog: Loaded<readonly HomeCatalogBooking[]>;
  readonly wallets: Loaded<readonly HomeClubWallet[]>;
  readonly onboarding:
    "not-started" | "in-progress" | "guardian-required" | "complete";
  readonly firstDayDemo: boolean;
}

/**
 * Everything Home shows, from queries the old Home and the shell already
 * make plus the existing player reads (catalog session bookings, payment
 * schedules, club wallets). No new API. A failed source becomes that block's
 * error with a reference; the rest of Home still renders.
 */
export async function loadHome(): Promise<HomeData> {
  const session = await getAppSession();
  const caller = await getServerCaller();
  const firstDay = await demoFirstDayRequested();
  const [dashboard, settings, catalog, schedules, wallets] = await Promise.all([
    loadDashboard(),
    load(() => loadSettings(), "settings"),
    load(
      () =>
        caller.player.catalogSessionBookings({
          scope: "upcoming",
          includeDependents: true,
          limit: 50,
        }),
      "catalog-bookings",
    ),
    load(() => caller.player.paymentSchedules(), "payment-schedules"),
    load(() => caller.player.organizationWallets(), "club-wallets"),
  ]);
  const incoming = await headers();
  const timeZone =
    incoming.get("x-vercel-ip-timezone") ?? "America/Los_Angeles";
  const activeClub = session.clubs.find((club) => club.isActive);
  const person = session.person!;
  const empty = firstDay;
  const model = buildHomeModel({
    person: {
      id: dashboard.player.id,
      displayName: dashboard.player.displayName,
      firstName: person.firstName,
      rating: empty
        ? { ...dashboard.player.rating, confidence: "Provisional", delta: 0 }
        : dashboard.player.rating,
    },
    actingFor: session.actingFor,
    dependents: session.dependents,
    bookings: empty ? [] : dashboard.bookings,
    events: dashboard.events,
    catalogBookings: !empty && catalog.state === "ok" ? catalog.data : [],
    recentMatches: empty ? [] : dashboard.recentMatches,
    paymentSchedules: !empty && schedules.state === "ok" ? schedules.data : [],
    region: activeClub?.name ?? person.homeMarket.split(",")[0],
    now: Date.now(),
    timeZone,
  });
  return {
    session,
    model,
    catalog: empty ? { state: "ok", data: [] } : catalog,
    wallets: empty ? { state: "ok", data: [] } : wallets,
    onboarding: empty
      ? "not-started"
      : settings.state === "ok"
        ? settings.data.profile.onboardingStatus
        : "complete",
    firstDayDemo: firstDay,
  };
}
