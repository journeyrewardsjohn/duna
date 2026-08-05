import AsyncStorage from "@react-native-async-storage/async-storage";
import { getStoredWorkOSMobileToken } from "@duna/mobile-auth";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { createDunaApiClient } from "./mobile-api";

const TASK_NAME = "duna-pro-session-arrival";
const CONFIG_KEY = "duna.pro.arrival-background-config";
const authBaseUrl = (
  process.env.EXPO_PUBLIC_DUNA_AUTH_URL?.trim() || "https://duna-web.vercel.app"
).replace(/\/+$/, "");

interface ArrivalTaskConfig {
  readonly sessionId: string;
  readonly startsAt: string;
  readonly consentedAt: string;
}

interface ArrivalTaskData {
  readonly locations?: readonly Location.LocationObject[];
}

function activeWindow(startsAt: string, now = Date.now()) {
  const start = Date.parse(startsAt);
  return now >= start - 60 * 60_000 && now < start + 30 * 60_000;
}

async function storedConfig(): Promise<ArrivalTaskConfig | undefined> {
  const value = await AsyncStorage.getItem(CONFIG_KEY);
  if (!value) return undefined;
  try {
    return JSON.parse(value) as ArrivalTaskConfig;
  } catch {
    return undefined;
  }
}

async function stopTask() {
  if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(TASK_NAME);
  }
  await AsyncStorage.removeItem(CONFIG_KEY);
}

if (!TaskManager.isTaskDefined(TASK_NAME)) {
  TaskManager.defineTask<ArrivalTaskData>(
    TASK_NAME,
    async ({ data, error }) => {
      if (error) return;
      const config = await storedConfig();
      if (!config) {
        await stopTask().catch(() => undefined);
        return;
      }
      if (!activeWindow(config.startsAt)) {
        const client = createDunaApiClient(() =>
          getStoredWorkOSMobileToken(authBaseUrl),
        );
        await client.operator.stopCoachSessionArrival
          .mutate({ sessionId: config.sessionId })
          .catch(() => undefined);
        await stopTask().catch(() => undefined);
        return;
      }
      const location = data?.locations?.at(-1);
      if (!location) return;
      const client = createDunaApiClient(() =>
        getStoredWorkOSMobileToken(authBaseUrl),
      );
      await client.operator.publishCoachSessionArrival
        .mutate({
          sessionId: config.sessionId,
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          accuracyMeters:
            location.coords.accuracy === null
              ? undefined
              : Math.max(0, location.coords.accuracy),
          consentedAt: config.consentedAt,
        })
        .catch(() => undefined);
    },
  );
}

export async function startCoachArrivalBackgroundUpdates(
  config: ArrivalTaskConfig,
): Promise<boolean> {
  if (!activeWindow(config.startsAt)) return false;
  if (!(await TaskManager.isAvailableAsync())) return false;
  await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  if (await Location.hasStartedLocationUpdatesAsync(TASK_NAME)) return true;
  await Location.startLocationUpdatesAsync(TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    activityType: Location.ActivityType.OtherNavigation,
    deferredUpdatesDistance: 300,
    deferredUpdatesInterval: 60_000,
    distanceInterval: 300,
    pausesUpdatesAutomatically: true,
    showsBackgroundLocationIndicator: true,
    timeInterval: 60_000,
    foregroundService: {
      notificationTitle: "Duna Pro arrival reminder is active",
      notificationBody:
        "Keeping your private session ETA current during the arrival window.",
      notificationColor: "#173A67",
    },
  });
  return true;
}

export async function stopCoachArrivalBackgroundUpdates(sessionId?: string) {
  const config = await storedConfig();
  if (sessionId && config && config.sessionId !== sessionId) return;
  await stopTask();
}
