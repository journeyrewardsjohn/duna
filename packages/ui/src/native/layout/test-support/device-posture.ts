import type { PostureSnapshot } from "@duna/expo-device-posture/posture";
import { UNAVAILABLE_POSTURE } from "@duna/expo-device-posture/posture";

export * from "@duna/expo-device-posture/posture";

export const testPosture: { current: PostureSnapshot } = {
  current: UNAVAILABLE_POSTURE,
};

export function useDevicePosture(): PostureSnapshot {
  return testPosture.current;
}
