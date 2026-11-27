import type { PlayerSummary } from "../avatar/avatar";

export interface AddPlayerResult {
  selected: PlayerSummary[];
  changed: boolean;
  /** Why nothing changed. */
  reason?: "duplicate" | "full";
}

export interface RemovePlayerResult {
  selected: PlayerSummary[];
  changed: boolean;
  reason?: "locked" | "missing";
}

export function isPlayerSelected(
  selected: ReadonlyArray<PlayerSummary>,
  playerId: string,
): boolean {
  return selected.some((player) => player.id === playerId);
}

/** Free places left; never negative, even when the list is over capacity. */
export function openSpots(
  selected: ReadonlyArray<PlayerSummary>,
  capacity: number,
): number {
  return Math.max(0, Math.trunc(capacity) - selected.length);
}

/** Adds a player at the end, unless they are already in or there is no room. */
export function addPlayer(
  selected: ReadonlyArray<PlayerSummary>,
  player: PlayerSummary,
  capacity: number,
): AddPlayerResult {
  if (isPlayerSelected(selected, player.id)) {
    return { selected: [...selected], changed: false, reason: "duplicate" };
  }
  if (openSpots(selected, capacity) === 0) {
    return { selected: [...selected], changed: false, reason: "full" };
  }
  return { selected: [...selected, player], changed: true };
}

/** Removes a player, unless they are locked in (like the organiser). */
export function removePlayer(
  selected: ReadonlyArray<PlayerSummary>,
  playerId: string,
  lockedIds: ReadonlyArray<string> = [],
): RemovePlayerResult {
  if (!isPlayerSelected(selected, playerId)) {
    return { selected: [...selected], changed: false, reason: "missing" };
  }
  if (lockedIds.includes(playerId)) {
    return { selected: [...selected], changed: false, reason: "locked" };
  }
  return {
    selected: selected.filter((player) => player.id !== playerId),
    changed: true,
  };
}

/** One entry per place: the players in order, then `null` for each open spot. */
export function playerSlots(
  selected: ReadonlyArray<PlayerSummary>,
  capacity: number,
): Array<PlayerSummary | null> {
  return [
    ...selected,
    ...Array.from<null>({ length: openSpots(selected, capacity) }).fill(null),
  ];
}

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();

/** Players whose name or detail contains every word of the query. */
export function filterPlayers(
  players: ReadonlyArray<PlayerSummary>,
  query: string,
): PlayerSummary[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...players];
  return players.filter((player) => {
    const haystack = fold(`${player.name} ${player.detail ?? ""}`);
    return words.every((word) => haystack.includes(word));
  });
}
