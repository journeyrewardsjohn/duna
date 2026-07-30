import type { ReactNode } from "react";
import { PlayerShell } from "@/components/player-shell";

export default function PlayerLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return <PlayerShell>{children}</PlayerShell>;
}
