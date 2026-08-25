export type PlayerPrimaryDestination = "calendar" | "home" | "messages";

/**
 * Translates the existing Player route model into the smaller primary dock.
 * Secondary workflows stay functional without pretending to be primary tabs.
 */
export function playerPrimaryDestination(
  tab: string,
): PlayerPrimaryDestination | undefined {
  if (tab === "home") return "home";
  if (tab === "plans" || tab === "training") return "calendar";
  if (tab === "messages") return "messages";
  return undefined;
}
