import { NativeModule, requireOptionalNativeModule } from "expo";
import type {
  CaptureOptions,
  CapturedRecording,
  CourtObservation,
  CourtOptions,
  CourtPoint,
  DunaCaptureModuleEvents,
} from "./DunaCapture.types";

declare class DunaCaptureNativeModule extends NativeModule<DunaCaptureModuleEvents> {
  isAvailable(): boolean;
  requestPermissions(
    audioEnabled: boolean,
  ): Promise<{ readonly camera: boolean; readonly audio: boolean }>;
  /** Opens the camera and the preview. Safe to call again with new options. */
  prepare(options: CaptureOptions): Promise<void>;
  /** Resolves once the first frame is in the file. */
  startRecording(): Promise<{
    readonly recordingId: string;
    readonly startedAt?: string;
  }>;
  stopRecording(): Promise<CapturedRecording>;
  /** Recordings a crash or dead battery left unfinished, repaired. */
  recoverRecordings(): Promise<readonly CapturedRecording[]>;
  /** Saved recordings still on this iPhone, oldest first. */
  savedRecordings(): Promise<readonly CapturedRecording[]>;
  /** Deletes a saved recording, normally after its upload is confirmed. */
  discardRecording(recordingId: string): Promise<boolean>;
  /**
   * Turns the live court finder on or off. It runs while setting up, reports
   * through `onCourt`, and is paused during a recording.
   */
  setCourtDetection(enabled: boolean, options?: CourtOptions): void;
  /**
   * The player marked the four corners (fractions of the frame, any order).
   * Replaces the automatic result until detection is turned on again.
   */
  setCourtCorners(
    corners: readonly CourtPoint[],
  ): Promise<CourtObservation | null>;
  /**
   * Measures the camera's height above the sand with LiDAR. Null when the
   * iPhone has no LiDAR or the sand is out of its five-metre range.
   */
  measureCameraHeight(): Promise<number | null>;
  /** Closes the camera. Ignored while a recording is running. */
  release(): void;
  setPreviewDimmed(dimmed: boolean): Promise<void>;
}

export default requireOptionalNativeModule<DunaCaptureNativeModule>(
  "DunaCapture",
);
