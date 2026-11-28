/**
 * Where a live match lives on the phone (M-P4a): one record in AsyncStorage
 * holding the match's event log and its point queue, written after every
 * tap (in order, one write at a time). Closing the app mid-set loses
 * nothing: the next open finds the record and offers to resume.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { report } from "@duna/observability";
import { parseQueue, type PointQueue } from "./point-queue";
import { parseLiveMatch, type LiveMatch } from "./scoring-machine";

const LIVE_KEY = "duna.score.live.v1";
const DEVICE_KEY = "duna.score.device.v1";
const LINEUP_KEY = "duna.score.last-lineup.v1";

export interface StoredLiveMatch {
  readonly match: LiveMatch;
  readonly queue: PointQueue;
}

/** Pure: a stored record back, or null when it is malformed. */
export function parseStoredLiveMatch(
  raw: string | null,
): StoredLiveMatch | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as {
      readonly match?: unknown;
      readonly queue?: unknown;
    };
    const match = parseLiveMatch(value.match);
    if (!match) return null;
    return { match, queue: parseQueue(value.queue, match.id) };
  } catch {
    return null;
  }
}

export async function loadLiveMatch(): Promise<StoredLiveMatch | null> {
  try {
    return parseStoredLiveMatch(await AsyncStorage.getItem(LIVE_KEY));
  } catch (reason) {
    report(reason, { event: "player.score.live_load_failed" });
    return null;
  }
}

let writes: Promise<unknown> = Promise.resolve();

/** Writes in call order; a failed write is reported, never thrown. */
export function saveLiveMatch(record: StoredLiveMatch | null): Promise<void> {
  const next = writes.then(() =>
    record
      ? AsyncStorage.setItem(LIVE_KEY, JSON.stringify(record))
      : AsyncStorage.removeItem(LIVE_KEY),
  );
  writes = next.catch((reason) => {
    report(reason, { event: "player.score.live_save_failed" });
  });
  return writes.then(() => undefined);
}

/** This phone's scoring device id (the server's authority check). */
export async function scoringDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_KEY);
    if (existing && existing.length >= 8) return existing;
    const created = `native-score-${Crypto.randomUUID()}`;
    await AsyncStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return `native-score-${Crypto.randomUUID()}`;
  }
}

/** The last line-up, so the next pickup game starts in two taps. */
export interface Lineup {
  readonly teamSize: LiveMatch["teamSize"];
  readonly matchType: LiveMatch["matchType"];
  readonly scoringSystem: LiveMatch["format"]["scoringSystem"];
  readonly teams: LiveMatch["teams"];
  readonly venue?: LiveMatch["venue"];
}

export async function loadLineup(): Promise<Lineup | null> {
  try {
    const raw = await AsyncStorage.getItem(LINEUP_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<Lineup>;
    if (![2, 3, 4, 6].includes(value.teamSize as number) || !value.teams)
      return null;
    return value as Lineup;
  } catch {
    return null;
  }
}

export function saveLineup(lineup: Lineup): void {
  void AsyncStorage.setItem(LINEUP_KEY, JSON.stringify(lineup)).catch(
    () => undefined,
  );
}

export function newId(): string {
  return Crypto.randomUUID();
}
