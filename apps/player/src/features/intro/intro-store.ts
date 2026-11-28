/**
 * Which intros this device has shown. A convenience, not a record: if the
 * store cannot be read, nothing is shown automatically (an intro is never
 * forced on someone because storage failed); "What's in Duna" still opens
 * every intro on request.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseSeen, type IntroKey } from "./intro-content";

const KEY = "duna.player.intros.seen.v1";

/** `null` when the store could not be read. */
export async function loadSeenIntros(): Promise<Set<IntroKey> | null> {
  try {
    return parseSeen(await AsyncStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export async function saveSeenIntros(seen: ReadonlySet<IntroKey>) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify([...seen]));
  } catch {
    // Seen again next launch at worst; never an error a person must act on.
  }
}
