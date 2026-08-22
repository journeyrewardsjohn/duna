import { requireOptionalNativeModule, NativeModule } from "expo";
import type { EventSubscription } from "expo-modules-core";

export type BackgroundUploadStatus =
  "queued" | "staging" | "uploading" | "completed" | "retryable-error";

export interface BackgroundUploadPart {
  readonly uploadId: string;
  readonly partNumber: number;
  readonly etag: string;
  readonly sizeBytes: number;
}

export interface BackgroundUploadStatusEvent {
  readonly uploadId: string;
  readonly partNumber: number;
  readonly status: BackgroundUploadStatus;
  readonly etag?: string;
  readonly sizeBytes?: number;
  readonly progress?: number;
  readonly error?: string;
}

export interface BackgroundUploadPartInput {
  /** Stable server multipart upload ID; it also scopes persisted completion. */
  readonly uploadId: string;
  readonly partNumber: number;
  readonly fileUri: string;
  readonly uploadUrl: string;
  readonly offset: number;
  readonly length: number;
  /** Passed through to the signed R2 PUT. The server controls which types it signs. */
  readonly contentType: string;
  /** Applied to iOS URLSession. Android makes no durability guarantee. */
  readonly allowCellular: boolean;
}

export interface BackgroundUploadQueuePart {
  readonly partNumber: number;
  readonly uploadUrl: string;
  readonly offset: number;
  readonly length: number;
  readonly contentType: string;
}

export interface BackgroundUploadQueueInput {
  /** Stable server multipart upload ID; it scopes the persisted native state. */
  readonly uploadId: string;
  readonly fileUri: string;
  readonly allowCellular: boolean;
  /** URLs are presigned before this one native call schedules every part. */
  readonly parts: readonly BackgroundUploadQueuePart[];
}

export interface BackgroundUploadQueueResult {
  readonly queuedPartNumbers: readonly number[];
  readonly inFlightPartNumbers: readonly number[];
  readonly completedPartNumbers: readonly number[];
}

export interface BackgroundUploadCancelResult {
  readonly cancelledPartNumbers: readonly number[];
  readonly cancelledTaskCount: number;
}

type DunaBackgroundUploadEvents = {
  readonly onUploadStatusChange: (event: BackgroundUploadStatusEvent) => void;
};

declare class DunaBackgroundUploadNativeModule extends NativeModule<DunaBackgroundUploadEvents> {
  isAvailable(): boolean;
  uploadPart(input: BackgroundUploadPartInput): Promise<BackgroundUploadPart>;
  enqueueParts(
    input: BackgroundUploadQueueInput,
  ): Promise<BackgroundUploadQueueResult>;
  cancelUpload(uploadId: string): Promise<BackgroundUploadCancelResult>;
  completedParts(uploadId: string): Promise<readonly BackgroundUploadPart[]>;
}

const nativeModule =
  requireOptionalNativeModule<DunaBackgroundUploadNativeModule>(
    "DunaBackgroundUpload",
  );

/**
 * iOS uses a persisted background URLSession and file-backed ranges. Other
 * platforms deliberately return an explicit unsupported error instead of
 * promising resumability that their native implementation does not provide.
 */
export function isBackgroundUploadAvailable(): boolean {
  return Boolean(nativeModule?.isAvailable());
}

export async function uploadFileBackedPart(
  input: BackgroundUploadPartInput,
): Promise<BackgroundUploadPart> {
  if (!nativeModule?.isAvailable()) {
    throw new Error(
      "Durable background video upload is unavailable on this device. The original file remains queued for retry.",
    );
  }
  return nativeModule.uploadPart(input);
}

/**
 * Schedules all currently missing ranges in one native call. It resolves once
 * tasks are persisted and enqueued—not after transfer—so iOS can continue
 * them if React Native is suspended. Foreground code reconciles completed
 * ETags with R2 before it asks the server to complete the multipart upload.
 */
export async function enqueueFileBackedParts(
  input: BackgroundUploadQueueInput,
): Promise<BackgroundUploadQueueResult> {
  if (!nativeModule?.isAvailable()) {
    throw new Error(
      "Durable background video upload is unavailable on this device. The original file remains queued for retry.",
    );
  }
  return nativeModule.enqueueParts(input);
}

/**
 * Call on foreground before resuming server reconciliation. Completed ETags
 * survive an iOS process launch; JavaScript need not be alive at completion.
 */
export async function getCompletedFileBackedParts(
  uploadId: string,
): Promise<readonly BackgroundUploadPart[]> {
  if (!nativeModule?.isAvailable()) return [];
  return nativeModule.completedParts(uploadId);
}

/**
 * Clears persisted manifests, staged ranges, and any URLSession tasks for a
 * multipart ID. Call only after server cancellation succeeds or the server
 * has completed the object; transient failures must retain the local state.
 */
export async function cancelFileBackedUpload(
  uploadId: string,
): Promise<BackgroundUploadCancelResult> {
  if (!nativeModule?.isAvailable()) {
    return { cancelledPartNumbers: [], cancelledTaskCount: 0 };
  }
  return nativeModule.cancelUpload(uploadId);
}

export function addBackgroundUploadStatusListener(
  listener: (event: BackgroundUploadStatusEvent) => void,
): EventSubscription | undefined {
  return nativeModule?.addListener("onUploadStatusChange", listener);
}
