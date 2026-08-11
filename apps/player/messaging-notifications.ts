import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Linking, Platform } from "react-native";
import type { DunaApiClient } from "./mobile-api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function projectId(): string | undefined {
  return (
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)
      ?.projectId
  );
}

async function prepareAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("messages", {
    name: "Messages",
    description: "Event, lesson, rental, team, and Duna Support messages",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 180, 120, 180],
  });
}

async function expoToken(
  requestPermission: boolean,
): Promise<string | undefined> {
  if (
    !Device.isDevice ||
    (Platform.OS !== "ios" && Platform.OS !== "android")
  ) {
    return undefined;
  }
  await prepareAndroidChannel();
  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && requestPermission) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) return undefined;
  const easProjectId = projectId();
  if (!easProjectId) {
    throw new Error("Duna's notification project is not configured.");
  }
  return (
    await Notifications.getExpoPushTokenAsync({ projectId: easProjectId })
  ).data;
}

export async function messagingNotificationsEnabled(): Promise<boolean> {
  if (!Device.isDevice) return false;
  return (await Notifications.getPermissionsAsync()).granted;
}

export async function registerMessagingNotifications(
  client: DunaApiClient,
  requestPermission: boolean,
): Promise<boolean> {
  const token = await expoToken(requestPermission);
  if (!token || (Platform.OS !== "ios" && Platform.OS !== "android")) {
    return false;
  }
  await client.messaging.registerPushDevice.mutate({
    expoPushToken: token,
    app: "player",
    platform: Platform.OS,
  });
  return true;
}

export async function unregisterMessagingNotifications(
  client: DunaApiClient,
): Promise<void> {
  try {
    const token = await expoToken(false);
    if (token) {
      await client.messaging.unregisterPushDevice.mutate({
        expoPushToken: token,
      });
    }
  } finally {
    await Notifications.unregisterForNotificationsAsync().catch(
      () => undefined,
    );
  }
}

function openMessagingResponse(
  response: Notifications.NotificationResponse,
  onMessage?: () => void,
) {
  const deepLink = response.notification.request.content.data?.deepLink;
  if (typeof deepLink === "string" && deepLink.startsWith("duna://messages")) {
    onMessage?.();
    void Linking.openURL(deepLink);
  }
}

export function listenForMessagingNotificationResponses(
  onMessage?: () => void,
): () => void {
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (!response) return;
    openMessagingResponse(response, onMessage);
    void Notifications.clearLastNotificationResponseAsync();
  });
  const responseSubscription =
    Notifications.addNotificationResponseReceivedListener((response) =>
      openMessagingResponse(response, onMessage),
    );
  const receivedSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      const deepLink = notification.request.content.data?.deepLink;
      if (
        typeof deepLink === "string" &&
        deepLink.startsWith("duna://messages")
      )
        onMessage?.();
    },
  );
  return () => {
    responseSubscription.remove();
    receivedSubscription.remove();
  };
}
