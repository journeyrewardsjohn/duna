import muxReactNativeVideo from "@mux/mux-data-react-native-video";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
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
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import Video from "react-native-video";
import { SafeAreaView } from "react-native-safe-area-context";
import VideoCapture, {
  DunaVideoCaptureView,
  type CaptureGuidance,
  type DunaCourtCalibration,
  type PreparedVideo,
} from "./modules/duna-video-capture";
import { dunaWebUrl, type DunaApiClient } from "./mobile-api";
import type { PlayerRuntime } from "./runtime";
import {
  FellixText as Text,
  FellixTextInput as TextInput,
} from "./fellix-text";

type VideoStudioData = Awaited<
  ReturnType<DunaApiClient["player"]["videoStudio"]["query"]>
>;
type VideoSummary = VideoStudioData["videos"][number];
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

type VideoCategory = "practice" | "event" | "match" | "social";
type RecordingVisibility = "public" | "private";
type LiveVisibility = "public" | "link-only";

interface VenueSelection {
  readonly venueId?: string;
  readonly name: string;
  readonly address?: string;
  readonly googlePlaceId?: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

interface CaptureForm {
  readonly title: string;
  readonly category: VideoCategory;
  readonly association?: VideoAssociation;
  readonly venue?: VenueSelection;
  readonly hasAudio: boolean;
  readonly liveVisibility: LiveVisibility;
  readonly recordingVisibility: RecordingVisibility;
  readonly publishedToProfile: boolean;
  readonly courtWidthMeters: number;
  readonly courtLengthMeters: number;
  readonly netHeightMeters: number;
}

const initialCaptureForm: CaptureForm = {
  title: "",
  category: "match",
  hasAudio: true,
  liveVisibility: "public",
  recordingVisibility: "private",
  publishedToProfile: false,
  courtWidthMeters: 8,
  courtLengthMeters: 16,
  netHeightMeters: 2.43,
};

const palette = {
  canvas: "#f8f7f3",
  depth: "#ffffff",
  ink: "#101828",
  muted: "#667085",
  navy: "#173a67",
  aqua: "#235a96",
  aquaSoft: "#e8eef7",
  sand: "#d7bd91",
  flare: "#de6842",
  positive: "#2f7d57",
  warning: "#a86f18",
  danger: "#b84444",
  line: "#e4e0d8",
};

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`;
}

function displayError(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Duna could not complete that video request.";
}

function qualityLabel(grade: CaptureGuidance["qualityGrade"]): string {
  if (grade === "excellent")
    return "Excellent · advanced trajectories expected";
  if (grade === "good") return "Good · traditional statistics expected";
  if (grade === "limited") return "Limited · rallies and basic events only";
  return "Poor · reposition for better analysis";
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

function ChoiceRow<Value extends string>({
  label,
  onChange,
  options,
  value,
}: {
  readonly label: string;
  readonly value: Value;
  readonly onChange: (value: Value) => void;
  readonly options: readonly {
    readonly label: string;
    readonly value: Value;
  }[];
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
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

function AssociationPicker({
  category,
  client,
  onChange,
  value,
}: {
  readonly category: VideoCategory;
  readonly client?: DunaApiClient;
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
              <Text style={styles.helper}>
                Search all Duna events. Your registrations appear first.
              </Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

interface PlaceSuggestion {
  readonly placeId: string;
  readonly text: string;
  readonly mainText: string;
  readonly secondaryText: string;
}

function VenuePicker({
  onChange,
  value,
}: {
  readonly value?: VenueSelection;
  readonly onChange: (value: VenueSelection | undefined) => void;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<readonly PlaceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 3 || value) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void fetch(
        `${dunaWebUrl}/api/places/autocomplete?q=${encodeURIComponent(query.trim())}`,
      )
        .then(async (response) => {
          if (!response.ok) throw new Error("Venue search unavailable");
          return (await response.json()) as {
            readonly suggestions?: readonly PlaceSuggestion[];
          };
        })
        .then((result) => {
          if (!cancelled) setOptions(result.suggestions ?? []);
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, value]);

  const select = async (option: PlaceSuggestion) => {
    setLoading(true);
    try {
      const response = await fetch(
        `${dunaWebUrl}/api/places/details?placeId=${encodeURIComponent(option.placeId)}`,
      );
      if (!response.ok) throw new Error("Venue details unavailable");
      const place = (await response.json()) as VenueSelection & {
        readonly placeId?: string;
      };
      onChange({
        name: place.name || option.mainText,
        address: place.address || option.secondaryText,
        googlePlaceId: place.placeId ?? option.placeId,
        latitude: place.latitude,
        longitude: place.longitude,
      });
      setQuery("");
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>Venue (optional)</Text>
      {value ? (
        <View style={styles.selectedAssociation}>
          <View style={styles.flex}>
            <Text style={styles.associationTitle}>{value.name}</Text>
            {!!value.address && (
              <Text style={styles.associationMeta}>{value.address}</Text>
            )}
          </View>
          <Pressable onPress={() => onChange(undefined)}>
            <Text style={styles.textAction}>Change</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <TextInput
            autoCapitalize="words"
            onChangeText={setQuery}
            placeholder="Search Google Places"
            placeholderTextColor="#98a2b3"
            style={styles.input}
            value={query}
          />
          {loading && <ActivityIndicator color={palette.aqua} />}
          {options.map((option) => (
            <Pressable
              key={option.placeId}
              onPress={() => void select(option)}
              style={styles.option}
            >
              <View style={styles.flex}>
                <Text style={styles.associationTitle}>{option.mainText}</Text>
                <Text style={styles.associationMeta}>
                  {option.secondaryText}
                </Text>
              </View>
            </Pressable>
          ))}
        </>
      )}
    </View>
  );
}

function VideoDetailsForm({
  client,
  form,
  mode,
  onCancel,
  onChange,
  onContinue,
  preparedVideo,
}: {
  readonly client?: DunaApiClient;
  readonly form: CaptureForm;
  readonly mode: "live" | "upload";
  readonly preparedVideo?: PreparedVideo;
  readonly onChange: (form: CaptureForm) => void;
  readonly onCancel: () => void;
  readonly onContinue: () => void;
}) {
  const associationRequired =
    form.category === "event" || form.category === "match";
  const valid =
    form.title.trim().length >= 2 &&
    (!associationRequired || Boolean(form.association));
  return (
    <SafeAreaView style={styles.modalSafe}>
      <View style={styles.modalHeader}>
        <Pressable onPress={onCancel}>
          <Text style={styles.headerAction}>Cancel</Text>
        </Pressable>
        <Text style={styles.modalTitle}>
          {mode === "live" ? "Set up live stream" : "Add video details"}
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
      >
        {preparedVideo && (
          <View style={styles.fileSummary}>
            <Text style={styles.fileSummaryTitle}>Ready to upload</Text>
            <Text style={styles.helper}>
              {formatDuration(preparedVideo.durationSeconds)} ·{" "}
              {formatBytes(preparedVideo.bytes)} · MP4
            </Text>
          </View>
        )}
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Title</Text>
          <TextInput
            autoCapitalize="sentences"
            maxLength={180}
            onChangeText={(title) => onChange({ ...form, title })}
            placeholder="e.g. AVP qualifier — Court 2"
            placeholderTextColor="#98a2b3"
            style={styles.input}
            value={form.title}
          />
        </View>
        <ChoiceRow
          label="What is this?"
          onChange={(category) =>
            onChange({ ...form, category, association: undefined })
          }
          options={[
            { label: "Practice", value: "practice" },
            { label: "Event", value: "event" },
            { label: "Match", value: "match" },
            { label: "Social", value: "social" },
          ]}
          value={form.category}
        />
        <AssociationPicker
          category={form.category}
          client={client}
          onChange={(association) => onChange({ ...form, association })}
          value={form.association}
        />
        <VenuePicker
          onChange={(venue) => onChange({ ...form, venue })}
          value={form.venue}
        />
        {mode === "live" && (
          <ChoiceRow
            label="Who can watch live?"
            onChange={(liveVisibility) => onChange({ ...form, liveVisibility })}
            options={[
              { label: "Public", value: "public" },
              { label: "Link only", value: "link-only" },
            ]}
            value={form.liveVisibility}
          />
        )}
        <ChoiceRow
          label={mode === "live" ? "After the stream" : "Recording privacy"}
          onChange={(recordingVisibility) =>
            onChange({
              ...form,
              recordingVisibility,
              publishedToProfile:
                recordingVisibility === "public" && form.publishedToProfile,
            })
          }
          options={[
            { label: "Keep private", value: "private" },
            { label: "Public", value: "public" },
          ]}
          value={form.recordingVisibility}
        />
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
        {mode === "live" && (
          <>
            <ChoiceRow
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
              setting when it differs from this calibration default.
            </Text>
          </>
        )}
      </ScrollView>
      <View style={styles.modalFooter}>
        <Pressable
          disabled={!valid}
          onPress={onContinue}
          style={[styles.primaryButton, !valid && styles.disabled]}
        >
          <Text style={styles.primaryButtonText}>
            {mode === "live" ? "Open camera guide" : "Upload video"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function CourtOverlay({ acceptable }: { readonly acceptable: boolean }) {
  const color = acceptable ? "#67d391" : "rgba(255,255,255,0.78)";
  return (
    <View pointerEvents="none" style={styles.courtOverlay}>
      <View style={[styles.courtOutline, { borderColor: color }]}>
        <View style={[styles.netLine, { backgroundColor: color }]} />
        <View style={[styles.centerMark, { backgroundColor: color }]} />
        <View style={[styles.safeMargin, { borderColor: color }]} />
      </View>
      <View style={[styles.horizon, { backgroundColor: color }]} />
    </View>
  );
}

function CaptureExperience({
  client,
  form,
  mode,
  onClose,
  onFinished,
  onRecorded,
}: {
  readonly client: DunaApiClient;
  readonly form: CaptureForm;
  readonly mode: "live" | "record";
  readonly onClose: () => void;
  readonly onFinished: () => Promise<void>;
  readonly onRecorded: (video: PreparedVideo) => void;
}) {
  const [permissionsReady, setPermissionsReady] = useState(false);
  const [guidance, setGuidance] = useState<CaptureGuidance>();
  const [captureError, setCaptureError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [streamState, setStreamState] = useState<
    "preview" | "connecting" | "live" | "stopped"
  >("preview");
  const [session, setSession] = useState<LiveVideoSession>();
  const [recording, setRecording] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [recordingVisibility, setRecordingVisibility] =
    useState<RecordingVisibility>(form.recordingVisibility);
  const [publishProfile, setPublishProfile] = useState(form.publishedToProfile);
  const [removeMusic, setRemoveMusic] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

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

  const calibration = (): DunaCourtCalibration => {
    const locked = VideoCapture?.lockCalibration();
    return (
      locked ?? {
        courtWidthMeters: form.courtWidthMeters,
        courtLengthMeters: form.courtLengthMeters,
        netHeightMeters: form.netHeightMeters,
        qualityGrade: guidance?.qualityGrade ?? "poor",
        qualityScore: guidance?.qualityScore ?? 0,
        confidence: guidance?.confidence ?? 0,
        warnings: guidance?.warnings ?? ["Camera calibration was unavailable"],
        corners: guidance?.corners,
        deviceAttitude: guidance?.deviceAttitude,
        lens: guidance?.lens,
        zoomFactor: guidance?.zoomFactor,
        calibratedAt: guidance?.calibratedAt ?? new Date().toISOString(),
        acceptable: guidance?.acceptable ?? false,
      }
    );
  };

  const start = async () => {
    if (!VideoCapture) return;
    setBusy(true);
    setCaptureError(undefined);
    try {
      if (mode === "record") {
        await VideoCapture.startRecording(form.hasAudio);
        setRecording(true);
        void Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        );
      } else {
        const created = await client.player.createLiveVideo.mutate({
          title: form.title,
          category: form.category,
          ...associationInput(form.association),
          venue: form.venue,
          liveVisibility: form.liveVisibility,
          recordingVisibility: form.recordingVisibility,
          hasAudio: form.hasAudio,
          courtCalibration: calibration(),
          idempotencyKey: idempotencyKey(),
        });
        setSession(created);
        await VideoCapture.startStream(
          created.streamUrl,
          created.streamKey,
          form.hasAudio,
        );
      }
    } catch (error) {
      setCaptureError(displayError(error));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    if (!VideoCapture) return;
    setBusy(true);
    try {
      if (mode === "record") {
        const video = await VideoCapture.stopRecording();
        setRecording(false);
        onRecorded(video);
        return;
      }
      await VideoCapture.stopStream();
      if (session) {
        await client.player.finishLiveVideo.mutate({
          videoId: session.video.id,
          idempotencyKey: idempotencyKey(),
        });
      }
      setReviewing(true);
    } catch (error) {
      setCaptureError(displayError(error));
    } finally {
      setBusy(false);
    }
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
      onClose();
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
            Choose what happens after Mux prepares it. You can change this again
            from your video archive.
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

  const isActive =
    recording || streamState === "connecting" || streamState === "live";
  return (
    <View style={styles.captureRoot}>
      <DunaVideoCaptureView
        audioEnabled={form.hasAudio}
        courtLengthMeters={form.courtLengthMeters}
        courtWidthMeters={form.courtWidthMeters}
        netHeightMeters={form.netHeightMeters}
        onCaptureError={(event) => setCaptureError(event.nativeEvent.message)}
        onGuidance={(event) => setGuidance(event.nativeEvent)}
        onStreamState={(event) => setStreamState(event.nativeEvent.state)}
        style={StyleSheet.absoluteFill}
      />
      <CourtOverlay acceptable={guidance?.acceptable ?? false} />
      <SafeAreaView pointerEvents="box-none" style={styles.captureChrome}>
        <View style={styles.captureTop}>
          <Pressable
            disabled={isActive}
            onPress={onClose}
            style={styles.captureClose}
          >
            <Text style={styles.captureCloseText}>×</Text>
          </Pressable>
          <View style={styles.captureStatus}>
            {isActive && <View style={styles.liveDot} />}
            <Text style={styles.captureStatusText}>
              {recording
                ? `RECORDING · ${formatDuration(elapsedSeconds)}`
                : streamState === "live"
                  ? `LIVE · ${formatDuration(elapsedSeconds)}`
                  : streamState === "connecting"
                    ? "CONNECTING"
                    : "COURT ALIGNMENT"}
            </Text>
          </View>
          <View style={styles.captureClose} />
        </View>
        <View style={styles.captureBottom}>
          {!isActive && (
            <View style={styles.guidanceCard}>
              <View style={styles.guidanceTop}>
                <Text
                  style={[
                    styles.guidanceGrade,
                    guidance?.acceptable && { color: "#67d391" },
                  ]}
                >
                  {guidance
                    ? qualityLabel(guidance.qualityGrade)
                    : "Analyzing court geometry…"}
                </Text>
                <Text style={styles.guidanceScore}>
                  {guidance?.qualityScore ?? 0}/100
                </Text>
              </View>
              <Text style={styles.guidanceWarning}>
                {guidance?.warnings[0] ??
                  "Keep the four corners, net line, and both service areas visible."}
              </Text>
              <Text style={styles.guidanceNote}>
                A poor angle will not block recording; it may limit future
                trajectory and height estimates.
              </Text>
            </View>
          )}
          {!!captureError && (
            <View style={styles.captureError}>
              <Text style={styles.captureErrorText}>{captureError}</Text>
            </View>
          )}
          {session && streamState === "live" && (
            <Pressable onPress={() => void share()} style={styles.sharePill}>
              <Text style={styles.sharePillText}>Share live link</Text>
            </Pressable>
          )}
          <Pressable
            disabled={!permissionsReady || busy}
            onPress={() => void (isActive ? stop() : start())}
            style={[
              styles.captureButton,
              isActive && styles.captureButtonStop,
              (!permissionsReady || busy) && styles.disabled,
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
                      ? guidance?.acceptable
                        ? "Lock + go live"
                        : "Go live anyway"
                      : guidance?.acceptable
                        ? "Lock + record"
                        : "Record anyway"}
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

type VideoComponentProps = ComponentProps<typeof Video>;
const MuxVideo = muxReactNativeVideo<VideoComponentProps>(Video);

function VideoPlayerModal({
  client,
  onClose,
  video,
}: {
  readonly client: DunaApiClient;
  readonly video: VideoSummary;
  readonly onClose: () => void;
}) {
  const [playback, setPlayback] = useState<VideoPlayback>();
  const [error, setError] = useState<string>();
  const lastHeartbeat = useRef(0);

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
        onProgress: (progress) => heartbeat(progress.currentTime),
        poster: playback?.posterUrl,
        resizeMode: "contain",
        source: { uri },
        style: styles.player,
      }
    : undefined;

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible>
      <SafeAreaView style={styles.playerModal}>
        <View style={styles.modalHeaderDark}>
          <Pressable onPress={onClose}>
            <Text style={styles.headerActionLight}>Done</Text>
          </Pressable>
          <Text numberOfLines={1} style={styles.modalTitleLight}>
            {video.title}
          </Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.playerStage}>
          {!uri && !error && <ActivityIndicator color="#63e3db" size="large" />}
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
        </View>
        <View style={styles.playerInfo}>
          <Text style={styles.playerTitle}>{video.title}</Text>
          <Text style={styles.playerMeta}>
            {video.owner.displayName} · {video.category}
            {video.event ? ` · ${video.event.title}` : ""}
          </Text>
          <Text style={styles.playerPrivacy}>
            {video.status === "live" ? "LIVE NOW" : "DUNA VIDEO"} ·{" "}
            {video.hasAudio ? "Audio" : "Silent"}
          </Text>
        </View>
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
            {video.source === "live" ? "Mux" : "Duna archive"}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export function VideoStudioScreen({
  runtime,
}: {
  readonly runtime: PlayerRuntime;
}) {
  const client = runtime.client;
  const [studio, setStudio] = useState<VideoStudioData>();
  const [metrics, setMetrics] = useState<readonly VideoMetric[]>([]);
  const [loading, setLoading] = useState(Boolean(client));
  const [error, setError] = useState<string>();
  const [detailsMode, setDetailsMode] = useState<"live" | "upload">();
  const [captureMode, setCaptureMode] = useState<"live" | "record">();
  const [form, setForm] = useState<CaptureForm>(initialCaptureForm);
  const [preparedVideo, setPreparedVideo] = useState<PreparedVideo>();
  const [showUploadChoices, setShowUploadChoices] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [selectedVideo, setSelectedVideo] = useState<VideoSummary>();

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

  const metricByVideo = useMemo(
    () => new Map(metrics.map((metric) => [metric.video.id, metric])),
    [metrics],
  );

  const openLive = () => {
    setForm(initialCaptureForm);
    setDetailsMode("live");
  };

  const chooseLibrary = async () => {
    setShowUploadChoices(false);
    if (!VideoCapture) {
      setError("Video upload requires the Duna iOS app.");
      return;
    }
    try {
      const selected = await VideoCapture.pickVideo();
      if (!selected) return;
      setPreparedVideo(selected);
      setForm({ ...initialCaptureForm, category: "practice" });
      setDetailsMode("upload");
    } catch (reason) {
      setError(displayError(reason));
    }
  };

  const recordNew = () => {
    setShowUploadChoices(false);
    setForm({
      ...initialCaptureForm,
      title: "New court recording",
      category: "practice",
    });
    setCaptureMode("record");
  };

  const upload = async () => {
    if (!client || !VideoCapture || !preparedVideo) return;
    setUploading(true);
    setUploadProgress(0);
    setError(undefined);
    try {
      const session = await client.player.beginVideoUpload.mutate({
        title: form.title,
        category: form.category,
        ...associationInput(form.association),
        venue: form.venue,
        recordingVisibility: form.recordingVisibility,
        publishedToProfile: form.publishedToProfile,
        hasAudio: form.hasAudio,
        originalFileName: preparedVideo.fileName,
        mimeType: preparedVideo.mimeType,
        bytes: preparedVideo.bytes,
        durationSeconds: preparedVideo.durationSeconds,
        idempotencyKey: idempotencyKey(),
      });
      for (let partNumber = 1; partNumber <= session.totalParts; partNumber++) {
        const offset = (partNumber - 1) * session.partSizeBytes;
        const length = Math.min(
          session.partSizeBytes,
          preparedVideo.bytes - offset,
        );
        const signed = await client.player.videoUploadPartUrl.mutate({
          videoId: session.videoId,
          partNumber,
        });
        const uploaded = await VideoCapture.uploadPart(
          preparedVideo.fileUri,
          signed.url,
          offset,
          length,
        );
        await client.player.recordVideoUploadPart.mutate({
          videoId: session.videoId,
          partNumber,
          etag: uploaded.etag,
          sizeBytes: uploaded.sizeBytes,
        });
        setUploadProgress(partNumber / session.totalParts);
      }
      await client.player.completeVideoUpload.mutate({
        videoId: session.videoId,
        idempotencyKey: idempotencyKey(),
      });
      setDetailsMode(undefined);
      setPreparedVideo(undefined);
      setForm(initialCaptureForm);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setUploading(false);
    }
  };

  const isIos = Platform.OS === "ios";
  const entitlement = studio?.entitlement ?? runtime.settings?.dunaPlus;
  const liveUsed = studio?.usage.live.usedSeconds ?? 0;
  const liveLimit = studio?.usage.live.limitSeconds ?? 4 * 60 * 60;
  const uploadUsed = studio?.usage.uploads.usedSeconds ?? 0;
  const uploadLimit = studio?.usage.uploads.limitSeconds ?? 24 * 60 * 60;
  const livePercent = Math.min(1, liveUsed / Math.max(1, liveLimit));
  const uploadPercent = Math.min(1, uploadUsed / Math.max(1, uploadLimit));

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
            Stream a match, build a private practice archive, and choose exactly
            what becomes public.
          </Text>
          {entitlement?.kind === "complimentary" && (
            <View style={styles.complimentaryBadge}>
              <Text style={styles.complimentaryText}>
                ✦ Complimentary Duna+
              </Text>
            </View>
          )}
          {!isIos && (
            <Text style={styles.iosNote}>
              Capture and upload launch on iPhone first. Public video remains
              available on the Duna web experience.
            </Text>
          )}
          <View style={styles.heroActions}>
            <Pressable
              disabled={!isIos || !client || !entitlement?.active}
              onPress={openLive}
              style={[
                styles.goLiveButton,
                (!isIos || !client || !entitlement?.active) && styles.disabled,
              ]}
            >
              <View style={styles.liveButtonDot} />
              <Text style={styles.goLiveText}>
                {entitlement?.active ? "Go Live" : "Duna+ to go live"}
              </Text>
            </Pressable>
            <Pressable
              disabled={!isIos || !client}
              onPress={() => setShowUploadChoices(true)}
              style={[
                styles.uploadButton,
                (!isIos || !client) && styles.disabled,
              ]}
            >
              <Text style={styles.uploadButtonText}>Upload video</Text>
            </Pressable>
          </View>
        </View>

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
              {entitlement?.label ?? "Duna Player"}
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
              Upload usage is reported now; it is not blocked unless a Super
              Admin enables enforcement.
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
        animationType="slide"
        onRequestClose={() => setDetailsMode(undefined)}
        visible={Boolean(detailsMode)}
      >
        {detailsMode && (
          <VideoDetailsForm
            client={client}
            form={form}
            mode={detailsMode}
            onCancel={() => {
              if (!uploading) setDetailsMode(undefined);
            }}
            onChange={setForm}
            onContinue={() => {
              if (detailsMode === "live") {
                setDetailsMode(undefined);
                setCaptureMode("live");
              } else {
                void upload();
              }
            }}
            preparedVideo={preparedVideo}
          />
        )}
        {uploading && (
          <View style={styles.uploadOverlay}>
            <ActivityIndicator color="#ffffff" size="large" />
            <Text style={styles.uploadOverlayTitle}>Uploading to Duna</Text>
            <Text style={styles.uploadOverlayBody}>
              {Math.round(uploadProgress * 100)}% · Keep Duna open
            </Text>
            <View style={styles.uploadTrack}>
              <View
                style={[
                  styles.uploadFill,
                  { width: `${uploadProgress * 100}%` },
                ]}
              />
            </View>
          </View>
        )}
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setCaptureMode(undefined)}
        visible={Boolean(captureMode)}
      >
        {captureMode && client && (
          <CaptureExperience
            client={client}
            form={form}
            mode={captureMode}
            onClose={() => {
              VideoCapture?.releasePreview();
              setCaptureMode(undefined);
            }}
            onFinished={load}
            onRecorded={(video) => {
              VideoCapture?.releasePreview();
              setPreparedVideo(video);
              setCaptureMode(undefined);
              setDetailsMode("upload");
            }}
          />
        )}
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setShowUploadChoices(false)}
        transparent
        visible={showUploadChoices}
      >
        <Pressable
          onPress={() => setShowUploadChoices(false)}
          style={styles.sheetBackdrop}
        >
          <Pressable style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Add a video</Text>
            <Text style={styles.sheetBody}>
              Record with court guidance or choose an existing video. Both
              upload directly to your private Duna archive in Cloudflare R2.
            </Text>
            <Pressable onPress={recordNew} style={styles.sheetActionPrimary}>
              <Text style={styles.sheetActionPrimaryText}>
                Record with Duna
              </Text>
              <Text style={styles.sheetActionMeta}>Vision court guide</Text>
            </Pressable>
            <Pressable
              onPress={() => void chooseLibrary()}
              style={styles.sheetAction}
            >
              <Text style={styles.sheetActionText}>Choose from library</Text>
              <Text style={styles.sheetActionMeta}>
                Converted to web-ready MP4
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {selectedVideo && client && (
        <VideoPlayerModal
          client={client}
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
    fontSize: 10,
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
  heroBody: { color: "#dce7f5", fontSize: 14, lineHeight: 21 },
  complimentaryBadge: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(99,227,219,0.16)",
    borderColor: "rgba(99,227,219,0.5)",
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  complimentaryText: { color: "#8cece5", fontSize: 11, fontWeight: "800" },
  iosNote: { color: "#f7c86b", fontSize: 12, lineHeight: 18 },
  heroActions: { flexDirection: "row", gap: 10 },
  goLiveButton: {
    alignItems: "center",
    backgroundColor: palette.flare,
    borderRadius: 14,
    flex: 1,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  liveButtonDot: {
    backgroundColor: "#ffffff",
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  goLiveText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  uploadButton: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,0.36)",
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 14,
  },
  uploadButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
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
    fontSize: 10,
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
  usageValue: { color: palette.muted, fontSize: 11 },
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
  usageFootnote: { color: palette.muted, fontSize: 10, lineHeight: 15 },
  section: { gap: 11 },
  countBadge: {
    backgroundColor: palette.aquaSoft,
    borderRadius: 12,
    color: palette.aqua,
    fontSize: 11,
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
  liveBadgeText: { color: "#ffffff", fontSize: 10, fontWeight: "900" },
  videoThumbMeta: {
    bottom: 7,
    color: "rgba(255,255,255,0.8)",
    fontSize: 10,
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
  videoMeta: { color: palette.muted, fontSize: 10 },
  videoPrivacy: { color: palette.aqua, fontSize: 10, fontWeight: "700" },
  metricLine: { color: palette.positive, fontSize: 10, fontWeight: "700" },
  emptyCard: {
    backgroundColor: "#f2efe8",
    borderRadius: 16,
    gap: 5,
    padding: 16,
  },
  emptyTitle: { color: palette.ink, fontSize: 13, fontWeight: "800" },
  emptyBody: { color: palette.muted, fontSize: 11, lineHeight: 17 },
  analyticsDisclosure: {
    backgroundColor: "#eef5f4",
    borderRadius: 18,
    gap: 6,
    padding: 17,
  },
  analyticsTitle: { color: palette.positive, fontSize: 13, fontWeight: "800" },
  analyticsBody: { color: "#48645a", fontSize: 11, lineHeight: 17 },
  modalSafe: { backgroundColor: palette.canvas, flex: 1 },
  modalHeader: {
    alignItems: "center",
    borderBottomColor: palette.line,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 56,
    paddingHorizontal: 18,
  },
  modalTitle: { color: palette.ink, fontSize: 15, fontWeight: "800" },
  headerAction: { color: palette.aqua, fontSize: 13, fontWeight: "700" },
  headerSpacer: { width: 48 },
  formContent: { gap: 18, padding: 18, paddingBottom: 120 },
  field: { gap: 8 },
  fieldLabel: { color: palette.ink, fontSize: 12, fontWeight: "800" },
  input: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce3",
    borderRadius: 13,
    borderWidth: 1,
    color: palette.ink,
    fontSize: 14,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  choice: {
    backgroundColor: "#ffffff",
    borderColor: "#d7dce3",
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  choiceActive: {
    backgroundColor: palette.aquaSoft,
    borderColor: palette.aqua,
  },
  choiceText: { color: palette.muted, fontSize: 11, fontWeight: "700" },
  choiceTextActive: { color: palette.aqua },
  selectedAssociation: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: palette.aqua,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 13,
  },
  associationTitle: { color: palette.ink, fontSize: 12, fontWeight: "800" },
  associationMeta: { color: palette.muted, fontSize: 10, marginTop: 2 },
  optionList: { gap: 7 },
  option: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: palette.line,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    padding: 12,
  },
  yoursBadge: {
    backgroundColor: "#e8f5ee",
    borderRadius: 8,
    color: palette.positive,
    fontSize: 10,
    fontWeight: "900",
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  helper: { color: palette.muted, fontSize: 10, lineHeight: 15 },
  toggleRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: palette.line,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    padding: 14,
  },
  toggleTitle: { color: palette.ink, fontSize: 12, fontWeight: "800" },
  toggleBody: {
    color: palette.muted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 3,
  },
  disclosure: { color: palette.warning, fontSize: 10, lineHeight: 15 },
  fileSummary: {
    backgroundColor: "#eaf4ef",
    borderRadius: 14,
    gap: 4,
    padding: 14,
  },
  fileSummaryTitle: {
    color: palette.positive,
    fontSize: 12,
    fontWeight: "800",
  },
  modalFooter: {
    backgroundColor: "rgba(248,247,243,0.96)",
    borderTopColor: palette.line,
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    padding: 14,
    position: "absolute",
    right: 0,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: palette.aqua,
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 50,
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
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
  },
  captureTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
  },
  captureClose: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  captureCloseText: { color: "#ffffff", fontSize: 28, lineHeight: 30 },
  captureStatus: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.46)",
    borderRadius: 16,
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  captureStatusText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  liveDot: {
    backgroundColor: "#ff6a3d",
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  captureBottom: { alignItems: "center", gap: 12 },
  guidanceCard: {
    alignSelf: "stretch",
    backgroundColor: "rgba(4,10,13,0.78)",
    borderColor: "rgba(255,255,255,0.2)",
    borderRadius: 16,
    borderWidth: 1,
    gap: 5,
    padding: 13,
  },
  guidanceTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  guidanceGrade: { color: "#f7c86b", flex: 1, fontSize: 11, fontWeight: "800" },
  guidanceScore: { color: "#ffffff", fontSize: 11, fontWeight: "800" },
  guidanceWarning: { color: "#ffffff", fontSize: 13, fontWeight: "700" },
  guidanceNote: {
    color: "rgba(255,255,255,0.66)",
    fontSize: 10,
    lineHeight: 14,
  },
  captureError: {
    alignSelf: "stretch",
    backgroundColor: "rgba(130,25,25,0.82)",
    borderRadius: 12,
    padding: 10,
  },
  captureErrorText: { color: "#ffffff", fontSize: 11, textAlign: "center" },
  sharePill: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 9,
  },
  sharePillText: { color: palette.navy, fontSize: 11, fontWeight: "800" },
  captureButton: {
    alignItems: "center",
    backgroundColor: "rgba(222,104,66,0.94)",
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
  headerActionLight: { color: "#63e3db", fontSize: 13, fontWeight: "800" },
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
  player: { height: "100%", width: "100%" },
  playerError: { color: "#f27878", padding: 20, textAlign: "center" },
  playerInfo: { gap: 8, padding: 20 },
  playerTitle: { color: "#ffffff", fontSize: 22, fontWeight: "800" },
  playerMeta: { color: "#aaa79e", fontSize: 12 },
  playerPrivacy: { color: "#63e3db", fontSize: 10, fontWeight: "800" },
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
  uploadFill: { backgroundColor: "#63e3db", height: 8 },
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
  sheetActionMeta: { color: "#98a2b3", fontSize: 10 },
});
