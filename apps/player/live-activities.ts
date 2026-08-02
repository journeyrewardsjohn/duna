import { Platform } from "react-native";
import DunaLiveActivity, {
  type DunaLiveActivityProps,
} from "./DunaLiveActivity";

export type LiveActivityPushToken = {
  readonly activityId: string;
  readonly pushToken: string;
  readonly subjectId: string;
  readonly kind: DunaLiveActivityProps["kind"];
};

type StartOptions = {
  readonly onPushToken?: (token: LiveActivityPushToken) => void;
};

async function endExistingActivities() {
  const existing = DunaLiveActivity.getInstances();
  await Promise.all(
    existing.map((instance) =>
      instance.end("immediate").catch(() => undefined),
    ),
  );
}

export async function startDunaLiveActivity(
  props: Omit<DunaLiveActivityProps, "updatedAt">,
  options: StartOptions = {},
) {
  if (Platform.OS !== "ios") return null;

  await endExistingActivities();
  const activity = DunaLiveActivity.start(
    { ...props, updatedAt: new Date().toISOString() },
    `duna://live/${props.kind}/${encodeURIComponent(props.subjectId)}`,
  );

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

export async function updateDunaLiveActivity(
  props: Omit<DunaLiveActivityProps, "updatedAt">,
) {
  if (Platform.OS !== "ios") return;
  const instances = DunaLiveActivity.getInstances();
  await Promise.all(
    instances.map((instance) =>
      instance.update({ ...props, updatedAt: new Date().toISOString() }),
    ),
  );
}

export async function endDunaLiveActivities() {
  if (Platform.OS !== "ios") return;
  await endExistingActivities();
}
