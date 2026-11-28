/**
 * The last pass shown, kept for offline use (WALLET-2). Today the back of
 * every card is the static Duna member credential (`player.memberCard`),
 * which is designed to work without a connection, so it is kept in the
 * Keychain through `expo-secure-store` (the store the app already uses for
 * sign-in), this device only, readable while unlocked; never in plain
 * AsyncStorage. It is tied to the person: another account never sees it.
 * A rotating per-club code (Needs API: `player.cardPass`) would not be
 * cached this way; it would carry its own offline seed.
 */
import * as SecureStore from "expo-secure-store";
import { log, report } from "@duna/observability";
import type { MembershipPassData } from "@duna/tideline-core";
import { parseSavedPass, type Saved } from "./saved-pass";

const KEY = "duna.wallet.pass.v1";

export async function readSavedPass(
  personId: string,
): Promise<MembershipPassData | null> {
  try {
    return parseSavedPass(await SecureStore.getItemAsync(KEY), personId);
  } catch (error) {
    report(error, { event: "player.wallet.pass_cache_read_failed" });
    return null;
  }
}

/** Saves the static credential (only that kind) for this person. */
export async function savePass(
  personId: string,
  pass: MembershipPassData,
): Promise<void> {
  if (pass.rotation !== "static" || !pass.code.startsWith("duna:member:v1:"))
    return;
  const value: Saved = {
    personId,
    code: pass.code,
    ...(pass.reference ? { reference: pass.reference } : {}),
    savedAt: new Date().toISOString(),
  };
  try {
    await SecureStore.setItemAsync(KEY, JSON.stringify(value), {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    log.info("player.wallet.pass_saved");
  } catch (error) {
    report(error, { event: "player.wallet.pass_cache_write_failed" });
  }
}
