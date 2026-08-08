import AsyncStorage from "@react-native-async-storage/async-storage";

export const LIVE_ACTIVITY_OPT_IN_KEY = "duna.live-activities.opted-in-at";

const LEGACY_LIVE_ACTIVITY_TOKEN_PREFIX = "duna.live-activity.";

export async function hasLiveActivityOptIn() {
  const optedInAt = await AsyncStorage.getItem(LIVE_ACTIVITY_OPT_IN_KEY);
  if (optedInAt) return true;

  const storageKeys = await AsyncStorage.getAllKeys();
  return storageKeys.some((key) =>
    key.startsWith(LEGACY_LIVE_ACTIVITY_TOKEN_PREFIX),
  );
}

export async function rememberLiveActivityOptIn() {
  await AsyncStorage.setItem(
    LIVE_ACTIVITY_OPT_IN_KEY,
    new Date().toISOString(),
  );
}
