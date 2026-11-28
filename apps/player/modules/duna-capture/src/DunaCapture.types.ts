import type { StyleProp, ViewStyle } from "react-native";

export type CapturePhase =
  | "idle"
  | "preview"
  /** Record was pressed; waiting for the first frame to reach the file. */
  | "starting"
  | "recording"
  /** iOS has taken the camera for a moment (a call, system pressure). */
  | "interrupted"
  /** Frames stopped unexpectedly; the camera is being restarted. */
  | "recovering"
  | "finishing"
  | "failed";

export type CaptureWarning =
  "hot" | "very-hot" | "battery-critical" | "storage-low" | "storage-full";

export type CaptureEndReason =
  | "user-stopped"
  | "entered-background"
  | "camera-lost"
  | "storage-full"
  | "writer-failed"
  | "recovered-after-crash";

export interface CaptureOptions {
  readonly audioEnabled?: boolean;
  readonly orientation?: "landscape" | "portrait";
  /** H.264 plays everywhere today; HEVC roughly halves the upload. */
  readonly codec?: "h264" | "hevc";
  readonly videoBitsPerSecond?: number;
}

export interface CaptureStatus {
  readonly phase: CapturePhase;
  /** The same state names the Watch app and older capture screens use. */
  readonly healthState:
    | "preview"
    | "preparing"
    | "active"
    | "recovering"
    | "interrupted"
    | "obscured"
    | "failed"
    | "stopped";
  /** True once the camera has delivered a real frame. */
  readonly cameraActive: boolean;
  readonly lensObscured: boolean;
  readonly recordingId?: string;
  /** Wall-clock time of the first frame in the file. */
  readonly startedAt?: string;
  readonly thermal: "nominal" | "fair" | "serious" | "critical";
  /** -1 when iOS has not reported a battery level yet. */
  readonly batteryPercent: number;
  readonly batteryCharging: boolean;
  /** Lowered automatically when the phone is at its thermal limit. */
  readonly framesPerSecond: number;
  readonly droppedFrames: number;
  readonly deviceOrientation: "landscape" | "portrait" | "unknown";
  /** False when the phone is held against the chosen orientation. */
  readonly orientationMatches: boolean;
  readonly warnings: readonly CaptureWarning[];
  readonly message?: string;
}

/** A span where the camera delivered no frames. The file keeps the gap. */
export interface CaptureInterruption {
  readonly reason: string;
  readonly beganAt: string;
  readonly endedAt?: string;
}

/**
 * A clean camera original on disk. Video time equals wall-clock time since
 * `startedAt`, so score events and heart-rate samples line up directly.
 */
export interface CapturedRecording {
  readonly recordingId: string;
  readonly state: "finalized" | "recovered";
  readonly fileUri: string;
  readonly fileName: string;
  readonly mimeType: "video/quicktime";
  readonly bytes: number;
  /** Whole seconds, at least 1. */
  readonly durationSeconds: number;
  readonly exactDurationSeconds: number;
  readonly startedAt?: string;
  readonly endedAt?: string;
  readonly endReason?: CaptureEndReason;
  readonly hasAudio: boolean;
  readonly codec: "h264" | "hevc";
  readonly orientation: "landscape" | "portrait";
  readonly width: number;
  readonly height: number;
  readonly framesPerSecond: number;
  readonly droppedFrames: number;
  readonly interruptions: readonly CaptureInterruption[];
  /** One JSON object per line: what happened to the camera, and when. */
  readonly healthLogUri: string;
  /** The court as found or marked when recording started. */
  readonly court?: CourtObservation;
}

export interface CourtPoint {
  /** Fractions of the frame: 0,0 top left to 1,1 bottom right. */
  readonly x: number;
  readonly y: number;
}

export interface CourtOptions {
  readonly courtLengthMeters?: number;
  readonly courtWidthMeters?: number;
  /** Starting assumption; the finder reports the height it actually sees. */
  readonly netHeightMeters?: number;
}

export type CourtFeatureName =
  | "endLineA"
  | "endLineB"
  | "sidelineA"
  | "sidelineB"
  | "netTape"
  | "postA"
  | "postB";

/** Where the court is in the frame, and how sure the finder is. */
export interface CourtObservation {
  readonly source: "automatic" | "manual";
  /** 0 to 1. Below about 0.5 it is a suggestion to confirm. */
  readonly confidence: number;
  /** Four corners in order around the court; empty if one is out of view behind the camera. */
  readonly corners: readonly CourtPoint[];
  /** Where the net meets the sand. */
  readonly netBase: readonly CourtPoint[];
  /** The top tape. */
  readonly netTop: readonly CourtPoint[];
  /** Foot and top of each post. */
  readonly posts: readonly (readonly CourtPoint[])[];
  readonly cameraHeightMeters: number;
  /** "measured" by LiDAR, or "solved" from the court's size. */
  readonly cameraHeightSource: "measured" | "solved";
  readonly courtLengthMeters: number;
  readonly courtWidthMeters: number;
  readonly netHeightMeters: number;
  /** False when the tape could not be seen well enough to tell its height. */
  readonly netHeightIdentified: boolean;
  /** Court centre relative to the camera, on the sand. */
  readonly distanceMeters: number;
  readonly offsetRightMeters: number;
  readonly yawDegrees: number;
  readonly featuresFound: Readonly<Record<CourtFeatureName, boolean>>;
  readonly featuresVisible: Readonly<Record<CourtFeatureName, number>>;
  /** What the fit was made from, so analysis can re-project later. */
  readonly gravity: readonly number[];
  readonly focalLengthPixels: number;
  readonly frameWidth: number;
  readonly frameHeight: number;
}

export interface CapturePreviewFrame {
  readonly jpegBase64: string;
  readonly capturedAt: string;
}

export type DunaCaptureModuleEvents = {
  onStatus: (status: CaptureStatus) => void;
  /** Also fires when iOS, not the player, ended the recording. */
  onRecordingFinalized: (recording: CapturedRecording) => void;
  /** A small still every couple of seconds for alignment checks. */
  onPreview: (frame: CapturePreviewFrame) => void;
  /** About once a second while the court finder is on. */
  onCourt: (event: {
    readonly found: boolean;
    readonly court?: CourtObservation;
  }) => void;
};

export interface DunaCaptureViewProps {
  readonly style?: StyleProp<ViewStyle>;
  /** Fill the view (cropping) instead of letterboxing. Defaults to true. */
  readonly fill?: boolean;
}
