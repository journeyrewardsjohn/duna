import "server-only";

import { getServerCaller } from "@/lib/api";
import { DUNA_HQ_URL } from "@/lib/site-urls";
import {
  selectHqNavigationQuickAction,
  selectPlayerNavigationQuickAction,
  type SiteNavigationQuickAction,
} from "@/lib/site-navigation";

async function available<T>(work: Promise<T>): Promise<T | undefined> {
  try {
    return await work;
  } catch {
    return undefined;
  }
}

export async function loadSiteNavigationQuickActions(): Promise<
  readonly SiteNavigationQuickAction[]
> {
  const caller = await getServerCaller();
  const [playerDashboard, hqDashboard] = await Promise.all([
    available(caller.player.dashboard()),
    available(caller.operator.dashboard()),
  ]);
  const now = Date.now();
  const actions = [
    playerDashboard
      ? selectPlayerNavigationQuickAction(playerDashboard, now)
      : undefined,
    hqDashboard
      ? selectHqNavigationQuickAction(hqDashboard, DUNA_HQ_URL, now)
      : undefined,
  ];
  return actions.filter((action): action is SiteNavigationQuickAction =>
    Boolean(action),
  );
}
