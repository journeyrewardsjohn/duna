import type { ReactNode } from "react";
import { PlayerShell } from "@/components/player-shell";
import { getServerCaller } from "@/lib/api";

export default async function PlayerLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const caller = await getServerCaller();
  const dashboard = await caller.player.dashboard();
  return <PlayerShell player={dashboard.player}>{children}</PlayerShell>;
}
