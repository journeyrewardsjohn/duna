import muxReactNativeVideo from "@mux/mux-data-react-native-video";
import { MEMBERSHIP_PLANS, type PersonSummary } from "@duna/core";
import {
  mobileControl,
  mobileGrid,
  resolveDunaMobileTokens,
} from "@duna/ui/mobile";
import type { DunaTheme } from "@duna/ui/tokens";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as ScreenOrientation from "expo-screen-orientation";
import * as WebBrowser from "expo-web-browser";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  useWindowDimensions,
  type LayoutChangeEvent,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import Video from "react-native-video";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import VideoCapture, {
  DunaVideoCaptureView,
  type CaptureGuidance,
  type CapturePoint,
  type DunaCourtCalibration,
  type PreparedVideo,
  type VideoFrameSample,
} from "./modules/duna-video-capture";
import { dunaWebUrl, type DunaApiClient } from "./mobile-api";
import type { PlayerRuntime } from "./runtime";
import {
  MobilePlacePicker,
  type MobilePlaceSelection,
} from "./components/mobile-place-picker";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "./satoshi-text";
import {
  acknowledgeWatchVisionEvents,
  getPendingWatchVisionEvents,
  subscribeToWatchVisionEvents,
  syncVisionSessionToWatch,
  type WatchScoreSnapshot,
  type WatchVisionEvent,
} from "./watch-scoring";
import {
  edgeVisibility,
  geometryFromGuidance,
  geometrySettings,
  interpolatePoint,
  isCapturePointVisible,
  moveAntennaAnchor,
  moveCourtCorner,
  moveNetTopAnchor,
  moveNetTopLine,
  toggleAntennas,
  visibleCornerCount,
  withFullCourtVisible,
  withNearLineOffscreen,
  type CourtCornerIndex,
  type CourtGeometry,
} from "./court-calibration";
import {
  canUseVideoTransport,
  defaultVideoNetworkPreferences,
  enqueueOfflineVideoDraft,
  loadOfflineVideoDrafts,
  loadVideoNetworkPreferences,
  removeOfflineVideoDraft,
  retainVideoForOfflineUpload,
  subscribeToVideoNetwork,
  uploadOfflineVideoRange,
  updateOfflineVideoDraft,
  type OfflineVideoDraft,
  type VideoNetworkPreferences,
} from "./video-offline";
import {
  cancelFileBackedUpload,
  enqueueFileBackedParts,
  getCompletedFileBackedParts,
  isBackgroundUploadAvailable,
} from "@duna/expo-background-upload";
import { PlayerPickerModal, type MobileSocialPalette } from "./player-social";
import { startDunaLiveActivity } from "./live-activities";
import { DunaIcon, type DunaIconName } from "./duna-icon";
import type { ProvisionalParticipant } from "./score-upload";
import {
  acknowledgeLegacyVisionConsentRevocation,
  createVisionLearningConsentReceipt,
  legacyVisionConsentRevocationLocator,
  normalizeVisionLearningConsent,
  resetVisionLearningConsent,
  type VisionLearningConsentReceipt,
} from "./video-learning-consent";

type VideoStudioData = Awaited<
  ReturnType<DunaApiClient["player"]["videoStudio"]["query"]>
>;
export type VideoSummary = VideoStudioData["videos"][number];
type VideoAssociation = Awaited<
  ReturnType<DunaApiClient["player"]["videoAssociations"]["query"]>
>[number];
type VideoMetric = Awaited<
  ReturnType<DunaApiClient["player"]["videoMetrics"]["query"]>
>[number];
type LiveVideoSession = Awaited<
  ReturnType<DunaApiClient["player"]["createLiveVideo"]["mutate"]>
>;
type VideoPlayback = Awaited<
  ReturnType<DunaApiClient["public"]["videoPlayback"]["query"]>
>;
type VideoAnalysisReport = Awaited<
  ReturnType<DunaApiClient["player"]["videoAnalysisReport"]["query"]>
>;
type VideoPerformanceReview = Awaited<
  ReturnType<
    DunaApiClient["player"]["requestOwnerVideoPerformanceReview"]["mutate"]
  >
>;
type VisionSessionAccess = Awaited<
  ReturnType<DunaApiClient["player"]["createVisionSession"]["mutate"]>
>;
type VisionSession = VisionSessionAccess["session"];
type VisionSettings = VisionSession["settings"];
type VisionScore = NonNullable<VideoPlayback["liveScore"]>;
type VisionTimelineEvent = NonNullable<
  NonNullable<VideoPlayback["vision"]>["events"]
>[number];
type MatchScoringState = Awaited<
  ReturnType<DunaApiClient["player"]["matchScoringState"]["query"]>
>;
type MatchScoreEvent = Parameters<
  DunaApiClient["player"]["appendMatchEvents"]["mutate"]
>[0]["events"][number]["event"];

type VideoCategory = "practice" | "event" | "match" | "social";
type RecordingVisibility = "public" | "private";
type LiveVisibility = "public" | "link-only";
type CaptureOrientation = "landscape" | "portrait";

type VenueSelection = MobilePlaceSelection;

interface CaptureForm {
  readonly title: string;
  readonly category: VideoCategory;
  readonly association?: VideoAssociation;
  readonly venue?: VenueSelection;
  readonly hasAudio: boolean;
  readonly liveVisibility: LiveVisibility;
  readonly recordingVisibility: RecordingVisibility;
  readonly simulcastToDunaYoutube: boolean;
  readonly youtubeConnectionIds: readonly string[];
  readonly publishedToProfile: boolean;
  readonly courtWidthMeters: number;
  readonly courtLengthMeters: number;
  readonly netHeightMeters: number;
  readonly orientation: CaptureOrientation;
  readonly contributeCalibration: boolean;
}

interface OfflineUploadPayload {
  readonly form: CaptureForm;
  /** Proves that a current, default-off UI recorded an affirmative choice. */
  readonly visionLearningConsentReceipt?: VisionLearningConsentReceipt;
  /** Written with the local draft before begin, so a lost response is safe. */
  readonly beginIdempotencyKey: string;
  /** Completion can also be retried after a database/network acknowledgement loss. */
  readonly completeIdempotencyKey: string;
  readonly cancelIdempotencyKey: string;
  readonly visionSessionId?: string;
  readonly calibration?: DunaCourtCalibration;
  readonly importedVision?: ImportedVisionPayload;
  /** Stable server-side multipart identity. Native completion is reconciled
   * against this session on foreground rather than trusting local progress. */
  readonly upload?: {
    readonly videoId: string;
    readonly uploadId: string;
  };
}

interface ImportedVisionPayload {
  readonly courtFrame?: VideoFrameSample;
  readonly playerFrameAtSeconds?: number;
  readonly playerIds: readonly string[];
  readonly geometry?: CourtGeometry;
}

interface ImportedVisionSetup {
  readonly frames: readonly VideoFrameSample[];
  readonly courtFrameId?: string;
  readonly playerFrameId?: string;
  readonly players: readonly PersonSummary[];
  readonly geometry?: CourtGeometry;
}

export interface VideoTransferStatus {
  readonly id: string;
  readonly stage:
    | "importing"
    | "waiting"
    | "uploading"
    | "processing"
    | "complete"
    | "failed";
  readonly title: string;
  readonly detail: string;
  readonly progress?: number;
}

function offlineUploadPayload(
  value: Record<string, unknown>,
): OfflineUploadPayload | undefined {
  const candidate = value as Partial<OfflineUploadPayload>;
  if (
    !candidate.form ||
    typeof candidate.form.title !== "string" ||
    !candidate.form.category
  ) {
    return undefined;
  }
  return {
    ...candidate,
    form: {
      ...candidate.form,
      contributeCalibration: normalizeVisionLearningConsent({
        requested: candidate.form.contributeCalibration,
        receipt: candidate.visionLearningConsentReceipt,
      }),
    },
  } as OfflineUploadPayload;
}

const initialCaptureForm: CaptureForm = {
  title: "",
  category: "match",
  hasAudio: true,
  liveVisibility: "public",
  recordingVisibility: "private",
  simulcastToDunaYoutube: false,
  youtubeConnectionIds: [],
  publishedToProfile: false,
  courtWidthMeters: 8,
  courtLengthMeters: 16,
  netHeightMeters: 2.43,
  orientation: "landscape",
  // This decision belongs to this recording only and always starts off. It is
  // intentionally not included in saved capture defaults, so consent cannot
  // silently carry into a future recording or library upload.
  contributeCalibration: false,
};

interface StoredCaptureDefaults {
  readonly category?: VideoCategory;
  readonly venue?: VenueSelection;
  readonly hasAudio?: boolean;
  readonly liveVisibility?: LiveVisibility;
  readonly recordingVisibility?: RecordingVisibility;
  readonly publishedToProfile?: boolean;
  readonly courtWidthMeters?: number;
  readonly courtLengthMeters?: number;
  readonly netHeightMeters?: number;
  readonly orientation?: CaptureOrientation;
}

const captureDefaultsKey = "duna.video.capture-defaults.v2";
const videoMatchDeviceKey = "duna.video.match-device.v1";

function captureFormFromDefaults(
  stored: StoredCaptureDefaults | undefined,
  overrides: Partial<CaptureForm> = {},
): CaptureForm {
  const category = overrides.category ?? stored?.category ?? "match";
  const recordingVisibility =
    category === "practice"
      ? "private"
      : (overrides.recordingVisibility ??
        stored?.recordingVisibility ??
        "private");
  return resetVisionLearningConsent({
    ...initialCaptureForm,
    ...stored,
    ...overrides,
    category,
    recordingVisibility,
    publishedToProfile:
      recordingVisibility === "public" &&
      Boolean(overrides.publishedToProfile ?? stored?.publishedToProfile),
  });
}

function storedDefaults(form: CaptureForm): StoredCaptureDefaults {
  return {
    category: form.category,
    venue: form.venue,
    hasAudio: form.hasAudio,
    liveVisibility: form.liveVisibility,
    recordingVisibility: form.recordingVisibility,
    publishedToProfile: form.publishedToProfile,
    courtWidthMeters: form.courtWidthMeters,
    courtLengthMeters: form.courtLengthMeters,
    netHeightMeters: form.netHeightMeters,
    orientation: form.orientation,
  };
}

const palette = {
  canvas: "#f6f5f1",
  depth: "#ffffff",
  ink: "#1b1b19",
  muted: "#766f61",
  navy: "#22343b",
  aqua: "#3d6672",
  aquaSoft: "#dfe5e4",
  sand: "#c9a96a",
  flare: "#e8683a",
  positive: "#2f6b3a",
  warning: "#8a6a2f",
  danger: "#9a4a2e",
  line: "#dedbd3",
};

const importedPlayerPalette: MobileSocialPalette = {
  canvas: palette.canvas,
  ink: palette.ink,
  depth: palette.depth,
  navy: palette.navy,
  navyLift: "#31484f",
  bone: palette.ink,
  muted: palette.muted,
  aqua: palette.aqua,
  aquaDeep: "#274f5b",
  sand: palette.sand,
  flare: palette.flare,
  positive: palette.positive,
  warning: palette.warning,
  danger: palette.danger,
  onAccent: "#ffffff",
  white: "#ffffff",
  overlayRgb: "27,27,25",
  accentRgb: "61,102,114",
  warningRgb: "138,106,47",
  positiveRgb: "47,107,58",
  dangerRgb: "154,74,46",
  flareRgb: "232,104,58",
  inkRgb: "27,27,25",
  depthRgb: "255,255,255",
  navyRgb: "34,52,59",
  boneRgb: "27,27,25",
  whiteRgb: "255,255,255",
};

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3_600);
  const minutes = Math.floor((whole % 3_600) / 60);
  const remainder = whole % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

