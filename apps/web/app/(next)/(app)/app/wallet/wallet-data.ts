import "server-only";

import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { log, report } from "@duna/observability";
import { cookies, headers } from "next/headers";
import { getAppSession } from "@/components/app-shell/session";
import { getServerCaller } from "@/lib/api";
import { demoWallet } from "./wallet-demo";
import {
  buildWalletModel,
  type Loaded,
  type WalletModel,
} from "./wallet-model";

async function load<T>(
  read: () => Promise<T>,
  source: string,
): Promise<Loaded<T>> {
  try {
    return { state: "ok", data: await read() };
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    if (code === "NOT_IMPLEMENTED") {
      log.info("web.wallet.source_not_configured", { source });
      return { state: "not-configured" };
    }
    const reference = report(error, {
      event: "web.wallet.source_failed",
      tags: { source },
    });
    return { state: "error", reference };
  }
}

/** The test-only switch: `duna-demo-wallet=1|5|12` (demo mode, never production). */
export const DEMO_WALLET_COOKIE = "duna-demo-wallet";

async function demoCardsRequested(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<number | null> {
  if (
    isWorkOSAuthKitConfigured(env) ||
    env.DUNA_DEMO_PERSONAS !== "enabled" ||
    env.NEXT_PUBLIC_DEMO_MODE === "false" ||
    env.VERCEL_ENV === "production"
  )
    return null;
  const value = (await cookies()).get(DEMO_WALLET_COOKIE)?.value;
  const count = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isInteger(count) && count >= 0 && count <= 12 ? count : null;
}

export interface WalletPageData {
  readonly model: WalletModel;
  readonly demo: boolean;
}

/**
 * Everything the wallet shows, from the queries the old wallet page made
 * (money, club wallets, prediction credits) plus the member credential and
 * club bookings that already exist. No new API. A failed source becomes its
 * block's error with a reference; the rest of the page still renders.
 */
export async function loadWallet(card?: string): Promise<WalletPageData> {
  const session = await getAppSession();
  const caller = await getServerCaller();
  const person = session.person!;
  const acting = session.actingFor;
  const timeZone =
    (await headers()).get("x-vercel-ip-timezone") ?? "America/Los_Angeles";
  const demoCount = await demoCardsRequested();
  const noDatabase = session.demo && !process.env.DATABASE_URL;

  const [clubs, family, credential, upcoming, past, money, predictions] =
    await Promise.all([
      load(() => caller.player.organizationWallets(), "club-wallets"),
      !acting
        ? Promise.resolve(null)
        : noDatabase
          ? Promise.resolve({ state: "ok", data: [] } as const)
          : load(() => caller.player.familyWallets(), "family-wallets"),
      acting || noDatabase
        ? Promise.resolve({ state: "not-configured" } as const)
        : load(() => caller.player.memberCard(), "member-card"),
      load(
        () =>
          caller.player.catalogSessionBookings({
            scope: "upcoming",
            includeDependents: true,
            limit: 50,
          }),
        "upcoming-bookings",
      ),
      load(
        () =>
          caller.player.catalogSessionBookings({
            scope: "past",
            includeDependents: true,
            limit: 50,
          }),
        "past-bookings",
      ),
      acting
        ? Promise.resolve(null)
        : load(() => caller.player.wallet(), "money"),
      acting || session.junior
        ? Promise.resolve(null)
        : load(() => caller.player.predictionWallet(), "predictions"),
    ]);

  const demo = demoCount !== null && !acting;
  const sample = demo ? demoWallet(demoCount, new Date()) : null;
  const model = buildWalletModel({
    person: { id: person.id, displayName: person.displayName },
    actingFor: acting
      ? {
          personId: acting.personId,
          displayName: acting.displayName,
          firstName: acting.firstName,
        }
      : null,
    junior: session.junior,
    clubs: sample ? { state: "ok", data: sample.clubs } : clubs,
    family,
    credential,
    upcoming: sample
      ? { state: "ok", data: sample.upcoming(person.id) }
      : upcoming,
    past: sample ? { state: "ok", data: sample.past(person.id) } : past,
    money,
    predictions,
    timeZone,
    ...(card ? { card } : {}),
    ...(sample ? { passOverride: sample.pass } : {}),
  });
  return { model, demo };
}
