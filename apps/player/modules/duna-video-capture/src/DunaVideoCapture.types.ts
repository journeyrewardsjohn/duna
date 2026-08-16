import type { StyleProp, ViewStyle } from "react-native";

export type CaptureQualityGrade = "excellent" | "good" | "limited" | "poor";

export interface CapturePoint {
  readonly x: number;
  readonly y: number;
}

export type CaptureLine = readonly [CapturePoint, CapturePoint];

export interface CaptureEdgeVisibility {
  readonly far: boolean;
  readonly left: boolean;
  readonly right: boolean;
  readonly near: boolean;
  readonly net: boolean;
}

export interface CaptureGuidance {
  readonly qualityGrade: CaptureQualityGrade;
  readonly qualityScore: number;
  readonly confidence: number;
  readonly acceptable: boolean;
  readonly warnings: readonly string[];
  readonly corners?: readonly CapturePoint[];
  /** The net line projected onto the sand plane. */
  readonly netLine?: CaptureLine;
  /** The visible top tape, which is intentionally separate from the sand plane. */
  readonly netTopLine?: CaptureLine;
  /** Optional left/right antenna tips. */
  readonly antennaPoints?: CaptureLine;
  readonly visibleCornerCount?: number;
  readonly nearLineVisible?: boolean;
  readonly partialCourt?: boolean;
  readonly edgeVisibility?: CaptureEdgeVisibility;
  readonly netDetected?: boolean;
  readonly antennaDetected?: boolean;
  readonly calibrationMode?: "automatic" | "assisted" | "manual";
  readonly modelVersion?: string;
  readonly horizonY?: number;
  readonly projectionSource?: "lidar" | "arkit" | "vision" | "estimated";
  readonly lidarAvailable?: boolean;
  readonly groundPlaneDetected?: boolean;
  readonly courtDetected?: boolean;
  readonly cameraHeightMeters?: number;
  readonly preferredOrientation?: "landscape" | "portrait";
  readonly deviceOrientation?: "landscape" | "portrait" | "unknown";
  readonly orientationMatches?: boolean;
  readonly trackingState?:
    "initializing" | "limited" | "normal" | "unavailable";
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
  readonly preferredOrientation: "landscape" | "portrait";
  readonly calibrationMode?: "automatic" | "assisted" | "manual";
}

export interface PreparedVideo {
  readonly fileUri: string;
  readonly fileName: string;
  readonly mimeType: "video/mp4";
  readonly bytes: number;
  readonly durationSeconds: number;
}

/**
 * A deliberately small, on-device-selected still from an imported recording.
 * These are candidates for the player to confirm, never a claim that Duna has
 * already found a valid court or identified a person.
 */
export interface VideoFrameSample {
  readonly id: string;
  readonly timestampSeconds: number;
  readonly jpegBase64: string;
  readonly courtScore: number;
  readonly playerCount: number;
}

export interface DunaVideoCaptureViewProps {
  readonly style?: StyleProp<ViewStyle>;
  readonly audioEnabled: boolean;
  readonly courtWidthMeters: number;
  readonly courtLengthMeters: number;
  readonly netHeightMeters: number;
  readonly preferredOrientation: "landscape" | "portrait";
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
