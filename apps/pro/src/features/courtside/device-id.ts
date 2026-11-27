import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

export async function loadDeviceId(): Promise<string> {
  const key = "duna-pro-authoritative-device-id";
  const existing = await SecureStore.getItemAsync(key);
  if (existing) return existing;
  const value = `duna-pro-${Crypto.randomUUID()}`;
  await SecureStore.setItemAsync(key, value);
  return value;
}