function displayError(error: unknown): string {
  const payload =
    typeof error === "object" && error !== null
      ? (error as { readonly code?: unknown; readonly message?: unknown })
      : undefined;
  const code = typeof payload?.code === "string" ? payload.code : "";
  const rawMessage =
    error instanceof Error
      ? error.message
      : typeof payload?.message === "string"
        ? payload.message
        : "";
  const message = rawMessage.trim();
  if (
    code === "ERR_DUNA_VIDEO_PICKER" ||
    code === "ERR_DUNA_VIDEO_EXPORT" ||
    message.includes("ERR_DUNA_VIDEO_PICKER") ||
    message.includes("ERR_DUNA_VIDEO_EXPORT")
  ) {
    return "That video could not be read from Photos. Download it to this iPhone if it is stored in iCloud, then choose it again.";
  }
  if (!message) return "Duna could not complete that video request.";
  if (
    message.includes("new_asset_settings.passthrough") ||
    /^\d{3}\s*\{/.test(message)
  ) {
    return "Duna could not open the video provider. Please try again in a moment.";
  }
  return message.length > 280
    ? "Duna could not complete that video request. Please try again."
    : message;
}

function frameForId(
  setup: ImportedVisionSetup | undefined,
  frameId: string | undefined,
): VideoFrameSample | undefined {
  if (!setup || !frameId) return undefined;
  return setup.frames.find((frame) => frame.id === frameId);
}

function importedVisionPayload(
  setup: ImportedVisionSetup | undefined,
): ImportedVisionPayload | undefined {
  if (!setup) return undefined;
  const courtFrame = frameForId(setup, setup.courtFrameId);
  const playerFrame = frameForId(setup, setup.playerFrameId);
  return {
    courtFrame,
    playerFrameAtSeconds: playerFrame?.timestampSeconds,
    playerIds: setup.players.map((player) => player.id),
    geometry: setup.geometry,
  };
}

function importedVisionSettings(
  form: CaptureForm,
  imported: ImportedVisionPayload | undefined,
): VisionSettings {
  return {
    captureMode: "upload",
    courtWidthMeters: form.courtWidthMeters,
    courtLengthMeters: form.courtLengthMeters,
    netHeightMeters: form.netHeightMeters,
    cameraHeightMeters: 2.1,
    overlayScoreboard: true,
    teamA: "Side A",
    teamB: "Side B",
    ...(imported?.geometry ? geometrySettings(imported.geometry) : {}),
  };
}

function idempotencyKey(): string {
  return Crypto.randomUUID();
}

function associationInput(association: VideoAssociation | undefined): {
  readonly eventId?: string;
  readonly matchId?: string;
} {
  if (association?.type === "match") {
    return { eventId: association.eventId, matchId: association.id };
  }
  return association?.type === "event" ? { eventId: association.id } : {};
}

function teamLabels(form: CaptureForm): {
  readonly teamA: string;
  readonly teamB: string;
} {
  if (form.association?.type !== "match") {
    return { teamA: "Side A", teamB: "Side B" };
  }
  const separators = /\s+(?:vs\.?|v\.?|—|–|-)\s+/i;
  const [left, right] = form.association.title.split(separators);
  return {
    teamA: left?.trim() || "Side A",
    teamB: right?.trim() || "Side B",
  };
}

function matchLabelTeams(label: string | undefined): {
  readonly teamA: string;
  readonly teamB: string;
} {
  if (!label) return { teamA: "Side A", teamB: "Side B" };
  const [left, right] = label.split(/\s+(?:vs\.?|v\.?|—|–|-)\s+/i);
  return {
    teamA: left?.trim() || "Side A",
    teamB: right?.trim() || "Side B",
  };
}

function scoreAtTime(
  playback: VideoPlayback | undefined,
  seconds: number,
): VisionScore | undefined {
  if (playback?.video.status === "live" && playback.liveScore) {
    return playback.liveScore;
  }

  const events = playback?.vision?.events ?? [];
  let score: VisionScore | undefined;
  for (const event of events) {
    if (event.elapsedMs > seconds * 1_000) break;
    if (event.score) score = event.score;
  }
  return score;
}

function heartRateAtTime(
  playback: VideoPlayback | undefined,
  playbackSeconds: number,
): number | undefined {
  const points = playback?.healthOverlay?.points;
  if (!points?.length) return undefined;
  const elapsedMs = Math.max(0, playbackSeconds * 1_000);
  let low = 0;
  let high = points.length - 1;
  let selected = points[0];
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const point = points[middle]!;
    if (point.elapsedMs <= elapsedMs) {
      selected = point;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return selected?.beatsPerMinute;
}

function compactScore(
  score: MatchScoringState["score"] | WatchScoreSnapshot,
): VisionScore {
  return {
    setIndex: score.setIndex,
    sets: score.sets.map((set) => ({ a: set.a, b: set.b })),
    serving: score.serving,
    status: score.status,
  };
}

function VisionScoreboard({
  compact = false,
  landscape = false,
  score,
  teamA,
  teamB,
}: {
  readonly compact?: boolean;
  readonly landscape?: boolean;
  readonly score: VisionScore;
  readonly teamA: string;
  readonly teamB: string;
}) {
  const current = score.sets[
    Math.min(score.setIndex, score.sets.length - 1)
  ] ?? {
    a: 0,
    b: 0,
  };
  const setsWon = score.sets.reduce(
    (total, set, index) => {
      if (index >= score.setIndex && score.status !== "complete") return total;
      if (set.a > set.b) total.a += 1;
      if (set.b > set.a) total.b += 1;
      return total;
    },
    { a: 0, b: 0 },
  );
  return (
    <View
      style={[
        styles.visionScoreboard,
        compact && styles.visionScoreboardCompact,
        landscape && styles.visionScoreboardLandscape,
      ]}
    >
      <View style={styles.visionScoreHeader}>
        <Text style={styles.visionScoreBrand}>DUNA</Text>
        <Text style={styles.visionScoreSet}>SET {score.setIndex + 1}</Text>
      </View>
      {[
        { key: "A", label: teamA, point: current.a, sets: setsWon.a },
        { key: "B", label: teamB, point: current.b, sets: setsWon.b },
      ].map((team) => (
        <View key={team.key} style={styles.visionScoreRow}>
          <View
            style={[
              styles.visionServeDot,
              score.serving !== team.key && styles.visionServeDotOff,
            ]}
          />
          <Text numberOfLines={1} style={styles.visionTeamName}>
            {team.label}
          </Text>
          <Text style={styles.visionSetCount}>{team.sets}</Text>
          <Text style={styles.visionPointCount}>{team.point}</Text>
        </View>
      ))}
    </View>
  );
}

function ChoiceRow<Value extends string>({
  body,
  label,
  onChange,
  options,
  value,
}: {
  readonly label: string;
  readonly body?: string;
  readonly value: Value;
  readonly onChange: (value: Value) => void;
  readonly options: readonly {
    readonly label: string;
    readonly value: Value;
    readonly body?: string;
    readonly recommended?: boolean;
  }[];
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {!!body && <Text style={styles.fieldDescription}>{body}</Text>}
      <View style={styles.choiceRow}>
        {options.map((option) => (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.choice,
              value === option.value && styles.choiceActive,
            ]}
          >
            <Text
              style={[
                styles.choiceText,
                value === option.value && styles.choiceTextActive,
              ]}
            >
              {option.label}
            </Text>
            {!!option.body && (
              <Text
                style={[
                  styles.choiceBody,
                  value === option.value && styles.choiceBodyActive,
                ]}
              >
                {option.body}
              </Text>
            )}
            {option.recommended && (
              <Text style={styles.recommendedLabel}>RECOMMENDED</Text>
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ToggleRow({
  body,
  label,
  onChange,
  value,
}: {
  readonly label: string;
  readonly body: string;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.flex}>
        <Text style={styles.toggleTitle}>{label}</Text>
        <Text style={styles.toggleBody}>{body}</Text>
      </View>
      <Switch
        onValueChange={onChange}
        thumbColor="#ffffff"
        trackColor={{ false: "#d0d5dd", true: palette.aqua }}
        value={value}
      />
    </View>
  );
}

type CaptureSetupSheet = "audio" | "court" | "more" | "orientation" | "privacy";

type RecordingSetupStyles = ReturnType<typeof createRecordingSetupStyles>;

function CaptureSettingTile({
  icon,
  label,
  onPress,
  styles: setupStyles,
  value,
}: {
  readonly icon: DunaIconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly styles: RecordingSetupStyles;
  readonly value: string;
}) {
  return (
    <Pressable
      accessibilityHint={`Opens ${label.toLowerCase()} choices`}
      accessibilityLabel={`${label}, ${value}`}
      accessibilityRole="button"
      onPress={onPress}
      style={setupStyles.settingTile}
    >
      <View style={setupStyles.settingTileHeader}>
        <View style={setupStyles.settingIcon}>
          <DunaIcon color={setupStyles.iconColor.color} name={icon} />
        </View>
        <DunaIcon
          color={setupStyles.mutedIconColor.color}
          name="chevron-right"
          size={18}
        />
      </View>
      <View style={setupStyles.settingCopy}>
        <Text style={setupStyles.settingLabel}>{label}</Text>
        <Text numberOfLines={1} style={setupStyles.settingValue}>
          {value}
        </Text>
      </View>
    </Pressable>
  );
}

function RecordingChoiceSheet({
  description,
  onClose,
  onSelect,
  options,
  styles: setupStyles,
  title,
  value,
  visible,
}: {
  readonly description: string;
  readonly onClose: () => void;
  readonly onSelect: (value: string) => void;
  readonly options: readonly {
    readonly detail: string;
    readonly icon: DunaIconName;
    readonly label: string;
    readonly value: string;
  }[];
  readonly styles: RecordingSetupStyles;
  readonly title: string;
  readonly value: string;
  readonly visible: boolean;
}) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={visible}
    >
      <Pressable onPress={onClose} style={setupStyles.sheetBackdrop}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={setupStyles.sheet}
        >
          <View style={setupStyles.sheetHandle} />
          <View style={setupStyles.sheetHeader}>
            <View style={styles.flex}>
              <Text style={setupStyles.sheetTitle}>{title}</Text>
              <Text style={setupStyles.sheetDescription}>{description}</Text>
            </View>
            <Pressable
              accessibilityLabel="Close options"
              hitSlop={10}
              onPress={onClose}
              style={setupStyles.sheetClose}
            >
              <DunaIcon
                color={setupStyles.iconColor.color}
                name="close"
                size={20}
              />
            </Pressable>
          </View>
          <View style={setupStyles.sheetOptionList}>
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  key={option.value}
                  onPress={() => {
                    onSelect(option.value);
                    onClose();
                  }}
                  style={[
                    setupStyles.sheetOption,
                    selected && setupStyles.sheetOptionSelected,
                  ]}
                >
                  <View style={setupStyles.sheetOptionIcon}>
                    <DunaIcon
                      color={setupStyles.iconColor.color}
                      name={option.icon}
                    />
                  </View>
                  <View style={styles.flex}>
                    <Text style={setupStyles.sheetOptionTitle}>
                      {option.label}
                    </Text>
                    <Text style={setupStyles.sheetOptionDetail}>
                      {option.detail}
                    </Text>
                  </View>
                  <View
                    style={[
                      setupStyles.radio,
                      selected && setupStyles.radioSelected,
                    ]}
                  >
                    {selected && (
                      <DunaIcon
                        color={setupStyles.selectedIconColor.color}
                        name="check"
                        size={14}
                        strokeWidth={2.25}
                      />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CaptureSetupForm({
  broadcast,
  client,
  form,
  mode,
  onCancel,
  onChange,
  onContinue,
  onCreateMatch,
  onYoutubeConnectionsChanged,
  theme,
}: {
  readonly broadcast?: VideoStudioData["broadcast"];
  readonly client?: DunaApiClient;
  readonly form: CaptureForm;
  readonly mode: "live" | "record";
  readonly onCancel: () => void;
  readonly onChange: (form: CaptureForm) => void;
  readonly onContinue: () => void;
  readonly onCreateMatch?: () => void;
  readonly onYoutubeConnectionsChanged?: () => Promise<void>;
  readonly theme: DunaTheme;
}) {
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<CaptureSetupSheet>();
  const [linkingYoutube, setLinkingYoutube] = useState(false);
  const [disconnectingYoutubeId, setDisconnectingYoutubeId] =
    useState<string>();
  const [youtubeNotice, setYoutubeNotice] = useState<string>();
  const tokens = useMemo(
    () => resolveDunaMobileTokens(theme, "athletic"),
    [theme],
  );
  const setupStyles = useMemo(
    () => createRecordingSetupStyles(tokens),
    [tokens],
  );
  const associationRequired =
    form.category === "event" || form.category === "match";
  const valid =
    form.title.trim().length >= 2 &&
    (!associationRequired || Boolean(form.association));
  const courtValue =
    form.courtLengthMeters === 16 && form.courtWidthMeters === 8
      ? "Full · 16×8m"
      : "Short · 12×6m";
  const netValue =
    form.netHeightMeters === 2.43
      ? "Men · 2.43m"
      : form.netHeightMeters === 2.24
        ? "Women · 2.24m"
        : "Juniors · 2.12m";

  const connectYoutube = async (scope: "personal" | "organization") => {
    if (!client || linkingYoutube) return;
    setLinkingYoutube(true);
    setYoutubeNotice(undefined);
    try {
      const connection =
        await client.player.beginYoutubeChannelConnection.mutate({
          scope,
          returnUrl: "duna://video",
        });
      const result = await WebBrowser.openAuthSessionAsync(
        connection.authorizationUrl,
        "duna://video",
      );
      if (result.type === "success") {
        const callback = new URL(result.url);
        if (callback.searchParams.get("youtube") === "connected") {
          setYoutubeNotice(
            callback.searchParams.get("channel")
              ? `${callback.searchParams.get("channel")} is connected.`
              : "YouTube channel connected.",
          );
          await onYoutubeConnectionsChanged?.();
        } else {
          setYoutubeNotice(
            callback.searchParams.get("reason") ||
              "YouTube did not finish connecting.",
          );
        }
      } else if (result.type !== "cancel") {
        setYoutubeNotice("YouTube did not finish connecting.");
      }
    } catch (error) {
      setYoutubeNotice(displayError(error));
    } finally {
      setLinkingYoutube(false);
    }
  };

  const disconnectYoutube = (
    connection: VideoStudioData["broadcast"]["youtube"]["connections"][number],
  ) => {
    if (!client || disconnectingYoutubeId) return;
    Alert.alert(
      `Disconnect ${connection.channelTitle}?`,
      "Duna will revoke its YouTube access. Existing YouTube videos are not deleted.",
      [
        { text: "Keep connected", style: "cancel" },
        {
          text: "Disconnect",
          style: "destructive",
          onPress: () => {
            setDisconnectingYoutubeId(connection.id);
            setYoutubeNotice(undefined);
            void client.player.disconnectYoutubeChannel
              .mutate({
                connectionId: connection.id,
                idempotencyKey: idempotencyKey(),
              })
              .then(async () => {
                onChange({
                  ...form,
                  youtubeConnectionIds: form.youtubeConnectionIds.filter(
                    (id) => id !== connection.id,
                  ),
                });
                setYoutubeNotice(`${connection.channelTitle} is disconnected.`);
                await onYoutubeConnectionsChanged?.();
              })
              .catch((error: unknown) => {
                setYoutubeNotice(displayError(error));
              })
              .finally(() => setDisconnectingYoutubeId(undefined));
          },
        },
      ],
    );
  };

  const applyAssociation = (association: VideoAssociation | undefined) => {
    if (!association) {
      onChange({ ...form, association: undefined });
      return;
    }
    onChange({
      ...form,
      association,
      title:
        !form.title.trim() || form.title === "Match recording"
          ? association.title
          : form.title,
      venue: association.venue ?? form.venue,
      courtWidthMeters:
        association.captureDefaults?.courtWidthMeters ?? form.courtWidthMeters,
      courtLengthMeters:
        association.captureDefaults?.courtLengthMeters ??
        form.courtLengthMeters,
      netHeightMeters:
        association.captureDefaults?.netHeightMeters ?? form.netHeightMeters,
      orientation: association.captureDefaults?.orientation ?? form.orientation,
    });
  };

  const changeCategory = (category: VideoCategory) => {
    onChange({
      ...form,
      category,
      association: undefined,
      recordingVisibility:
        category === "practice" ? "private" : form.recordingVisibility,
      publishedToProfile:
        category === "practice" ? false : form.publishedToProfile,
    });
  };

  const choiceSheet = (() => {
    switch (sheet) {
      case "orientation":
        return {
          description:
            "Landscape captures the full court. Duna opens the camera in the selected orientation.",
          onSelect: (value: string) =>
            onChange({ ...form, orientation: value as CaptureOrientation }),
          options: [
            {
              detail: "Best for a full court and Duna Vision",
              icon: "rotate" as const,
              label: "Landscape",
              value: "landscape",
            },
            {
              detail: "Best for vertical and social viewing",
              icon: "video" as const,
              label: "Portrait",
              value: "portrait",
            },
          ],
          title: "Orientation",
          value: form.orientation,
        };
      case "court":
        return {
          description:
            "Use the court dimensions being played. You can still refine the visible lines in the camera guide.",
          onSelect: (value: string) =>
            onChange({
              ...form,
              courtLengthMeters: value === "full" ? 16 : 12,
              courtWidthMeters: value === "full" ? 8 : 6,
            }),
          options: [
            {
              detail: "Regulation beach court",
              icon: "court" as const,
              label: "Full · 16×8m",
              value: "full",
            },
            {
              detail: "Junior or adapted play",
              icon: "court" as const,
              label: "Short · 12×6m",
              value: "short",
            },
          ],
          title: "Court",
          value: form.courtLengthMeters === 16 ? "full" : "short",
        };
      case "privacy":
        return {
          description:
            form.category === "practice"
              ? "Practice recordings begin private. You can publish them later from your library."
              : "You can change this later from your video library.",
          onSelect: (value: string) =>
            onChange({
              ...form,
              recordingVisibility: value as RecordingVisibility,
              publishedToProfile: value === "public" && form.publishedToProfile,
            }),
          options:
            form.category === "practice"
              ? [
                  {
                    detail: "Only you can find it",
                    icon: "lock" as const,
                    label: "Private",
                    value: "private",
                  },
                ]
              : [
                  {
                    detail: "Only you can find it",
                    icon: "lock" as const,
                    label: "Private",
                    value: "private",
                  },
                  {
                    detail: "Eligible for Duna pages",
                    icon: "eye" as const,
                    label: "Public",
                    value: "public",
                  },
                ],
          title: "Recording privacy",
          value: form.recordingVisibility,
        };
      case "audio":
        return {
          description:
            "Audio can help with review and match context. Turn it off for a silent recording.",
          onSelect: (value: string) =>
            onChange({ ...form, hasAudio: value === "on" }),
          options: [
            {
              detail: "Record court sound",
              icon: "microphone" as const,
              label: "Audio on",
              value: "on",
            },
            {
              detail: "Record video only",
              icon: "microphone" as const,
              label: "Audio off",
              value: "off",
            },
          ],
          title: "Audio",
          value: form.hasAudio ? "on" : "off",
        };
      default:
        return undefined;
    }
  })();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={setupStyles.safe}
    >
      <SafeAreaView
        edges={["bottom", "left", "right"]}
        style={setupStyles.safe}
      >
        <View
          style={[
            setupStyles.header,
            {
              minHeight: mobileGrid[12] + insets.top,
              paddingTop: insets.top,
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            hitSlop={10}
            onPress={onCancel}
            style={setupStyles.headerAction}
          >
            <Text style={setupStyles.headerActionText}>Cancel</Text>
          </Pressable>
          <Text style={setupStyles.headerTitle}>Duna Video</Text>
          <Pressable
            accessibilityLabel="Open recording details"
            onPress={() => setSheet("more")}
            style={setupStyles.headerIconButton}
          >
            <DunaIcon color={tokens.text1} name="settings" size={23} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={setupStyles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={setupStyles.heroCopy}>
            <Text style={setupStyles.eyebrow}>STEP 1 OF 2 · SETUP</Text>
            <Text style={setupStyles.displayTitle}>
              {mode === "live"
                ? "Set up your live stream."
                : "Set up your recording."}
            </Text>
            <Text style={setupStyles.intro}>
              Connect a game, confirm the camera essentials, then Duna will walk
              you through court alignment.
            </Text>
          </View>

          <View style={setupStyles.section}>
            <Text style={setupStyles.sectionLabel}>
              What are you capturing?
            </Text>
            <View style={setupStyles.segmentedControl}>
              {(["practice", "event", "match", "social"] as const).map(
                (category) => {
                  const selected = form.category === category;
                  return (
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      key={category}
                      onPress={() => changeCategory(category)}
                      style={[
                        setupStyles.segment,
                        selected && setupStyles.segmentSelected,
                      ]}
                    >
                      <Text
                        style={[
                          setupStyles.segmentText,
                          selected && setupStyles.segmentTextSelected,
                        ]}
                      >
                        {category[0]!.toUpperCase() + category.slice(1)}
                      </Text>
                    </Pressable>
                  );
                },
              )}
            </View>
          </View>

          <AssociationPicker
            category={form.category}
            client={client}
            onCreateMatch={onCreateMatch}
            onChange={applyAssociation}
            value={form.association}
          />

          <View style={setupStyles.section}>
            <Text style={setupStyles.sectionLabel}>Recording name</Text>
            <TextInput
              autoCapitalize="sentences"
              maxLength={180}
              onChangeText={(title) => onChange({ ...form, title })}
              placeholder={
                associationRequired
                  ? "Choose a game or add a name"
                  : "Morning practice · Court 2"
              }
              placeholderTextColor={tokens.text3}
              style={setupStyles.nameInput}
              value={form.title}
            />
          </View>

          <View style={setupStyles.settingGrid}>
            <CaptureSettingTile
              icon="rotate"
              label="Orientation"
              onPress={() => setSheet("orientation")}
              styles={setupStyles}
              value={
                form.orientation === "landscape" ? "Landscape" : "Portrait"
              }
            />
            <CaptureSettingTile
              icon="court"
              label="Court"
              onPress={() => setSheet("court")}
              styles={setupStyles}
              value={courtValue}
            />
            <CaptureSettingTile
              icon="lock"
              label="Visibility"
              onPress={() => setSheet("privacy")}
              styles={setupStyles}
              value={
                form.recordingVisibility === "private" ? "Private" : "Public"
              }
            />
            <CaptureSettingTile
              icon="microphone"
              label="Audio"
              onPress={() => setSheet("audio")}
              styles={setupStyles}
              value={form.hasAudio ? "On" : "Off"}
            />
          </View>

          {mode === "live" && (
            <View style={setupStyles.destinationSection}>
              <View style={setupStyles.destinationHeading}>
                <View style={setupStyles.detailsIcon}>
                  <DunaIcon color={tokens.text1} name="video" />
                </View>
                <View style={styles.flex}>
                  <Text style={setupStyles.sectionLabel}>
                    Simulcast to YouTube
                  </Text>
                  <Text style={setupStyles.destinationIntro}>
                    Duna stays the primary stream. Choose every YouTube channel
                    that should receive this match.
                  </Text>
                </View>
              </View>

              {!broadcast?.preferredProvider ? (
                <Text style={setupStyles.disclosureText}>
                  YouTube simulcast becomes available when a Duna live provider
                  is connected.
                </Text>
              ) : (
                <>
                  {broadcast.youtube.dunaChannel && (
                    <View style={setupStyles.advancedToggle}>
                      <View style={styles.flex}>
                        <Text style={setupStyles.advancedToggleTitle}>
                          {broadcast.youtube.dunaChannel.channelTitle}
                        </Text>
                        <Text style={setupStyles.advancedToggleBody}>
                          Duna’s official YouTube channel
                        </Text>
                      </View>
                      <Switch
                        accessibilityLabel={`Simulcast to ${broadcast.youtube.dunaChannel.channelTitle}`}
                        onValueChange={(simulcastToDunaYoutube) =>
                          onChange({ ...form, simulcastToDunaYoutube })
                        }
                        thumbColor={tokens.surface1}
                        trackColor={{
                          false: tokens.hairlineStrong,
                          true: tokens.buttonPrimaryBackground,
                        }}
                        value={form.simulcastToDunaYoutube}
                      />
                    </View>
                  )}

                  {broadcast.youtube.connections.map((connection) => {
                    const selected = form.youtubeConnectionIds.includes(
                      connection.id,
                    );
                    return (
                      <View
                        key={connection.id}
                        style={setupStyles.advancedToggle}
                      >
                        <View style={styles.flex}>
                          <Text style={setupStyles.advancedToggleTitle}>
                            {connection.channelTitle}
                          </Text>
                          <Text style={setupStyles.advancedToggleBody}>
                            {connection.scope === "organization"
                              ? "Organization YouTube channel"
                              : "Your YouTube channel"}
                            {connection.status === "error"
                              ? " · Reconnect required"
                              : ""}
                          </Text>
                        </View>
                        <View style={setupStyles.destinationControls}>
                          <Switch
                            accessibilityLabel={`Simulcast to ${connection.channelTitle}`}
                            disabled={connection.status === "error"}
                            onValueChange={(enabled) =>
                              onChange({
                                ...form,
                                youtubeConnectionIds: enabled
                                  ? [
                                      ...new Set([
                                        ...form.youtubeConnectionIds,
                                        connection.id,
                                      ]),
                                    ]
                                  : form.youtubeConnectionIds.filter(
                                      (id) => id !== connection.id,
                                    ),
                              })
                            }
                            thumbColor={tokens.surface1}
                            trackColor={{
                              false: tokens.hairlineStrong,
                              true: tokens.buttonPrimaryBackground,
                            }}
                            value={selected}
                          />
                          {(connection.scope === "personal" ||
                            broadcast.youtube
                              .canManageOrganizationConnections) && (
                            <Pressable
                              accessibilityLabel={`Disconnect ${connection.channelTitle}`}
                              accessibilityRole="button"
                              disabled={Boolean(disconnectingYoutubeId)}
                              hitSlop={mobileGrid[2]}
                              onPress={() => disconnectYoutube(connection)}
                              style={setupStyles.youtubeDisconnectButton}
                            >
                              {disconnectingYoutubeId === connection.id ? (
                                <ActivityIndicator
                                  color={tokens.text3}
                                  size="small"
                                />
                              ) : (
                                <DunaIcon
                                  color={tokens.text3}
                                  name="close"
                                  size={17}
                                />
                              )}
                            </Pressable>
                          )}
                        </View>
                      </View>
                    );
                  })}

                  {broadcast.youtube.linkingConfigured && (
                    <View style={setupStyles.youtubeActions}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={linkingYoutube}
                        onPress={() => void connectYoutube("personal")}
                        style={setupStyles.youtubeLinkButton}
                      >
                        {linkingYoutube ? (
                          <ActivityIndicator
                            color={tokens.text1}
                            size="small"
                          />
                        ) : (
                          <DunaIcon
                            color={tokens.text1}
                            name="plus"
                            size={19}
                          />
                        )}
                        <Text style={setupStyles.youtubeLinkButtonText}>
                          Link your YouTube
                        </Text>
                      </Pressable>
                      {broadcast.youtube.canManageOrganizationConnections && (
                        <Pressable
                          accessibilityRole="button"
                          disabled={linkingYoutube}
                          onPress={() => void connectYoutube("organization")}
                          style={setupStyles.youtubeLinkButton}
                        >
                          <DunaIcon
                            color={tokens.text1}
                            name="plus"
                            size={19}
                          />
                          <Text style={setupStyles.youtubeLinkButtonText}>
                            Link organization channel
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                  {youtubeNotice && (
                    <Text style={setupStyles.disclosureText}>
                      {youtubeNotice}
                    </Text>
                  )}
                </>
              )}
            </View>
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => setSheet("more")}
            style={setupStyles.detailsRow}
          >
            <View style={setupStyles.detailsIcon}>
              <DunaIcon color={tokens.text1} name="settings" />
            </View>
            <View style={styles.flex}>
              <Text style={setupStyles.detailsTitle}>Recording details</Text>
              <Text style={setupStyles.detailsBody}>
                {netValue}
                {form.venue?.name ? ` · ${form.venue.name}` : " · Add venue"}
              </Text>
            </View>
            <DunaIcon color={tokens.text3} name="chevron-right" size={19} />
          </Pressable>

          <View style={setupStyles.aiNote}>
            <DunaIcon color={tokens.gold} name="sparkles" size={22} />
            <Text style={setupStyles.aiNoteText}>
              Duna guides orientation, court alignment, scoreboard, and Watch
              scoring on the next step.
            </Text>
          </View>
        </ScrollView>

        <View style={setupStyles.footer}>
          {!valid && (
            <Text style={setupStyles.validationText}>
              {associationRequired && !form.association
                ? `Choose the ${form.category} this recording belongs to.`
                : "Add a recording name to continue."}
            </Text>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={!valid}
            onPress={onContinue}
            style={[
              setupStyles.continueButton,
              !valid && setupStyles.continueButtonDisabled,
            ]}
          >
            <Text style={setupStyles.continueText}>
              Continue to camera guide
            </Text>
            <DunaIcon
              color={tokens.buttonPrimaryForeground}
              name="arrow-right"
              size={24}
              strokeWidth={2}
            />
          </Pressable>
        </View>

        {choiceSheet && (
          <RecordingChoiceSheet
            description={choiceSheet.description}
            onClose={() => setSheet(undefined)}
            onSelect={choiceSheet.onSelect}
            options={choiceSheet.options}
            styles={setupStyles}
            title={choiceSheet.title}
            value={choiceSheet.value}
            visible={Boolean(sheet && sheet !== "more")}
          />
        )}

        <Modal
          animationType="slide"
          onRequestClose={() => setSheet(undefined)}
          presentationStyle="overFullScreen"
          statusBarTranslucent
          transparent
          visible={sheet === "more"}
        >
          <Pressable
            onPress={() => setSheet(undefined)}
            style={setupStyles.sheetBackdrop}
          >
            <Pressable
              accessibilityViewIsModal
              onPress={(event) => event.stopPropagation()}
              style={setupStyles.sheetTall}
            >
              <View style={setupStyles.sheetHandle} />
              <View style={setupStyles.sheetHeader}>
                <View style={styles.flex}>
                  <Text style={setupStyles.sheetTitle}>Recording details</Text>
                  <Text style={setupStyles.sheetDescription}>
                    These choices are remembered. Vision learning consent is
                    intentionally asked for every video.
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Close recording details"
                  onPress={() => setSheet(undefined)}
                  style={setupStyles.sheetClose}
                >
                  <DunaIcon color={tokens.text1} name="close" size={20} />
                </Pressable>
              </View>
              <ScrollView
                contentContainerStyle={setupStyles.advancedContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={setupStyles.section}>
                  <Text style={setupStyles.sectionLabel}>Recording name</Text>
                  <TextInput
                    autoCapitalize="sentences"
                    maxLength={180}
                    onChangeText={(title) => onChange({ ...form, title })}
                    placeholder="AVP qualifier · Court 2"
                    placeholderTextColor={tokens.text3}
                    style={setupStyles.nameInput}
                    value={form.title}
                  />
                </View>

                <MobilePlacePicker
                  baseUrl={dunaWebUrl}
                  label="Venue (optional)"
                  onChange={(venue) => onChange({ ...form, venue })}
                  value={form.venue}
                />

                <View style={setupStyles.section}>
                  <Text style={setupStyles.sectionLabel}>Net height</Text>
                  <View style={setupStyles.inlineChoices}>
                    {[
                      { label: "Men · 2.43m", value: 2.43 },
                      { label: "Women · 2.24m", value: 2.24 },
                      { label: "Juniors · 2.12m", value: 2.12 },
                    ].map((option) => {
                      const selected = form.netHeightMeters === option.value;
                      return (
                        <Pressable
                          accessibilityRole="radio"
                          accessibilityState={{ checked: selected }}
                          key={option.value}
                          onPress={() =>
                            onChange({
                              ...form,
                              netHeightMeters: option.value,
                            })
                          }
                          style={[
                            setupStyles.inlineChoice,
                            selected && setupStyles.inlineChoiceSelected,
                          ]}
                        >
                          <Text
                            style={[
                              setupStyles.inlineChoiceText,
                              selected && setupStyles.inlineChoiceTextSelected,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <Text style={setupStyles.disclosureText}>
                    Junior heights vary by age and division. Confirm the event
                    setting when it differs.
                  </Text>
                </View>

                {mode === "live" && (
                  <View style={setupStyles.advancedToggle}>
                    <View style={styles.flex}>
                      <Text style={setupStyles.advancedToggleTitle}>
                        Public live stream
                      </Text>
                      <Text style={setupStyles.advancedToggleBody}>
                        Turn off to make this stream link-only.
                      </Text>
                    </View>
                    <Switch
                      onValueChange={(isPublic) =>
                        onChange({
                          ...form,
                          liveVisibility: isPublic ? "public" : "link-only",
                        })
                      }
                      thumbColor={tokens.surface1}
                      trackColor={{
                        false: tokens.hairlineStrong,
                        true: tokens.buttonPrimaryBackground,
                      }}
                      value={form.liveVisibility === "public"}
                    />
                  </View>
                )}

                <View style={setupStyles.advancedToggle}>
                  <View style={styles.flex}>
                    <Text style={setupStyles.advancedToggleTitle}>
                      Help improve Duna Vision
                    </Text>
                    <Text style={setupStyles.advancedToggleBody}>
                      Share de-identified court geometry, a low-resolution setup
                      frame, and quality signals. Your full video stays private.
                    </Text>
                  </View>
                  <Switch
                    onValueChange={(contributeCalibration) =>
                      onChange({ ...form, contributeCalibration })
                    }
                    thumbColor={tokens.surface1}
                    trackColor={{
                      false: tokens.hairlineStrong,
                      true: tokens.buttonPrimaryBackground,
                    }}
                    value={form.contributeCalibration}
                  />
                </View>
              </ScrollView>
              <View style={setupStyles.sheetFooter}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSheet(undefined)}
                  style={setupStyles.sheetDoneButton}
                >
                  <Text style={setupStyles.sheetDoneText}>Done</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function createRecordingSetupStyles(
  tokens: ReturnType<typeof resolveDunaMobileTokens>,
) {
  return StyleSheet.create({
    safe: { backgroundColor: tokens.ground, flex: 1 },
    header: {
      alignItems: "center",
      backgroundColor: tokens.glassStrong,
      borderBottomColor: tokens.hairline,
      borderBottomWidth: mobileGrid.hairline,
      flexDirection: "row",
      minHeight: mobileGrid[12],
      paddingHorizontal: mobileControl.pageInset,
    },
    headerAction: {
      alignItems: "flex-start",
      justifyContent: "center",
      minHeight: mobileControl.minimumTarget,
      minWidth: mobileControl.minimumTarget,
    },
    headerActionText: { color: tokens.text1, fontSize: 16, fontWeight: "500" },
    headerTitle: {
      color: tokens.text1,
      flex: 1,
      fontSize: 17,
      fontWeight: "700",
      textAlign: "center",
    },
    headerIconButton: {
      alignItems: "center",
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairline,
      borderRadius: mobileControl.pillRadius,
      borderWidth: mobileGrid.hairline,
      height: mobileControl.iconButton,
      justifyContent: "center",
      width: mobileControl.iconButton,
    },
    content: {
      gap: mobileGrid[6],
      paddingBottom: 145,
      paddingHorizontal: mobileControl.pageInset,
      paddingTop: mobileGrid[6],
    },
    heroCopy: { gap: mobileGrid[2] },
    eyebrow: {
      color: tokens.gold,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.1,
    },
    displayTitle: {
      color: tokens.text1,
      fontSize: 32,
      fontWeight: "700",
      letterSpacing: -0.8,
      lineHeight: 37,
    },
    intro: { color: tokens.text3, fontSize: 16, lineHeight: 22 },
    section: { gap: mobileGrid[2] },
    sectionLabel: { color: tokens.text1, fontSize: 16, fontWeight: "700" },
    segmentedControl: {
      backgroundColor: tokens.inactiveFill,
      borderRadius: mobileControl.cardRadius,
      flexDirection: "row",
      minHeight: mobileControl.minimumTarget,
      padding: mobileGrid.half,
    },
    segment: {
      alignItems: "center",
      borderRadius: 17.5,
      flex: 1,
      justifyContent: "center",
      minHeight: mobileGrid[9],
      paddingHorizontal: mobileGrid[1],
    },
    segmentSelected: {
      backgroundColor: tokens.selectedFill,
      borderColor: tokens.hairline,
      borderWidth: mobileGrid.hairline,
    },
    segmentText: { color: tokens.text3, fontSize: 12, fontWeight: "500" },
    segmentTextSelected: { color: tokens.text1, fontWeight: "700" },
    nameInput: {
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairlineStrong,
      borderRadius: mobileControl.nestedRadius,
      borderWidth: mobileGrid.hairline,
      color: tokens.text1,
      fontSize: 16,
      minHeight: mobileControl.minimumTarget,
      paddingHorizontal: mobileGrid[3],
    },
    settingGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: mobileGrid[2],
    },
    destinationSection: {
      backgroundColor: tokens.inactiveFill,
      borderColor: tokens.hairline,
      borderRadius: mobileControl.cardRadius,
      borderWidth: mobileGrid.hairline,
      gap: mobileGrid[3],
      padding: mobileGrid[3],
    },
    destinationHeading: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: mobileGrid[3],
    },
    destinationIntro: {
      color: tokens.text3,
      fontSize: 13,
      lineHeight: 18,
      marginTop: mobileGrid[1],
    },
    youtubeActions: { gap: mobileGrid[2] },
    destinationControls: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileGrid[1],
    },
    youtubeDisconnectButton: {
      alignItems: "center",
      borderRadius: mobileControl.pillRadius,
      height: mobileControl.minimumTarget,
      justifyContent: "center",
      width: mobileControl.minimumTarget,
    },
    youtubeLinkButton: {
      alignItems: "center",
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairlineStrong,
      borderRadius: mobileControl.nestedRadius,
      borderWidth: mobileGrid.hairline,
      flexDirection: "row",
      gap: mobileGrid[2],
      justifyContent: "center",
      minHeight: mobileControl.minimumTarget,
      paddingHorizontal: mobileGrid[3],
    },
    youtubeLinkButtonText: {
      color: tokens.text1,
      fontSize: 14,
      fontWeight: "700",
    },
    settingTile: {
      alignItems: "stretch",
      backgroundColor: tokens.inactiveFill,
      borderColor: tokens.hairline,
      borderRadius: mobileControl.cardRadius,
      borderWidth: mobileGrid.hairline,
      flexBasis: "47%",
      flexGrow: 1,
      gap: mobileGrid[2],
      minHeight: mobileGrid[12] + mobileGrid[12],
      padding: mobileGrid[3],
    },
    settingTileHeader: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    settingIcon: {
      alignItems: "center",
      backgroundColor: tokens.surface1,
      borderRadius: mobileControl.nestedRadius,
      height: mobileGrid[9],
      justifyContent: "center",
      width: mobileGrid[9],
    },
    settingCopy: { flex: 1, gap: mobileGrid[1], minWidth: 0 },
    settingLabel: {
      color: tokens.text3,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.7,
      textTransform: "uppercase",
    },
    settingValue: { color: tokens.text1, fontSize: 15, fontWeight: "500" },
    detailsRow: {
      alignItems: "center",
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairline,
      borderRadius: mobileControl.cardRadius,
      borderWidth: mobileGrid.hairline,
      flexDirection: "row",
      gap: mobileGrid[3],
      minHeight: mobileGrid[10] + mobileGrid[5],
      padding: mobileGrid[3],
    },
    detailsIcon: {
      alignItems: "center",
      backgroundColor: tokens.sandUnderlay,
      borderRadius: mobileControl.nestedRadius,
      height: mobileGrid[9],
      justifyContent: "center",
      width: mobileGrid[9],
    },
    detailsTitle: { color: tokens.text1, fontSize: 16, fontWeight: "700" },
    detailsBody: {
      color: tokens.text3,
      fontSize: 13,
      lineHeight: 18,
      marginTop: mobileGrid[1],
    },
    aiNote: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: mobileGrid[2],
      paddingHorizontal: mobileGrid[2],
    },
    aiNoteText: { color: tokens.text3, flex: 1, fontSize: 13, lineHeight: 18 },
    footer: {
      backgroundColor: tokens.glassStrong,
      borderTopColor: tokens.hairline,
      borderTopWidth: mobileGrid.hairline,
      bottom: 0,
      gap: mobileGrid[2],
      left: 0,
      paddingBottom: mobileGrid[4],
      paddingHorizontal: mobileControl.pageInset,
      paddingTop: mobileGrid[3],
      position: "absolute",
      right: 0,
    },
    validationText: {
      color: tokens.flareText,
      fontSize: 12,
      lineHeight: 15,
      textAlign: "center",
    },
    continueButton: {
      alignItems: "center",
      backgroundColor: tokens.buttonPrimaryBackground,
      borderRadius: mobileControl.cardRadius,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: mobileControl.primaryTarget,
      paddingHorizontal: mobileGrid[4],
    },
    continueButtonDisabled: { opacity: 0.38 },
    continueText: {
      color: tokens.buttonPrimaryForeground,
      fontSize: 16,
      fontWeight: "700",
    },
    sheetBackdrop: {
      backgroundColor: tokens.scrim,
      flex: 1,
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: tokens.ground,
      borderTopLeftRadius: mobileControl.sheetRadius,
      borderTopRightRadius: mobileControl.sheetRadius,
      gap: mobileGrid[4],
      paddingBottom: mobileGrid[7],
      paddingHorizontal: mobileControl.pageInset,
      paddingTop: mobileGrid[2],
    },
    sheetTall: {
      backgroundColor: tokens.ground,
      borderTopLeftRadius: mobileControl.sheetRadius,
      borderTopRightRadius: mobileControl.sheetRadius,
      maxHeight: "88%",
      paddingTop: mobileGrid[2],
    },
    sheetHandle: {
      alignSelf: "center",
      backgroundColor: tokens.hairlineStrong,
      borderRadius: mobileControl.pillRadius,
      height: mobileGrid[1],
      width: mobileGrid[8],
    },
    sheetHeader: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: mobileGrid[3],
    },
    sheetTitle: { color: tokens.text1, fontSize: 24, fontWeight: "700" },
    sheetDescription: {
      color: tokens.text3,
      fontSize: 14,
      lineHeight: 20,
      marginTop: mobileGrid[1],
    },
    sheetClose: {
      alignItems: "center",
      backgroundColor: tokens.inactiveFill,
      borderRadius: mobileControl.pillRadius,
      height: mobileControl.minimumTarget,
      justifyContent: "center",
      width: mobileControl.minimumTarget,
    },
    sheetOptionList: { gap: mobileGrid[2] },
    sheetOption: {
      alignItems: "center",
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairline,
      borderRadius: mobileControl.cardRadius,
      borderWidth: mobileGrid.hairline,
      flexDirection: "row",
      gap: mobileGrid[3],
      minHeight: mobileGrid[12] + mobileGrid[3],
      padding: mobileGrid[3],
    },
    sheetOptionSelected: { borderColor: tokens.buttonPrimaryBackground },
    sheetOptionIcon: {
      alignItems: "center",
      backgroundColor: tokens.inactiveFill,
      borderRadius: mobileControl.nestedRadius,
      height: mobileGrid[9],
      justifyContent: "center",
      width: mobileGrid[9],
    },
    sheetOptionTitle: { color: tokens.text1, fontSize: 16, fontWeight: "700" },
    sheetOptionDetail: {
      color: tokens.text3,
      fontSize: 13,
      lineHeight: 18,
      marginTop: mobileGrid[1],
    },
    radio: {
      alignItems: "center",
      borderColor: tokens.hairlineStrong,
      borderRadius: mobileControl.pillRadius,
      borderWidth: 1.5,
      height: mobileGrid[5],
      justifyContent: "center",
      width: mobileGrid[5],
    },
    radioSelected: {
      backgroundColor: tokens.buttonPrimaryBackground,
      borderColor: tokens.buttonPrimaryBackground,
    },
    iconColor: { color: tokens.text1 },
    mutedIconColor: { color: tokens.text3 },
    selectedIconColor: { color: tokens.buttonPrimaryForeground },
    advancedContent: {
      gap: mobileGrid[5],
      paddingBottom: mobileGrid[4],
      paddingHorizontal: mobileControl.pageInset,
      paddingTop: mobileGrid[4],
    },
    inlineChoices: { gap: mobileGrid[2] },
    inlineChoice: {
      alignItems: "center",
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairlineStrong,
      borderRadius: mobileControl.nestedRadius,
      borderWidth: mobileGrid.hairline,
      justifyContent: "center",
      minHeight: mobileControl.minimumTarget,
      paddingHorizontal: mobileGrid[3],
    },
    inlineChoiceSelected: {
      backgroundColor: tokens.buttonPrimaryBackground,
      borderColor: tokens.buttonPrimaryBackground,
    },
    inlineChoiceText: { color: tokens.text1, fontSize: 14, fontWeight: "500" },
    inlineChoiceTextSelected: {
      color: tokens.buttonPrimaryForeground,
      fontWeight: "700",
    },
    disclosureText: { color: tokens.text3, fontSize: 12, lineHeight: 17 },
    advancedToggle: {
      alignItems: "center",
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairline,
      borderRadius: mobileControl.cardRadius,
      borderWidth: mobileGrid.hairline,
      flexDirection: "row",
      gap: mobileGrid[3],
      minHeight: mobileGrid[12] + mobileGrid[4],
      padding: mobileGrid[3],
    },
    advancedToggleTitle: {
      color: tokens.text1,
      fontSize: 15,
      fontWeight: "700",
    },
    advancedToggleBody: {
      color: tokens.text3,
      fontSize: 12,
      lineHeight: 17,
      marginTop: mobileGrid[1],
    },
    sheetFooter: {
      borderTopColor: tokens.hairline,
      borderTopWidth: mobileGrid.hairline,
      paddingBottom: mobileGrid[5],
      paddingHorizontal: mobileControl.pageInset,
      paddingTop: mobileGrid[3],
    },
    sheetDoneButton: {
      alignItems: "center",
      backgroundColor: tokens.buttonPrimaryBackground,
      borderRadius: mobileControl.cardRadius,
      justifyContent: "center",
      minHeight: mobileControl.primaryTarget,
    },
    sheetDoneText: {
      color: tokens.buttonPrimaryForeground,
      fontSize: 16,
      fontWeight: "700",
    },
  });
}

function AssociationPicker({
  category,
  client,
  onCreateMatch,
  onChange,
  value,
}: {
  readonly category: VideoCategory;
  readonly client?: DunaApiClient;
  readonly onCreateMatch?: () => void;
  readonly value?: VideoAssociation;
  readonly onChange: (value: VideoAssociation | undefined) => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<readonly VideoAssociation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!client || (category !== "event" && category !== "match")) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(
      () => {
        setLoading(true);
        void client.player.videoAssociations
          .query({ query })
          .then((results) => {
            if (!cancelled) {
              setOptions(
                results
                  .filter((option) => option.type === category)
                  .slice(0, 12),
              );
            }
          })
          .finally(() => {
            if (!cancelled) setLoading(false);
          });
      },
      query ? 280 : 0,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [category, client, query]);

  if (category !== "event" && category !== "match") return null;
  const scheduledMatches =
    category === "match"
      ? options.filter((option) => option.associated).slice(0, 3)
      : [];

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {category === "match" ? "Which match?" : "Which event?"}
      </Text>
      {value ? (
        <View style={styles.selectedAssociation}>
          <View style={styles.flex}>
            <Text style={styles.associationTitle}>{value.title}</Text>
            <Text style={styles.associationMeta}>{value.subtitle}</Text>
          </View>
          <Pressable onPress={() => onChange(undefined)}>
            <Text style={styles.textAction}>Change</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {category === "match" && onCreateMatch && (
            <Pressable
              onPress={onCreateMatch}
              style={styles.createMatchInlineButton}
            >
              <Text style={styles.createMatchInlineText}>
                + Create a new match
              </Text>
            </Pressable>
          )}
          {scheduledMatches.length > 0 && (
            <View style={styles.scheduledAssociationSection}>
              <View style={styles.scheduledAssociationHeading}>
                <View style={styles.flex}>
                  <Text style={styles.scheduledAssociationEyebrow}>
                    YOUR SCHEDULE
                  </Text>
                  <Text style={styles.scheduledAssociationTitle}>
                    Today + next scheduled match
                  </Text>
                </View>
                <Text style={styles.scheduledAssociationHint}>TAP TO LINK</Text>
              </View>
              {scheduledMatches.map((option) => (
                <Pressable
                  key={`scheduled-${option.id}`}
                  onPress={() => onChange(option)}
                  style={styles.scheduledAssociationCard}
                >
                  <View style={styles.scheduledAssociationDot} />
                  <View style={styles.flex}>
                    <Text style={styles.associationTitle}>{option.title}</Text>
                    <Text style={styles.associationMeta}>
                      {option.subtitle}
                    </Text>
                  </View>
                  <Text style={styles.textAction}>Select</Text>
                </Pressable>
              ))}
            </View>
          )}
          <TextInput
            autoCapitalize="words"
            onChangeText={setQuery}
            placeholder={`Search ${category === "match" ? "teams, event, or match" : "events"}`}
            placeholderTextColor="#98a2b3"
            style={styles.input}
            value={query}
          />
          {loading && <ActivityIndicator color={palette.aqua} />}
          <View style={styles.optionList}>
            {options.map((option) => (
              <Pressable
                key={option.id}
                onPress={() => onChange(option)}
                style={styles.option}
              >
                <View style={styles.flex}>
                  <Text style={styles.associationTitle}>{option.title}</Text>
                  <Text style={styles.associationMeta}>{option.subtitle}</Text>
                </View>
                {option.associated && (
                  <Text style={styles.yoursBadge}>YOURS</Text>
                )}
              </Pressable>
            ))}
            {!loading && options.length === 0 && (
              <View style={styles.matchEmptyState}>
                <Text style={styles.helper}>
                  Search all Duna events. Your registrations appear first.
                </Text>
              </View>
            )}
          </View>
        </>
      )}
    </View>
  );
}

type QuickMatchParticipant =
  | { readonly kind: "duna"; readonly person: PersonSummary }
  | ProvisionalParticipant;

function QuickRecordingMatchSetup({
  client,
  host,
  onCancel,
  onCreated,
  venue,
}: {
  readonly client: DunaApiClient;
  readonly host: PersonSummary;
  readonly onCancel: () => void;
  readonly onCreated: (association: VideoAssociation) => void;
  readonly venue?: VenueSelection;
}) {
  const [players, setPlayers] = useState<
    readonly (QuickMatchParticipant | undefined)[]
  >([undefined, undefined, undefined]);
  const [pickerTarget, setPickerTarget] = useState<number>();
  const [guestTarget, setGuestTarget] = useState<number>();
  const [guestGivenName, setGuestGivenName] = useState("");
  const [guestFamilyName, setGuestFamilyName] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const quickPlayerName = (participant: QuickMatchParticipant | undefined) =>
    participant?.kind === "duna"
      ? participant.person.displayName
      : participant
        ? `${participant.givenName} ${participant.familyName}`
        : undefined;
  const rosterComplete = players.every(Boolean);

  const create = async () => {
    const [partner, opponentA, opponentB] = players;
    if (!partner || !opponentA || !opponentB || !consent || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      let deviceId = await AsyncStorage.getItem(videoMatchDeviceKey);
      if (!deviceId) {
        deviceId = `video-${Crypto.randomUUID()}`;
        await AsyncStorage.setItem(videoMatchDeviceKey, deviceId);
      }
      const teamAIds = [
        host.id,
        ...(partner.kind === "duna" ? [partner.person.id] : []),
      ];
      const teamBIds = [opponentA, opponentB].flatMap((participant) =>
        participant.kind === "duna" ? [participant.person.id] : [],
      );
      const provisionalParticipants = [
        { participant: partner, side: "A" as const },
        { participant: opponentA, side: "B" as const },
        { participant: opponentB, side: "B" as const },
      ].flatMap(({ participant, side }) =>
        participant.kind === "provisional"
          ? [
              {
                side,
                givenName: participant.givenName,
                familyName: participant.familyName,
                email: participant.email,
                phoneE164: participant.phoneE164,
              },
            ]
          : [],
      );
      const scoring = await client.player.startMatch.mutate({
        teamAIds,
        teamBIds,
        provisionalParticipants,
        venueId: venue?.venueId,
        scoringSystem: "rally",
        matchType: "competitive",
        allPlayersAgreedToRecord: true,
        serviceOrder: { A: teamAIds, B: teamBIds },
        initialServerPersonId: host.id,
        deviceId,
        idempotencyKey: idempotencyKey(),
      });
      if (scoring.participantClaims?.shareUrl) {
        const shareUrl = scoring.participantClaims.shareUrl;
        Alert.alert(
          "Guest claim link ready",
          "The match stays private and unrated until every guest claims their place.",
          [
            { text: "Share later", style: "cancel" },
            {
              text: "Share now",
              onPress: () =>
                void Share.share({
                  message: `Claim your player place in our Duna match.\n${shareUrl}`,
                  url: shareUrl,
                }),
            },
          ],
        );
      }
      onCreated({
        type: "match",
        id: scoring.matchId,
        title: `${scoring.teamA.name} vs ${scoring.teamB.name}`,
        subtitle: `Live scoring · ${scoring.venueName}`,
        associated: true,
        venue,
        captureDefaults: {
          courtWidthMeters: 8,
          courtLengthMeters: 16,
          netHeightMeters: 2.43,
          orientation: "landscape",
        },
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  };

  if (pickerTarget !== undefined) {
    return (
      <PlayerPickerModal
        embedded
        excludedPersonIds={[
          host.id,
          ...players.flatMap((participant, index) =>
            index !== pickerTarget && participant?.kind === "duna"
              ? [participant.person.id]
              : [],
          ),
        ]}
        maxSelected={1}
        onAddProvisional={() => {
          setGuestTarget(pickerTarget);
          setPickerTarget(undefined);
        }}
        onChange={(selected) => {
          const person = selected[0];
          if (!person) return;
          setPlayers((current) =>
            current.map((participant, index) =>
              index === pickerTarget ? { kind: "duna", person } : participant,
            ),
          );
        }}
        onClose={() => setPickerTarget(undefined)}
        palette={importedPlayerPalette}
        selected={
          players[pickerTarget]?.kind === "duna"
            ? [players[pickerTarget].person]
            : []
        }
        title={
          pickerTarget === 0
            ? "Choose your partner"
            : `Choose opponent ${pickerTarget}`
        }
        visible
      />
    );
  }

  if (guestTarget !== undefined) {
    const saveGuest = () => {
      const givenName = guestGivenName.trim();
      const familyName = guestFamilyName.trim();
      if (!givenName || !familyName) {
        setError("Add the guest's first and last name.");
        return;
      }
      setPlayers((current) =>
        current.map((participant, index) =>
          index === guestTarget
            ? {
                kind: "provisional",
                id: Crypto.randomUUID(),
                givenName,
                familyName,
              }
            : participant,
        ),
      );
      setGuestGivenName("");
      setGuestFamilyName("");
      setGuestTarget(undefined);
      setError(undefined);
    };
    return (
      <SafeAreaView style={styles.quickMatchSafe}>
        <View style={styles.quickMatchHeader}>
          <Pressable
            onPress={() => setGuestTarget(undefined)}
            style={styles.headerTap}
          >
            <Text style={styles.headerAction}>Back</Text>
          </Pressable>
          <Text style={styles.modalTitle}>Add guest</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.quickMatchContent}>
          <Text style={styles.formTitle}>Who is playing?</Text>
          <Text style={styles.formIntro}>
            No email or phone is required. Duna will create one share link so
            they can claim and correct their player place later.
          </Text>
          <TextInput
            autoCapitalize="words"
            onChangeText={setGuestGivenName}
            placeholder="First name"
            placeholderTextColor="#98a2b3"
            style={styles.input}
            value={guestGivenName}
          />
          <TextInput
            autoCapitalize="words"
            onChangeText={setGuestFamilyName}
            placeholder="Last name"
            placeholderTextColor="#98a2b3"
            style={styles.input}
            value={guestFamilyName}
          />
          {!!error && <Text style={styles.errorText}>{error}</Text>}
        </ScrollView>
        <View style={styles.modalFooter}>
          <Pressable onPress={saveGuest} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Add guest player</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.quickMatchSafe}>
      <View style={styles.quickMatchHeader}>
        <Pressable onPress={onCancel} style={styles.headerTap}>
          <Text style={styles.headerAction}>Cancel</Text>
        </Pressable>
        <Text style={styles.modalTitle}>New match</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.quickMatchContent}>
        <View style={styles.formHero}>
          <Text style={styles.formStep}>RECORD + SCORE</Text>
          <Text style={styles.formTitle}>Create the match first.</Text>
          <Text style={styles.formIntro}>
            The recording, second-screen scoreboard, Watch events, and replay
            markers will all share this match timeline.
          </Text>
        </View>
        <View style={styles.quickMatchTeams}>
          <View style={styles.quickMatchTeamCard}>
            <Text style={styles.quickMatchTeamLabel}>YOUR TEAM</Text>
            <Text style={styles.quickMatchPlayer}>{host.displayName}</Text>
            <Text style={styles.quickMatchPlayer}>
              {quickPlayerName(players[0]) ?? "Choose your partner"}
            </Text>
          </View>
          <View style={styles.quickMatchTeamCard}>
            <Text style={styles.quickMatchTeamLabel}>OPPONENTS</Text>
            <Text style={styles.quickMatchPlayer}>
              {quickPlayerName(players[1]) ?? "Choose opponent"}
            </Text>
            <Text style={styles.quickMatchPlayer}>
              {quickPlayerName(players[2]) ?? "Choose opponent"}
            </Text>
          </View>
        </View>
        {["Partner", "Opponent 1", "Opponent 2"].map((label, index) => (
          <Pressable
            key={label}
            onPress={() => setPickerTarget(index)}
            style={styles.quickMatchChoose}
          >
            <View style={styles.flex}>
              <Text style={styles.quickMatchChooseText}>{label}</Text>
              <Text style={styles.quickMatchPlayer}>
                {quickPlayerName(players[index]) ??
                  "Choose a Duna player or add a guest"}
              </Text>
            </View>
            <Text style={styles.textAction}>
              {players[index] ? "Change" : "Add"}
            </Text>
          </Pressable>
        ))}
        <View style={styles.quickMatchConsent}>
          <View style={styles.flex}>
            <Text style={styles.quickMatchConsentTitle}>
              Everyone agreed to be recorded
            </Text>
            <Text style={styles.quickMatchConsentBody}>
              Confirm with all four players before creating this recorded match.
            </Text>
          </View>
          <Switch onValueChange={setConsent} value={consent} />
        </View>
        {!!error && <Text style={styles.errorText}>{error}</Text>}
      </ScrollView>
      <View style={styles.modalFooter}>
        <Pressable
          disabled={busy || !rosterComplete || !consent}
          onPress={() => void create()}
          style={[
            styles.primaryButton,
            (busy || !rosterComplete || !consent) && styles.disabled,
          ]}
        >
          {busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>Create + link match</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function ImportedVisionSetupCard({
  loading,
  onChange,
  onEditCourt,
  onIdentifyPlayers,
  setup,
}: {
  readonly loading: boolean;
  readonly setup?: ImportedVisionSetup;
  readonly onChange: (setup: ImportedVisionSetup) => void;
  readonly onEditCourt: () => void;
  readonly onIdentifyPlayers: () => void;
}) {
  const courtFrame = frameForId(setup, setup?.courtFrameId);
  const playerFrame = frameForId(setup, setup?.playerFrameId);
  const frames = setup?.frames ?? [];
  const update = (partial: Partial<ImportedVisionSetup>) => {
    if (!setup) return;
    onChange({ ...setup, ...partial });
  };
  return (
    <View style={styles.importedVisionCard}>
      <View style={styles.importedVisionHeading}>
        <View style={styles.importedVisionMark}>
          <Text style={styles.importedVisionMarkText}>✦</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.importedVisionEyebrow}>DUNA VISION SETUP</Text>
          <Text style={styles.importedVisionTitle}>
            Make the analysis fit this video.
          </Text>
        </View>
      </View>
      <Text style={styles.importedVisionBody}>
        Duna sampled clear moments across this recording on your iPhone. Pick
        only what helps: a court view and player hints are optional.
      </Text>

      {loading ? (
        <View style={styles.importedVisionLoading}>
          <ActivityIndicator color={palette.aqua} />
          <Text style={styles.importedVisionLoadingText}>
            Finding useful court and player views…
          </Text>
        </View>
      ) : frames.length > 0 ? (
        <>
          <Text style={styles.importedVisionLabel}>
            COURT + NET · TAP THE BEST VIEW
          </Text>
          <ScrollView
            contentContainerStyle={styles.importedFrameRail}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {frames.map((frame) => {
              const selected = courtFrame?.id === frame.id;
              return (
                <Pressable
                  accessibilityLabel={`Use ${formatClock(frame.timestampSeconds)} for court setup`}
                  key={`court-${frame.id}`}
                  onPress={() => update({ courtFrameId: frame.id })}
                  style={[
                    styles.importedFrame,
                    selected && styles.importedFrameSelected,
                  ]}
                >
                  <Image
                    source={{
                      uri: `data:image/jpeg;base64,${frame.jpegBase64}`,
                    }}
                    style={styles.importedFrameImage}
                  />
                  <Text style={styles.importedFrameTime}>
                    {formatClock(frame.timestampSeconds)}
                  </Text>
                  {selected && (
                    <View style={styles.importedFrameCheck}>
                      <Text style={styles.importedFrameCheckText}>✓</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable
            disabled={!courtFrame}
            onPress={onEditCourt}
            style={[
              styles.importedVisionAction,
              !courtFrame && styles.disabled,
            ]}
          >
            <Text style={styles.importedVisionActionText}>
              {setup?.geometry
                ? "Refine court + net"
                : "Mark court + net (optional)"}
            </Text>
            <Text style={styles.importedVisionActionArrow}>›</Text>
          </Pressable>

          <Text style={styles.importedVisionLabel}>
            PLAYERS · OPTIONAL PRIVATE HINT
          </Text>
          <ScrollView
            contentContainerStyle={styles.importedFrameRail}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {frames.map((frame) => {
              const selected = playerFrame?.id === frame.id;
              return (
                <Pressable
                  accessibilityLabel={`Use ${formatClock(frame.timestampSeconds)} for player hints`}
                  key={`players-${frame.id}`}
                  onPress={() => update({ playerFrameId: frame.id })}
                  style={[
                    styles.importedFrame,
                    selected && styles.importedFrameSelected,
                  ]}
                >
                  <Image
                    source={{
                      uri: `data:image/jpeg;base64,${frame.jpegBase64}`,
                    }}
                    style={styles.importedFrameImage}
                  />
                  <Text style={styles.importedFrameTime}>
                    {frame.playerCount > 0
                      ? `${frame.playerCount} seen · ${formatClock(frame.timestampSeconds)}`
                      : formatClock(frame.timestampSeconds)}
                  </Text>
                  {selected && (
                    <View style={styles.importedFrameCheck}>
                      <Text style={styles.importedFrameCheckText}>✓</Text>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable
            onPress={onIdentifyPlayers}
            style={styles.importedVisionAction}
          >
            <Text style={styles.importedVisionActionText}>
              {setup?.players.length
                ? `${setup.players.length} player${setup.players.length === 1 ? "" : "s"} identified`
                : "Identify players (optional)"}
            </Text>
            <Text style={styles.importedVisionActionArrow}>›</Text>
          </Pressable>
        </>
      ) : (
        <Text style={styles.importedVisionUnavailable}>
          Duna could not make a useful filmstrip from this format. You can still
          set the court size and net height below, or upload now.
        </Text>
      )}
      <Text style={styles.importedVisionPrivacy}>
        Selected moments and player tags are private analysis instructions for
        this video—not identity-model training.
      </Text>
    </View>
  );
}

function VideoDetailsForm({
  broadcast,
  client,
  form,
  importedVision,
  importedVisionLoading,
  mode,
  onCreateMatch,
  onCancel,
  onChange,
  onContinue,
  onEditImportedCourt,
  onIdentifyImportedPlayers,
  onImportedVisionChange,
  onYoutubeConnectionsChanged,
  preparedVideo,
  foregroundOnlyUpload,
  theme,
}: {
  readonly broadcast?: VideoStudioData["broadcast"];
  readonly client?: DunaApiClient;
  readonly form: CaptureForm;
  readonly importedVision?: ImportedVisionSetup;
  readonly importedVisionLoading: boolean;
  readonly mode: "live" | "record" | "upload";
  readonly preparedVideo?: PreparedVideo;
  readonly onCreateMatch?: () => void;
  readonly onChange: (form: CaptureForm) => void;
  readonly onCancel: () => void;
  readonly onContinue: () => void;
  readonly onEditImportedCourt: () => void;
  readonly onIdentifyImportedPlayers: () => void;
  readonly onImportedVisionChange: (setup: ImportedVisionSetup) => void;
  readonly onYoutubeConnectionsChanged?: () => Promise<void>;
  readonly foregroundOnlyUpload: boolean;
  readonly theme: DunaTheme;
}) {
  if (mode === "live" || mode === "record") {
    return (
      <CaptureSetupForm
        broadcast={broadcast}
        client={client}
        form={form}
        mode={mode}
        onCancel={onCancel}
        onChange={onChange}
        onContinue={onContinue}
        onCreateMatch={onCreateMatch}
        onYoutubeConnectionsChanged={onYoutubeConnectionsChanged}
        theme={theme}
      />
    );
  }

  const associationRequired =
    form.category === "event" || form.category === "match";
  const valid =
    form.title.trim().length >= 2 &&
    (!associationRequired || Boolean(form.association));
  const applyAssociation = (association: VideoAssociation | undefined) => {
    if (!association) {
      onChange({ ...form, association: undefined });
      return;
    }
    onChange({
      ...form,
      association,
      title: form.title.trim() || association.title,
      venue: association.venue ?? form.venue,
      courtWidthMeters:
        association.captureDefaults?.courtWidthMeters ?? form.courtWidthMeters,
      courtLengthMeters:
        association.captureDefaults?.courtLengthMeters ??
        form.courtLengthMeters,
      netHeightMeters:
        association.captureDefaults?.netHeightMeters ?? form.netHeightMeters,
      orientation: association.captureDefaults?.orientation ?? form.orientation,
    });
  };
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.modalSafe}
    >
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Pressable hitSlop={12} onPress={onCancel} style={styles.headerTap}>
            <Text style={styles.headerAction}>Cancel</Text>
          </Pressable>
          <Text style={styles.modalTitle}>Duna Video</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.formHero}>
            <Text style={styles.formStep}>VIDEO DETAILS</Text>
            <Text style={styles.formTitle}>Give this video a home.</Text>
            <Text style={styles.formIntro}>
              Confirm the essentials once; Duna will keep uploading and
              processing while you use the rest of the app.
            </Text>
          </View>

          {preparedVideo && (
            <View style={styles.fileSummary}>
              <View style={styles.fileSummaryIcon}>
                <Text style={styles.fileSummaryIconText}>✓</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.fileSummaryTitle}>Video ready</Text>
                <Text style={styles.helper}>
                  {formatDuration(preparedVideo.durationSeconds)} ·{" "}
                  {formatBytes(preparedVideo.bytes)} · MP4
                </Text>
                {mode === "upload" && (
                  <Text style={styles.importedVideoNote}>
                    Imported video · Duna can process it, but it was not
                    captured with on-court Duna Vision calibration.
                  </Text>
                )}
              </View>
            </View>
          )}

          {mode === "upload" && (
            <ImportedVisionSetupCard
              loading={importedVisionLoading}
              onChange={onImportedVisionChange}
              onEditCourt={onEditImportedCourt}
              onIdentifyPlayers={onIdentifyImportedPlayers}
              setup={importedVision}
            />
          )}

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Title</Text>
            <Text style={styles.fieldDescription}>
              Make it recognizable in your archive and on a match page.
            </Text>
            <TextInput
              autoCapitalize="sentences"
              maxLength={180}
              onChangeText={(title) => onChange({ ...form, title })}
              placeholder="AVP qualifier · Court 2"
              placeholderTextColor="#8b96a7"
              style={styles.input}
              value={form.title}
            />
          </View>

          <ChoiceRow
            body="This controls where Duna files the video and which defaults it uses."
            label="What are you capturing?"
            onChange={(category) =>
              onChange({
                ...form,
                category,
                association: undefined,
                recordingVisibility:
                  category === "practice"
                    ? "private"
                    : form.recordingVisibility,
                publishedToProfile:
                  category === "practice" ? false : form.publishedToProfile,
              })
            }
            options={[
              {
                label: "Practice",
                value: "practice",
                body: "Private archive by default",
              },
              {
                label: "Event",
                value: "event",
                body: "Connect to event history",
              },
              {
                label: "Match",
                value: "match",
                body: "Show on the match page",
                recommended: true,
              },
              {
                label: "Social",
                value: "social",
                body: "A moment beyond competition",
              },
            ]}
            value={form.category}
          />

          <AssociationPicker
            category={form.category}
            client={client}
            onCreateMatch={onCreateMatch}
            onChange={applyAssociation}
            value={form.association}
          />

          <MobilePlacePicker
            baseUrl={dunaWebUrl}
            label="Venue (optional)"
            onChange={(venue) => onChange({ ...form, venue })}
            value={form.venue}
          />

          {form.category === "practice" ? (
            <View style={styles.privatePracticeCard}>
              <View style={styles.privateIcon}>
                <Text style={styles.privateIconText}>✓</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.toggleTitle}>Practice starts private</Text>
                <Text style={styles.toggleBody}>
                  It goes to your private archive. You can publish it later.
                </Text>
              </View>
            </View>
          ) : (
            <ChoiceRow
              body="You can change this later from your archive."
              label="Recording privacy"
              onChange={(recordingVisibility) =>
                onChange({
                  ...form,
                  recordingVisibility,
                  publishedToProfile:
                    recordingVisibility === "public" && form.publishedToProfile,
                })
              }
              options={[
                {
                  label: "Keep private",
                  value: "private",
                  body: "Only you can find it",
                },
                {
                  label: "Public",
                  value: "public",
                  body: "Eligible for Duna pages",
                },
              ]}
              value={form.recordingVisibility}
            />
          )}

          {mode === "upload" && form.recordingVisibility === "public" && (
            <ToggleRow
              body="Show it in the public video section on your player profile."
              label="Publish to profile"
              onChange={(publishedToProfile) =>
                onChange({ ...form, publishedToProfile })
              }
              value={form.publishedToProfile}
            />
          )}

          <ToggleRow
            body="Turn this off for a silent stream or recording."
            label="Include audio"
            onChange={(hasAudio) => onChange({ ...form, hasAudio })}
            value={form.hasAudio}
          />

          <ToggleRow
            body="Share de-identified court geometry, a low-resolution setup frame, and quality signals to improve Duna Vision’s court guidance and video-analysis models. Your full video stays private. Nothing is used for model training without reviewed approval."
            label="Help improve Duna Vision"
            onChange={(contributeCalibration) =>
              onChange({ ...form, contributeCalibration })
            }
            value={form.contributeCalibration}
          />

          <>
            <ChoiceRow
              body={
                mode === "upload"
                  ? "Tell Duna how this video was framed. Landscape usually gives Vision more court context."
                  : "We guide you if the iPhone is held the wrong way. Landscape captures more of a full court."
              }
              label={
                mode === "upload"
                  ? "How was this video framed?"
                  : "How will you hold the phone?"
              }
              onChange={(orientation) => onChange({ ...form, orientation })}
              options={[
                {
                  label: "Landscape",
                  value: "landscape",
                  body: "Best for full-court video",
                  recommended: true,
                },
                {
                  label: "Portrait",
                  value: "portrait",
                  body: "Best for social viewing",
                },
              ]}
              value={form.orientation}
            />
            <ChoiceRow
              body="Official beach is 16 × 8 meters. Short court is useful for junior or adapted play."
              label="Court"
              onChange={(court) =>
                onChange({
                  ...form,
                  courtLengthMeters: court === "full" ? 16 : 12,
                  courtWidthMeters: court === "full" ? 8 : 6,
                })
              }
              options={[
                { label: "Full · 16×8m", value: "full" },
                { label: "Short · 12×6m", value: "short" },
              ]}
              value={form.courtLengthMeters === 16 ? "full" : "short"}
            />
            <ChoiceRow
              body="Match settings are applied automatically when Duna has them."
              label="Net height"
              onChange={(net) =>
                onChange({
                  ...form,
                  netHeightMeters:
                    net === "men" ? 2.43 : net === "women" ? 2.24 : 2.12,
                })
              }
              options={[
                { label: "Men · 2.43m", value: "men" },
                { label: "Women · 2.24m", value: "women" },
                { label: "Juniors · 2.12m", value: "juniors" },
              ]}
              value={
                form.netHeightMeters === 2.43
                  ? "men"
                  : form.netHeightMeters === 2.24
                    ? "women"
                    : "juniors"
              }
            />
            <Text style={styles.disclosure}>
              Junior net heights vary by age and division. Confirm the event’s
              setting when it differs from this default.
            </Text>
          </>
        </ScrollView>
        <View style={styles.modalFooter}>
          <Pressable
            accessibilityRole="button"
            disabled={!valid}
            onPress={onContinue}
            style={[styles.primaryButton, !valid && styles.disabled]}
          >
            <Text style={styles.primaryButtonText}>
              {mode === "upload"
                ? foregroundOnlyUpload
                  ? "Start foreground upload"
                  : "Start upload in background"
                : "Continue to camera guide"}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

function CourtLine({
  color,
  dashed = false,
  end,
  opacity = 1,
  size,
  start,
  thickness = 2,
}: {
  readonly color: string;
  readonly dashed?: boolean;
  readonly start: { readonly x: number; readonly y: number };
  readonly end: { readonly x: number; readonly y: number };
  readonly opacity?: number;
  readonly size: { readonly width: number; readonly height: number };
  readonly thickness?: number;
}) {
  const startX = start.x * size.width;
  const startY = start.y * size.height;
  const endX = end.x * size.width;
  const endY = end.y * size.height;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const length = Math.sqrt(deltaX ** 2 + deltaY ** 2);
  const angle = `${(Math.atan2(deltaY, deltaX) * 180) / Math.PI}deg`;
  return (
    <View
      style={[
        styles.dynamicCourtLine,
        {
          backgroundColor: dashed ? "transparent" : color,
          borderColor: color,
          borderStyle: dashed ? "dashed" : "solid",
          borderTopWidth: dashed ? thickness : 0,
          height: thickness,
          left: (startX + endX) / 2 - length / 2,
          opacity,
          top: (startY + endY) / 2 - thickness / 2,
          transform: [{ rotate: angle }],
          width: length,
        },
      ]}
    />
  );
}

function CourtOverlay({
  forceVisible = false,
  geometry,
  guidance,
}: {
  readonly geometry: CourtGeometry;
  readonly guidance?: CaptureGuidance;
  /** The editor may deliberately begin from an assisted shape. */
  readonly forceVisible?: boolean;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };
  const color = guidance?.acceptable
    ? palette.positive
    : guidance?.groundPlaneDetected || geometry.mode !== "automatic"
      ? palette.sand
      : "rgba(255,255,255,0.82)";
  const points = geometry.corners;
  const [topLeft, topRight, bottomRight, bottomLeft] = points;
  const centerFar = interpolatePoint(topLeft!, topRight!, 0.5);
  const centerNear = interpolatePoint(bottomLeft!, bottomRight!, 0.5);
  const courtCenter = interpolatePoint(centerFar, centerNear, 0.5);
  const safePoints = points.map((point) =>
    interpolatePoint(point, courtCenter, 0.09),
  );
  const hasCourtGeometry = Boolean(
    forceVisible || guidance?.courtDetected || geometry.mode !== "automatic",
  );
  const hasNetEvidence = Boolean(
    !hasCourtGeometry && guidance?.netDetected && geometry.netTopLine,
  );
  const hasFramingGuide = Boolean(
    guidance?.groundPlaneDetected || hasCourtGeometry || hasNetEvidence,
  );
  const alignmentCorners =
    !hasCourtGeometry && guidance?.alignmentCorners?.length === 4
      ? guidance.alignmentCorners
      : undefined;
  const alignmentNetStart = alignmentCorners
    ? interpolatePoint(alignmentCorners[0]!, alignmentCorners[3]!, 0.5)
    : undefined;
  const alignmentNetEnd = alignmentCorners
    ? interpolatePoint(alignmentCorners[1]!, alignmentCorners[2]!, 0.5)
    : undefined;
  const alignmentNetCenter =
    alignmentNetStart && alignmentNetEnd
      ? interpolatePoint(alignmentNetStart, alignmentNetEnd, 0.5)
      : undefined;
  return (
    <View
      onLayout={onLayout}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      {size.width > 0 && (
        <>
          {hasCourtGeometry && (
            <>
              {points.map((point, index) => (
                <CourtLine
                  color={color}
                  dashed={
                    ![
                      geometry.edgeVisibility.far,
                      geometry.edgeVisibility.right,
                      geometry.edgeVisibility.near,
                      geometry.edgeVisibility.left,
                    ][index]
                  }
                  end={points[(index + 1) % points.length]!}
                  key={`outside-${index}`}
                  size={size}
                  start={point}
                  thickness={3}
                />
              ))}
              <CourtLine
                color={color}
                dashed
                end={geometry.netLine[1]}
                opacity={0.72}
                size={size}
                start={geometry.netLine[0]}
              />
              <CourtLine
                color={color}
                end={centerNear}
                opacity={0.42}
                size={size}
                start={centerFar}
              />
              {safePoints.map((point, index) => (
                <CourtLine
                  color={color}
                  dashed
                  end={safePoints[(index + 1) % safePoints.length]!}
                  key={`safe-${index}`}
                  size={size}
                  start={point}
                />
              ))}
            </>
          )}
          {alignmentCorners && (
            <>
              {alignmentCorners.map((point, index) => (
                <CourtLine
                  color={palette.sand}
                  dashed
                  end={alignmentCorners[(index + 1) % 4]!}
                  key={`alignment-${index}`}
                  opacity={0.34}
                  size={size}
                  start={point}
                />
              ))}
              <CourtLine
                color={palette.sand}
                dashed
                end={alignmentNetEnd!}
                opacity={0.46}
                size={size}
                start={alignmentNetStart!}
              />
              <View
                style={[
                  styles.alignmentNetLabel,
                  {
                    left: alignmentNetCenter!.x * size.width - 25,
                    top: alignmentNetCenter!.y * size.height - 13,
                  },
                ]}
              >
                <Text style={styles.alignmentNetLabelText}>NET</Text>
              </View>
            </>
          )}
          {(hasCourtGeometry || hasNetEvidence) && geometry.netTopLine && (
            <CourtLine
              color={color}
              end={geometry.netTopLine[1]}
              size={size}
              start={geometry.netTopLine[0]}
              thickness={4}
            />
          )}
          {hasCourtGeometry &&
            geometry.netTopLine &&
            geometry.antennaPoints && (
              <>
                <CourtLine
                  color={palette.flare}
                  end={geometry.antennaPoints[0]}
                  size={size}
                  start={geometry.netTopLine[0]}
                  thickness={4}
                />
                <CourtLine
                  color={palette.flare}
                  end={geometry.antennaPoints[1]}
                  size={size}
                  start={geometry.netTopLine[1]}
                  thickness={4}
                />
              </>
            )}
          {hasFramingGuide && (
            <>
              <View
                style={[
                  styles.dynamicHorizon,
                  {
                    backgroundColor: color,
                    top: (guidance?.horizonY ?? 0.16) * size.height,
                  },
                ]}
              />
            </>
          )}
        </>
      )}
    </View>
  );
}

function clampedScreenPoint(point: CapturePoint): CapturePoint {
  return {
    x: Math.max(0.035, Math.min(0.965, point.x)),
    y: Math.max(0.09, Math.min(0.94, point.y)),
  };
}

function CalibrationAnchor({
  label,
  onMove,
  point,
  size,
  tone = "court",
}: {
  readonly label: string;
  readonly onMove: (point: CapturePoint) => void;
  readonly point: CapturePoint;
  readonly size: { readonly width: number; readonly height: number };
  readonly tone?: "court" | "net" | "antenna";
}) {
  const start = useRef(point);
  const pointRef = useRef(point);
  const onMoveRef = useRef(onMove);
  const sizeRef = useRef(size);
  pointRef.current = point;
  onMoveRef.current = onMove;
  sizeRef.current = size;
  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponderCapture: () => true,
        onPanResponderGrant: () => {
          start.current = pointRef.current;
        },
        onPanResponderMove: (_event, gesture) => {
          const currentSize = sizeRef.current;
          if (currentSize.width <= 0 || currentSize.height <= 0) return;
          onMoveRef.current({
            x: Math.max(
              -1.5,
              Math.min(2.5, start.current.x + gesture.dx / currentSize.width),
            ),
            y: Math.max(
              -1.5,
              Math.min(2.5, start.current.y + gesture.dy / currentSize.height),
            ),
          });
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );
  const display = clampedScreenPoint(point);
  const offscreen = !isCapturePointVisible(point);
  return (
    <View
      {...responder.panHandlers}
      accessibilityLabel={`${label} ${offscreen ? "outside the current frame" : "anchor"}`}
      accessibilityRole="adjustable"
      style={[
        styles.calibrationAnchor,
        tone === "net" && styles.calibrationAnchorNet,
        tone === "antenna" && styles.calibrationAnchorAntenna,
        offscreen && styles.calibrationAnchorOffscreen,
        {
          left: display.x * size.width - 27,
          top: display.y * size.height - 27,
        },
      ]}
    >
      <View style={styles.calibrationAnchorCore} />
      <Text style={styles.calibrationAnchorLabel}>
        {label}
        {offscreen ? " ↘" : ""}
      </Text>
    </View>
  );
}

function defaultNetTop(geometry: CourtGeometry): CourtGeometry {
  const rise = 0.15;
  const netTopLine = [
    { x: geometry.netLine[0].x, y: geometry.netLine[0].y - rise },
    { x: geometry.netLine[1].x, y: geometry.netLine[1].y - rise },
  ] as const;
  return {
    ...geometry,
    netTopLine,
    edgeVisibility: edgeVisibility(geometry.corners, netTopLine),
    mode: "manual",
  };
}

function CourtCalibrationEditor({
  automaticGeometry,
  geometry,
  guidance,
  onCancel,
  onChange,
  onSave,
}: {
  readonly automaticGeometry: CourtGeometry;
  readonly geometry: CourtGeometry;
  readonly guidance?: CaptureGuidance;
  readonly onCancel: () => void;
  readonly onChange: (geometry: CourtGeometry) => void;
  readonly onSave: () => void;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const hasNet = Boolean(geometry.netTopLine);
  return (
    <View
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize({ width, height });
      }}
      style={styles.calibrationEditor}
    >
      <View pointerEvents="none" style={styles.calibrationEditorShade} />
      <CourtOverlay forceVisible geometry={geometry} guidance={guidance} />
      {size.width > 0 &&
        geometry.corners.map((corner, index) => (
          <CalibrationAnchor
            key={`corner-${index}`}
            label={["FAR L", "FAR R", "NEAR R", "NEAR L"][index]!}
            onMove={(next) =>
              onChange(
                moveCourtCorner(geometry, index as CourtCornerIndex, next),
              )
            }
            point={corner}
            size={size}
          />
        ))}
      {size.width > 0 &&
        geometry.netTopLine?.map((anchor, index) => (
          <CalibrationAnchor
            key={`net-${index}`}
            label={index === 0 ? "NET L" : "NET R"}
            onMove={(next) =>
              onChange(moveNetTopAnchor(geometry, index as 0 | 1, next))
            }
            point={anchor}
            size={size}
            tone="net"
          />
        ))}
      {size.width > 0 && geometry.netTopLine && (
        <CalibrationAnchor
          label="MOVE NET"
          onMove={(next) => onChange(moveNetTopLine(geometry, next))}
          point={interpolatePoint(
            geometry.netTopLine[0],
            geometry.netTopLine[1],
            0.5,
          )}
          size={size}
          tone="net"
        />
      )}
      {size.width > 0 &&
        geometry.antennaPoints?.map((anchor, index) => (
          <CalibrationAnchor
            key={`antenna-${index}`}
            label={index === 0 ? "ANT L" : "ANT R"}
            onMove={(next) =>
              onChange(moveAntennaAnchor(geometry, index as 0 | 1, next))
            }
            point={anchor}
            size={size}
            tone="antenna"
          />
        ))}
      <SafeAreaView pointerEvents="box-none" style={styles.calibrationEditorUi}>
        <View style={styles.calibrationEditorHeader}>
          <Pressable
            onPress={onCancel}
            style={styles.calibrationEditorHeaderButton}
          >
            <Text style={styles.calibrationEditorHeaderButtonText}>Cancel</Text>
          </Pressable>
          <View style={styles.calibrationEditorHeading}>
            <Text style={styles.calibrationEditorEyebrow}>
              COURT CALIBRATION
            </Text>
            <Text style={styles.calibrationEditorTitle}>
              Match the real lines
            </Text>
          </View>
          <Pressable onPress={onSave} style={styles.calibrationEditorSave}>
            <Text style={styles.calibrationEditorSaveText}>Save</Text>
          </Pressable>
        </View>
        <View style={styles.calibrationEditorBottom}>
          <Text style={styles.calibrationEditorHelp}>
            Drag court corners, net tape, and antenna tips. A boundary can sit
            beyond the screen—Duna keeps its geometry without blocking capture.
          </Text>
          <ScrollView
            contentContainerStyle={styles.calibrationPresetRow}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            <Pressable
              onPress={() => onChange(automaticGeometry)}
              style={styles.calibrationPreset}
            >
              <Text style={styles.calibrationPresetText}>Auto detect</Text>
            </Pressable>
            <Pressable
              onPress={() => onChange(withNearLineOffscreen(geometry))}
              style={styles.calibrationPreset}
            >
              <Text style={styles.calibrationPresetText}>
                Near line off-screen
              </Text>
            </Pressable>
            <Pressable
              onPress={() => onChange(withFullCourtVisible(geometry))}
              style={styles.calibrationPreset}
            >
              <Text style={styles.calibrationPresetText}>
                All lines visible
              </Text>
            </Pressable>
            <Pressable
              onPress={() =>
                onChange(
                  hasNet
                    ? {
                        ...geometry,
                        netTopLine: undefined,
                        antennaPoints: undefined,
                        edgeVisibility: edgeVisibility(geometry.corners),
                        mode: "manual",
                      }
                    : defaultNetTop(geometry),
                )
              }
              style={[
                styles.calibrationPreset,
                hasNet && styles.calibrationPresetSelected,
              ]}
            >
              <Text style={styles.calibrationPresetText}>
                {hasNet ? "Clear net" : "Mark net top"}
              </Text>
            </Pressable>
            <Pressable
              disabled={!hasNet}
              onPress={() =>
                onChange(toggleAntennas(geometry, !geometry.antennaPoints))
              }
              style={[
                styles.calibrationPreset,
                geometry.antennaPoints && styles.calibrationPresetSelected,
                !hasNet && styles.disabled,
              ]}
            >
              <Text style={styles.calibrationPresetText}>Antennas</Text>
            </Pressable>
          </ScrollView>
          <View style={styles.calibrationEditorStatus}>
            <Text style={styles.calibrationEditorStatusText}>
              {visibleCornerCount(geometry)}/4 corners visible ·{" "}
              {hasNet ? "net marked" : "net not marked"}
            </Text>
            <Text style={styles.calibrationEditorStatusMeta}>
              {geometry.mode === "automatic"
                ? "Automatic"
                : geometry.mode === "assisted"
                  ? "Assisted"
                  : "Manual"}
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function CaptureExperience({
  client,
  form,
  mode,
  networkPreferences,
  onActiveChange,
  onClose,
  onFallbackToRecord,
  onFinished,
  onRecorded,
  onRestartOrientation,
  preferSrt,
}: {
  readonly client: DunaApiClient;
  readonly form: CaptureForm;
  readonly mode: "live" | "record";
  readonly networkPreferences: VideoNetworkPreferences;
  readonly onActiveChange: (active: boolean) => void;
  readonly onClose: () => void;
  readonly onFallbackToRecord: () => void;
  readonly onFinished: () => Promise<void>;
  readonly onRecorded: (
    video: PreparedVideo,
    calibration: DunaCourtCalibration,
    visionSessionId?: string,
  ) => void;
  readonly onRestartOrientation: (
    orientation: "landscape" | "portrait",
  ) => void;
  readonly preferSrt: boolean;
}) {
  const { height, width } = useWindowDimensions();
  const isLandscapeViewport = width > height;
  const labels = useMemo(() => teamLabels(form), [form]);
  const matchId =
    form.association?.type === "match" ? form.association.id : undefined;
  const initialScore = useMemo<VisionScore>(
    () => ({
      setIndex: 0,
      sets: [{ a: 0, b: 0 }],
      status: "not-started",
    }),
    [],
  );
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [guidance, setGuidance] = useState<CaptureGuidance>();
  const [automaticGeometry, setAutomaticGeometry] = useState<CourtGeometry>(
    geometryFromGuidance(undefined),
  );
  const [courtGeometry, setCourtGeometry] = useState<CourtGeometry>(
    geometryFromGuidance(undefined),
  );
  const [calibrationDraft, setCalibrationDraft] = useState<CourtGeometry>();
  const [captureError, setCaptureError] = useState<string>();
  const [visionNotice, setVisionNotice] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [streamState, setStreamState] = useState<
    "preview" | "connecting" | "live" | "stopped"
  >("preview");
  const [streamTransport, setStreamTransport] = useState<"srt" | "rtmps">();
  const [session, setSession] = useState<LiveVideoSession>();
  const [recording, setRecording] = useState(false);
  const isActive =
    recording || streamState === "connecting" || streamState === "live";
  const [orientationLockState, setOrientationLockState] = useState<
    "locking" | "ready" | "unavailable"
  >("locking");
  const [reviewing, setReviewing] = useState(false);
  const [recordingVisibility, setRecordingVisibility] =
    useState<RecordingVisibility>(form.recordingVisibility);
  const [publishProfile, setPublishProfile] = useState(form.publishedToProfile);
  const [removeMusic, setRemoveMusic] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [visionAccess, setVisionAccess] = useState<VisionSessionAccess>();
  const [visionSession, setVisionSession] = useState<VisionSession>();
  const [visionSettings, setVisionSettings] = useState<VisionSettings>({
    captureMode: mode,
    courtWidthMeters: form.courtWidthMeters,
    courtLengthMeters: form.courtLengthMeters,
    netHeightMeters: form.netHeightMeters,
    cameraHeightMeters: 2.1,
    overlayScoreboard: true,
    teamA: labels.teamA,
    teamB: labels.teamB,
    program: {
      scoreboardVisible: true,
      score: initialScore,
    },
  });
  const [visionScore, setVisionScore] = useState<VisionScore>(initialScore);
  const [matchScoring, setMatchScoring] = useState<MatchScoringState>();
  const [showRemote, setShowRemote] = useState(false);
  const [previewHidden, setPreviewHidden] = useState(false);
  const [replayBusy, setReplayBusy] = useState(false);
  const activeRef = useRef(false);
  const busyRef = useRef(false);
  const permissionRef = useRef(false);
  const sessionRef = useRef<VisionSession | undefined>(undefined);
  const settingsRef = useRef(visionSettings);
  const geometryRef = useRef(courtGeometry);
  const guidanceRef = useRef<CaptureGuidance | undefined>(undefined);
  const manualCalibrationRef = useRef(false);
  const scoreRef = useRef<VisionScore>(initialScore);
  const elapsedRef = useRef(0);
  const captureStartedAtMs = useRef<number | undefined>(undefined);
  const previewUploadBusy = useRef(false);
  const watchEventChain = useRef<Promise<void>>(Promise.resolve());
  const visionCreation = useRef<Promise<void> | undefined>(undefined);
  const remoteCommand = useRef<string | undefined>(undefined);
  const remoteScoreCommand = useRef<string | undefined>(undefined);
  const remoteMatchScoreCommand = useRef<string | undefined>(undefined);
  const remoteReplayCommand = useRef<string | undefined>(undefined);
  const startRef = useRef<() => void>(() => undefined);
  const stopRef = useRef<() => void>(() => undefined);

  sessionRef.current = visionSession;
  settingsRef.current = visionSettings;
  geometryRef.current = courtGeometry;
  guidanceRef.current = guidance;
  scoreRef.current = visionScore;
  elapsedRef.current = elapsedSeconds;
  permissionRef.current = permissionsReady;
  busyRef.current = busy;

  useEffect(() => {
    onActiveChange(isActive || busy);
    return () => onActiveChange(false);
  }, [busy, isActive, onActiveChange]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    return BackHandler.addEventListener("hardwareBackPress", () => {
      if (showRemote) {
        setShowRemote(false);
        return true;
      }
      if (calibrationDraft) {
        setCalibrationDraft(undefined);
        return true;
      }
      return isActive || busy;
    }).remove;
  }, [busy, calibrationDraft, isActive, showRemote]);

  useEffect(() => {
    if (Platform.OS === "web") {
      setOrientationLockState("unavailable");
      return;
    }
    let active = true;
    let previousLock: ScreenOrientation.OrientationLock | undefined;
    const requestedLock =
      form.orientation === "landscape"
        ? ScreenOrientation.OrientationLock.LANDSCAPE
        : ScreenOrientation.OrientationLock.PORTRAIT_UP;
    void (async () => {
      try {
        previousLock = await ScreenOrientation.getOrientationLockAsync();
        await ScreenOrientation.lockAsync(requestedLock);
        if (active) setOrientationLockState("ready");
      } catch {
        // The physical-orientation guidance remains useful on an older build
        // or a platform which declines a runtime orientation lock.
        if (active) setOrientationLockState("unavailable");
      }
    })();
    return () => {
      active = false;
      if (previousLock !== undefined) {
        void ScreenOrientation.lockAsync(previousLock).catch(() => undefined);
      } else {
        void ScreenOrientation.unlockAsync().catch(() => undefined);
      }
    };
  }, [form.orientation]);

  const updateSessionState = useCallback((next: VisionSession) => {
    sessionRef.current = next;
    settingsRef.current = next.settings;
    setVisionSession(next);
    setVisionSettings(next.settings);
    if (next.settings.program?.score) {
      scoreRef.current = next.settings.program.score;
      setVisionScore(next.settings.program.score);
    }
    if (next.settings.corners?.length === 4) {
      const nextGeometry = geometryFromGuidance(guidanceRef.current, {
        corners: next.settings.corners,
        netLine: next.settings.netLine,
        netTopLine: next.settings.netTopLine,
        antennaPoints: next.settings.antennaPoints,
        nearLineVisible: next.settings.nearLineVisible,
        edgeVisibility: next.settings.edgeVisibility,
        calibrationMode: next.settings.calibrationMode,
      });
      manualCalibrationRef.current = nextGeometry.mode !== "automatic";
      geometryRef.current = nextGeometry;
      setCourtGeometry(nextGeometry);
    }
  }, []);

  useEffect(() => {
    if (!VideoCapture) return;
    const score = matchScoring ? compactScore(matchScoring.score) : visionScore;
    const currentSet = score.sets[
      Math.min(score.setIndex, score.sets.length - 1)
    ] ?? {
      a: 0,
      b: 0,
    };
    const sponsor = visionSettings.program?.sponsor;
    void VideoCapture.updateProgramState(
      JSON.stringify({
        teamA: visionSettings.teamA,
        teamB: visionSettings.teamB,
        scoreA: currentSet.a,
        scoreB: currentSet.b,
        setLabel: `SET ${score.setIndex + 1}`,
        scoreboardVisible:
          visionSettings.overlayScoreboard &&
          (visionSettings.program?.scoreboardVisible ?? true),
        sponsorHeadline: sponsor?.headline,
        sponsorBody: sponsor?.body,
        sponsorVisible: sponsor?.active ?? false,
      }),
    ).catch((error: unknown) => {
      setVisionNotice(
        `Program graphics are unavailable: ${displayError(error)}`,
      );
    });
  }, [matchScoring, visionScore, visionSettings]);

  useEffect(() => {
    const current = sessionRef.current;
    if (
      !current ||
      current.status === "ended" ||
      current.status === "expired"
    ) {
      return;
    }
    const currentScore = current.settings.program?.score;
    if (JSON.stringify(currentScore) === JSON.stringify(visionScore)) return;
    const timer = setTimeout(() => {
      const latest = sessionRef.current;
      if (!latest) return;
      const settings: VisionSettings = {
        ...latest.settings,
        program: {
          ...latest.settings.program,
          scoreboardVisible:
            latest.settings.program?.scoreboardVisible ??
            latest.settings.overlayScoreboard,
          score: visionScore,
        },
      };
      void client.player.updateVisionSession
        .mutate({ sessionId: latest.id, settings })
        .then(updateSessionState)
        .catch(() => undefined);
    }, 300);
    return () => clearTimeout(timer);
  }, [client, updateSessionState, visionScore]);

  useEffect(() => {
    let active = true;
    const creation = client.player.createVisionSession
      .mutate({
        title: form.title,
        matchId,
        settings: visionSettings,
        idempotencyKey: idempotencyKey(),
      })
      .then((created) => {
        if (!active) return;
        setVisionAccess(created);
        updateSessionState(created.session);
      })
      .catch((error) => {
        if (active) {
          setVisionNotice(
            `Remote, Watch tagging, and timed overlays are unavailable: ${displayError(error)}`,
          );
        }
      });
    visionCreation.current = creation;
    void creation;
    return () => {
      active = false;
    };
    // The capture form is frozen while this screen is mounted.
  }, [client, matchId, updateSessionState]);

  useEffect(() => {
    if (!VideoCapture) {
      setCaptureError("The iOS capture engine is unavailable in this build.");
      return;
    }
    const capture = VideoCapture;
    let active = true;
    void capture
      .requestPermissions(form.hasAudio)
      .then(async (permissions) => {
        if (!permissions.camera || !permissions.audio) {
          throw new Error(
            form.hasAudio
              ? "Camera and microphone access are required for this setup."
              : "Camera access is required for this setup.",
          );
        }
        await capture.preparePreview(form.hasAudio);
        if (active) setPermissionsReady(true);
      })
      .catch((error) => {
        if (active) setCaptureError(displayError(error));
      });
    return () => {
      active = false;
    };
  }, [form.hasAudio]);

  useEffect(() => {
    if (streamState !== "live" && !recording) return;
    const timer = setInterval(
      () => setElapsedSeconds((current) => current + 1),
      1_000,
    );
    return () => clearInterval(timer);
  }, [recording, streamState]);

  useEffect(() => {
    if (!matchId) return;
    let active = true;
    const loadScore = async () => {
      try {
        const next = await client.player.matchScoringState.query({ matchId });
        if (!active) return;
        setMatchScoring(next);
        const compact = compactScore(next.score);
        scoreRef.current = compact;
        setVisionScore(compact);
      } catch {
        // A linked match may not have entered live scoring yet. Watch scoring
        // still remains durable in the Duna Vision timeline.
      }
    };
    void loadScore();
    const timer = setInterval(() => void loadScore(), 3_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [client, matchId]);

  const calibration = (): DunaCourtCalibration => {
    const locked = VideoCapture?.lockCalibration();
    const settings = settingsRef.current;
    const geometry = geometryRef.current;
    const base = locked ?? {
      courtWidthMeters: form.courtWidthMeters,
      courtLengthMeters: form.courtLengthMeters,
      netHeightMeters: form.netHeightMeters,
      preferredOrientation: form.orientation,
      qualityGrade: guidance?.qualityGrade ?? "poor",
      qualityScore: guidance?.qualityScore ?? 0,
      confidence: guidance?.confidence ?? 0,
      warnings: guidance?.warnings ?? ["Camera calibration was unavailable"],
      corners: guidance?.corners,
      horizonY: guidance?.horizonY,
      projectionSource: guidance?.projectionSource,
      lidarAvailable: guidance?.lidarAvailable,
      groundPlaneDetected: guidance?.groundPlaneDetected,
      courtDetected: guidance?.courtDetected,
      cameraHeightMeters: guidance?.cameraHeightMeters,
      deviceOrientation: guidance?.deviceOrientation,
      orientationMatches: guidance?.orientationMatches,
      trackingState: guidance?.trackingState,
      deviceAttitude: guidance?.deviceAttitude,
      lens: guidance?.lens,
      zoomFactor: guidance?.zoomFactor,
      calibratedAt: guidance?.calibratedAt ?? new Date().toISOString(),
      acceptable: guidance?.acceptable ?? false,
    };
    const hasCourtEvidence = Boolean(
      guidance?.courtDetected ||
      guidance?.netDetected ||
      geometry.mode !== "automatic",
    );
    return {
      ...base,
      courtWidthMeters: settings.courtWidthMeters,
      courtLengthMeters: settings.courtLengthMeters,
      netHeightMeters: settings.netHeightMeters,
      preferredOrientation: form.orientation,
      corners: hasCourtEvidence ? geometry.corners : undefined,
      netLine: hasCourtEvidence ? geometry.netLine : undefined,
      netTopLine: hasCourtEvidence ? geometry.netTopLine : undefined,
      antennaPoints: hasCourtEvidence ? geometry.antennaPoints : undefined,
      visibleCornerCount: hasCourtEvidence ? visibleCornerCount(geometry) : 0,
      nearLineVisible: hasCourtEvidence && geometry.nearLineVisible,
      partialCourt: !hasCourtEvidence || visibleCornerCount(geometry) < 4,
      edgeVisibility: hasCourtEvidence ? geometry.edgeVisibility : undefined,
      netDetected: hasCourtEvidence && Boolean(geometry.netTopLine),
      antennaDetected: hasCourtEvidence && Boolean(geometry.antennaPoints),
      calibrationMode: geometry.mode,
      modelVersion: guidance?.modelVersion ?? "court-v4-spatial-2026-08-30",
    };
  };

  const appendPhoneEvent = async (
    type:
      | "recording-started"
      | "favorite"
      | "recording-stopped"
      | "calibration-updated"
      | "review-marker",
    label?: string,
    occurredAt = new Date(),
    payload?: Record<string, unknown>,
  ) => {
    const current = sessionRef.current;
    if (!current) return;
    const event: VisionTimelineEvent = {
      id: Crypto.randomUUID(),
      sessionId: current.id,
      source: "iphone",
      type,
      elapsedMs:
        type === "recording-started" || !captureStartedAtMs.current
          ? 0
          : Math.min(
              43_200_000,
              Math.max(0, occurredAt.getTime() - captureStartedAtMs.current),
            ),
      occurredAt: occurredAt.toISOString(),
      score: scoreRef.current,
      label,
      payload,
    };
    await client.player.appendVisionTimelineEvents.mutate({
      sessionId: current.id,
      events: [event],
    });
  };

  const saveCalibration = async () => {
    const nextGeometry = calibrationDraft;
    if (!nextGeometry) return;
    manualCalibrationRef.current = nextGeometry.mode !== "automatic";
    geometryRef.current = nextGeometry;
    setCourtGeometry(nextGeometry);
    setCalibrationDraft(undefined);
    const nextSettings: VisionSettings = {
      ...settingsRef.current,
      ...geometrySettings(nextGeometry),
    };
    settingsRef.current = nextSettings;
    setVisionSettings(nextSettings);
    try {
      if (!sessionRef.current) await visionCreation.current;
      const current = sessionRef.current;
      if (current) {
        const next = await client.player.updateVisionSession.mutate({
          sessionId: current.id,
          settings: nextSettings,
        });
        updateSessionState(next);
        await appendPhoneEvent(
          "calibration-updated",
          `${nextGeometry.mode} court calibration saved`,
          new Date(),
          {
            ...geometrySettings(nextGeometry),
            visibleCornerCount: visibleCornerCount(nextGeometry),
          },
        );
      }
      setVisionNotice(
        nextGeometry.nearLineVisible
          ? "Court and net calibration saved."
          : "Calibration saved with the near line outside the frame.",
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      setVisionNotice(
        `Calibration is saved on this iPhone but remote sync is waiting: ${displayError(error)}`,
      );
    }
  };

  const updateVisionStatus = async (
    status: "recording" | "ended",
  ): Promise<void> => {
    const current = sessionRef.current;
    if (!current) return;
    try {
      const next = await client.player.updateVisionSession.mutate({
        sessionId: current.id,
        status,
      });
      updateSessionState(next);
    } catch (error) {
      setVisionNotice(`Vision status did not sync: ${displayError(error)}`);
    }
  };

  const start = async () => {
    if (!VideoCapture || busyRef.current || activeRef.current) return;
    if (guidanceRef.current?.orientationMatches === false) {
      const required = form.orientation;
      const actual = guidanceRef.current.deviceOrientation;
      setCaptureError(
        `Rotate your phone to ${required} to start, or restart this recording in ${actual === "unknown" || !actual ? "the phone's current" : actual} mode.`,
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    busyRef.current = true;
    onActiveChange(true);
    setBusy(true);
    setCaptureError(undefined);
    let createdSession: LiveVideoSession | undefined;
    try {
      if (!sessionRef.current) await visionCreation.current;
      setElapsedSeconds(0);
      let startedAt: Date;
      if (mode === "record") {
        await VideoCapture.startRecording(form.hasAudio);
        startedAt = new Date();
        activeRef.current = true;
        setRecording(true);
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      } else {
        const connection = await canUseVideoTransport(
          "live",
          networkPreferences,
        );
        if (!connection.allowed) {
          throw new Error(
            `${connection.reason ?? "Offline"}. Live video needs an allowed internet connection.`,
          );
        }
        const created = await client.player.createLiveVideo.mutate({
          title: form.title,
          category: form.category,
          ...associationInput(form.association),
          venue: form.venue,
          liveVisibility: form.liveVisibility,
          recordingVisibility: form.recordingVisibility,
          hasAudio: form.hasAudio,
          simulcastToDunaYoutube: form.simulcastToDunaYoutube,
          youtubeConnectionIds: [...form.youtubeConnectionIds],
          visionLearningConsent: form.contributeCalibration,
          courtCalibration: calibration(),
          idempotencyKey: idempotencyKey(),
        });
        createdSession = created;
        setSession(created);
        const failedDestinations = created.destinations.filter(
          (destination) => destination.status === "failed",
        );
        if (failedDestinations.length > 0) {
          setVisionNotice(
            `Duna is ready. ${failedDestinations.map((destination) => destination.channelTitle).join(", ")} could not connect to YouTube.`,
          );
        }
        const currentVision = sessionRef.current;
        if (currentVision) {
          const attached =
            await client.player.attachVisionSessionToVideo.mutate({
              sessionId: currentVision.id,
              videoId: created.video.id,
              idempotencyKey: idempotencyKey(),
            });
          updateSessionState(attached);
        }
        const srt = created.ingests.srt;
        const rtmps = created.ingests.rtmps;
        // Provider capability selects the preferred contribution protocol.
        // The native encoder falls back to RTMPS if SRT cannot connect or
        // drops; adaptive bitrate remains independent of this choice.
        const useSrt = Boolean(srt) && preferSrt;
        await VideoCapture.startStream(
          useSrt ? srt!.url : rtmps.url,
          useSrt ? srt!.streamId : rtmps.streamKey,
          form.hasAudio,
          useSrt ? "srt" : "rtmps",
          useSrt ? srt!.passphrase : undefined,
          useSrt ? rtmps.url : undefined,
          useSrt ? rtmps.streamKey : undefined,
        );
        setStreamTransport(useSrt ? "srt" : "rtmps");
        startedAt = new Date();
        activeRef.current = true;
      }
      captureStartedAtMs.current = startedAt.getTime();
      await updateVisionStatus("recording");
      await appendPhoneEvent(
        "recording-started",
        "Duna Vision recording started",
        startedAt,
      );
    } catch (error) {
      if (createdSession) {
        void client.player.finishLiveVideo.mutate({
          videoId: createdSession.video.id,
          idempotencyKey: idempotencyKey(),
        });
      }
      setCaptureError(displayError(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
      if (!activeRef.current) onActiveChange(false);
    }
  };

  const stop = async () => {
    if (!VideoCapture || busyRef.current || !activeRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const stoppedAt = new Date();
    try {
      if (mode === "record") {
        const lockedCalibration = calibration();
        const video = await VideoCapture.stopRecording();
        activeRef.current = false;
        setRecording(false);
        await appendPhoneEvent(
          "recording-stopped",
          "Duna Vision recording stopped",
          stoppedAt,
        );
        await updateVisionStatus("ended");
        onRecorded(video, lockedCalibration, sessionRef.current?.id);
        return;
      }
      await VideoCapture.stopStream();
      activeRef.current = false;
      if (session) {
        await client.player.finishLiveVideo.mutate({
          videoId: session.video.id,
          idempotencyKey: idempotencyKey(),
        });
      }
      await appendPhoneEvent(
        "recording-stopped",
        "Duna Vision stream ended",
        stoppedAt,
      );
      await updateVisionStatus("ended");
      setReviewing(true);
    } catch (error) {
      setCaptureError(displayError(error));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  startRef.current = () => void start();
  stopRef.current = () => void stop();

  const appendRemoteProgramEvent = useCallback(
    async (input: {
      readonly id: string;
      readonly type: "rally-won" | "review-marker";
      readonly occurredAt: string;
      readonly winnerSide?: "A" | "B";
      readonly score?: VisionScore;
      readonly label: string;
      readonly payload?: Record<string, unknown>;
    }) => {
      const current = sessionRef.current;
      if (!current) return;
      await client.player.appendVisionTimelineEvents.mutate({
        sessionId: current.id,
        events: [
          {
            id: input.id,
            sessionId: current.id,
            source: "remote",
            type: input.type,
            winnerSide: input.winnerSide,
            elapsedMs: captureStartedAtMs.current
              ? Math.min(
                  43_200_000,
                  Math.max(
                    0,
                    Date.parse(input.occurredAt) - captureStartedAtMs.current,
                  ),
                )
              : 0,
            occurredAt: input.occurredAt,
            score: input.score,
            label: input.label,
            payload: input.payload,
          },
        ],
      });
    },
    [client],
  );

  const processRemoteProgram = useCallback(
    async (next: VisionSession) => {
      const scoreCommand = next.settings.program?.scoreCommand;
      if (scoreCommand && remoteScoreCommand.current !== scoreCommand.id) {
        remoteScoreCommand.current = scoreCommand.id;
        const score = next.settings.program?.score;
        if (score) {
          scoreRef.current = score;
          setVisionScore(score);
        }
        await appendRemoteProgramEvent({
          id: scoreCommand.id,
          type: "rally-won",
          occurredAt: scoreCommand.occurredAt,
          winnerSide: scoreCommand.winnerSide,
          score,
          label: `${scoreCommand.winnerSide === "A" ? next.settings.teamA : next.settings.teamB} won the rally`,
          payload: { command: "second-screen-score" },
        }).catch(() => undefined);
      }

      // Timeline acceptance and linked-match scoring are independent writes.
      // Keep retrying the authoritative match event if that write was the only
      // part interrupted; the event ID makes the retry naturally idempotent.
      if (
        scoreCommand &&
        matchId &&
        remoteMatchScoreCommand.current !== scoreCommand.id
      ) {
        remoteMatchScoreCommand.current = scoreCommand.id;
        try {
          const current = await client.player.matchScoringState.query({
            matchId,
          });
          const result = await client.player.appendMatchEvents.mutate({
            matchId,
            deviceId: current.deviceId,
            events: [
              {
                sequence: current.nextSequence,
                monotonicCounter: current.nextMonotonicCounter,
                event: {
                  id: scoreCommand.id,
                  type: "rally-won",
                  winner: scoreCommand.winnerSide,
                  occurredAt: scoreCommand.occurredAt,
                },
              },
            ],
            idempotencyKey: idempotencyKey(),
          });
          setMatchScoring(result.scoring);
          const authoritativeScore = compactScore(result.scoring.score);
          scoreRef.current = authoritativeScore;
          setVisionScore(authoritativeScore);
        } catch (error) {
          remoteMatchScoreCommand.current = undefined;
          setVisionNotice(
            `Second-screen score received; linked match scoring is waiting to sync: ${displayError(error)}`,
          );
        }
      }

      const replayRequest = next.settings.program?.replayRequest;
      if (
        replayRequest &&
        remoteReplayCommand.current !== replayRequest.id &&
        activeRef.current
      ) {
        remoteReplayCommand.current = replayRequest.id;
        const result = await VideoCapture?.insertReplay(
          replayRequest.durationSeconds,
        );
        await appendRemoteProgramEvent({
          id: replayRequest.id,
          type: "review-marker",
          occurredAt: replayRequest.requestedAt,
          score: scoreRef.current,
          label: result?.accepted
            ? `${replayRequest.durationSeconds}-second instant replay`
            : "Instant replay requested while buffer was warming up",
          payload: {
            command: "second-screen-replay",
            accepted: result?.accepted ?? false,
            durationSeconds: result?.durationSeconds ?? 0,
          },
        }).catch(() => undefined);
        setVisionNotice(
          result?.accepted
            ? `Playing the last ${result.durationSeconds} seconds.`
            : "Replay is warming up. Try again after the next rally.",
        );
      }
    },
    [appendRemoteProgramEvent, client, matchId],
  );

  useEffect(() => {
    const sessionId = visionSession?.id;
    if (!sessionId) return;
    let active = true;
    const poll = async () => {
      try {
        const next = await client.player.visionSession.query({ sessionId });
        if (!active) return;
        updateSessionState(next);
        await processRemoteProgram(next);
        const commandKey = `${next.controlVersion}:${next.status}`;
        if (
          next.status === "recording" &&
          !activeRef.current &&
          !busyRef.current &&
          permissionRef.current &&
          remoteCommand.current !== commandKey
        ) {
          remoteCommand.current = commandKey;
          startRef.current();
        } else if (
          next.status === "ended" &&
          activeRef.current &&
          !busyRef.current &&
          remoteCommand.current !== commandKey
        ) {
          remoteCommand.current = commandKey;
          stopRef.current();
        }
      } catch {
        // Keep capture usable during a temporary network interruption.
      }
    };
    const timer = setInterval(() => void poll(), 2_500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [client, processRemoteProgram, updateSessionState, visionSession?.id]);

  const processWatchEvents = useCallback(
    async (events: readonly WatchVisionEvent[], sessionId: string) => {
      const applicable = events.filter(
        (event) => event.sessionId === sessionId,
      );
      if (applicable.length === 0) return;
      const timeline: VisionTimelineEvent[] = applicable.map((event) => ({
        id: event.eventId,
        sessionId,
        source: "apple-watch",
        type: event.eventType,
        winnerSide: event.winnerSide,
        targetEventId: event.targetEventId,
        elapsedMs: event.elapsedMs,
        occurredAt: event.occurredAt,
        score: event.score,
        label: event.label,
        payload: event.payload,
      }));
      await client.player.appendVisionTimelineEvents.mutate({
        sessionId,
        events: timeline,
      });
      const latest = applicable.at(-1)?.score;
      if (latest) {
        const compact = compactScore(latest);
        scoreRef.current = compact;
        setVisionScore(compact);
      }
      acknowledgeWatchVisionEvents(applicable.map((event) => event.eventId));

      if (!matchId) return;
      const scoreEvents: MatchScoreEvent[] = [];
      for (const event of applicable) {
        if (event.eventType === "rally-won" && event.winnerSide) {
          scoreEvents.push({
            id: event.eventId,
            type: "rally-won",
            winner: event.winnerSide,
            occurredAt: event.occurredAt,
          });
        }
        if (event.eventType === "undo" && event.targetEventId) {
          scoreEvents.push({
            id: event.eventId,
            type: "undo",
            targetEventId: event.targetEventId,
            occurredAt: event.occurredAt,
          });
        }
      }
      if (scoreEvents.length === 0) return;
      try {
        const current = await client.player.matchScoringState.query({
          matchId,
        });
        const result = await client.player.appendMatchEvents.mutate({
          matchId,
          deviceId: current.deviceId,
          events: scoreEvents.map((event, index) => ({
            sequence: current.nextSequence + index,
            monotonicCounter: current.nextMonotonicCounter + index,
            event,
          })),
          idempotencyKey: idempotencyKey(),
        });
        setMatchScoring(result.scoring);
        const compact = compactScore(result.scoring.score);
        scoreRef.current = compact;
        setVisionScore(compact);
      } catch (error) {
        setVisionNotice(
          `Moment saved to Duna Vision; linked match scoring did not update: ${displayError(error)}`,
        );
      }
    },
    [client, matchId],
  );

  useEffect(() => {
    const sessionId = visionSession?.id;
    if (!sessionId) return;
    const enqueue = (events: readonly WatchVisionEvent[]) => {
      watchEventChain.current = watchEventChain.current
        .then(() => processWatchEvents(events, sessionId))
        .catch((error) => {
          setVisionNotice(
            `Watch moments are waiting to sync: ${displayError(error)}`,
          );
        });
    };
    enqueue(getPendingWatchVisionEvents());
    return subscribeToWatchVisionEvents((event) => enqueue([event]));
  }, [processWatchEvents, visionSession?.id]);

  useEffect(() => {
    const current = visionSession;
    if (!current || current.status === "expired") return;
    syncVisionSessionToWatch({
      sessionId: current.id,
      captureMode: mode,
      videoId: current.videoId,
      matchId: current.matchId,
      teamA: visionSettings.teamA,
      teamB: visionSettings.teamB,
      recordingStartedAt: current.recordingStartedAt,
      status: current.status,
      score: visionScore,
      format: matchScoring
        ? {
            setsToWin: matchScoring.format.setsToWin,
            maximumSets: matchScoring.format.maximumSets,
            pointTargets: matchScoring.format.pointTargets,
            winBy: matchScoring.format.winBy,
            hardCaps: matchScoring.format.hardCaps.map((cap) => cap ?? 0),
            sideSwitchIntervals: matchScoring.format.sideSwitchIntervals,
          }
        : undefined,
    });
  }, [
    matchScoring?.format,
    mode,
    visionScore,
    visionSession,
    visionSettings.teamA,
    visionSettings.teamB,
  ]);

  const uploadPreview = (jpegBase64: string, capturedAt: string) => {
    const current = sessionRef.current;
    if (!current || previewUploadBusy.current) return;
    previewUploadBusy.current = true;
    void client.player.updateVisionPreview
      .mutate({ sessionId: current.id, jpegBase64, capturedAt })
      .catch(() => undefined)
      .finally(() => {
        previewUploadBusy.current = false;
      });
  };

  const favoriteMoment = async () => {
    try {
      await appendPhoneEvent("favorite", "Favorite moment");
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVisionNotice(`Moment saved at ${formatClock(elapsedRef.current)}`);
    } catch (error) {
      setVisionNotice(`Favorite is waiting to sync: ${displayError(error)}`);
    }
  };

  const insertInstantReplay = async (durationSeconds = 10) => {
    if (!VideoCapture || replayBusy) return;
    setReplayBusy(true);
    try {
      const result = await VideoCapture.insertReplay(durationSeconds);
      await appendPhoneEvent(
        "review-marker",
        result.accepted
          ? `${result.durationSeconds}-second instant replay`
          : "Instant replay requested while buffer was warming up",
        new Date(),
        {
          command: "camera-replay",
          accepted: result.accepted,
          durationSeconds: result.durationSeconds,
        },
      ).catch(() => undefined);
      setVisionNotice(
        result.accepted
          ? `Playing the last ${result.durationSeconds} seconds.`
          : "Replay is warming up. Try again after the next rally.",
      );
    } catch (error) {
      setVisionNotice(`Replay is unavailable: ${displayError(error)}`);
    } finally {
      setReplayBusy(false);
    }
  };

  const closeCapture = async () => {
    const current = sessionRef.current;
    if (current && current.status !== "ended" && current.status !== "expired") {
      try {
        await client.player.revokeVisionRemote.mutate({
          sessionId: current.id,
          idempotencyKey: idempotencyKey(),
        });
      } catch {
        // The remote is time-limited even if explicit revocation cannot sync.
      }
    }
    onClose();
  };

  const saveReview = async () => {
    if (!session) return;
    setBusy(true);
    try {
      await client.player.updateVideoPrivacy.mutate({
        videoId: session.video.id,
        liveVisibility: form.liveVisibility,
        recordingVisibility,
        publishedToProfile: recordingVisibility === "public" && publishProfile,
        idempotencyKey: idempotencyKey(),
      });
      if (removeMusic && form.hasAudio) {
        await client.player.requestVideoMusicRemoval.mutate({
          videoId: session.video.id,
          idempotencyKey: idempotencyKey(),
        });
      }
      await onFinished();
      await closeCapture();
    } catch (error) {
      setCaptureError(displayError(error));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!session) return;
    await Share.share({
      message: `${form.title}\nWatch on Duna: ${session.shareUrl}`,
      url: session.shareUrl,
    });
  };

  if (reviewing) {
    return (
      <SafeAreaView style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <View style={styles.headerSpacer} />
          <Text style={styles.modalTitle}>Stream complete</Text>
          <View style={styles.headerSpacer} />
        </View>
        <ScrollView contentContainerStyle={styles.reviewContent}>
          <View style={styles.successMark}>
            <Text style={styles.successMarkText}>✓</Text>
          </View>
          <Text style={styles.reviewTitle}>Your recording is processing.</Text>
          <Text style={styles.reviewBody}>
            Choose what happens after Duna prepares it. You can change this
            again from your video archive.
          </Text>
          <ChoiceRow
            label="Recording visibility"
            onChange={setRecordingVisibility}
            options={[
              { label: "Keep private", value: "private" },
              { label: "Public", value: "public" },
            ]}
            value={recordingVisibility}
          />
          {recordingVisibility === "public" && (
            <ToggleRow
              body="Add this recording to your public player profile."
              label="Publish to profile"
              onChange={setPublishProfile}
              value={publishProfile}
            />
          )}
          {form.hasAudio && (
            <ToggleRow
              body="Duna will queue audio isolation to reduce event music while preserving court sound when possible."
              label="Attempt to remove music"
              onChange={setRemoveMusic}
              value={removeMusic}
            />
          )}
          <Pressable
            onPress={() => void share()}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryButtonText}>Share watch link</Text>
          </Pressable>
          {!!captureError && (
            <Text style={styles.errorText}>{captureError}</Text>
          )}
        </ScrollView>
        <View style={styles.modalFooter}>
          <Pressable
            disabled={busy}
            onPress={() => void saveReview()}
            style={[styles.primaryButton, busy && styles.disabled]}
          >
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                Save recording choice
              </Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.captureRoot}>
      {orientationLockState === "locking" ? (
        <View style={styles.orientationLoading}>
          <ActivityIndicator color={palette.sand} />
          <Text style={styles.orientationLoadingText}>
            Opening {form.orientation} recorder…
          </Text>
        </View>
      ) : (
        <DunaVideoCaptureView
          audioEnabled={form.hasAudio}
          courtLengthMeters={visionSettings.courtLengthMeters}
          courtWidthMeters={visionSettings.courtWidthMeters}
          netHeightMeters={visionSettings.netHeightMeters}
          preferredOrientation={form.orientation}
          onCaptureError={(event) => setCaptureError(event.nativeEvent.message)}
          onGuidance={(event) => {
            const next = event.nativeEvent;
            const detected = geometryFromGuidance(next);
            guidanceRef.current = next;
            setGuidance(next);
            setAutomaticGeometry(detected);
            if (!manualCalibrationRef.current && !calibrationDraft) {
              geometryRef.current = detected;
              setCourtGeometry(detected);
            }
          }}
          onPreview={(event) =>
            uploadPreview(
              event.nativeEvent.jpegBase64,
              event.nativeEvent.capturedAt,
            )
          }
          onStreamState={(event) => {
            const next = event.nativeEvent.state;
            setStreamState(next);
            if (event.nativeEvent.transport) {
              setStreamTransport(event.nativeEvent.transport);
            }
            if (next === "connecting" || next === "live")
              activeRef.current = true;
            if (next === "stopped") {
              activeRef.current = false;
              setRecording(false);
            }
          }}
          onRecordingFinalized={(event) => {
            if (mode !== "record") return;
            const stoppedAt = new Date();
            const lockedCalibration = calibration();
            activeRef.current = false;
            setRecording(false);
            setVisionNotice(
              "Your recording was safely finalized after iOS interrupted capture.",
            );
            void appendPhoneEvent(
              "recording-stopped",
              "Duna Vision recording safely finalized after an iOS interruption",
              stoppedAt,
            );
            void updateVisionStatus("ended");
            onRecorded(
              event.nativeEvent,
              lockedCalibration,
              sessionRef.current?.id,
            );
          }}
          style={StyleSheet.absoluteFill}
        />
      )}
      <CourtOverlay geometry={courtGeometry} guidance={guidance} />
      {isActive && previewHidden && (
        <View pointerEvents="none" style={styles.lowPowerOverlay}>
          <View style={styles.lowPowerMark}>
            <DunaIcon color="#ffffff" name="eye-off" size={28} />
          </View>
          <Text style={styles.lowPowerTimer}>
            {formatClock(elapsedSeconds)}
          </Text>
          <Text style={styles.lowPowerTitle}>
            {mode === "live"
              ? "Live stream in progress"
              : "Recording in progress"}
          </Text>
          <Text style={styles.lowPowerBody}>
            Preview is hidden to reduce screen use. Camera, Watch scoring, and
            remote control stay active.
          </Text>
        </View>
      )}
      <SafeAreaView
        pointerEvents="box-none"
        style={[
          styles.captureChrome,
          isLandscapeViewport && styles.captureChromeLandscape,
        ]}
      >
        <View
          style={[
            styles.captureTop,
            isLandscapeViewport && styles.captureTopLandscape,
          ]}
        >
          <Pressable
            accessibilityLabel="Close camera guide"
            disabled={isActive || busy}
            onPress={() => void closeCapture()}
            style={styles.captureClose}
          >
            <DunaIcon color="#ffffff" name="close" size={21} />
          </Pressable>
          <View style={styles.captureStatus}>
            {isActive && <View style={styles.liveDot} />}
            <View style={styles.captureStatusCopy}>
              <Text style={styles.captureStatusText}>
                {recording
                  ? "RECORDING"
                  : streamState === "live"
                    ? `LIVE · ${streamTransport?.toUpperCase() ?? "VIDEO"}`
                    : streamState === "connecting"
                      ? "CONNECTING"
                      : mode === "live"
                        ? "LIVE SETUP"
                        : "CAMERA GUIDE"}
              </Text>
              {isActive && (
                <Text style={styles.captureStatusTimer}>
                  {formatClock(elapsedSeconds)}
                </Text>
              )}
            </View>
          </View>
          <Pressable
            accessibilityLabel="Connect a remote device"
            disabled={!visionAccess}
            onPress={() => setShowRemote(true)}
            style={styles.remoteButton}
          >
            <DunaIcon color="#ffffff" name="remote" size={19} />
            <Text style={styles.remoteButtonText}>REMOTE</Text>
          </Pressable>
        </View>
        <View
          style={[
            styles.captureBottom,
            isLandscapeViewport && styles.captureBottomLandscape,
          ]}
        >
          {!isActive && (
            <View style={styles.guidanceCard}>
              <View style={styles.guidanceTop}>
                <View
                  style={[
                    styles.guidanceReadyDot,
                    guidance?.acceptable && styles.guidanceReadyDotActive,
                  ]}
                />
                <View style={styles.flex}>
                  <Text
                    style={[
                      styles.guidanceGrade,
                      guidance?.acceptable && { color: palette.positive },
                    ]}
                  >
                    {guidance?.orientationMatches === false
                      ? `Rotate to ${form.orientation}`
                      : guidance?.courtDetected
                        ? "Court locked"
                        : guidance?.netDetected
                          ? "Net found · widen the frame"
                          : guidance?.groundPlaneDetected
                            ? "Ground mapped · find the net"
                            : "Map the court"}
                  </Text>
                  <Text numberOfLines={2} style={styles.guidanceWarning}>
                    {guidance?.orientationMatches === false
                      ? `Rotate your phone to ${form.orientation} to start, or restart in ${guidance.deviceOrientation === "unknown" || !guidance.deviceOrientation ? "the phone's current" : guidance.deviceOrientation} mode.`
                      : (guidance?.warnings[0] ??
                        "Aim at the net and move slowly for a spatial lock.")}
                  </Text>
                </View>
                <Text style={styles.guidanceScore}>
                  {guidance?.qualityScore ?? 0}
                </Text>
              </View>
              {guidance?.orientationMatches === false &&
                guidance.deviceOrientation !== "unknown" &&
                guidance.deviceOrientation && (
                  <Pressable
                    onPress={() =>
                      onRestartOrientation(
                        guidance.deviceOrientation as "landscape" | "portrait",
                      )
                    }
                    style={styles.orientationRestartButton}
                  >
                    <Text style={styles.orientationRestartButtonText}>
                      Restart in {guidance.deviceOrientation}
                    </Text>
                  </Pressable>
                )}
              <View style={styles.guidanceSignals}>
                <View style={styles.guidanceSignal}>
                  <Text style={styles.guidanceSignalText}>
                    {guidance?.groundPlaneDetected ? "● Ground" : "○ Ground"}
                  </Text>
                </View>
                <View style={styles.guidanceSignal}>
                  <Text style={styles.guidanceSignalText}>
                    {courtGeometry.netTopLine ? "● Net" : "○ Net"}
                  </Text>
                </View>
                <View style={styles.guidanceSignal}>
                  <Text style={styles.guidanceSignalText}>
                    {guidance?.courtDetected
                      ? `${visibleCornerCount(courtGeometry)}/4 corners`
                      : "○ Court"}
                  </Text>
                </View>
                <Pressable
                  onPress={() => setCalibrationDraft(courtGeometry)}
                  style={styles.guidanceAdjustCompact}
                >
                  <Text style={styles.guidanceAdjustCompactText}>Adjust</Text>
                </Pressable>
              </View>
              {!courtGeometry.nearLineVisible && (
                <Text style={styles.partialCourtNote}>
                  Near line is off-screen; capture still works.
                </Text>
              )}
            </View>
          )}
          {!!captureError && (
            <View style={styles.captureError}>
              <Text style={styles.captureErrorText}>{captureError}</Text>
              {mode === "live" && (
                <Pressable
                  onPress={onFallbackToRecord}
                  style={styles.captureFallbackButton}
                >
                  <Text style={styles.captureFallbackButtonText}>
                    Record with Duna instead
                  </Text>
                </Pressable>
              )}
            </View>
          )}
          {!!visionNotice && (
            <View style={styles.visionNotice}>
              <Text numberOfLines={2} style={styles.visionNoticeText}>
                {visionNotice}
              </Text>
            </View>
          )}
          {isActive && visionSession && (
            <View style={styles.captureMomentActions}>
              <Pressable
                accessibilityLabel="Save favorite moment"
                onPress={() => void favoriteMoment()}
                style={styles.favoriteMomentButton}
              >
                <DunaIcon color={palette.sand} name="star" size={21} />
                <Text style={styles.favoriteMomentText}>Moment</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Insert a ten second instant replay"
                disabled={replayBusy}
                onPress={() => void insertInstantReplay()}
                style={styles.favoriteMomentButton}
              >
                {replayBusy ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <DunaIcon color="#ffffff" name="rotate" size={21} />
                )}
                <Text style={styles.favoriteMomentText}>Replay</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={
                  previewHidden ? "Show camera preview" : "Hide camera preview"
                }
                onPress={() => setPreviewHidden((current) => !current)}
                style={styles.favoriteMomentButton}
              >
                <DunaIcon
                  color="#ffffff"
                  name={previewHidden ? "eye" : "eye-off"}
                  size={21}
                />
                <Text style={styles.favoriteMomentText}>
                  {previewHidden ? "Show" : "Hide"}
                </Text>
              </Pressable>
            </View>
          )}
          {session && streamState === "live" && (
            <Pressable onPress={() => void share()} style={styles.sharePill}>
              <Text style={styles.sharePillText}>Share live link</Text>
            </Pressable>
          )}
          <Pressable
            disabled={
              !permissionsReady ||
              busy ||
              (!isActive && guidance?.orientationMatches === false)
            }
            onPress={() => void (isActive ? stop() : start())}
            style={[
              styles.captureButton,
              isActive && styles.captureButtonStop,
              (!permissionsReady ||
                busy ||
                (!isActive && guidance?.orientationMatches === false)) &&
                styles.disabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <View
                  style={[
                    styles.captureButtonCore,
                    isActive && styles.captureButtonCoreStop,
                  ]}
                />
                <Text style={styles.captureButtonText}>
                  {isActive
                    ? mode === "live"
                      ? "End stream"
                      : "Stop recording"
                    : mode === "live"
                      ? guidance?.orientationMatches === false
                        ? `Rotate to ${form.orientation}`
                        : guidance?.acceptable
                          ? "Lock + go live"
                          : "Go live"
                      : guidance?.orientationMatches === false
                        ? `Rotate to ${form.orientation}`
                        : guidance?.acceptable
                          ? "Lock + record"
                          : "Record"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
      {calibrationDraft && !isActive && (
        <CourtCalibrationEditor
          automaticGeometry={automaticGeometry}
          geometry={calibrationDraft}
          guidance={guidance}
          onCancel={() => setCalibrationDraft(undefined)}
          onChange={setCalibrationDraft}
          onSave={() => void saveCalibration()}
        />
      )}
      {showRemote && (
        <View accessibilityViewIsModal style={StyleSheet.absoluteFill}>
          <Pressable
            onPress={() => setShowRemote(false)}
            style={styles.remoteBackdrop}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={styles.remoteCard}
            >
              <View style={styles.remoteCardHeader}>
                <View style={styles.flex}>
                  <Text style={styles.remoteEyebrow}>DUNA VISION REMOTE</Text>
                  <Text style={styles.remoteTitle}>
                    Scan to control this camera
                  </Text>
                </View>
                <Pressable
                  onPress={() => setShowRemote(false)}
                  style={styles.remoteClose}
                >
                  <Text style={styles.remoteCloseText}>×</Text>
                </Pressable>
              </View>
              <Text style={styles.remoteBody}>
                A trusted iPhone or iPad can watch the preview, run the score,
                insert replays, take sponsor graphics, and start or end this{" "}
                {mode === "live" ? "live stream" : "recording"}. The link
                expires automatically.
              </Text>
              {visionAccess ? (
                <View style={styles.qrFrame}>
                  <QRCode
                    backgroundColor="#ffffff"
                    color={palette.navy}
                    size={214}
                    value={visionAccess.appUrl}
                  />
                </View>
              ) : (
                <ActivityIndicator color={palette.aqua} size="large" />
              )}
              <View style={styles.remoteConnectionRow}>
                <View
                  style={[
                    styles.remoteStatusDot,
                    visionSession?.remoteConnected &&
                      styles.remoteStatusDotLive,
                  ]}
                />
                <Text style={styles.remoteConnectionText}>
                  {visionSession?.remoteConnected
                    ? "Remote is connected"
                    : "Waiting for a remote device"}
                </Text>
              </View>
              {!!visionAccess && (
                <Pressable
                  onPress={() =>
                    void Share.share({
                      message: `Control ${form.title} in the Duna app: ${visionAccess.appUrl}\n\nBrowser fallback: ${visionAccess.remoteUrl}`,
                      url: visionAccess.appUrl,
                    })
                  }
                  style={styles.remoteShareButton}
                >
                  <Text style={styles.remoteShareText}>Share secure link</Text>
                </Pressable>
              )}
            </Pressable>
          </Pressable>
        </View>
      )}
    </View>
  );
}

type VideoComponentProps = ComponentProps<typeof Video>;
const MuxVideo = muxReactNativeVideo<VideoComponentProps>(Video);

function analysisStatusLabel(report: VideoAnalysisReport | undefined): string {
  if (!report?.run) return "READY FOR EVIDENCE";
  switch (report.run.status) {
    case "queued":
      return "ANALYSIS QUEUED";
    case "processing":
      return "ANALYSIS IN PROGRESS";
    case "ready":
      return "MODEL EVIDENCE READY";
    case "needs-review":
      return "COACH REVIEW NEEDED";
    case "failed":
      return "ANALYSIS NEEDS RETRY";
    default:
      return "ANALYSIS CANCELLED";
  }
}

function VisionAnalysisCard({
  client,
  playbackSeconds,
  teamA,
  teamB,
  videoId,
}: {
  readonly client: DunaApiClient;
  readonly playbackSeconds: number;
  readonly teamA: string;
  readonly teamB: string;
  readonly videoId: string;
}) {
  const [report, setReport] = useState<VideoAnalysisReport>();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [performanceReview, setPerformanceReview] =
    useState<VideoPerformanceReview>();
  const [courtSize, setCourtSize] = useState({ width: 0, height: 0 });

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      setReport(await client.player.videoAnalysisReport.query({ videoId }));
      setNotice(undefined);
    } catch (reason) {
      setNotice(displayError(reason));
    } finally {
      setLoading(false);
    }
  }, [client, videoId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const requestAnalysis = async () => {
    setBusy(true);
    try {
      const run = await client.player.requestVideoAnalysis.mutate({
        videoId,
        idempotencyKey: idempotencyKey(),
      });
      setNotice(
        run.status === "queued"
          ? "Analysis is queued. Watch score and your court tags are already available below."
          : "Duna Vision is processing the available evidence.",
      );
      await loadReport();
    } catch (reason) {
      setNotice(displayError(reason));
    } finally {
      setBusy(false);
    }
  };

  const requestPerformanceReview = async () => {
    if (!report?.run || busy) return;
    setBusy(true);
    try {
      const review =
        await client.player.requestOwnerVideoPerformanceReview.mutate({
          videoId,
          idempotencyKey: idempotencyKey(),
        });
      setPerformanceReview(review);
      setNotice(
        review.status === "succeeded"
          ? "Your evidence-only review is ready as private draft insights."
          : (review.fallbackReason ??
              "The evidence-only review is unavailable. Your Vision report remains private and unchanged."),
      );
    } catch (reason) {
      setNotice(displayError(reason));
    } finally {
      setBusy(false);
    }
  };

  const markLanding = async (x: number, y: number) => {
    if (!report || courtSize.width <= 0 || courtSize.height <= 0 || busy) {
      return;
    }
    setBusy(true);
    try {
      const next = await client.player.createVideoAnalysisMarker.mutate({
        videoId,
        sessionTimeUs: Math.max(0, Math.floor(playbackSeconds * 1_000_000)),
        eventType: "ball-landing",
        courtPoint: {
          xMeters: Math.max(
            0,
            Math.min(
              report.court.widthMeters,
              (x / courtSize.width) * report.court.widthMeters,
            ),
          ),
          yMeters: Math.max(
            0,
            Math.min(
              report.court.lengthMeters,
              (y / courtSize.height) * report.court.lengthMeters,
            ),
          ),
          observed: "visible",
        },
        label: `Coach-confirmed landing at ${formatClock(playbackSeconds)}`,
        idempotencyKey: idempotencyKey(),
      });
      setReport(next);
      setNotice(`Verified landing saved at ${formatClock(playbackSeconds)}.`);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (reason) {
      setNotice(displayError(reason));
    } finally {
      setBusy(false);
    }
  };

  const reviewObservation = async (
    eventId: string,
    decision: "confirmed" | "rejected",
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await client.player.reviewVideoAnalysisEvent.mutate({
        videoId,
        eventId,
        decision,
        note:
          decision === "confirmed"
            ? "Confirmed in Duna Player video review."
            : "Rejected in Duna Player video review.",
        idempotencyKey: idempotencyKey(),
      });
      setReport(next);
      setNotice(
        decision === "confirmed"
          ? "Observation confirmed and promoted into the report."
          : "Observation removed from report totals.",
      );
      void Haptics.notificationAsync(
        decision === "confirmed"
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Warning,
      );
    } catch (reason) {
      setNotice(displayError(reason));
    } finally {
      setBusy(false);
    }
  };

  const maxHeat = Math.max(
    1,
    ...(report?.heatmap.cells.map((cell) => cell.count) ?? [1]),
  );
  const sideLabel = (side: "a" | "b" | "unknown") =>
    side === "a" ? teamA : side === "b" ? teamB : "Unattributed";
  // A newly built Player can briefly talk to the previous API deployment
  // while production rolls forward. Keep playback safe during that window.
  const performance = report?.performance;

  return (
    <View style={styles.visionAnalysisCard}>
      <View style={styles.visionAnalysisHeader}>
        <View style={styles.flex}>
          <Text style={styles.visionAnalysisEyebrow}>DUNA VISION REPORT</Text>
          <Text style={styles.visionAnalysisTitle}>Evidence, not guesses.</Text>
        </View>
        <Text style={styles.visionAnalysisStatus}>
          {analysisStatusLabel(report)}
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={palette.aqua} />
      ) : report ? (
        <>
          <Text style={styles.visionAnalysisBody}>
            {report.heatmap.summary}
          </Text>
          <Pressable
            accessibilityHint="Places a verified ball landing at the current playback time."
            accessibilityLabel={`Court heatmap. ${report.heatmap.summary}. Double tap to mark the ball landing at ${formatClock(playbackSeconds)}.`}
            disabled={busy}
            onLayout={(event) => {
              const { height, width } = event.nativeEvent.layout;
              setCourtSize({ width, height });
            }}
            onPress={(event) =>
              void markLanding(
                event.nativeEvent.locationX,
                event.nativeEvent.locationY,
              )
            }
            style={styles.visionCourt}
          >
            <View style={styles.visionCourtNet} />
            {report.heatmap.cells.map((cell) => (
              <View
                key={`${cell.column}-${cell.row}`}
                pointerEvents="none"
                style={[
                  styles.visionHeatCell,
                  {
                    left: `${(cell.column / report.heatmap.columns) * 100}%`,
                    top: `${(cell.row / report.heatmap.rows) * 100}%`,
                    width: `${100 / report.heatmap.columns}%`,
                    height: `${100 / report.heatmap.rows}%`,
                    opacity: Math.min(
                      0.86,
                      0.22 + (cell.count / maxHeat) * 0.64,
                    ),
                  },
                ]}
              >
                <Text style={styles.visionHeatCellText}>{cell.count}</Text>
              </View>
            ))}
            <View pointerEvents="none" style={styles.visionCourtLabels}>
              <Text style={styles.visionCourtLabel}>OPPONENT</Text>
              <Text style={styles.visionCourtLabel}>YOUR SIDE</Text>
            </View>
            <View pointerEvents="none" style={styles.visionCourtTapHint}>
              <Text style={styles.visionCourtTapText}>
                TAP TO VERIFY A LANDING · {formatClock(playbackSeconds)}
              </Text>
            </View>
          </Pressable>

          <View style={styles.visionMetricsRow}>
            <View style={styles.visionMetric}>
              <Text style={styles.visionMetricValue}>
                {report.score.scoredRallies}
              </Text>
              <Text style={styles.visionMetricLabel}>SCORED RALLIES</Text>
            </View>
            <View style={styles.visionMetric}>
              <Text style={styles.visionMetricValue}>
                {report.heatmap.observedCount}
              </Text>
              <Text style={styles.visionMetricLabel}>VISIBLE LANDINGS</Text>
            </View>
            <View style={styles.visionMetric}>
              <Text style={styles.visionMetricValue}>
                {report.highlights.length}
              </Text>
              <Text style={styles.visionMetricLabel}>SAVED MOMENTS</Text>
            </View>
          </View>

          {performance && (
            <View style={styles.visionPerformanceCard}>
              <View style={styles.visionPerformanceHeader}>
                <View style={styles.flex}>
                  <Text style={styles.visionPerformanceEyebrow}>
                    VOLLEYBALL INTELLIGENCE
                  </Text>
                  <Text style={styles.visionPerformanceTitle}>
                    Rally and contact profile
                  </Text>
                </View>
                <Text style={styles.visionPerformanceCoverage}>
                  {performance.attributedContacts}/
                  {performance.contactObservations} ATTRIBUTED
                </Text>
              </View>
              <Text style={styles.visionPerformanceSummary}>
                {performance.summary}
              </Text>
              {performance.contactObservations > 0 ? (
                <>
                  <View style={styles.visionPerformanceMetrics}>
                    <View style={styles.visionPerformanceMetric}>
                      <Text style={styles.visionPerformanceValue}>
                        {performance.averageRallySeconds === undefined
                          ? "—"
                          : `${performance.averageRallySeconds}s`}
                      </Text>
                      <Text style={styles.visionPerformanceLabel}>
                        AVG RALLY
                      </Text>
                    </View>
                    <View style={styles.visionPerformanceMetric}>
                      <Text style={styles.visionPerformanceValue}>
                        {performance.averageContactsPerRally ?? "—"}
                      </Text>
                      <Text style={styles.visionPerformanceLabel}>
                        CONTACTS / RALLY
                      </Text>
                    </View>
                    <View style={styles.visionPerformanceMetric}>
                      <Text style={styles.visionPerformanceValue}>
                        {performance.maxAttackSpeedKph ??
                          performance.maxServeSpeedKph ??
                          "—"}
                      </Text>
                      <Text style={styles.visionPerformanceLabel}>
                        TOP SPEED KPH
                      </Text>
                    </View>
                  </View>
                  {performance.sides
                    .filter((side) => side.side !== "unknown")
                    .map((side) => (
                      <View key={side.side} style={styles.visionSideRow}>
                        <View style={styles.flex}>
                          <Text numberOfLines={1} style={styles.visionSideName}>
                            {sideLabel(side.side)}
                          </Text>
                          <Text style={styles.visionSideDetail}>
                            {side.kills}/{side.attacks} kills · {side.aces}/
                            {side.serves} aces · {side.blocks} blocks ·{" "}
                            {side.digs} digs
                          </Text>
                        </View>
                        <View style={styles.visionSideEfficiency}>
                          <Text style={styles.visionSideEfficiencyValue}>
                            {side.attackEfficiency === undefined
                              ? "—"
                              : `${Math.round(side.attackEfficiency * 100)}%`}
                          </Text>
                          <Text style={styles.visionSideEfficiencyLabel}>
                            ATTACK EFF.
                          </Text>
                        </View>
                      </View>
                    ))}
                </>
              ) : (
                <Text style={styles.visionPerformanceEmpty}>
                  Typed serve, pass, set, attack, block, and dig observations
                  will appear here when the analysis worker has real evidence.
                  Duna will not turn an unavailable contact into a zero.
                </Text>
              )}
              {performance.needsReview > 0 && (
                <Text style={styles.visionPerformanceReview}>
                  {performance.needsReview} lower-confidence model{" "}
                  {performance.needsReview === 1
                    ? "observation is"
                    : "observations are"}{" "}
                  held for review and excluded from these totals.
                </Text>
              )}
            </View>
          )}

          {report.run &&
            (report.run.status === "ready" ||
              report.run.status === "needs-review") && (
              <View style={styles.visionOwnerReviewCard}>
                <Text style={styles.visionOwnerReviewEyebrow}>
                  OWNER REVIEW · ADULT ONLY
                </Text>
                <Text style={styles.visionOwnerReviewTitle}>
                  Turn this evidence into private coaching drafts.
                </Text>
                <Text style={styles.visionOwnerReviewBody}>
                  Duna sends the completed 2D report—not raw video, identity, or
                  unseen play—to the governed review service. Nothing trains or
                  promotes a model. Available only to the adult video owner;
                  eligibility is checked again when requested.
                </Text>
                <Pressable
                  accessibilityLabel="Request an evidence-only performance review"
                  disabled={busy}
                  onPress={() => void requestPerformanceReview()}
                  style={[
                    styles.visionOwnerReviewButton,
                    busy && styles.disabled,
                  ]}
                >
                  <Text style={styles.visionOwnerReviewButtonText}>
                    {busy
                      ? "Preparing review…"
                      : performanceReview?.status === "succeeded"
                        ? "Request another evidence review"
                        : "Request evidence-only review"}
                  </Text>
                </Pressable>
                {performanceReview?.status === "succeeded" &&
                  performanceReview.recommendations.length > 0 && (
                    <View style={styles.visionOwnerReviewDrafts}>
                      {performanceReview.recommendations.map(
                        (recommendation) => (
                          <View
                            key={`${recommendation.category}-${recommendation.headline}`}
                            style={styles.visionOwnerReviewDraft}
                          >
                            <Text style={styles.visionOwnerReviewDraftTitle}>
                              {recommendation.headline}
                            </Text>
                            <Text style={styles.visionOwnerReviewDraftBody}>
                              {recommendation.guidance}
                            </Text>
                          </View>
                        ),
                      )}
                    </View>
                  )}
              </View>
            )}

          {report.reviewQueue.length > 0 && (
            <View style={styles.visionReviewRail}>
              <Text style={styles.visionReviewTitle}>COURTSIDE REVIEW</Text>
              {report.reviewQueue.slice(0, 3).map((item) => (
                <View key={item.id} style={styles.visionReviewItem}>
                  <View style={styles.flex}>
                    <Text style={styles.visionReviewItemTitle}>
                      {formatClock(item.sessionTimeUs / 1_000_000)} ·{" "}
                      {item.label}
                    </Text>
                    <Text style={styles.visionReviewItemMeta}>
                      {item.contactKind?.toUpperCase() ??
                        item.eventType?.replaceAll("-", " ").toUpperCase() ??
                        item.source.toUpperCase()}
                      {item.confidence === undefined
                        ? ""
                        : ` · ${Math.round(item.confidence * 100)}% confidence`}
                    </Text>
                  </View>
                  {item.reviewable && (
                    <View style={styles.visionReviewActions}>
                      <Pressable
                        accessibilityLabel={`Reject ${item.label}`}
                        disabled={busy}
                        onPress={() =>
                          void reviewObservation(item.id, "rejected")
                        }
                        style={styles.visionReviewReject}
                      >
                        <Text style={styles.visionReviewRejectText}>
                          Reject
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={`Confirm ${item.label}`}
                        disabled={busy}
                        onPress={() =>
                          void reviewObservation(item.id, "confirmed")
                        }
                        style={styles.visionReviewConfirm}
                      >
                        <Text style={styles.visionReviewConfirmText}>
                          Confirm
                        </Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}

          <Text style={styles.visionEvidenceNote}>
            {report.evidence.disclaimer}
          </Text>
          <Pressable
            disabled={busy}
            onPress={() =>
              void (report.run &&
              report.run.status !== "failed" &&
              report.run.status !== "cancelled"
                ? loadReport()
                : requestAnalysis())
            }
            style={[styles.visionAnalysisButton, busy && styles.disabled]}
          >
            <Text style={styles.visionAnalysisButtonText}>
              {busy
                ? "Working…"
                : report.run
                  ? "Refresh analysis status"
                  : "Analyze available evidence"}
            </Text>
          </Pressable>
        </>
      ) : (
        <Pressable
          disabled={busy}
          onPress={() => void requestAnalysis()}
          style={[styles.visionAnalysisButton, busy && styles.disabled]}
        >
          <Text style={styles.visionAnalysisButtonText}>
            {busy ? "Starting…" : "Start Duna Vision analysis"}
          </Text>
        </Pressable>
      )}
      {!!notice && <Text style={styles.visionAnalysisNotice}>{notice}</Text>}
    </View>
  );
}

export function VideoPlayerModal({
  client,
  metric,
  onClose,
  video,
}: {
  readonly client: DunaApiClient;
  readonly metric?: VideoMetric;
  readonly video: VideoSummary;
  readonly onClose: () => void;
}) {
  const [playback, setPlayback] = useState<VideoPlayback>();
  const [error, setError] = useState<string>();
  const [playbackSeconds, setPlaybackSeconds] = useState(0);
  const lastHeartbeat = useRef(0);
  const fallbackTeams = matchLabelTeams(video.match?.label);

  useEffect(() => {
    let active = true;
    void client.public.videoPlayback
      .query({ videoId: video.id, platform: "ios" })
      .then((result) => {
        if (active) setPlayback(result);
      })
      .catch((reason) => {
        if (active) setError(displayError(reason));
      });
    return () => {
      active = false;
    };
  }, [client, video.id]);

  useEffect(() => {
    if (video.status !== "live" || !video.match?.id) return;
    let active = true;
    const refresh = async () => {
      try {
        const scoring = await client.public.liveMatch.query({
          matchId: video.match!.id,
        });
        if (active) {
          setPlayback((current) =>
            current
              ? { ...current, liveScore: compactScore(scoring.score) }
              : current,
          );
        }
      } catch {
        // Keep playing if live scoring briefly becomes unavailable.
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 3_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [client, video.match, video.status]);

  const heartbeat = useCallback(
    (seconds: number, completed = false) => {
      if (!playback) return;
      const rounded = Math.max(0, Math.floor(seconds));
      if (!completed && rounded - lastHeartbeat.current < 10) return;
      lastHeartbeat.current = rounded;
      void client.public.videoViewHeartbeat.mutate({
        videoId: video.id,
        viewSessionId: playback.viewSessionId,
        watchedSeconds: rounded,
        completed,
      });
    },
    [client, playback, video.id],
  );

  const uri = playback
    ? playback.provider === "mux" && playback.playbackId
      ? `https://stream.mux.com/${playback.playbackId}.m3u8${playback.playbackToken ? `?token=${encodeURIComponent(playback.playbackToken)}` : ""}`
      : playback.sourceUrl
    : undefined;
  const commonProps: VideoComponentProps | undefined = uri
    ? {
        controls: true,
        onEnd: () => heartbeat(video.durationSeconds ?? 0, true),
        onProgress: (progress) => {
          setPlaybackSeconds(progress.currentTime);
          heartbeat(progress.currentTime);
        },
        poster: playback?.posterUrl,
        resizeMode: "contain",
        source: { uri },
        style: styles.player,
      }
    : undefined;
  const playbackScore = playback
    ? scoreAtTime(playback, playbackSeconds)
    : undefined;
  const playbackScoreboardEnabled = playback
    ? (playback.vision?.settings.overlayScoreboard ??
      (video.status === "live" && Boolean(video.match)))
    : false;
  const playbackHeartRate = heartRateAtTime(playback, playbackSeconds);
  const portrait = video.courtCalibration?.preferredOrientation === "portrait";

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible>
      <SafeAreaView style={styles.playerModal}>
        <View style={styles.modalHeaderDark}>
          <Pressable hitSlop={12} onPress={onClose} style={styles.playerDone}>
            <Text style={styles.headerActionLight}>Done</Text>
          </Pressable>
          <Text numberOfLines={1} style={styles.modalTitleLight}>
            {video.title}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <View
          style={[styles.playerStage, portrait && styles.playerStagePortrait]}
        >
          {!uri && !error && <ActivityIndicator color="#d4b77c" size="large" />}
          {!!error && <Text style={styles.playerError}>{error}</Text>}
          {commonProps &&
            (playback?.dataEnvironmentKey ? (
              <MuxVideo
                {...commonProps}
                muxOptions={{
                  application_name: "Duna Player",
                  application_version: "1.1.0",
                  data: {
                    env_key: playback.dataEnvironmentKey,
                    player_name: "Duna iOS",
                    player_software_version: "6.19.2",
                    video_id: video.id,
                    video_title: video.title,
                    video_series: video.event?.title,
                    video_stream_type:
                      video.status === "live" ? "live" : "on-demand",
                  },
                }}
              />
            ) : (
              <Video {...commonProps} />
            ))}
          {playback && playbackScoreboardEnabled && playbackScore && (
            <VisionScoreboard
              score={playbackScore}
              teamA={playback.vision?.settings.teamA ?? fallbackTeams.teamA}
              teamB={playback.vision?.settings.teamB ?? fallbackTeams.teamB}
            />
          )}
          {playbackHeartRate !== undefined && (
            <View style={styles.healthVideoOverlay}>
              <Text style={styles.healthVideoHeart}>♥</Text>
              <View>
                <Text style={styles.healthVideoValue}>
                  {Math.round(playbackHeartRate)} BPM
                </Text>
                <Text style={styles.healthVideoLabel}>PRIVATE DUNA HEALTH</Text>
              </View>
            </View>
          )}
        </View>
        <ScrollView
          contentContainerStyle={styles.playerInfo}
          showsVerticalScrollIndicator={false}
          style={styles.playerDetailsScroll}
        >
          <View style={styles.playerKickerRow}>
            {video.status === "live" && <View style={styles.liveDot} />}
            <Text style={styles.playerPrivacy}>
              {video.status === "live" ? "LIVE NOW" : "DUNA VIDEO"} ·{" "}
              {video.recordingVisibility === "public" ? "PUBLIC" : "PRIVATE"}
            </Text>
          </View>
          <Text style={styles.playerTitle}>{video.title}</Text>
          <Text style={styles.playerMeta}>
            {video.owner.displayName} · {video.category}
            {video.event ? ` · ${video.event.title}` : ""}
          </Text>
          {!!video.venue && (
            <View style={styles.playerVenue}>
              <Text style={styles.playerVenueIcon}>⌖</Text>
              <View style={styles.flex}>
                <Text style={styles.playerVenueName}>{video.venue.name}</Text>
                {!!video.venue.address && (
                  <Text style={styles.playerVenueAddress}>
                    {video.venue.address}
                  </Text>
                )}
              </View>
            </View>
          )}
          {metric && (
            <View style={styles.playerMetricCard}>
              <View style={styles.playerMetricItem}>
                <Text style={styles.playerMetricValue}>{metric.views}</Text>
                <Text style={styles.playerMetricLabel}>VIEWS</Text>
              </View>
              <View style={styles.playerMetricDivider} />
              <View style={styles.playerMetricItem}>
                <Text style={styles.playerMetricValue}>
                  {formatDuration(metric.watchedSeconds)}
                </Text>
                <Text style={styles.playerMetricLabel}>WATCHED</Text>
              </View>
              <View style={styles.playerMetricDivider} />
              <View style={styles.playerMetricItem}>
                <Text style={styles.playerMetricValue}>
                  {Math.round(metric.completionRate * 100)}%
                </Text>
                <Text style={styles.playerMetricLabel}>COMPLETION</Text>
              </View>
            </View>
          )}
          {playback?.isOwner && (
            <VisionAnalysisCard
              client={client}
              playbackSeconds={playbackSeconds}
              teamA={playback.vision?.settings.teamA ?? fallbackTeams.teamA}
              teamB={playback.vision?.settings.teamB ?? fallbackTeams.teamB}
              videoId={video.id}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function VideoCard({
  metric,
  onPress,
  video,
}: {
  readonly video: VideoSummary;
  readonly metric?: VideoMetric;
  readonly onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.videoCard}>
      <View style={styles.videoThumb}>
        {video.posterUrl && (
          <Image
            accessibilityIgnoresInvertColors
            resizeMode="cover"
            source={{ uri: video.posterUrl }}
            style={StyleSheet.absoluteFill}
          />
        )}
        <View style={styles.videoPlay}>
          <Text style={styles.videoPlayText}>▶</Text>
        </View>
        {video.status === "live" && (
          <View style={styles.liveBadge}>
            <View style={styles.liveBadgeDot} />
            <Text style={styles.liveBadgeText}>LIVE</Text>
          </View>
        )}
        <Text style={styles.videoThumbMeta}>
          {video.durationSeconds
            ? formatDuration(video.durationSeconds)
            : video.status.toUpperCase()}
        </Text>
      </View>
      <View style={styles.videoCardBody}>
        <Text numberOfLines={2} style={styles.videoTitle}>
          {video.title}
        </Text>
        <Text numberOfLines={1} style={styles.videoMeta}>
          {video.owner.displayName}
          {video.match ? ` · ${video.match.label}` : ""}
          {!video.match && video.event ? ` · ${video.event.title}` : ""}
        </Text>
        {metric ? (
          <Text style={styles.metricLine}>
            {metric.views} views · {formatDuration(metric.watchedSeconds)}{" "}
            watched
          </Text>
        ) : (
          <Text style={styles.videoPrivacy}>
            {video.recordingVisibility === "public" ? "Public" : "Private"} ·{" "}
            {video.source === "live"
              ? "Mux"
              : video.source === "upload"
                ? "Imported · calibration unavailable"
                : "Duna archive"}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export function VideoStudioScreen({
  active = true,
  onCreateMatch,
  onTransferStatus,
  runtime,
  theme = "light",
}: {
  /** Keep the offline-sync worker mounted while another Duna tab is open. */
  readonly active?: boolean;
  readonly onCreateMatch?: () => void;
  readonly onTransferStatus?: (status: VideoTransferStatus | undefined) => void;
  readonly runtime: PlayerRuntime;
  readonly theme?: DunaTheme;
}) {
  const client = runtime.client;
  const [studio, setStudio] = useState<VideoStudioData>();
  const [metrics, setMetrics] = useState<readonly VideoMetric[]>([]);
  const [loading, setLoading] = useState(Boolean(client));
  const [error, setError] = useState<string>();
  const [detailsMode, setDetailsMode] = useState<
    "live" | "record" | "upload"
  >();
  const [captureMode, setCaptureMode] = useState<"live" | "record">();
  const [captureActive, setCaptureActive] = useState(false);
  const [quickMatchOpen, setQuickMatchOpen] = useState(false);
  const [form, setForm] = useState<CaptureForm>(initialCaptureForm);
  const [savedCaptureDefaults, setSavedCaptureDefaults] =
    useState<StoredCaptureDefaults>();
  const [preparedVideo, setPreparedVideo] = useState<PreparedVideo>();
  const [visionSessionId, setVisionSessionId] = useState<string>();
  const [preparedCalibration, setPreparedCalibration] =
    useState<DunaCourtCalibration>();
  const [importedVision, setImportedVision] = useState<ImportedVisionSetup>();
  const [samplingImportedFrames, setSamplingImportedFrames] = useState(false);
  const [importedCourtDraft, setImportedCourtDraft] = useState<CourtGeometry>();
  const [editingImportedCourt, setEditingImportedCourt] = useState(false);
  const [identifyingImportedPlayers, setIdentifyingImportedPlayers] =
    useState(false);
  const [selectedVideo, setSelectedVideo] = useState<VideoSummary>();
  const [networkPreferences, setNetworkPreferences] =
    useState<VideoNetworkPreferences>(defaultVideoNetworkPreferences);
  const [offlineDrafts, setOfflineDrafts] = useState<
    readonly OfflineVideoDraft[]
  >([]);
  const [offlineNotice, setOfflineNotice] = useState<string>();
  const flushingOfflineUploads = useRef(false);
  const activeScreenRef = useRef(active);
  const uploadLiveActivity = useRef<
    Awaited<ReturnType<typeof startDunaLiveActivity>> | undefined
  >(undefined);

  useEffect(() => {
    activeScreenRef.current = active;
  }, [active]);

  const reportTransfer = useCallback(
    (status: VideoTransferStatus | undefined) => onTransferStatus?.(status),
    [onTransferStatus],
  );

  const updateUploadLiveActivity = useCallback(
    async (
      draft: OfflineVideoDraft,
      stage: "waiting" | "uploading" | "processing" | "complete",
      progress?: number,
    ) => {
      const status =
        stage === "waiting"
          ? "Waiting for Wi‑Fi"
          : stage === "uploading"
            ? "Uploading"
            : stage === "processing"
              ? "Duna Vision processing"
              : "Duna Vision processing";
      const props = {
        subjectId: draft.id,
        kind: "upload" as const,
        title: stage === "complete" ? "Upload complete" : "Duna video",
        subtitle: draft.fileName,
        status,
        progress,
        updatedAt: new Date().toISOString(),
      };
      if (stage === "complete") {
        const current = uploadLiveActivity.current;
        uploadLiveActivity.current = undefined;
        if (current) await current.end("default", props).catch(() => undefined);
        return;
      }
      if (!uploadLiveActivity.current) {
        uploadLiveActivity.current = await startDunaLiveActivity(props);
        return;
      }
      await uploadLiveActivity.current.update(props).catch(() => undefined);
    },
    [],
  );

  const load = useCallback(async () => {
    if (!client) return;
    setLoading(true);
    setError(undefined);
    try {
      const [nextStudio, nextMetrics] = await Promise.all([
        client.player.videoStudio.query(),
        client.player.videoMetrics.query(),
      ]);
      setStudio(nextStudio);
      setMetrics(nextMetrics);
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(captureDefaultsKey).then((stored) => {
      if (!active || !stored) return;
      try {
        const parsed = JSON.parse(stored) as StoredCaptureDefaults;
        if (
          parsed.orientation &&
          parsed.orientation !== "landscape" &&
          parsed.orientation !== "portrait"
        ) {
          return;
        }
        setSavedCaptureDefaults(parsed);
      } catch {
        // Ignore a stale local preference and use safe Duna defaults.
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const refreshOfflineDrafts = useCallback(async () => {
    const [preferences, drafts] = await Promise.all([
      loadVideoNetworkPreferences(),
      loadOfflineVideoDrafts(),
    ]);
    setNetworkPreferences(preferences);
    setOfflineDrafts(drafts);
    return { preferences, drafts };
  }, []);

  useEffect(() => {
    void refreshOfflineDrafts();
  }, [refreshOfflineDrafts]);

  const rememberCaptureDefaults = (nextForm: CaptureForm) => {
    const defaults = storedDefaults(nextForm);
    setSavedCaptureDefaults(defaults);
    void AsyncStorage.setItem(captureDefaultsKey, JSON.stringify(defaults));
  };

  const metricByVideo = useMemo(
    () => new Map(metrics.map((metric) => [metric.video.id, metric])),
    [metrics],
  );

  const openLive = async () => {
    const preferences = await loadVideoNetworkPreferences();
    const connection = await canUseVideoTransport("live", preferences);
    setNetworkPreferences(preferences);
    if (!connection.allowed) {
      setOfflineNotice(
        `${connection.reason ?? "Offline"}. Recording works locally; live video starts when an allowed connection is available.`,
      );
      return;
    }
    setPreparedVideo(undefined);
    setVisionSessionId(undefined);
    setPreparedCalibration(undefined);
    setImportedVision(undefined);
    setForm(captureFormFromDefaults(savedCaptureDefaults));
    setDetailsMode("live");
  };

  const chooseLibrary = async () => {
    const importId = Crypto.randomUUID();
    reportTransfer({
      id: importId,
      stage: "importing",
      title: "Importing your video",
      detail:
        "Duna is preparing a reliable local upload. You can keep using the app.",
    });
    try {
      const pickWithExpo = async (): Promise<PreparedVideo | null> => {
        const permission =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          throw new Error(
            "Photo library permission is needed to upload a video.",
          );
        }
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["videos"],
        });
        const asset = result.assets?.[0];
        if (result.canceled || !asset?.uri) return null;
        const localFile = new File(asset.uri);
        const bytes = asset.fileSize ?? localFile.size;
        if (!bytes || bytes <= 0) {
          throw new Error("Duna could not read the selected video size.");
        }
        const quickTime =
          asset.mimeType === "video/quicktime" ||
          asset.fileName?.toLowerCase().endsWith(".mov");
        const mimeType = quickTime ? "video/quicktime" : "video/mp4";
        const extension = quickTime ? "mov" : "mp4";
        return {
          fileUri: asset.uri,
          fileName: asset.fileName ?? `duna-upload-${Date.now()}.${extension}`,
          mimeType,
          bytes,
          durationSeconds: Math.max(
            1,
            Math.ceil((asset.duration ?? 1_000) / 1_000),
          ),
        };
      };
      let selected: PreparedVideo | null;
      try {
        // Expo's Photos picker is the most reliable route for iCloud-backed
        // and very large library assets, and returns a durable local URI.
        selected = await pickWithExpo();
      } catch (expoError) {
        if (Platform.OS !== "ios" || !VideoCapture) throw expoError;
        try {
          selected = await VideoCapture.pickVideo();
        } catch (nativeError) {
          throw nativeError instanceof Error ? nativeError : expoError;
        }
      }
      if (!selected) {
        reportTransfer(undefined);
        return;
      }
      setPreparedVideo(selected);
      setVisionSessionId(undefined);
      setPreparedCalibration(undefined);
      setImportedVision({ frames: [], players: [] });
      setForm(
        captureFormFromDefaults(savedCaptureDefaults, {
          category: "practice",
          title: "",
        }),
      );
      setSamplingImportedFrames(true);
      const sampler = VideoCapture?.sampleVideoFrames;
      if (typeof sampler === "function") {
        void sampler(selected.fileUri, 14)
          .then((frames) => {
            const bestCourt = [...frames].sort(
              (left, right) => right.courtScore - left.courtScore,
            )[0];
            const bestPlayers = [...frames].sort(
              (left, right) =>
                right.playerCount - left.playerCount ||
                right.courtScore - left.courtScore,
            )[0];
            setImportedVision((current) => ({
              frames,
              players: current?.players ?? [],
              courtFrameId: current?.courtFrameId ?? bestCourt?.id,
              playerFrameId: current?.playerFrameId ?? bestPlayers?.id,
              geometry: current?.geometry,
            }));
          })
          .catch(() => {
            // Imported footage remains uploadable even if its local filmstrip
            // cannot be generated on this particular format.
          })
          .finally(() => setSamplingImportedFrames(false));
      } else {
        setSamplingImportedFrames(false);
      }
      if (activeScreenRef.current) {
        setDetailsMode("upload");
        reportTransfer(undefined);
      } else {
        reportTransfer({
          id: importId,
          stage: "complete",
          title: "Video ready to review",
          detail: "Tap to add optional Duna Vision setup and start the upload.",
        });
      }
    } catch (reason) {
      setError(displayError(reason));
      reportTransfer({
        id: importId,
        stage: "failed",
        title: "Video import paused",
        detail: displayError(reason),
      });
    }
  };

  const recordNew = () => {
    setPreparedVideo(undefined);
    setVisionSessionId(undefined);
    setPreparedCalibration(undefined);
    setImportedVision(undefined);
    setForm(
      captureFormFromDefaults(savedCaptureDefaults, {
        title: "",
        category: "match",
      }),
    );
    setDetailsMode("record");
  };

  const queuePreparedVideo = useCallback(
    async (input: {
      readonly video: PreparedVideo;
      readonly nextForm: CaptureForm;
      readonly calibration?: DunaCourtCalibration;
      readonly sessionId?: string;
      readonly importedVision?: ImportedVisionPayload;
    }) => {
      const id = Crypto.randomUUID();
      const fileUri = await retainVideoForOfflineUpload({
        id,
        fileUri: input.video.fileUri,
        extension: input.video.fileName.split(".").at(-1),
      });
      const draft: OfflineVideoDraft = {
        id,
        createdAt: new Date().toISOString(),
        fileUri,
        fileName: input.video.fileName,
        mimeType: input.video.mimeType,
        bytes: input.video.bytes,
        durationSeconds: input.video.durationSeconds,
        payload: {
          form: input.nextForm,
          visionLearningConsentReceipt: createVisionLearningConsentReceipt(
            input.nextForm.contributeCalibration,
          ),
          beginIdempotencyKey: idempotencyKey(),
          completeIdempotencyKey: idempotencyKey(),
          cancelIdempotencyKey: idempotencyKey(),
          visionSessionId: input.sessionId,
          calibration: input.calibration,
          importedVision: input.importedVision,
        },
      };
      await enqueueOfflineVideoDraft(draft);
      setOfflineDrafts((current) => [
        ...current.filter((item) => item.id !== draft.id),
        draft,
      ]);
      return draft;
    },
    [],
  );

  const ensureImportedVisionSession = useCallback(
    async (
      draft: OfflineVideoDraft,
      payload: OfflineUploadPayload,
    ): Promise<OfflineUploadPayload> => {
      if (!client || payload.visionSessionId || !payload.importedVision) {
        return payload;
      }
      const created = await client.player.createVisionSession.mutate({
        title: payload.form.title,
        matchId: associationInput(payload.form.association).matchId,
        settings: importedVisionSettings(payload.form, payload.importedVision),
        idempotencyKey: idempotencyKey(),
      });
      const sessionId = created.session.id;
      const courtFrame = payload.importedVision.courtFrame;
      if (courtFrame) {
        await client.player.updateVisionPreview
          .mutate({
            sessionId,
            jpegBase64: courtFrame.jpegBase64,
            capturedAt: new Date().toISOString(),
          })
          .catch(() => undefined);
      }
      await client.player.appendVisionTimelineEvents
        .mutate({
          sessionId,
          events: [
            {
              id: Crypto.randomUUID(),
              sessionId,
              source: "iphone",
              type: "review-marker",
              elapsedMs: Math.max(
                0,
                Math.round((courtFrame?.timestampSeconds ?? 0) * 1_000),
              ),
              occurredAt: new Date().toISOString(),
              label: "Imported-video setup",
              payload: {
                source: "library-upload",
                courtFrameAtSeconds: courtFrame?.timestampSeconds,
                playerFrameAtSeconds:
                  payload.importedVision.playerFrameAtSeconds,
                playerPersonIds: payload.importedVision.playerIds,
                ...(payload.importedVision.geometry
                  ? geometrySettings(payload.importedVision.geometry)
                  : {}),
              },
            },
          ],
        })
        .catch(() => undefined);
      const nextPayload: OfflineUploadPayload = {
        ...payload,
        visionSessionId: sessionId,
      };
      const updatedDraft: OfflineVideoDraft = {
        ...draft,
        payload: { ...nextPayload },
      };
      await updateOfflineVideoDraft(updatedDraft);
      setOfflineDrafts((current) =>
        current.map((item) => (item.id === draft.id ? updatedDraft : item)),
      );
      return nextPayload;
    },
    [client],
  );

  const transferOfflineDraft = useCallback(
    async (
      draft: OfflineVideoDraft,
      onProgress?: (progress: number) => void,
      allowCellular = false,
    ) => {
      if (!client) {
        throw new Error(
          "Duna will upload this video when the Player app is ready.",
        );
      }
      const rawPayload = offlineUploadPayload(draft.payload);
      if (!rawPayload) {
        throw new Error("This local video is missing its Duna upload details.");
      }
      const payloadWithStableKeys: OfflineUploadPayload = {
        ...rawPayload,
        beginIdempotencyKey: rawPayload.beginIdempotencyKey ?? idempotencyKey(),
        completeIdempotencyKey:
          rawPayload.completeIdempotencyKey ?? idempotencyKey(),
        cancelIdempotencyKey:
          rawPayload.cancelIdempotencyKey ?? idempotencyKey(),
      };
      const storedForm =
        draft.payload.form && typeof draft.payload.form === "object"
          ? (draft.payload.form as Record<string, unknown>)
          : undefined;
      const consentWasNormalized =
        storedForm?.contributeCalibration !==
        rawPayload.form.contributeCalibration;
      const stableKeysChanged =
        payloadWithStableKeys.beginIdempotencyKey !==
          rawPayload.beginIdempotencyKey ||
        payloadWithStableKeys.completeIdempotencyKey !==
          rawPayload.completeIdempotencyKey ||
        payloadWithStableKeys.cancelIdempotencyKey !==
          rawPayload.cancelIdempotencyKey;
      const legacyConsentRevocation = legacyVisionConsentRevocationLocator({
        requested: storedForm?.contributeCalibration,
        receipt: rawPayload.visionLearningConsentReceipt,
        beginIdempotencyKey: payloadWithStableKeys.beginIdempotencyKey,
        uploadVideoId: payloadWithStableKeys.upload?.videoId,
        completedVideoId: draft.completedVideoId,
      });
      if (stableKeysChanged && !legacyConsentRevocation) {
        await updateOfflineVideoDraft({
          ...draft,
          payload: { ...payloadWithStableKeys },
        });
      }
      const reconciledLegacyVideo = legacyConsentRevocation
        ? await acknowledgeLegacyVisionConsentRevocation({
            locator: legacyConsentRevocation,
            revoke: (locator) =>
              client.player.revokeVideoVisionLearningConsent.mutate(locator),
            persistNormalizedConsent: () =>
              updateOfflineVideoDraft({
                ...draft,
                payload: { ...payloadWithStableKeys },
              }),
          })
        : undefined;
      if (consentWasNormalized && !legacyConsentRevocation) {
        await updateOfflineVideoDraft({
          ...draft,
          payload: { ...payloadWithStableKeys },
        });
      }
      let payload = await ensureImportedVisionSession(
        draft,
        payloadWithStableKeys,
      );
      const attachVisionSession = async (videoId: string) => {
        if (!payload.visionSessionId) return true;
        try {
          await client.player.attachVisionSessionToVideo.mutate({
            sessionId: payload.visionSessionId,
            videoId,
            idempotencyKey: payload.beginIdempotencyKey,
          });
          return true;
        } catch {
          // The video is already safe in Duna Cloud. Keep this tiny queue item
          // so the court-session link retries without uploading the original a
          // second time.
          return false;
        }
      };

      if (draft.completedVideoId) {
        return (await attachVisionSession(draft.completedVideoId))
          ? "complete"
          : "vision-link-pending";
      }

      const resumableVideoId =
        payload.upload?.videoId ?? reconciledLegacyVideo?.videoId;
      const session = resumableVideoId
        ? await client.player.resumeVideoUpload.query({
            videoId: resumableVideoId,
          })
        : await client.player.beginVideoUpload.mutate({
            title: payload.form.title,
            category: payload.form.category,
            ...associationInput(payload.form.association),
            venue: payload.form.venue,
            recordingVisibility: payload.form.recordingVisibility,
            publishedToProfile: payload.form.publishedToProfile,
            hasAudio: payload.form.hasAudio,
            visionLearningConsent: payload.form.contributeCalibration,
            originalFileName: draft.fileName,
            mimeType: draft.mimeType,
            bytes: draft.bytes,
            durationSeconds: draft.durationSeconds,
            courtCalibration: payload.calibration,
            idempotencyKey: payload.beginIdempotencyKey,
          });
      if (!payload.upload) {
        payload = {
          ...payload,
          upload: { videoId: session.videoId, uploadId: session.uploadId },
        };
        await updateOfflineVideoDraft({ ...draft, payload: { ...payload } });
      }
      // Background URLSession may have finished while React Native was not
      // running. Its persisted ETags are submitted only as reconciliation
      // hints; the API verifies each one with R2 ListParts.
      const completedParts = await getCompletedFileBackedParts(
        session.uploadId,
      );
      for (const part of completedParts) {
        await client.player.recordVideoUploadPart.mutate({
          videoId: session.videoId,
          partNumber: part.partNumber,
          etag: part.etag,
          sizeBytes: part.sizeBytes,
        });
      }
      const authoritative = await client.player.resumeVideoUpload.query({
        videoId: session.videoId,
      });
      const uploadedPartNumbers = new Set(authoritative.uploadedParts);
      const missingPartNumbers = Array.from(
        { length: session.totalParts },
        (_, index) => index + 1,
      ).filter((partNumber) => !uploadedPartNumbers.has(partNumber));
      onProgress?.(uploadedPartNumbers.size / session.totalParts);
      if (missingPartNumbers.length > 0) {
        // Presign first, then enqueue all missing parts in one native call.
        // Returning now is intentional: iOS owns the persisted URLSession
        // tasks after React Native is suspended, and foreground reconciliation
        // below will record ETags and complete only after R2 confirms them.
        const queuedParts: Array<{
          partNumber: number;
          uploadUrl: string;
          offset: number;
          length: number;
          contentType: string;
        }> = [];
        // Sign serially so a multi-gigabyte recording cannot create a burst of
        // dozens of simultaneous API mutations before iOS owns the transfer.
        for (const partNumber of missingPartNumbers) {
          const offset = (partNumber - 1) * session.partSizeBytes;
          const signed = await client.player.videoUploadPartUrl.mutate({
            videoId: session.videoId,
            partNumber,
          });
          queuedParts.push({
            partNumber,
            uploadUrl: signed.url,
            offset,
            length: Math.min(session.partSizeBytes, draft.bytes - offset),
            contentType: draft.mimeType,
          });
        }
        if (Platform.OS === "ios" && isBackgroundUploadAvailable()) {
          await enqueueFileBackedParts({
            uploadId: session.uploadId,
            fileUri: draft.fileUri,
            allowCellular,
            parts: queuedParts,
          });
          return "upload-queued";
        }
        // Android and web keep their original foreground behavior. This path
        // uses a file slice directly and makes no background-durability claim.
        for (const part of queuedParts) {
          const etag = await uploadOfflineVideoRange({
            fileUri: draft.fileUri,
            uploadUrl: part.uploadUrl,
            offset: part.offset,
            length: part.length,
            contentType: part.contentType,
          });
          await client.player.recordVideoUploadPart.mutate({
            videoId: session.videoId,
            partNumber: part.partNumber,
            etag,
            sizeBytes: part.length,
          });
          onProgress?.(part.partNumber / session.totalParts);
        }
      }
      await client.player.completeVideoUpload.mutate({
        videoId: session.videoId,
        idempotencyKey: payload.completeIdempotencyKey,
      });
      // R2 completion is authoritative. Only now may native local state be
      // discarded; a transient completion failure keeps every staged retry.
      await cancelFileBackedUpload(session.uploadId).catch(() => undefined);
      const completedDraft = {
        ...draft,
        completedVideoId: session.videoId,
        payload: { ...payload },
      };
      // Persist the completed object before attaching metadata. If Wi-Fi
      // drops on the next request, the retry only links Vision evidence; it
      // never creates a duplicate full-video upload.
      await updateOfflineVideoDraft(completedDraft);
      return (await attachVisionSession(session.videoId))
        ? "complete"
        : "vision-link-pending";
    },
    [client, ensureImportedVisionSession],
  );

  const cancelOfflineVideoDraft = useCallback(
    async (draft: OfflineVideoDraft) => {
      const rawPayload = offlineUploadPayload(draft.payload);
      let payload = rawPayload;
      if (rawPayload && !rawPayload.cancelIdempotencyKey) {
        payload = {
          ...rawPayload,
          beginIdempotencyKey:
            rawPayload.beginIdempotencyKey ?? idempotencyKey(),
          completeIdempotencyKey:
            rawPayload.completeIdempotencyKey ?? idempotencyKey(),
          cancelIdempotencyKey: idempotencyKey(),
        };
        await updateOfflineVideoDraft({ ...draft, payload: { ...payload } });
      }
      if (payload?.upload) {
        if (!client) {
          throw new Error("Reconnect Duna before cancelling an active upload.");
        }
        await client.player.abortVideoUpload.mutate({
          videoId: payload.upload.videoId,
          idempotencyKey: payload.cancelIdempotencyKey,
        });
        await cancelFileBackedUpload(payload.upload.uploadId).catch(
          () => undefined,
        );
      }
      await removeOfflineVideoDraft(draft.id);
      setOfflineDrafts((current) =>
        current.filter((item) => item.id !== draft.id),
      );
      setOfflineNotice("Saved video upload cancelled and local copy removed.");
    },
    [client],
  );

  const flushOfflineUploads = useCallback(async () => {
    if (!client || flushingOfflineUploads.current) return;
    flushingOfflineUploads.current = true;
    try {
      const { preferences, drafts } = await refreshOfflineDrafts();
      const connection = await canUseVideoTransport("upload", preferences);
      if (drafts.length === 0) return;
      if (!connection.allowed) {
        const draft = drafts[0]!;
        reportTransfer({
          id: draft.id,
          stage: "waiting",
          title: "Video safely saved",
          detail:
            connection.reason ??
            "Duna will begin the upload on your next allowed connection.",
        });
        void updateUploadLiveActivity(draft, "waiting");
        return;
      }
      for (const draft of drafts) {
        try {
          reportTransfer({
            id: draft.id,
            stage: "uploading",
            title: "Uploading to Duna Cloud",
            detail: "You can keep using Duna while this video uploads.",
            progress: 0,
          });
          void updateUploadLiveActivity(draft, "uploading", 0);
          const result = await transferOfflineDraft(
            draft,
            (progress) => {
              reportTransfer({
                id: draft.id,
                stage: "uploading",
                title: "Uploading to Duna Cloud",
                detail: `${Math.round(progress * 100)}% · You can keep using Duna.`,
                progress,
              });
              void updateUploadLiveActivity(draft, "uploading", progress);
            },
            preferences.allowCellularUploads,
          );
          if (result === "upload-queued") {
            setOfflineNotice(
              "All video parts are safely queued with iOS. Duna will reconcile them when the app returns to the foreground.",
            );
            reportTransfer({
              id: draft.id,
              stage: "uploading",
              title: "Upload running in the background",
              detail:
                "Every remaining video part is scheduled. Keep the original safe until Duna confirms completion.",
            });
            break;
          }
          if (result === "vision-link-pending") {
            setOfflineNotice(
              "Your video reached Duna Cloud. Its court evidence will link as soon as the connection is stable.",
            );
            reportTransfer({
              id: draft.id,
              stage: "processing",
              title: "Video uploaded",
              detail:
                "Duna Vision will connect its court setup when the connection is stable.",
              progress: 1,
            });
            void updateUploadLiveActivity(draft, "complete", 1);
            break;
          }
          await removeOfflineVideoDraft(draft.id);
          setOfflineDrafts((current) =>
            current.filter((item) => item.id !== draft.id),
          );
          setOfflineNotice(
            "A saved video reached Duna Cloud and is processing.",
          );
          reportTransfer({
            id: draft.id,
            stage: "processing",
            title: "Upload complete",
            detail:
              "Duna Vision is processing your video. We’ll let you know when it is ready.",
            progress: 1,
          });
          void updateUploadLiveActivity(draft, "complete", 1);
          await load();
        } catch (reason) {
          // Keep the protected local original and retry after the next network
          // change rather than surfacing a disruptive failure during capture.
          reportTransfer({
            id: draft.id,
            stage: "waiting",
            title: "Upload paused safely",
            detail: `${displayError(reason)} Duna will retry automatically.`,
          });
          break;
        }
      }
    } finally {
      flushingOfflineUploads.current = false;
    }
  }, [
    client,
    load,
    refreshOfflineDrafts,
    reportTransfer,
    transferOfflineDraft,
    updateUploadLiveActivity,
  ]);

  useEffect(() => {
    void flushOfflineUploads();
    const network = subscribeToVideoNetwork(() => {
      void flushOfflineUploads();
    });
    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") void flushOfflineUploads();
    });
    return () => {
      network.remove();
      appState.remove();
    };
  }, [flushOfflineUploads]);

  const upload = async () => {
    if (!preparedVideo) return;
    setError(undefined);
    try {
      // Copy first. A recorded video can be a temporary OS file; this ensures
      // it survives a flight, tunnel, or an interrupted upload.
      const draft = await queuePreparedVideo({
        video: preparedVideo,
        nextForm: form,
        calibration: preparedCalibration,
        sessionId: visionSessionId,
        importedVision: importedVisionPayload(importedVision),
      });
      setOfflineNotice(
        Platform.OS === "ios"
          ? "Your video is safe on this iPhone. Duna will upload it in the background on your next allowed connection."
          : "Your video is saved on this device. Keep Duna open while its foreground upload runs; it will pause safely if you leave the app.",
      );
      reportTransfer({
        id: draft.id,
        stage: "waiting",
        title: "Video queued safely",
        detail:
          "Duna will upload while you keep playing, planning, and browsing.",
      });
      void updateUploadLiveActivity(draft, "waiting");
      setDetailsMode(undefined);
      setPreparedVideo(undefined);
      setVisionSessionId(undefined);
      setPreparedCalibration(undefined);
      setImportedVision(undefined);
      rememberCaptureDefaults(form);
      setForm(captureFormFromDefaults(savedCaptureDefaults));
      void flushOfflineUploads();
    } catch (reason) {
      setError(displayError(reason));
    }
  };

  const isIos = Platform.OS === "ios";
  const entitlement = studio?.entitlement ?? runtime.settings?.dunaPlus;
  const plan = MEMBERSHIP_PLANS[entitlement?.plan ?? "free"];
  const canBroadcast = Boolean(
    studio?.canBroadcast ??
    (entitlement?.active && plan.monthlyLiveSeconds > 0),
  );
  const liveUsed = studio?.usage.live.usedSeconds ?? 0;
  const liveLimit = studio?.usage.live.limitSeconds ?? plan.monthlyLiveSeconds;
  const uploadUsed = studio?.usage.uploads.usedSeconds ?? 0;
  const uploadLimit =
    studio?.usage.uploads.limitSeconds ?? plan.monthlyUploadSeconds;
  const livePercent = Math.min(1, liveUsed / Math.max(1, liveLimit));
  const uploadPercent = Math.min(1, uploadUsed / Math.max(1, uploadLimit));
  const videoSurfaceVisible = Boolean(
    detailsMode || captureMode || quickMatchOpen,
  );
  const closeVideoSurface = () => {
    if (captureMode) {
      if (captureActive) {
        Alert.alert(
          captureMode === "live"
            ? "End the live stream first"
            : "Stop recording first",
          "Duna is keeping the camera session open so the video can finish safely.",
        );
        return;
      }
      VideoCapture?.releasePreview();
      setCaptureMode(undefined);
      return;
    }
    if (identifyingImportedPlayers) {
      setIdentifyingImportedPlayers(false);
      return;
    }
    if (editingImportedCourt) {
      setEditingImportedCourt(false);
      return;
    }
    if (quickMatchOpen) {
      setQuickMatchOpen(false);
      return;
    }
    setDetailsMode(undefined);
  };

  const openQuickMatch = () => {
    if (client && runtime.dashboard?.player) {
      setQuickMatchOpen(true);
      return;
    }
    setDetailsMode(undefined);
    setTimeout(() => onCreateMatch?.(), 280);
  };

  if (!active) return null;

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.screen}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.liveMark}>
              <View style={styles.liveMarkCore} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>DUNA VIDEO</Text>
              <Text style={styles.heroTitle}>
                Your game, live and on record.
              </Text>
            </View>
          </View>
          <Text style={styles.heroBody}>
            Choose how you want to capture. Both Duna recording and live mode
            keep Apple Watch scoring, favorite moments, overlays, and the remote
            camera preview in sync.
          </Text>
          {entitlement?.kind === "complimentary" && (
            <View style={styles.complimentaryBadge}>
              <Text style={styles.complimentaryText}>
                ✦ Complimentary Premium+
              </Text>
            </View>
          )}
          {!isIos && (
            <Text style={styles.iosNote}>
              Live capture launches on iPhone first. You can import an MP4 from
              this device library, then keep Duna open while its foreground
              upload runs.
            </Text>
          )}
          <View style={styles.captureChoiceStack}>
            <Pressable
              disabled={!isIos || !client}
              onPress={recordNew}
              style={[
                styles.captureChoiceCard,
                styles.captureChoiceCardRecord,
                (!isIos || !client) && styles.disabled,
              ]}
            >
              <View style={styles.captureChoiceIcon}>
                <View style={styles.captureChoiceRecordCore} />
              </View>
              <View style={styles.captureChoiceCopy}>
                <View style={styles.captureChoiceHeading}>
                  <Text style={styles.captureChoiceTitle}>
                    Record with Duna
                  </Text>
                  <Text style={styles.captureChoiceBadge}>PRIVATE FIRST</Text>
                </View>
                <Text style={styles.captureChoiceBody}>
                  Save full-quality video on this iPhone while your Watch
                  scores, marks highlights, and checks the camera. Duna uploads
                  when the connection you allow is available.
                </Text>
              </View>
            </Pressable>
            <Pressable
              disabled={!isIos || !client || !canBroadcast}
              onPress={() => void openLive()}
              style={[
                styles.captureChoiceCard,
                styles.captureChoiceCardLive,
                (!isIos || !client || !canBroadcast) && styles.disabled,
              ]}
            >
              <View style={styles.captureChoiceIconLive}>
                <View style={styles.liveButtonDot} />
              </View>
              <View style={styles.captureChoiceCopy}>
                <View style={styles.captureChoiceHeading}>
                  <Text style={styles.captureChoiceTitleLight}>Go Live</Text>
                  <Text style={styles.captureChoiceBadgeLight}>
                    {canBroadcast ? "PREMIUM+" : "PLAN REQUIRED"}
                  </Text>
                </View>
                <Text style={styles.captureChoiceBodyLight}>
                  Broadcast now with the same Watch controls and decide who can
                  watch live and after the match.
                </Text>
              </View>
            </Pressable>
          </View>
          <Pressable
            disabled={!client}
            onPress={() => void chooseLibrary()}
            style={[styles.libraryButton, !client && styles.disabled]}
          >
            <Text style={styles.libraryButtonText}>
              Upload an existing video
            </Text>
            <Text style={styles.libraryButtonMeta}>
              From your device library
            </Text>
          </Pressable>
        </View>

        {preparedVideo && !detailsMode && (
          <View style={styles.readyImportCard}>
            <View style={styles.readyImportIcon}>
              <Text style={styles.readyImportIconText}>✓</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.readyImportTitle}>Video ready to review</Text>
              <Text style={styles.readyImportBody}>
                Add optional court and player hints, then{" "}
                {isIos
                  ? "Duna uploads in the background."
                  : "keep Duna open while its foreground upload runs."}
              </Text>
            </View>
            <Pressable
              onPress={() => setDetailsMode("upload")}
              style={styles.readyImportAction}
            >
              <Text style={styles.readyImportActionText}>Review</Text>
            </Pressable>
          </View>
        )}

        {(offlineDrafts.length > 0 || offlineNotice) && (
          <View style={styles.offlineQueueCard}>
            <View style={styles.offlineQueueIcon}>
              <Text style={styles.offlineQueueIconText}>⇅</Text>
            </View>
            <View style={styles.flex}>
              <Text style={styles.offlineQueueTitle}>
                {offlineDrafts.length > 0
                  ? `${offlineDrafts.length} video${offlineDrafts.length === 1 ? "" : "s"} safely on this device`
                  : "Duna Cloud sync"}
              </Text>
              <Text style={styles.offlineQueueBody}>
                {offlineNotice ??
                  (networkPreferences.allowCellularUploads
                    ? isIos
                      ? "Duna will use Wi‑Fi or cellular data to finish the upload."
                      : "Keep Duna open to use Wi‑Fi or cellular data for this upload."
                    : isIos
                      ? "Duna will start uploading automatically on Wi‑Fi."
                      : "Keep Duna open and connect to Wi‑Fi to continue this upload.")}
              </Text>
            </View>
            {offlineDrafts.length > 0 && (
              <View style={styles.offlineQueueActions}>
                <Pressable
                  accessibilityLabel="Retry saved video uploads"
                  onPress={() => void flushOfflineUploads()}
                  style={styles.offlineQueueAction}
                >
                  <Text style={styles.offlineQueueActionText}>Sync now</Text>
                </Pressable>
                <Pressable
                  accessibilityLabel="Cancel saved video upload"
                  onPress={() =>
                    void cancelOfflineVideoDraft(offlineDrafts[0]!).catch(
                      (reason) => setError(displayError(reason)),
                    )
                  }
                  style={styles.offlineQueueCancel}
                >
                  <Text style={styles.offlineQueueCancelText}>Cancel</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {!!error && (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            {!!client && (
              <Pressable onPress={() => void load()}>
                <Text style={styles.textAction}>Try again</Text>
              </Pressable>
            )}
          </View>
        )}
        {loading && (
          <ActivityIndicator color={palette.aqua} style={styles.loader} />
        )}

        <View style={styles.usageCard}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.eyebrow}>THIS MONTH</Text>
              <Text style={styles.sectionTitle}>Video allowance</Text>
            </View>
            <Text style={styles.usagePlan}>
              {studio?.quotaScope.label ?? entitlement?.label ?? "Duna Player"}
            </Text>
          </View>
          <View style={styles.usageRow}>
            <View style={styles.usageLabels}>
              <Text style={styles.usageTitle}>Live streaming</Text>
              <Text style={styles.usageValue}>
                {formatDuration(liveUsed)} of {formatDuration(liveLimit)}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${livePercent * 100}%` },
                ]}
              />
            </View>
          </View>
          <View style={styles.usageRow}>
            <View style={styles.usageLabels}>
              <Text style={styles.usageTitle}>Uploaded video</Text>
              <Text style={styles.usageValue}>
                {formatDuration(uploadUsed)} of {formatDuration(uploadLimit)}
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFillSand,
                  { width: `${uploadPercent * 100}%` },
                ]}
              />
            </View>
            <Text style={styles.usageFootnote}>
              Upload and live allowances reset monthly. Existing videos remain
              in your cloud library.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.eyebrow}>WATCH NOW</Text>
              <Text style={styles.sectionTitle}>Live around Duna</Text>
            </View>
            <Text style={styles.countBadge}>{studio?.liveNow.length ?? 0}</Text>
          </View>
          {studio?.liveNow.map((video) => (
            <VideoCard
              key={video.id}
              onPress={() => setSelectedVideo(video)}
              video={video}
            />
          ))}
          {!loading && (studio?.liveNow.length ?? 0) === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                No public streams right now.
              </Text>
              <Text style={styles.emptyBody}>
                Public event and match streams will appear here. Link-only
                streams stay out of discovery.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <View>
              <Text style={styles.eyebrow}>YOUR ARCHIVE</Text>
              <Text style={styles.sectionTitle}>Videos and performance</Text>
            </View>
            <Text style={styles.countBadge}>{studio?.videos.length ?? 0}</Text>
          </View>
          {studio?.videos.map((video) => (
            <VideoCard
              key={video.id}
              metric={metricByVideo.get(video.id)}
              onPress={() => setSelectedVideo(video)}
              video={video}
            />
          ))}
          {!loading && (studio?.videos.length ?? 0) === 0 && (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                Your video archive is empty.
              </Text>
              <Text style={styles.emptyBody}>
                Practice uploads begin private. You decide later which videos
                become part of your public profile.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.analyticsDisclosure}>
          <Text style={styles.analyticsTitle}>Analytics you can trust</Text>
          <Text style={styles.analyticsBody}>
            Duna reports high-confidence ground position and an analytics
            quality grade. Monocular height and apex values remain estimates
            with confidence—not centimeter-perfect claims.
          </Text>
        </View>
      </ScrollView>

      <Modal
        animationType={captureMode ? "fade" : "slide"}
        onRequestClose={closeVideoSurface}
        visible={videoSurfaceVisible}
      >
        {captureMode && client && (
          <CaptureExperience
            client={client}
            form={form}
            key={`${captureMode}:${form.orientation}`}
            mode={captureMode}
            networkPreferences={networkPreferences}
            onActiveChange={setCaptureActive}
            onClose={() => {
              if (captureActive) return;
              VideoCapture?.releasePreview();
              setCaptureMode(undefined);
            }}
            onFallbackToRecord={() => {
              VideoCapture?.releasePreview();
              setCaptureMode("record");
            }}
            onFinished={load}
            onRecorded={(video, calibration, nextVisionSessionId) => {
              VideoCapture?.releasePreview();
              setPreparedVideo(video);
              setPreparedCalibration(calibration);
              setVisionSessionId(nextVisionSessionId);
              setCaptureMode(undefined);
              setDetailsMode("upload");
            }}
            onRestartOrientation={(orientation) => {
              if (captureActive) return;
              setForm((current) => ({ ...current, orientation }));
            }}
            preferSrt={studio?.broadcast.activeClientIngest === "srt"}
          />
        )}
        {!captureMode &&
          quickMatchOpen &&
          client &&
          runtime.dashboard?.player && (
            <QuickRecordingMatchSetup
              client={client}
              host={runtime.dashboard.player}
              onCancel={() => setQuickMatchOpen(false)}
              onCreated={(association) => {
                setForm((current) => ({
                  ...current,
                  category: "match",
                  association,
                  title: association.title,
                  venue: association.venue ?? current.venue,
                  courtWidthMeters:
                    association.captureDefaults?.courtWidthMeters ??
                    current.courtWidthMeters,
                  courtLengthMeters:
                    association.captureDefaults?.courtLengthMeters ??
                    current.courtLengthMeters,
                  netHeightMeters:
                    association.captureDefaults?.netHeightMeters ??
                    current.netHeightMeters,
                  orientation:
                    association.captureDefaults?.orientation ??
                    current.orientation,
                }));
                setQuickMatchOpen(false);
                void load();
              }}
              venue={form.venue}
            />
          )}
        {!captureMode &&
          !quickMatchOpen &&
          identifyingImportedPlayers &&
          detailsMode && (
            <PlayerPickerModal
              embedded
              maxSelected={8}
              onChange={(players) =>
                setImportedVision((current) =>
                  current ? { ...current, players } : current,
                )
              }
              onClose={() => setIdentifyingImportedPlayers(false)}
              palette={importedPlayerPalette}
              selected={importedVision?.players ?? []}
              title="Who appears in this video?"
              visible
            />
          )}
        {!captureMode &&
          !quickMatchOpen &&
          editingImportedCourt &&
          importedVision &&
          importedCourtDraft && (
            <View style={styles.importedCalibrationScene}>
              {frameForId(importedVision, importedVision.courtFrameId) && (
                <Image
                  source={{
                    uri:
                      "data:image/jpeg;base64," +
                      frameForId(importedVision, importedVision.courtFrameId)!
                        .jpegBase64,
                  }}
                  style={styles.importedCalibrationImage}
                />
              )}
              <CourtCalibrationEditor
                automaticGeometry={geometryFromGuidance(undefined)}
                geometry={importedCourtDraft}
                onCancel={() => setEditingImportedCourt(false)}
                onChange={setImportedCourtDraft}
                onSave={() => {
                  setImportedVision((current) =>
                    current
                      ? { ...current, geometry: importedCourtDraft }
                      : current,
                  );
                  setEditingImportedCourt(false);
                }}
              />
            </View>
          )}
        {!captureMode &&
          !quickMatchOpen &&
          !identifyingImportedPlayers &&
          !editingImportedCourt &&
          detailsMode && (
            <VideoDetailsForm
              broadcast={studio?.broadcast}
              client={client}
              form={form}
              importedVision={importedVision}
              importedVisionLoading={samplingImportedFrames}
              mode={detailsMode}
              onCreateMatch={openQuickMatch}
              onCancel={() => setDetailsMode(undefined)}
              onChange={setForm}
              onContinue={() => {
                rememberCaptureDefaults(form);
                if (detailsMode === "live") {
                  setDetailsMode(undefined);
                  setCaptureMode("live");
                } else if (detailsMode === "record") {
                  setDetailsMode(undefined);
                  setCaptureMode("record");
                } else {
                  void upload();
                }
              }}
              onEditImportedCourt={() => {
                if (!importedVision) return;
                setImportedCourtDraft(
                  importedVision.geometry ?? geometryFromGuidance(undefined),
                );
                setEditingImportedCourt(true);
              }}
              onIdentifyImportedPlayers={() =>
                setIdentifyingImportedPlayers(true)
              }
              onImportedVisionChange={setImportedVision}
              onYoutubeConnectionsChanged={load}
              preparedVideo={preparedVideo}
              foregroundOnlyUpload={!isIos}
              theme={theme}
            />
          )}
      </Modal>

      {selectedVideo && client && (
        <VideoPlayerModal
          client={client}
          metric={metricByVideo.get(selectedVideo.id)}
          onClose={() => setSelectedVideo(undefined)}
          video={selectedVideo}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screen: { gap: 18, padding: 18, paddingBottom: 120 },
  hero: {
    backgroundColor: palette.navy,
    borderRadius: 24,
    gap: 16,
    overflow: "hidden",
    padding: 20,
  },
  heroTop: { alignItems: "center", flexDirection: "row", gap: 14 },
  liveMark: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.13)",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  liveMarkCore: {
    backgroundColor: "#ff7a59",
    borderRadius: 7,
    height: 14,
    width: 14,
  },
  eyebrow: {
    color: palette.aqua,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 25,
    fontWeight: "800",
    letterSpacing: -0.7,
    lineHeight: 29,
  },
  heroBody: { color: "#dfe5e4", fontSize: 14, lineHeight: 21 },
  complimentaryBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(212,183,124,0.16)",
    borderColor: "rgba(212,183,124,0.5)",
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  complimentaryText: { color: palette.sand, fontSize: 12, fontWeight: "800" },
  iosNote: { color: palette.sand, fontSize: 12, lineHeight: 18 },
  captureChoiceStack: { gap: 10 },
  captureChoiceCard: {
    alignItems: "center",
    borderRadius: 18,
    flexDirection: "row",
    gap: 13,
    minHeight: 112,
    padding: 15,
  },
  captureChoiceCardRecord: {
    backgroundColor: "#ffffff",
    borderColor: "rgba(61,102,114,0.45)",
    borderWidth: 1,
  },
  captureChoiceCardLive: { backgroundColor: palette.flare },
  captureChoiceIcon: {
    alignItems: "center",
    backgroundColor: palette.aquaSoft,
    borderRadius: 25,
    height: 50,
    justifyContent: "center",
    width: 50,
  },
  captureChoiceIconLive: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 25,
    height: 50,
    justifyContent: "center",
    width: 50,
  },
  captureChoiceRecordCore: {
    backgroundColor: palette.aqua,
    borderRadius: 11,
    height: 22,
    width: 22,
  },
  liveButtonDot: {
    backgroundColor: "#ffffff",
    borderRadius: 9,
    height: 18,
    width: 18,
  },
  captureChoiceCopy: { flex: 1, gap: 6 },
  captureChoiceHeading: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  captureChoiceTitle: { color: palette.ink, fontSize: 17, fontWeight: "900" },
  captureChoiceTitleLight: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "900",
  },
  captureChoiceBadge: {
    backgroundColor: palette.aquaSoft,
    borderRadius: 10,
    color: palette.navy,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  captureChoiceBadgeLight: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 10,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
    overflow: "hidden",
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  captureChoiceBody: { color: palette.muted, fontSize: 12, lineHeight: 16 },
  captureChoiceBodyLight: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 12,
    lineHeight: 16,
  },
  libraryButton: {
    borderColor: "rgba(255,255,255,0.36)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 2,
    minHeight: 54,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  libraryButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  libraryButtonMeta: { color: "rgba(255,255,255,0.65)", fontSize: 12 },
  disabled: { opacity: 0.42 },
  errorCard: {
    alignItems: "center",
    backgroundColor: "#fff1ef",
    borderColor: "#f2c3ba",
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 13,
  },
  errorText: { color: palette.danger, flex: 1, fontSize: 12, lineHeight: 17 },
  textAction: { color: palette.aqua, fontSize: 12, fontWeight: "800" },
  loader: { marginVertical: 10 },
  offlineQueueAction: {
    alignItems: "center",
    borderColor: "rgba(61,102,114,0.28)",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 11,
  },
  offlineQueueActionText: {
    color: palette.aqua,
    fontSize: 12,
    fontWeight: "900",
  },
  offlineQueueActions: { gap: 6 },
  offlineQueueCancel: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 28,
    paddingHorizontal: 8,
  },
  offlineQueueCancelText: {
    color: palette.danger,
    fontSize: 12,
    fontWeight: "800",
  },
  offlineQueueBody: {
    color: "#526d65",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
  },
  offlineQueueCard: {
    alignItems: "center",
    backgroundColor: "#edf4f0",
    borderColor: "#b9d7c7",
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    padding: 13,
  },
  offlineQueueIcon: {
    alignItems: "center",
    backgroundColor: "#d5eadf",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  offlineQueueIconText: {
    color: palette.positive,
    fontSize: 18,
    fontWeight: "900",
  },
  offlineQueueTitle: { color: palette.navy, fontSize: 13, fontWeight: "900" },
  readyImportCard: {
    alignItems: "center",
    backgroundColor: "#eaf1f4",
    borderColor: "#b9d0d8",
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    padding: 13,
  },
  readyImportIcon: {
    alignItems: "center",
    backgroundColor: "#d6e5e9",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  readyImportIconText: { color: palette.aqua, fontSize: 16, fontWeight: "900" },
  readyImportTitle: { color: palette.navy, fontSize: 13, fontWeight: "900" },
  readyImportBody: {
    color: "#526d75",
    fontSize: 12,
    lineHeight: 16,
    marginTop: 3,
  },
  readyImportAction: {
    alignItems: "center",
    borderColor: "rgba(61,102,114,0.3)",
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 10,
  },
  readyImportActionText: {
    color: palette.aqua,
    fontSize: 12,
    fontWeight: "900",
  },
  usageCard: {
    backgroundColor: palette.depth,
    borderColor: palette.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 17,
    padding: 18,
  },
  sectionHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.45,
    marginTop: 3,
  },
  usagePlan: {
    backgroundColor: palette.aquaSoft,
    borderRadius: 14,
    color: palette.aqua,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  usageRow: { gap: 7 },
  usageLabels: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  usageTitle: { color: palette.ink, fontSize: 12, fontWeight: "700" },
  usageValue: { color: palette.muted, fontSize: 12 },
  progressTrack: {
    backgroundColor: "#eef0f3",
    borderRadius: 4,
    height: 7,
    overflow: "hidden",
  },
  progressFill: {
    backgroundColor: palette.aqua,
    borderRadius: 4,
    height: 7,
  },
  progressFillSand: {
    backgroundColor: palette.sand,
    borderRadius: 4,
    height: 7,
  },
  usageFootnote: { color: palette.muted, fontSize: 12, lineHeight: 15 },
  section: { gap: 11 },
  countBadge: {
    backgroundColor: palette.aquaSoft,
    borderRadius: 12,
    color: palette.aqua,
    fontSize: 12,
    fontWeight: "800",
    minWidth: 26,
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 5,
    textAlign: "center",
  },
  videoCard: {
    backgroundColor: palette.depth,
    borderColor: palette.line,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 110,
    overflow: "hidden",
  },
  videoThumb: {
    alignItems: "center",
    backgroundColor: palette.navy,
    justifyContent: "center",
    position: "relative",
    width: 128,
  },
  videoPlay: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderColor: "rgba(255,255,255,0.55)",
    borderRadius: 20,
    borderWidth: 1,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  videoPlayText: { color: "#ffffff", fontSize: 14, marginLeft: 2 },
  liveBadge: {
    alignItems: "center",
    backgroundColor: palette.flare,
    borderRadius: 8,
    flexDirection: "row",
    gap: 4,
    left: 8,
    paddingHorizontal: 6,
    paddingVertical: 4,
    position: "absolute",
    top: 8,
  },
  liveBadgeDot: {
    backgroundColor: "#ffffff",
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  liveBadgeText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  videoThumbMeta: {
    bottom: 7,
    color: "rgba(255,255,255,0.8)",
    fontSize: 12,
    position: "absolute",
    right: 8,
  },
  videoCardBody: { flex: 1, gap: 6, justifyContent: "center", padding: 13 },
  videoTitle: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 18,
  },
  videoMeta: { color: palette.muted, fontSize: 12 },
  videoPrivacy: { color: palette.aqua, fontSize: 12, fontWeight: "700" },
  metricLine: { color: palette.positive, fontSize: 12, fontWeight: "700" },
  emptyCard: {
    backgroundColor: "#f2efe8",
    borderRadius: 16,
    gap: 5,
    padding: 16,
  },
  emptyTitle: { color: palette.ink, fontSize: 13, fontWeight: "800" },
  emptyBody: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  analyticsDisclosure: {
    backgroundColor: "#eef5f4",
    borderRadius: 18,
    gap: 6,
    padding: 17,
  },
  analyticsTitle: { color: palette.positive, fontSize: 13, fontWeight: "800" },
  analyticsBody: { color: "#48645a", fontSize: 12, lineHeight: 17 },
  modalSafe: { backgroundColor: palette.canvas, flex: 1 },
  quickMatchSafe: { backgroundColor: palette.canvas, flex: 1 },
  quickMatchHeader: {
    alignItems: "center",
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 62,
    paddingHorizontal: 18,
  },
  quickMatchContent: { gap: 20, padding: 20, paddingBottom: 120 },
  quickMatchTeams: { flexDirection: "row", gap: 10 },
  quickMatchTeamCard: {
    backgroundColor: palette.depth,
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    gap: 7,
    minHeight: 122,
    padding: 14,
  },
  quickMatchTeamLabel: {
    color: palette.aqua,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  quickMatchPlayer: { color: palette.ink, fontSize: 14, fontWeight: "800" },
  quickMatchChoose: {
    alignItems: "center",
    borderColor: palette.aqua,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 50,
  },
  quickMatchChooseText: {
    color: palette.aqua,
    fontSize: 14,
    fontWeight: "900",
  },
  quickMatchConsent: {
    alignItems: "center",
    backgroundColor: "#eef5f4",
    borderRadius: 16,
    flexDirection: "row",
    gap: 14,
    padding: 15,
  },
  quickMatchConsentTitle: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "800",
  },
  quickMatchConsentBody: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  modalHeader: {
    alignItems: "center",
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 62,
    paddingHorizontal: 18,
  },
  modalTitle: { color: palette.ink, fontSize: 17, fontWeight: "800" },
  headerAction: { color: palette.aqua, fontSize: 15, fontWeight: "700" },
  headerTap: { justifyContent: "center", minHeight: 44, minWidth: 56 },
  headerSpacer: { width: 56 },
  formContent: { gap: 24, padding: 20, paddingBottom: 126 },
  formHero: { gap: 8, paddingBottom: 4 },
  formStep: {
    color: palette.aqua,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  formTitle: {
    color: palette.ink,
    fontSize: 31,
    fontWeight: "800",
    letterSpacing: -1,
    lineHeight: 35,
  },
  formIntro: { color: palette.muted, fontSize: 14, lineHeight: 21 },
  field: { gap: 9 },
  fieldLabel: { color: palette.ink, fontSize: 16, fontWeight: "800" },
  fieldDescription: { color: palette.muted, fontSize: 13, lineHeight: 19 },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce3",
    borderRadius: 18,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 16,
    minHeight: 62,
    paddingHorizontal: 16,
  },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  choice: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce3",
    borderRadius: 17,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    justifyContent: "center",
    minHeight: 70,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  choiceActive: {
    backgroundColor: palette.aquaSoft,
    borderColor: palette.aqua,
  },
  choiceText: { color: palette.ink, fontSize: 14, fontWeight: "800" },
  choiceTextActive: { color: palette.aqua },
  choiceBody: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 15,
    marginTop: 4,
  },
  choiceBodyActive: { color: "#526c8e" },
  recommendedLabel: {
    color: palette.positive,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginTop: 7,
  },
  selectedAssociation: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: palette.aqua,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 72,
    padding: 15,
  },
  associationTitle: { color: palette.ink, fontSize: 14, fontWeight: "800" },
  associationMeta: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  optionList: { gap: 7 },
  scheduledAssociationSection: {
    backgroundColor: "#edf4f0",
    borderColor: "#c7ded2",
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    marginBottom: 12,
    padding: 12,
  },
  scheduledAssociationHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  scheduledAssociationEyebrow: {
    color: palette.positive,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  scheduledAssociationTitle: {
    color: palette.navy,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 2,
  },
  scheduledAssociationHint: {
    color: palette.positive,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  scheduledAssociationCard: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.78)",
    borderColor: "rgba(47,107,58,0.16)",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 58,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  scheduledAssociationDot: {
    backgroundColor: palette.positive,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  matchEmptyState: { gap: 9 },
  createMatchInlineButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: "rgba(61,102,114,0.35)",
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 40,
    paddingHorizontal: 12,
  },
  createMatchInlineText: {
    color: palette.aqua,
    fontSize: 12,
    fontWeight: "900",
  },
  option: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: palette.line,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 64,
    padding: 14,
  },
  yoursBadge: {
    backgroundColor: "#e8f5ee",
    borderRadius: 8,
    color: palette.positive,
    fontSize: 12,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  helper: { color: palette.muted, fontSize: 12, lineHeight: 17 },
  importedVideoNote: {
    color: palette.warning,
    fontSize: 12,
    lineHeight: 16,
    marginTop: 6,
  },
  importedVisionCard: {
    backgroundColor: "#eef4f2",
    borderColor: "#bed7cf",
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 15,
  },
  importedVisionHeading: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  importedVisionMark: {
    alignItems: "center",
    backgroundColor: "#d5e7df",
    borderRadius: 17,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  importedVisionMarkText: {
    color: palette.positive,
    fontSize: 16,
    fontWeight: "900",
  },
  importedVisionEyebrow: {
    color: palette.positive,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  importedVisionTitle: {
    color: palette.navy,
    fontSize: 15,
    fontWeight: "900",
    marginTop: 2,
  },
  importedVisionBody: { color: "#526d65", fontSize: 12, lineHeight: 17 },
  importedVisionLoading: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.65)",
    borderColor: "rgba(47,107,58,0.14)",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 9,
    minHeight: 58,
    paddingHorizontal: 12,
  },
  importedVisionLoadingText: {
    color: palette.aqua,
    fontSize: 12,
    fontWeight: "800",
  },
  importedVisionLabel: {
    color: palette.navy,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.9,
    marginTop: 2,
  },
  importedFrameRail: { gap: 9, paddingRight: 3 },
  importedFrame: {
    backgroundColor: "#ffffff",
    borderColor: "#cbdad5",
    borderRadius: 11,
    borderWidth: 1,
    height: 110,
    overflow: "hidden",
    position: "relative",
    width: 115,
  },
  importedFrameSelected: { borderColor: palette.aqua, borderWidth: 2 },
  importedFrameImage: { height: 80, width: "100%" },
  importedFrameTime: {
    color: palette.navy,
    fontSize: 12,
    fontWeight: "800",
    paddingHorizontal: 7,
    paddingTop: 5,
  },
  importedFrameCheck: {
    alignItems: "center",
    backgroundColor: palette.aqua,
    borderRadius: 10,
    height: 20,
    justifyContent: "center",
    position: "absolute",
    right: 5,
    top: 5,
    width: 20,
  },
  importedFrameCheckText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  importedVisionAction: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
    borderColor: "#c5d8d1",
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 44,
    paddingHorizontal: 12,
  },
  importedVisionActionText: {
    color: palette.aqua,
    fontSize: 12,
    fontWeight: "900",
  },
  importedVisionActionArrow: {
    color: palette.aqua,
    fontSize: 22,
    fontWeight: "500",
  },
  importedVisionUnavailable: {
    color: palette.warning,
    fontSize: 12,
    lineHeight: 17,
  },
  importedVisionPrivacy: { color: "#60716d", fontSize: 12, lineHeight: 15 },
  toggleRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    minHeight: 82,
    padding: 16,
  },
  toggleTitle: { color: palette.ink, fontSize: 15, fontWeight: "800" },
  toggleBody: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  privatePracticeCard: {
    alignItems: "center",
    backgroundColor: "#eef5f2",
    borderColor: "#b9d9ca",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 13,
    minHeight: 82,
    padding: 16,
  },
  privateIcon: {
    alignItems: "center",
    backgroundColor: "#d9ede4",
    borderRadius: 19,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  privateIconText: { color: palette.positive, fontSize: 16, fontWeight: "900" },
  disclosure: { color: palette.warning, fontSize: 12, lineHeight: 18 },
  fileSummary: {
    alignItems: "center",
    backgroundColor: "#eaf4ef",
    borderRadius: 18,
    flexDirection: "row",
    gap: 12,
    padding: 16,
  },
  fileSummaryTitle: {
    color: palette.positive,
    fontSize: 14,
    fontWeight: "800",
  },
  fileSummaryIcon: {
    alignItems: "center",
    backgroundColor: "#d4eadf",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  fileSummaryIconText: {
    color: palette.positive,
    fontSize: 16,
    fontWeight: "900",
  },
  modalFooter: {
    backgroundColor: "rgba(248,247,243,0.96)",
    borderTopColor: palette.line,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    padding: 16,
    position: "absolute",
    right: 0,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: palette.aqua,
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: "#ffffff", fontSize: 16, fontWeight: "800" },
  secondaryButton: {
    alignItems: "center",
    borderColor: palette.aqua,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryButtonText: { color: palette.aqua, fontSize: 12, fontWeight: "800" },
  captureRoot: { backgroundColor: "#050708", flex: 1 },
  orientationLoading: {
    alignItems: "center",
    flex: 1,
    gap: 12,
    justifyContent: "center",
  },
  orientationLoadingText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 13,
    fontWeight: "700",
  },
  dynamicCourtLine: {
    borderTopWidth: 2,
    height: 2,
    position: "absolute",
  },
  dynamicHorizon: {
    height: 1,
    left: "3%",
    opacity: 0.6,
    position: "absolute",
    right: "3%",
  },
  alignmentNetLabel: {
    alignItems: "center",
    backgroundColor: "rgba(3,8,11,0.68)",
    borderColor: "rgba(212,183,124,0.58)",
    borderRadius: 9,
    borderWidth: 1,
    minWidth: 50,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: "absolute",
  },
  alignmentNetLabelText: {
    color: palette.sand,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  calibrationEditor: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 20,
  },
  calibrationEditorShade: {
    backgroundColor: "rgba(0,0,0,0.2)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  calibrationEditorUi: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  calibrationEditorHeader: {
    alignItems: "center",
    backgroundColor: "rgba(3,9,12,0.82)",
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 62,
    padding: 9,
  },
  calibrationEditorHeaderButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 58,
  },
  calibrationEditorHeaderButtonText: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 12,
    fontWeight: "800",
  },
  calibrationEditorHeading: { alignItems: "center", flex: 1 },
  calibrationEditorEyebrow: {
    color: palette.sand,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  calibrationEditorTitle: { color: "#ffffff", fontSize: 15, fontWeight: "900" },
  calibrationEditorSave: {
    alignItems: "center",
    backgroundColor: palette.aqua,
    borderRadius: 13,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 58,
  },
  calibrationEditorSaveText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  calibrationEditorBottom: {
    backgroundColor: "rgba(3,9,12,0.88)",
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    padding: 13,
  },
  calibrationEditorHelp: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 12,
    lineHeight: 16,
  },
  calibrationPresetRow: { gap: 8, paddingRight: 12 },
  calibrationPreset: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 13,
  },
  calibrationPresetSelected: {
    backgroundColor: "rgba(61,102,114,0.22)",
    borderColor: palette.aqua,
  },
  calibrationPresetText: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  calibrationEditorStatus: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  calibrationEditorStatusText: {
    color: palette.sand,
    fontSize: 12,
    fontWeight: "800",
  },
  calibrationEditorStatusMeta: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
  },
  calibrationAnchor: {
    alignItems: "center",
    backgroundColor: "rgba(201,169,106,0.24)",
    borderColor: palette.sand,
    borderRadius: 27,
    borderWidth: 2,
    height: 54,
    justifyContent: "center",
    position: "absolute",
    width: 54,
    zIndex: 24,
  },
  calibrationAnchorNet: {
    backgroundColor: "rgba(61,102,114,0.24)",
    borderColor: palette.aqua,
  },
  calibrationAnchorAntenna: {
    backgroundColor: "rgba(232,104,58,0.25)",
    borderColor: palette.flare,
  },
  calibrationAnchorOffscreen: { borderStyle: "dashed" },
  calibrationAnchorCore: {
    backgroundColor: "#ffffff",
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  calibrationAnchorLabel: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    marginTop: 2,
  },
  courtOverlay: {
    bottom: "24%",
    left: "8%",
    position: "absolute",
    right: "8%",
    top: "18%",
  },
  courtOutline: {
    borderRadius: 6,
    borderWidth: 2,
    flex: 1,
    overflow: "hidden",
    position: "relative",
    transform: [{ perspective: 700 }, { rotateX: "18deg" }],
  },
  netLine: {
    height: 2,
    left: 0,
    position: "absolute",
    right: 0,
    top: "50%",
  },
  centerMark: {
    height: "100%",
    left: "50%",
    opacity: 0.35,
    position: "absolute",
    width: 1,
  },
  safeMargin: {
    borderStyle: "dashed",
    borderWidth: 1,
    bottom: "7%",
    left: "5%",
    position: "absolute",
    right: "5%",
    top: "7%",
  },
  horizon: {
    height: 1,
    left: "-5%",
    opacity: 0.5,
    position: "absolute",
    right: "-5%",
    top: "-9%",
  },
  captureChrome: {
    flex: 1,
    justifyContent: "space-between",
    paddingBottom: 22,
    paddingHorizontal: 16,
    zIndex: 5,
  },
  captureChromeLandscape: { paddingBottom: 12, paddingHorizontal: 22 },
  captureTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  captureTopLandscape: { paddingTop: 2 },
  captureClose: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.56)",
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 25,
    borderWidth: 1,
    height: 50,
    justifyContent: "center",
    width: 50,
  },
  remoteButton: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.56)",
    borderColor: "rgba(255,255,255,0.28)",
    borderRadius: 25,
    borderWidth: 1,
    gap: 2,
    height: 50,
    justifyContent: "center",
    width: 65,
  },
  remoteButtonText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  captureStatus: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.58)",
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 15,
    paddingVertical: 7,
  },
  captureStatusCopy: { alignItems: "center", gap: 1 },
  captureStatusText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.9,
  },
  captureStatusTimer: {
    color: "rgba(255,255,255,0.8)",
    fontSize: 13,
    fontVariant: ["tabular-nums"],
    fontWeight: "500",
    letterSpacing: 0.4,
  },
  liveDot: {
    backgroundColor: "#e8683a",
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  lowPowerOverlay: {
    alignItems: "center",
    backgroundColor: "#111315",
    bottom: 0,
    gap: 10,
    justifyContent: "center",
    left: 0,
    paddingHorizontal: 30,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 4,
  },
  lowPowerMark: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 30,
    borderWidth: 1,
    height: 60,
    justifyContent: "center",
    marginBottom: 5,
    width: 60,
  },
  lowPowerTimer: {
    color: "#ffffff",
    fontSize: 32,
    fontVariant: ["tabular-nums"],
    fontWeight: "700",
    letterSpacing: -0.8,
  },
  lowPowerTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  lowPowerBody: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 390,
    textAlign: "center",
  },
  captureBottom: { alignItems: "center", gap: 12 },
  captureBottomLandscape: {
    alignItems: "flex-start",
    alignSelf: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  guidanceCard: {
    alignSelf: "stretch",
    backgroundColor: "rgba(4,10,13,0.78)",
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 16,
    borderWidth: 1,
    gap: 5,
    padding: 13,
  },
  orientationWarning: {
    alignItems: "center",
    backgroundColor: "rgba(201,169,106,0.15)",
    borderColor: "rgba(201,169,106,0.7)",
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginBottom: 7,
    padding: 11,
  },
  orientationWarningIcon: {
    color: palette.sand,
    fontSize: 24,
    fontWeight: "900",
  },
  orientationWarningTitle: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  orientationWarningBody: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    lineHeight: 14,
    marginTop: 2,
  },
  guidanceTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    justifyContent: "space-between",
  },
  guidanceReadyDot: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  guidanceReadyDotActive: { backgroundColor: palette.positive },
  guidanceGrade: {
    color: palette.sand,
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
  },
  guidanceScore: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  guidanceWarning: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  guidanceNote: {
    color: "rgba(255,255,255,0.66)",
    fontSize: 12,
    lineHeight: 14,
  },
  calibrationGuide: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 12,
    borderWidth: 1,
    gap: 7,
    marginTop: 3,
    padding: 10,
  },
  calibrationGuideHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  calibrationGuideEyebrow: {
    color: palette.sand,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  calibrationGuideState: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  calibrationGuidePrompt: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  calibrationGuideSteps: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  calibrationGuideStep: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  calibrationGuideMark: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 12,
    fontWeight: "900",
  },
  calibrationGuideMarkDone: { color: palette.positive },
  calibrationGuideMarkActive: { color: palette.sand },
  calibrationGuideStepText: {
    color: "rgba(255,255,255,0.64)",
    fontSize: 12,
    fontWeight: "600",
  },
  calibrationGuideStepTextActive: { color: "#ffffff" },
  guidanceSignals: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 3,
  },
  guidanceSignal: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderRadius: 9,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  guidanceSignalText: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    fontWeight: "800",
  },
  guidanceAdjustCompact: {
    alignItems: "center",
    borderColor: "rgba(201,169,106,0.7)",
    borderRadius: 9,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 28,
    paddingHorizontal: 10,
  },
  guidanceAdjustCompactText: {
    color: palette.sand,
    fontSize: 12,
    fontWeight: "900",
  },
  adjustCalibrationButton: {
    alignItems: "center",
    borderColor: "rgba(201,169,106,0.66)",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 3,
    minHeight: 44,
  },
  adjustCalibrationButtonText: {
    color: palette.sand,
    fontSize: 12,
    fontWeight: "900",
  },
  partialCourtNote: {
    color: palette.sand,
    fontSize: 12,
    lineHeight: 13,
    marginTop: 2,
  },
  orientationRestartButton: {
    alignItems: "center",
    alignSelf: "stretch",
    borderColor: "rgba(255,255,255,0.38)",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 16,
  },
  orientationRestartButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  captureError: {
    alignSelf: "stretch",
    backgroundColor: "rgba(130,25,25,0.82)",
    borderRadius: 12,
    padding: 10,
  },
  captureErrorText: { color: "#ffffff", fontSize: 12, textAlign: "center" },
  captureFallbackButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.96)",
    borderRadius: 11,
    justifyContent: "center",
    marginTop: 9,
    minHeight: 44,
  },
  captureFallbackButtonText: {
    color: "#7f1d1d",
    fontSize: 12,
    fontWeight: "900",
  },
  visionNotice: {
    alignSelf: "stretch",
    backgroundColor: "rgba(19,58,103,0.88)",
    borderColor: "rgba(140,236,229,0.3)",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  visionNoticeText: {
    color: "#ffffff",
    fontSize: 12,
    lineHeight: 15,
    textAlign: "center",
  },
  sharePill: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  sharePillText: { color: palette.navy, fontSize: 12, fontWeight: "800" },
  captureMomentActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  favoriteMomentButton: {
    alignItems: "center",
    backgroundColor: "rgba(4,10,13,0.82)",
    borderColor: "rgba(255,255,255,0.28)",
    borderRadius: 25,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 50,
    paddingHorizontal: 15,
  },
  favoriteMomentText: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  remoteStatusPill: {
    alignItems: "center",
    backgroundColor: "rgba(4,10,13,0.82)",
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 25,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 50,
    paddingHorizontal: 15,
  },
  remoteStatusDot: {
    backgroundColor: "#98a2b3",
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  remoteStatusDotLive: { backgroundColor: palette.positive },
  remoteStatusText: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  captureButton: {
    alignItems: "center",
    backgroundColor: "rgba(232,104,58,0.94)",
    borderColor: "#ffffff",
    borderRadius: 32,
    borderWidth: 2,
    flexDirection: "row",
    gap: 10,
    minHeight: 62,
    paddingHorizontal: 20,
  },
  captureButtonStop: { backgroundColor: "rgba(20,24,30,0.9)" },
  captureButtonCore: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    height: 24,
    width: 24,
  },
  captureButtonCoreStop: { borderRadius: 4, height: 20, width: 20 },
  captureButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
  visionScoreboard: {
    backgroundColor: "rgba(5,9,13,0.9)",
    borderColor: "rgba(255,255,255,0.24)",
    borderRadius: 10,
    borderWidth: 1,
    bottom: 12,
    minWidth: 176,
    overflow: "hidden",
    paddingBottom: 6,
    position: "absolute",
    right: 12,
    zIndex: 6,
  },
  visionScoreboardCompact: { bottom: 142, minWidth: 184, right: 16 },
  visionScoreboardLandscape: { bottom: 12, right: 22 },
  visionScoreHeader: {
    alignItems: "center",
    backgroundColor: "rgba(34,52,59,0.92)",
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 3,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  visionScoreBrand: {
    color: palette.sand,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  visionScoreSet: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  visionScoreRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    minHeight: 25,
    paddingHorizontal: 8,
  },
  visionServeDot: {
    backgroundColor: palette.positive,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  visionServeDotOff: { opacity: 0 },
  visionTeamName: {
    color: "#ffffff",
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    maxWidth: 102,
  },
  visionSetCount: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    fontWeight: "700",
    minWidth: 12,
    textAlign: "center",
  },
  visionPointCount: {
    color: "#ffffff",
    fontSize: 17,
    fontVariant: ["tabular-nums"],
    fontWeight: "900",
    minWidth: 24,
    textAlign: "right",
  },
  healthVideoOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(5,9,13,0.88)",
    borderColor: "rgba(255,255,255,0.22)",
    borderRadius: 11,
    borderWidth: 1,
    bottom: 12,
    flexDirection: "row",
    gap: 8,
    left: 12,
    paddingHorizontal: 11,
    paddingVertical: 8,
    position: "absolute",
    zIndex: 6,
  },
  healthVideoHeart: { color: "#ff6a5f", fontSize: 16 },
  healthVideoValue: {
    color: "#ffffff",
    fontFamily: "Archivo-Table",
    fontSize: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: "900",
  },
  healthVideoLabel: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: 1,
  },
  remoteBackdrop: {
    alignItems: "center",
    backgroundColor: "rgba(2,5,8,0.76)",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  remoteCard: {
    backgroundColor: palette.canvas,
    borderRadius: 24,
    gap: 16,
    maxWidth: 430,
    padding: 22,
    width: "100%",
  },
  remoteCardHeader: { alignItems: "flex-start", flexDirection: "row", gap: 12 },
  remoteEyebrow: {
    color: palette.aqua,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  remoteTitle: {
    color: palette.ink,
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.4,
    marginTop: 4,
  },
  remoteClose: {
    alignItems: "center",
    backgroundColor: "#e9e8e3",
    borderRadius: 17,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  remoteCloseText: { color: palette.ink, fontSize: 23, lineHeight: 25 },
  remoteBody: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  qrFrame: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#ffffff",
    borderColor: palette.line,
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
  },
  remoteConnectionRow: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    gap: 8,
  },
  remoteConnectionText: { color: palette.ink, fontSize: 12, fontWeight: "800" },
  remoteShareButton: {
    alignItems: "center",
    backgroundColor: palette.aqua,
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 48,
  },
  remoteShareText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
  reviewContent: {
    alignItems: "stretch",
    gap: 18,
    padding: 22,
    paddingBottom: 120,
  },
  successMark: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#e8f5ee",
    borderRadius: 34,
    height: 68,
    justifyContent: "center",
    width: 68,
  },
  successMarkText: { color: palette.positive, fontSize: 30, fontWeight: "900" },
  reviewTitle: {
    color: palette.ink,
    fontSize: 24,
    fontWeight: "800",
    textAlign: "center",
  },
  reviewBody: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  playerModal: { backgroundColor: "#06090b", flex: 1 },
  modalHeaderDark: {
    alignItems: "center",
    borderBottomColor: "rgba(255,255,255,0.1)",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 56,
    paddingHorizontal: 18,
  },
  headerActionLight: { color: "#d4b77c", fontSize: 13, fontWeight: "800" },
  playerDone: { justifyContent: "center", minHeight: 44, minWidth: 52 },
  modalTitleLight: {
    color: "#ffffff",
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    marginHorizontal: 10,
    textAlign: "center",
  },
  playerStage: {
    alignItems: "center",
    aspectRatio: 16 / 9,
    backgroundColor: "#000000",
    justifyContent: "center",
    width: "100%",
  },
  playerStagePortrait: {
    alignSelf: "center",
    aspectRatio: 9 / 16,
    maxHeight: "58%",
    width: "72%",
  },
  player: { height: "100%", width: "100%" },
  playerError: { color: "#f27878", padding: 20, textAlign: "center" },
  playerDetailsScroll: { flex: 1 },
  playerInfo: { gap: 12, padding: 20 },
  playerKickerRow: { alignItems: "center", flexDirection: "row", gap: 7 },
  playerTitle: {
    color: "#ffffff",
    fontSize: 25,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  playerMeta: { color: "#aaa79e", fontSize: 13, lineHeight: 18 },
  playerPrivacy: { color: "#d4b77c", fontSize: 12, fontWeight: "800" },
  playerVenue: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 16,
    flexDirection: "row",
    gap: 11,
    minHeight: 68,
    padding: 13,
  },
  playerVenueIcon: { color: "#d4b77c", fontSize: 22, fontWeight: "900" },
  playerVenueName: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  playerVenueAddress: {
    color: "#aaaeb6",
    fontSize: 12,
    lineHeight: 15,
    marginTop: 2,
  },
  playerMetricCard: {
    backgroundColor: "rgba(212,183,124,0.09)",
    borderColor: "rgba(212,183,124,0.22)",
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: "row",
    minHeight: 74,
    paddingVertical: 12,
  },
  playerMetricItem: { alignItems: "center", flex: 1, justifyContent: "center" },
  playerMetricValue: {
    color: "#ffffff",
    fontFamily: "Archivo-Table",
    fontSize: 17,
    fontWeight: "800",
  },
  playerMetricLabel: {
    color: "#d4b77c",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    marginTop: 4,
  },
  playerMetricDivider: { backgroundColor: "rgba(255,255,255,0.12)", width: 1 },
  visionAnalysisCard: {
    backgroundColor: "#10191b",
    borderColor: "rgba(212,183,124,0.28)",
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 15,
  },
  visionAnalysisHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  visionAnalysisEyebrow: {
    color: "#d4b77c",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  visionAnalysisTitle: { color: "#ffffff", fontSize: 18, fontWeight: "800" },
  visionAnalysisStatus: {
    color: "#a8d9bf",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
    maxWidth: 88,
    textAlign: "right",
  },
  visionAnalysisBody: { color: "#c7cfcb", fontSize: 12, lineHeight: 16 },
  visionCourt: {
    backgroundColor: "#1b2929",
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: 10,
    borderWidth: 2,
    height: 240,
    overflow: "hidden",
    position: "relative",
  },
  visionCourtNet: {
    backgroundColor: "rgba(255,255,255,0.78)",
    height: 2,
    left: 0,
    position: "absolute",
    right: 0,
    top: "50%",
    zIndex: 3,
  },
  visionHeatCell: {
    alignItems: "center",
    backgroundColor: "#54c5aa",
    borderColor: "rgba(255,255,255,0.16)",
    borderWidth: 0.5,
    justifyContent: "center",
    position: "absolute",
  },
  visionHeatCellText: { color: "#ffffff", fontSize: 12, fontWeight: "900" },
  visionCourtLabels: {
    bottom: 7,
    flexDirection: "row",
    justifyContent: "space-between",
    left: 9,
    position: "absolute",
    right: 9,
  },
  visionCourtLabel: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  visionCourtTapHint: {
    alignSelf: "center",
    backgroundColor: "rgba(3,9,12,0.7)",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
    position: "absolute",
    top: "46%",
  },
  visionCourtTapText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.55,
  },
  visionMetricsRow: { flexDirection: "row", gap: 7 },
  visionMetric: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 11,
    flex: 1,
    minHeight: 62,
    paddingHorizontal: 7,
    paddingVertical: 9,
  },
  visionMetricValue: {
    color: "#ffffff",
    fontFamily: "Archivo-Table",
    fontSize: 19,
    fontWeight: "800",
  },
  visionMetricLabel: {
    color: "#b8c1be",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.52,
    lineHeight: 11,
    marginTop: 3,
  },
  visionPerformanceCard: {
    backgroundColor: "rgba(84,197,170,0.07)",
    borderColor: "rgba(84,197,170,0.2)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  visionPerformanceHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  visionPerformanceEyebrow: {
    color: "#a8d9bf",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  visionPerformanceTitle: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2,
  },
  visionPerformanceCoverage: {
    color: "#b8c1be",
    fontFamily: "Archivo-Chip",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "right",
  },
  visionPerformanceSummary: {
    color: "#c7cfcb",
    fontSize: 12,
    lineHeight: 16,
  },
  visionPerformanceMetrics: { flexDirection: "row", gap: 7 },
  visionPerformanceMetric: {
    backgroundColor: "rgba(255,255,255,0.055)",
    borderRadius: 10,
    flex: 1,
    minHeight: 58,
    padding: 8,
  },
  visionPerformanceValue: {
    color: "#ffffff",
    fontFamily: "Archivo-Table",
    fontSize: 17,
    fontWeight: "800",
  },
  visionPerformanceLabel: {
    color: "#aeb8b5",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 12,
    marginTop: 3,
  },
  visionSideRow: {
    alignItems: "center",
    borderTopColor: "rgba(255,255,255,0.1)",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingTop: 9,
  },
  visionSideName: { color: "#ffffff", fontSize: 12, fontWeight: "800" },
  visionSideDetail: {
    color: "#aeb8b5",
    fontSize: 12,
    lineHeight: 14,
    marginTop: 2,
  },
  visionSideEfficiency: { alignItems: "flex-end" },
  visionSideEfficiencyValue: {
    color: "#a8d9bf",
    fontFamily: "Archivo-Table",
    fontSize: 15,
    fontWeight: "800",
  },
  visionSideEfficiencyLabel: {
    color: "#aeb8b5",
    fontSize: 12,
    fontWeight: "800",
  },
  visionPerformanceEmpty: {
    color: "#aeb8b5",
    fontSize: 12,
    lineHeight: 16,
  },
  visionPerformanceReview: {
    color: "#d4b77c",
    fontSize: 12,
    lineHeight: 15,
  },
  visionOwnerReviewCard: {
    backgroundColor: "rgba(212,183,124,0.09)",
    borderColor: "rgba(212,183,124,0.28)",
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 12,
  },
  visionOwnerReviewEyebrow: {
    color: "#d4b77c",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  visionOwnerReviewTitle: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  visionOwnerReviewBody: { color: "#c7cfcb", fontSize: 12, lineHeight: 16 },
  visionOwnerReviewButton: {
    alignItems: "center",
    backgroundColor: "#a8d9bf",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 10,
  },
  visionOwnerReviewButtonText: {
    color: "#111719",
    fontSize: 12,
    fontWeight: "900",
  },
  visionOwnerReviewDrafts: { gap: 7, marginTop: 2 },
  visionOwnerReviewDraft: {
    borderTopColor: "rgba(255,255,255,0.12)",
    borderTopWidth: 1,
    gap: 2,
    paddingTop: 7,
  },
  visionOwnerReviewDraftTitle: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  visionOwnerReviewDraftBody: {
    color: "#c7cfcb",
    fontSize: 12,
    lineHeight: 15,
  },
  visionReviewRail: {
    backgroundColor: "rgba(212,183,124,0.1)",
    borderColor: "rgba(212,183,124,0.22)",
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 10,
  },
  visionReviewTitle: {
    color: "#d4b77c",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  visionReviewItem: {
    alignItems: "center",
    borderTopColor: "rgba(212,183,124,0.16)",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 8,
    paddingTop: 8,
  },
  visionReviewItemTitle: { color: "#f2f5f3", fontSize: 12, lineHeight: 15 },
  visionReviewItemMeta: {
    color: "#aeb8b5",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 2,
  },
  visionReviewActions: { flexDirection: "row", gap: 6 },
  visionReviewReject: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.24)",
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 10,
  },
  visionReviewRejectText: {
    color: "#d2d7d5",
    fontSize: 12,
    fontWeight: "800",
  },
  visionReviewConfirm: {
    alignItems: "center",
    backgroundColor: "#a8d9bf",
    borderRadius: 10,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 10,
  },
  visionReviewConfirmText: {
    color: "#111719",
    fontSize: 12,
    fontWeight: "900",
  },
  visionEvidenceNote: { color: "#aeb8b5", fontSize: 12, lineHeight: 15 },
  visionAnalysisButton: {
    alignItems: "center",
    backgroundColor: "#d4b77c",
    borderRadius: 13,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 12,
  },
  visionAnalysisButtonText: {
    color: "#111719",
    fontSize: 12,
    fontWeight: "900",
  },
  visionAnalysisNotice: { color: "#b9d9ca", fontSize: 12, lineHeight: 15 },
  uploadOverlay: {
    alignItems: "center",
    backgroundColor: "rgba(10,20,28,0.92)",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    padding: 32,
    position: "absolute",
    right: 0,
    top: 0,
  },
  uploadOverlayTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 16,
  },
  uploadOverlayBody: { color: "#d0d5dd", fontSize: 12, marginTop: 6 },
  uploadTrack: {
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 5,
    height: 8,
    marginTop: 18,
    overflow: "hidden",
    width: "100%",
  },
  uploadFill: { backgroundColor: "#d4b77c", height: 8 },
  importedCalibrationScene: { backgroundColor: "#07151a", flex: 1 },
  importedCalibrationImage: {
    height: "100%",
    opacity: 0.92,
    resizeMode: "contain",
    width: "100%",
  },
  sheetBackdrop: {
    backgroundColor: "rgba(4,10,16,0.56)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: palette.canvas,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    gap: 12,
    padding: 20,
    paddingBottom: 38,
  },
  sheetHandle: {
    alignSelf: "center",
    backgroundColor: "#cbd0d8",
    borderRadius: 3,
    height: 5,
    marginBottom: 4,
    width: 42,
  },
  sheetTitle: { color: palette.ink, fontSize: 22, fontWeight: "800" },
  sheetBody: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  sheetActionPrimary: {
    backgroundColor: palette.aqua,
    borderRadius: 15,
    gap: 3,
    padding: 15,
  },
  sheetActionPrimaryText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  sheetAction: {
    backgroundColor: "#ffffff",
    borderColor: palette.line,
    borderRadius: 15,
    borderWidth: 1,
    gap: 3,
    padding: 15,
  },
  sheetActionText: { color: palette.ink, fontSize: 13, fontWeight: "800" },
  sheetActionMeta: { color: "#98a2b3", fontSize: 12 },
});
