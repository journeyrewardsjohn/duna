import { Platform } from "react-native";
import type { DunaProLiveActivityProps } from "./DunaProLiveActivity";

export type ProLiveActivityPushToken = {
  readonly activityId: string;
  readonly pushToken: string;
  readonly subjectId: string;
};

async function loadLiveActivity() {
  try {
    return (await import("./DunaProLiveActivity")).default;
  } catch {
    return null;
  }
}

export async function startDunaProLiveActivity(
  props: Omit<DunaProLiveActivityProps, "updatedAt">,
  onPushToken?: (token: ProLiveActivityPushToken) => void,
) {
  if (Platform.OS !== "ios") return null;
  const liveActivity = await loadLiveActivity();
  if (!liveActivity) return null;
  const activity = liveActivity.start(
    { ...props, updatedAt: new Date().toISOString() },
    `duna-pro://session/${encodeURIComponent(props.subjectId)}`,
  );
  const report = (activityId: string, pushToken: string) =>
    onPushToken?.({ activityId, pushToken, subjectId: props.subjectId });
  activity.addPushTokenListener(({ activityId, pushToken }) =>
    report(activityId, pushToken),
  );
  void activity
    .getPushToken()
    .then((pushToken) => {
      if (pushToken) report("current", pushToken);
    })
    .catch(() => undefined);
  return activity;
}
