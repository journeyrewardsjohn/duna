import { NativeModule, requireOptionalNativeModule } from "expo";
import type {
  DunaCourtCalibration,
  DunaVideoCaptureModuleEvents,
  PreparedVideo,
  ReplayInsertionResult,
  VideoFrameSample,
} from "./DunaVideoCapture.types";

declare class DunaVideoCaptureNativeModule extends NativeModule<DunaVideoCaptureModuleEvents> {
  isAvailable(): boolean;
  requestPermissions(
    audioEnabled: boolean,
  ): Promise<{ readonly camera: boolean; readonly audio: boolean }>;
  preparePreview(audioEnabled: boolean): Promise<void>;
  startStream(
    streamUrl: string,
    streamKey: string,
    audioEnabled: boolean,
    transport: "srt" | "rtmps",
    srtPassphrase?: string,
    fallbackUrl?: string,
    fallbackKey?: string,
  ): Promise<void>;
  stopStream(): Promise<void>;
  updateProgramState(payloadJson: string): Promise<void>;
  insertReplay(durationSeconds: number): Promise<ReplayInsertionResult>;
  startRecording(audioEnabled: boolean): Promise<void>;
  stopRecording(): Promise<PreparedVideo>;
  pickVideo(): Promise<PreparedVideo | null>;
  sampleVideoFrames(
    fileUri: string,
    maximumFrames?: number,
  ): Promise<readonly VideoFrameSample[]>;
  lockCalibration(): DunaCourtCalibration | null;
  releasePreview(): void;
}

export default requireOptionalNativeModule<DunaVideoCaptureNativeModule>(
  "DunaVideoCapture",
);
