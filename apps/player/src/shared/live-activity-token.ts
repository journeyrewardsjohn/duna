import AsyncStorage from "@react-native-async-storage/async-storage";
import type { LiveActivityPushToken } from "../../live-activities";
import type { DunaApiClient } from "../../mobile-api";

export async function rememberLiveActivityToken(
  token: LiveActivityPushToken,
  client?: DunaApiClient,
) {
  await AsyncStorage.setItem(
    `duna.live-activity.${token.kind}.${token.subjectId}`,
    JSON.stringify({ ...token, recordedAt: new Date().toISOString() }),
  );
  if (!client) return;
  await client.player.registerLiveActivity.mutate({
    kind: token.kind,
    subjectId: token.subjectId,
    activityId: token.activityId,
    pushToken: token.pushToken,
    environment: __DEV__ ? "sandbox" : "production",
  });
}
