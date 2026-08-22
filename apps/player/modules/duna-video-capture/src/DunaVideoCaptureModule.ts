import { NativeModule, requireOptionalNativeModule } from "expo";
import type {
  DunaCourtCalibration,
  DunaVideoCaptureModuleEvents,
  PreparedVideo,
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
  ): Promise<void>;
  stopStream(): Promise<void>;
  startRecording(audioEnabled: boolean): Promise<void>;
  stopRecording(): Promise<PreparedVideo>;
  pickVideo(): Promise<PreparedVideo | null>;
  sampleVideoFrames(
    fileUri: string,
    maximumFrames?: number,
  ): Promise<readonly VideoFrameSample[]>;
  uploadPart(
    fileUri: string,
    uploadUrl: string,
    offset: number,
    length: number,
  ): Promise<{ readonly etag: string; readonly sizeBytes: number }>;
  lockCalibration(): DunaCourtCalibration | null;
  releasePreview(): void;
}

export default requireOptionalNativeModule<DunaVideoCaptureNativeModule>(
  "DunaVideoCapture",
);
