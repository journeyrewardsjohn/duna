import "server-only";

import { unavailableAccountDeletionReadiness } from "@duna/api";
import { cookies } from "next/headers";
import { getAppSession, loadSettings } from "@/components/app-shell/session";
import type { AppSession } from "@/components/app-shell/session-types";
import { getServerCaller } from "@/lib/api";
import { settleServerRead, type ServerRead } from "@/lib/server-read";
import type {
  DeletionReadiness,
  FamilyWallet,
  MediaStudio,
  PlayerSettingsData,
} from "../api-types";
import { demoWithoutDatabase } from "../demo";
import type { Visibility } from "../privacy-model";

/** Demo only (no database): the visibility chosen in this browser. */
export const DEMO_VISIBILITY_COOKIE = "duna-demo-visibility";

export async function demoVisibility(
  session: AppSession,
): Promise<Visibility | null> {
  if (!demoWithoutDatabase(session.demo)) return null;
  const value = (await cookies()).get(DEMO_VISIBILITY_COOKIE)?.value;
  return value === "public" || value === "members" || value === "private"
    ? value
    : null;
}

export interface SettingsData {
  readonly session: AppSession;
  readonly settings: PlayerSettingsData;
  readonly familyWallets: readonly FamilyWallet[];
  readonly readiness: DeletionReadiness;
  readonly studio: MediaStudio | null;
}

/** The person's settings, with the parts that can fail alone kept apart. */
export async function loadSettingsPage(): Promise<ServerRead<SettingsData>> {
  const session = await getAppSession();
  return settleServerRead(async () => {
    const caller = await getServerCaller();
    const noDatabase = demoWithoutDatabase(session.demo);
    const [settings, familyWallets, readiness, studio] = await Promise.all([
      loadSettings(),
      noDatabase
        ? Promise.resolve([])
        : caller.player.familyWallets().catch(() => []),
      caller.player
        .accountDeletionReadiness()
        .catch(() => unavailableAccountDeletionReadiness),
      caller.player.playerMediaStudio().catch(() => null),
    ]);
    const visibility = await demoVisibility(session);
    return {
      session,
      settings: visibility
        ? { ...settings, profile: { ...settings.profile, visibility } }
        : settings,
      familyWallets,
      readiness,
      studio,
    };
  }, "web.settings.read_failed");
}
