import type { StyleProp, ViewStyle } from "react-native";

export type CaptureQualityGrade = "excellent" | "good" | "limited" | "poor";

export interface CapturePoint {
  readonly x: number;
  readonly y: number;
}

export interface CaptureGuidance {
  readonly qualityGrade: CaptureQualityGrade;
  readonly qualityScore: number;
  readonly confidence: number;
  readonly acceptable: boolean;
  readonly warnings: readonly string[];
  readonly corners?: readonly CapturePoint[];
  readonly deviceAttitude?: {
    readonly pitch: number;
    readonly roll: number;
    readonly yaw: number;
  };
  readonly lens?: string;
  readonly zoomFactor?: number;
  readonly calibratedAt: string;
}

export interface DunaCourtCalibration extends CaptureGuidance {
  readonly courtWidthMeters: number;
  readonly courtLengthMeters: number;
  readonly netHeightMeters: number;
}

export interface PreparedVideo {
  readonly fileUri: string;
  readonly fileName: string;
  readonly mimeType: "video/mp4";
  readonly bytes: number;
  readonly durationSeconds: number;
}

export interface DunaVideoCaptureViewProps {
  readonly style?: StyleProp<ViewStyle>;
  readonly audioEnabled: boolean;
  readonly courtWidthMeters: number;
  readonly courtLengthMeters: number;
  readonly netHeightMeters: number;
  readonly onGuidance?: (event: {
    readonly nativeEvent: CaptureGuidance;
  }) => void;
  readonly onStreamState?: (event: {
    readonly nativeEvent: {
      readonly state: "preview" | "connecting" | "live" | "stopped";
    };
  }) => void;
  readonly onCaptureError?: (event: {
    readonly nativeEvent: { readonly message: string };
  }) => void;
  readonly onPreview?: (event: {
    readonly nativeEvent: {
      readonly jpegBase64: string;
      readonly capturedAt: string;
    };
  }) => void;
}

export type DunaVideoCaptureModuleEvents = Record<string, never>;
