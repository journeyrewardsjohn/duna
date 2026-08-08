import { Platform } from "react-native";
import type { DunaLiveActivityProps } from "./DunaLiveActivity";
import { rememberLiveActivityOptIn } from "./live-activity-preference";

export type LiveActivityPushToken = {
  readonly activityId: string;
  readonly pushToken: string;
  readonly subjectId: string;
  readonly kind: DunaLiveActivityProps["kind"];
};

type StartOptions = {
  readonly onPushToken?: (token: LiveActivityPushToken) => void;
};

async function loadDunaLiveActivity() {
  try {
    return (await import("./DunaLiveActivity")).default;
  } catch {
    return null;
  }
}

export async function startDunaLiveActivity(
  props: Omit<DunaLiveActivityProps, "updatedAt">,
  options: StartOptions = {},
) {
  if (Platform.OS !== "ios") return null;

  const liveActivity = await loadDunaLiveActivity();
  if (!liveActivity) return null;
  const activity = liveActivity.start(
    { ...props, updatedAt: new Date().toISOString() },
    `duna://live/${props.kind}/${encodeURIComponent(props.subjectId)}`,
  );
  await rememberLiveActivityOptIn();

  const reportToken = (activityId: string, pushToken: string) => {
    options.onPushToken?.({
      activityId,
      pushToken,
      subjectId: props.subjectId,
      kind: props.kind,
    });
  };
  activity.addPushTokenListener(({ activityId, pushToken }) => {
    reportToken(activityId, pushToken);
  });
  void activity
    .getPushToken()
    .then((pushToken) => {
      if (pushToken) reportToken("current", pushToken);
    })
    .catch(() => undefined);

  return activity;
}
