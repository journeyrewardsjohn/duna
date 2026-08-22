import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import * as Network from "expo-network";

export interface VideoNetworkPreferences {
  readonly allowCellularUploads: boolean;
  readonly allowCellularLive: boolean;
}

export const defaultVideoNetworkPreferences: VideoNetworkPreferences = {
  allowCellularUploads: false,
  allowCellularLive: false,
};

const preferencesKey = "duna.video.network-preferences.v1";
const offlineQueueKey = "duna.video.offline-queue.v1";
const offlineDirectory = new Directory(Paths.document, "duna-video-offline");

export type VideoTransport = "upload" | "live";

export interface OfflineVideoDraft {
  readonly id: string;
  readonly createdAt: string;
  readonly fileUri: string;
  readonly fileName: string;
  readonly mimeType: "video/mp4" | "video/quicktime";
  readonly bytes: number;
  readonly durationSeconds: number;
  /** The cloud object finished; only its Vision linkage still needs a retry. */
  readonly completedVideoId?: string;
  /** Serialized by the caller so this queue stays independent from UI state. */
  readonly payload: Record<string, unknown>;
}

function isPreference(value: unknown): value is VideoNetworkPreferences {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.allowCellularUploads === "boolean" &&
    typeof candidate.allowCellularLive === "boolean"
  );
}

export async function loadVideoNetworkPreferences(): Promise<VideoNetworkPreferences> {
  try {
    const stored = await AsyncStorage.getItem(preferencesKey);
    if (!stored) return defaultVideoNetworkPreferences;
    const parsed = JSON.parse(stored) as unknown;
    return isPreference(parsed) ? parsed : defaultVideoNetworkPreferences;
  } catch {
    return defaultVideoNetworkPreferences;
  }
}

export async function saveVideoNetworkPreferences(
  preferences: VideoNetworkPreferences,
): Promise<void> {
  await AsyncStorage.setItem(preferencesKey, JSON.stringify(preferences));
}

/**
 * Network is an operating condition, not a permission. Unknown networks are
 * treated conservatively: uploads and streams wait rather than silently using
 * a metered connection.
 */
export async function canUseVideoTransport(
  transport: VideoTransport,
  preferences: VideoNetworkPreferences,
): Promise<{ readonly allowed: boolean; readonly reason?: string }> {
  const state = await Network.getNetworkStateAsync();
  if (!state.isConnected || state.isInternetReachable === false) {
    return { allowed: false, reason: "Offline" };
  }
  if (
    state.type === Network.NetworkStateType.WIFI ||
    state.type === Network.NetworkStateType.ETHERNET
  ) {
    return { allowed: true };
  }
  if (state.type === Network.NetworkStateType.CELLULAR) {
    const allowed =
      transport === "upload"
        ? preferences.allowCellularUploads
        : preferences.allowCellularLive;
    return {
      allowed,
      reason: allowed
        ? undefined
        : transport === "upload"
          ? "Uploads are set to Wi‑Fi only"
          : "Live video is set to Wi‑Fi only",
    };
  }
  return {
    allowed: false,
    reason: "Waiting for a Wi‑Fi connection",
  };
}

export function subscribeToVideoNetwork(listener: () => void): {
  remove: () => void;
} {
  return Network.addNetworkStateListener(() => listener());
}

export async function retainVideoForOfflineUpload(input: {
  readonly id: string;
  readonly fileUri: string;
  readonly extension?: string;
}): Promise<string> {
  offlineDirectory.create({ idempotent: true, intermediates: true });
  const extension = input.extension?.startsWith(".")
    ? input.extension
    : input.extension
      ? `.${input.extension}`
      : ".mp4";
  const destination = new File(offlineDirectory, `${input.id}${extension}`);
  const source = new File(input.fileUri);
  if (!source.exists) {
    throw new Error("Duna could not keep a local copy of this video.");
  }
  if (destination.exists) destination.delete();
  await source.copy(destination);
  return destination.uri;
}

/**
 * Android and web intentionally retain a foreground-only, file-backed
 * fallback. It streams the requested range from the retained source rather
 * than materializing a whole multipart part in JavaScript memory, and makes
 * no promise that the transfer survives app suspension.
 */
export async function uploadOfflineVideoRange(input: {
  readonly fileUri: string;
  readonly uploadUrl: string;
  readonly offset: number;
  readonly length: number;
  readonly contentType: string;
}): Promise<string> {
  const source = new File(input.fileUri);
  if (!source.exists) {
    throw new Error("Duna could not find the retained video for upload.");
  }
  const response = await fetch(input.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": input.contentType },
    body: source.slice(
      input.offset,
      input.offset + input.length,
      input.contentType,
    ),
  });
  if (!response.ok) {
    throw new Error("Private storage rejected an upload part.");
  }
  const etag = response.headers.get("etag");
  if (!etag) {
    throw new Error("Private storage did not confirm an upload part.");
  }
  return etag;
}

export async function loadOfflineVideoDrafts(): Promise<
  readonly OfflineVideoDraft[]
> {
  try {
    const stored = await AsyncStorage.getItem(offlineQueueKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((draft): draft is OfflineVideoDraft =>
      Boolean(
        draft &&
        typeof draft === "object" &&
        typeof (draft as OfflineVideoDraft).id === "string" &&
        typeof (draft as OfflineVideoDraft).fileUri === "string" &&
        ((draft as OfflineVideoDraft).completedVideoId === undefined ||
          typeof (draft as OfflineVideoDraft).completedVideoId === "string") &&
        typeof (draft as OfflineVideoDraft).payload === "object",
      ),
    );
  } catch {
    return [];
  }
}

async function saveOfflineVideoDrafts(
  drafts: readonly OfflineVideoDraft[],
): Promise<void> {
  await AsyncStorage.setItem(offlineQueueKey, JSON.stringify(drafts));
}

export async function enqueueOfflineVideoDraft(
  draft: OfflineVideoDraft,
): Promise<void> {
  const current = await loadOfflineVideoDrafts();
  await saveOfflineVideoDrafts([
    ...current.filter((item) => item.id !== draft.id),
    draft,
  ]);
}

export async function updateOfflineVideoDraft(
  draft: OfflineVideoDraft,
): Promise<void> {
  const current = await loadOfflineVideoDrafts();
  await saveOfflineVideoDrafts([
    ...current.filter((item) => item.id !== draft.id),
    draft,
  ]);
}

export async function removeOfflineVideoDraft(id: string): Promise<void> {
  const current = await loadOfflineVideoDrafts();
  const removed = current.find((draft) => draft.id === id);
  await saveOfflineVideoDrafts(current.filter((draft) => draft.id !== id));
  if (removed) {
    const file = new File(removed.fileUri);
    if (file.exists) file.delete();
  }
}
