import type { PersonSummary } from "@duna/core";
import { demoPlayer } from "@duna/core/demo";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Mapbox from "@rnmapbox/maps";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useMapboxToken } from "./discovery-map";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "./satoshi-text";
import { dunaApiBaseUrl } from "./mobile-api";
import {
  MobilePlacePicker,
  type MobilePlaceSelection,
} from "./components/mobile-place-picker";
import { PlayerPickerModal, type MobileSocialPalette } from "./player-social";
import { usePlayerRuntime } from "./runtime";
import {
  scoreMaximumSets,
  validateCompletedScore,
  type ScoreSetsToWin,
} from "./score-upload-utils";

type MatchType = "competitive" | "friendly";
type TeamSide = "A" | "B";
type TeamSize = 2 | 3 | 4 | 6;
type SetsToWin = ScoreSetsToWin;
type ScoreStep = "match" | "players" | "when" | "location" | "score" | "review";

type DunaParticipant = {
  readonly kind: "duna";
  readonly person: PersonSummary;
};

type ProvisionalParticipant = {
  readonly kind: "provisional";
  readonly id: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly email?: string;
  readonly phoneE164?: string;
};

type ScoreParticipant = DunaParticipant | ProvisionalParticipant;
type ScoreSetDraft = { readonly a: string; readonly b: string };

const steps: readonly ScoreStep[] = [
  "match",
  "players",
  "when",
  "location",
  "score",
  "review",
];
const teamSizes: readonly TeamSize[] = [2, 3, 4, 6];

function rgba(rgb: string, alpha: number) {
  return `rgba(${rgb},${alpha})`;
}

function participantName(participant: ScoreParticipant | undefined) {
  if (!participant) return "Available";
  return participant.kind === "duna"
    ? participant.person.displayName
    : `${participant.givenName} ${participant.familyName}`;
}

function participantInitials(participant: ScoreParticipant) {
  if (participant.kind === "duna") return participant.person.initials;
  return `${participant.givenName[0] ?? ""}${participant.familyName[0] ?? ""}`.toUpperCase();
}

function firstName(participant: ScoreParticipant | undefined) {
  return participantName(participant).split(/\s+/)[0] ?? "player";
}

function mergeDatePart(current: Date, selected: Date) {
  const next = new Date(current);
  next.setFullYear(
    selected.getFullYear(),
    selected.getMonth(),
    selected.getDate(),
  );
  return next;
}

function mergeTimePart(current: Date, selected: Date) {
  const next = new Date(current);
  next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
  return next;
}

function SelectionCard({
  active,
  body,
  icon,
  onPress,
  palette,
  title,
}: {
  readonly active: boolean;
  readonly body: string;
  readonly icon: string;
  readonly onPress: () => void;
  readonly palette: MobileSocialPalette;
  readonly title: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={[
        styles.selectionCard,
        {
          backgroundColor: active
            ? rgba(palette.accentRgb, 0.1)
            : palette.depth,
          borderColor: active ? palette.aqua : rgba(palette.overlayRgb, 0.1),
        },
      ]}
    >
      <View
        style={[
          styles.selectionIcon,
          {
            backgroundColor: active
              ? palette.aqua
              : rgba(palette.accentRgb, 0.09),
          },
        ]}
      >
        <Text
          style={{
            color: active ? palette.onAccent : palette.aqua,
            fontSize: 22,
          }}
        >
          {icon}
        </Text>
      </View>
      <View style={styles.flex}>
        <Text style={[styles.selectionTitle, { color: palette.bone }]}>
          {title}
        </Text>
        <Text style={[styles.selectionBody, { color: palette.muted }]}>
          {body}
        </Text>
      </View>
      <View
        style={[
          styles.radio,
          { borderColor: active ? palette.aqua : palette.muted },
        ]}
      >
        {active && (
          <View style={[styles.radioDot, { backgroundColor: palette.aqua }]} />
        )}
      </View>
    </Pressable>
  );
}

function ParticipantAvatar({
  participant,
  palette,
  size = 54,
}: {
  readonly participant?: ScoreParticipant;
  readonly palette: MobileSocialPalette;
  readonly size?: number;
}) {
  const shape = { borderRadius: size / 2, height: size, width: size };
  if (participant?.kind === "duna" && participant.person.avatarUrl) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri: participant.person.avatarUrl }}
        style={shape}
      />
    );
  }
  return (
    <View
      style={[
        shape,
        styles.participantFallback,
        {
          backgroundColor: participant
            ? palette.navy
            : rgba(palette.accentRgb, 0.08),
          borderColor: participant
            ? rgba(palette.accentRgb, 0.16)
            : rgba(palette.accentRgb, 0.28),
        },
      ]}
    >
      <Text
        style={[
          styles.participantInitials,
          { color: participant ? palette.aqua : palette.muted },
        ]}
      >
        {participant ? participantInitials(participant) : "+"}
      </Text>
    </View>
  );
}

function SelectedPlaceMap({
  palette,
  place,
}: {
  readonly palette: MobileSocialPalette;
  readonly place: MobilePlaceSelection;
}) {
  const canMap = place.latitude !== undefined && place.longitude !== undefined;
  const token = useMapboxToken(canMap);
  return (
    <View
      style={[
        styles.placeMap,
        { backgroundColor: rgba(palette.accentRgb, 0.1) },
      ]}
    >
      {token && canMap ? (
        <Mapbox.MapView
          attributionEnabled={false}
          compassEnabled={false}
          logoEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          scaleBarEnabled={false}
          scrollEnabled={false}
          style={StyleSheet.absoluteFill}
          styleURL="mapbox://styles/mapbox/standard"
          zoomEnabled={false}
        >
          <Mapbox.Camera
            defaultSettings={{
              centerCoordinate: [place.longitude!, place.latitude!],
              zoomLevel: 13.5,
            }}
          />
          <Mapbox.PointAnnotation
            coordinate={[place.longitude!, place.latitude!]}
            id="reported-match-location"
          >
            <View
              style={[
                styles.mapPin,
                {
                  backgroundColor: palette.flare,
                  borderColor: palette.white,
                },
              ]}
            />
          </Mapbox.PointAnnotation>
        </Mapbox.MapView>
      ) : null}
      <View
        pointerEvents="none"
        style={[
          styles.placeMapLabel,
          { backgroundColor: rgba(palette.depthRgb, token ? 0.92 : 0.72) },
        ]}
      >
        <Text style={[styles.placeMapEyebrow, { color: palette.aqua }]}>
          {token ? "MAP PREVIEW" : "LOCATION SAVED"}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.placeMapName, { color: palette.bone }]}
        >
          {place.name}
        </Text>
        {!!place.address && (
          <Text
            numberOfLines={2}
            style={[styles.placeMapAddress, { color: palette.muted }]}
          >
            {place.address}
          </Text>
        )}
      </View>
    </View>
  );
}

function ProvisionalPlayerModal({
  onClose,
  onSave,
  opponentNames,
  palette,
  visible,
}: {
  readonly onClose: () => void;
  readonly onSave: (participant: ProvisionalParticipant) => void;
  readonly opponentNames: readonly string[];
  readonly palette: MobileSocialPalette;
  readonly visible: boolean;
}) {
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [contactKind, setContactKind] = useState<"email" | "phone">("email");
  const [contact, setContact] = useState("");
  const [error, setError] = useState<string>();

  const close = () => {
    setGivenName("");
    setFamilyName("");
    setContact("");
    setContactKind("email");
    setError(undefined);
    onClose();
  };
  const save = () => {
    const cleanGivenName = givenName.trim();
    const cleanFamilyName = familyName.trim();
    const cleanContact =
      contactKind === "phone"
        ? contact.trim().replace(/[\s()-]/g, "")
        : contact.trim();
    if (!cleanGivenName || !cleanFamilyName) {
      setError("Add the player's first and last name.");
      return;
    }
    if (
      contactKind === "email" &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanContact)
    ) {
      setError("Add a valid email address.");
      return;
    }
    if (contactKind === "phone" && !/^\+[1-9]\d{7,14}$/.test(cleanContact)) {
      setError("Use an international mobile number beginning with +.");
      return;
    }
    onSave({
      kind: "provisional",
      id: Crypto.randomUUID(),
      givenName: cleanGivenName,
      familyName: cleanFamilyName,
      ...(contactKind === "email"
        ? { email: cleanContact.toLowerCase() }
        : { phoneE164: cleanContact }),
    });
    close();
  };
  const opponents =
    opponentNames.filter((name) => name && name !== "Available").join(" & ") ||
    "the other team";

  return (
    <Modal
      animationType="slide"
      onRequestClose={close}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView
        edges={["top", "bottom"]}
        style={[styles.modalSafe, { backgroundColor: palette.canvas }]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <View
            style={[
              styles.modalHeader,
              { borderBottomColor: rgba(palette.overlayRgb, 0.1) },
            ]}
          >
            <View style={styles.flex}>
              <Text style={[styles.eyebrow, { color: palette.aqua }]}>
                PROVISIONAL PLAYER
              </Text>
              <Text style={[styles.modalTitle, { color: palette.bone }]}>
                Invite them through this result
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close provisional player form"
              onPress={close}
              style={styles.closeButton}
            >
              <Text style={[styles.closeText, { color: palette.bone }]}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.provisionalContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.nameFields}>
              <View style={styles.flex}>
                <Text style={[styles.fieldLabel, { color: palette.bone }]}>
                  First name
                </Text>
                <TextInput
                  autoCapitalize="words"
                  onChangeText={setGivenName}
                  placeholder="First name"
                  placeholderTextColor={palette.muted}
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: palette.depth,
                      borderColor: rgba(palette.overlayRgb, 0.12),
                      color: palette.bone,
                    },
                  ]}
                  value={givenName}
                />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.fieldLabel, { color: palette.bone }]}>
                  Last name
                </Text>
                <TextInput
                  autoCapitalize="words"
                  onChangeText={setFamilyName}
                  placeholder="Last name"
                  placeholderTextColor={palette.muted}
                  style={[
                    styles.textInput,
                    {
                      backgroundColor: palette.depth,
                      borderColor: rgba(palette.overlayRgb, 0.12),
                      color: palette.bone,
                    },
                  ]}
                  value={familyName}
                />
              </View>
            </View>
            <Text style={[styles.fieldLabel, { color: palette.bone }]}>
              Send invitation by
            </Text>
            <View style={styles.segmentedRow}>
              {(["email", "phone"] as const).map((kind) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: contactKind === kind }}
                  key={kind}
                  onPress={() => {
                    setContactKind(kind);
                    setContact("");
                    setError(undefined);
                  }}
                  style={[
                    styles.segment,
                    {
                      backgroundColor:
                        contactKind === kind ? palette.aqua : palette.depth,
                      borderColor:
                        contactKind === kind
                          ? palette.aqua
                          : rgba(palette.overlayRgb, 0.12),
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      {
                        color:
                          contactKind === kind
                            ? palette.onAccent
                            : palette.bone,
                      },
                    ]}
                  >
                    {kind === "email" ? "Email" : "Mobile"}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType={
                contactKind === "email" ? "email-address" : "phone-pad"
              }
              onChangeText={setContact}
              placeholder={
                contactKind === "email"
                  ? "player@example.com"
                  : "+34 600 000 000"
              }
              placeholderTextColor={palette.muted}
              style={[
                styles.textInput,
                {
                  backgroundColor: palette.depth,
                  borderColor: rgba(palette.overlayRgb, 0.12),
                  color: palette.bone,
                },
              ]}
              value={contact}
            />
            <View
              style={[
                styles.invitePreview,
                {
                  backgroundColor: rgba(palette.accentRgb, 0.08),
                  borderColor: rgba(palette.accentRgb, 0.18),
                },
              ]}
            >
              <Text
                style={[styles.invitePreviewLabel, { color: palette.aqua }]}
              >
                INVITATION PREVIEW
              </Text>
              <Text style={[styles.invitePreviewText, { color: palette.bone }]}>
                Your match against {opponents} has been reported in Duna. Join
                now to see your rating and track your progress for free.
              </Text>
              <Text style={[styles.invitePreviewLink, { color: palette.aqua }]}>
                A unique sign-up link is added automatically.
              </Text>
            </View>
            <View
              style={[
                styles.ratingNotice,
                {
                  backgroundColor: rgba(palette.warningRgb, 0.11),
                  borderColor: rgba(palette.warningRgb, 0.22),
                },
              ]}
            >
              <Text style={[styles.noticeMark, { color: palette.warning }]}>
                ◇
              </Text>
              <Text style={[styles.noticeText, { color: palette.muted }]}>
                This match will not affect Sand Rating until every required
                player has joined Duna and the result is confirmed.
              </Text>
            </View>
            {!!error && (
              <Text style={[styles.errorText, { color: palette.danger }]}>
                {error}
              </Text>
            )}
          </ScrollView>
          <View
            style={[
              styles.modalFooter,
              {
                backgroundColor: palette.canvas,
                borderTopColor: rgba(palette.overlayRgb, 0.1),
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              onPress={save}
              style={[styles.primaryButton, { backgroundColor: palette.aqua }]}
            >
              <Text
                style={[styles.primaryButtonText, { color: palette.onAccent }]}
              >
                Add provisional player
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

export function ScoreUploadScreen({
  initialPlayedAt,
  initialSets = [],
  onComplete,
  palette,
}: {
  readonly initialPlayedAt?: string;
  readonly initialSets?: readonly { readonly a: number; readonly b: number }[];
  readonly onComplete: () => void;
  readonly palette: MobileSocialPalette;
}) {
  const { client, dashboard, mode, refresh } = usePlayerRuntime();
  const player = dashboard?.player ?? demoPlayer;
  const [step, setStep] = useState<ScoreStep>("match");
  const [matchType, setMatchType] = useState<MatchType>("competitive");
  const [teamSize, setTeamSize] = useState<TeamSize>(2);
  const [teamA, setTeamA] = useState<readonly (ScoreParticipant | undefined)[]>(
    [{ kind: "duna", person: player }, undefined],
  );
  const [teamB, setTeamB] = useState<readonly (ScoreParticipant | undefined)[]>(
    [undefined, undefined],
  );
  const initialSetsToWin: SetsToWin =
    initialSets.length === 1 ? 1 : initialSets.length <= 3 ? 2 : 3;
  const [playedAt, setPlayedAt] = useState(() => {
    const date = initialPlayedAt ? new Date(initialPlayedAt) : new Date();
    date.setMinutes(Math.floor(date.getMinutes() / 5) * 5, 0, 0);
    return date;
  });
  const [location, setLocation] = useState<MobilePlaceSelection>();
  const [setsToWin, setSetsToWin] = useState<SetsToWin>(initialSetsToWin);
  const [scoreDrafts, setScoreDrafts] = useState<readonly ScoreSetDraft[]>(() =>
    Array.from({ length: scoreMaximumSets(initialSetsToWin) }, (_, index) => {
      const score = initialSets[index];
      return score
        ? { a: String(score.a), b: String(score.b) }
        : { a: "", b: "" };
    }),
  );
  const [agreed, setAgreed] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<{
    readonly side: TeamSide;
    readonly index: number;
  }>();
  const [provisionalTarget, setProvisionalTarget] = useState<{
    readonly side: TeamSide;
    readonly index: number;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [submitted, setSubmitted] = useState<{
    readonly matchId?: string;
    readonly provisionalCount: number;
  }>();

  const currentStep = steps.indexOf(step);
  const themeVariant =
    palette.ink === palette.onAccent ? ("dark" as const) : ("light" as const);
  const roster = [...teamA, ...teamB];
  const provisionalCount = roster.filter(
    (participant) => participant?.kind === "provisional",
  ).length;
  const selectedDunaCount = roster.filter(
    (participant) => participant?.kind === "duna",
  ).length;
  const completedScores = useMemo(() => {
    const result: { a: number; b: number }[] = [];
    for (const draft of scoreDrafts) {
      if (!draft.a && !draft.b) continue;
      if (!draft.a || !draft.b) return undefined;
      result.push({ a: Number(draft.a), b: Number(draft.b) });
    }
    return result;
  }, [scoreDrafts]);
  const scoreError = completedScores
    ? validateCompletedScore(setsToWin, completedScores)
    : "Complete both sides of every recorded set.";
  const teamALabel = teamA.map(firstName).join(" / ");
  const teamBLabel = teamB.map(firstName).join(" / ");

  const resizeTeams = (size: TeamSize) => {
    const resize = (
      current: readonly (ScoreParticipant | undefined)[],
      includePlayer = false,
    ) => {
      const next = current.slice(0, size);
      while (next.length < size) next.push(undefined);
      if (
        includePlayer &&
        !next.some(
          (slot) => slot?.kind === "duna" && slot.person.id === player.id,
        )
      ) {
        next[0] = { kind: "duna", person: player };
      }
      return next;
    };
    setTeamSize(size);
    setTeamA((current) => resize(current, true));
    setTeamB((current) => resize(current));
    void Haptics.selectionAsync().catch(() => undefined);
  };

  const setSlot = (
    target: { readonly side: TeamSide; readonly index: number },
    participant: ScoreParticipant | undefined,
  ) => {
    const update = (current: readonly (ScoreParticipant | undefined)[]) =>
      current.map((slot, index) =>
        index === target.index ? participant : slot,
      );
    if (target.side === "A") setTeamA(update);
    else setTeamB(update);
  };

  const next = () => {
    setError(undefined);
    if (step === "players" && roster.some((slot) => !slot)) {
      setError(`Add all ${teamSize * 2} players before continuing.`);
      return;
    }
    if (step === "when" && playedAt.getTime() > Date.now() + 60_000) {
      setError("Choose a date and time that has already happened.");
      return;
    }
    if (step === "score" && scoreError) {
      setError(scoreError);
      return;
    }
    const nextStep = steps[currentStep + 1];
    if (nextStep) {
      setStep(nextStep);
      void Haptics.selectionAsync().catch(() => undefined);
    }
  };

  const back = () => {
    setError(undefined);
    const previous = steps[currentStep - 1];
    if (previous) setStep(previous);
  };

  const submit = async () => {
    if (!agreed) {
      setError("Confirm that every player agreed to record this result.");
      return;
    }
    if (!completedScores || scoreError) {
      setError(scoreError ?? "Complete the score before submitting.");
      return;
    }
    if (mode === "preview" || !client) {
      setSubmitted({ provisionalCount });
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      let deviceId = await AsyncStorage.getItem("duna-score-upload-device-id");
      if (!deviceId) {
        deviceId = `native-score-${Crypto.randomUUID()}`;
        await AsyncStorage.setItem("duna-score-upload-device-id", deviceId);
      }
      const dunaIds = (team: readonly (ScoreParticipant | undefined)[]) =>
        team.flatMap((participant) =>
          participant?.kind === "duna" ? [participant.person.id] : [],
        );
      const provisionalParticipants = [
        ...teamA.map((participant) => ({ side: "A" as const, participant })),
        ...teamB.map((participant) => ({ side: "B" as const, participant })),
      ].flatMap(({ side, participant }) =>
        participant?.kind === "provisional"
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
      const result = await client.player.recordCompletedMatch.mutate({
        teamAIds: dunaIds(teamA),
        teamBIds: dunaIds(teamB),
        provisionalParticipants,
        venueId: location?.venueId,
        ...(location
          ? {
              location: {
                label: location.address ?? location.name,
                googlePlaceId: location.googlePlaceId,
                name: location.name,
                address: location.address,
                latitude: location.latitude,
                longitude: location.longitude,
              },
            }
          : {}),
        playedAt: playedAt.toISOString(),
        setsToWin,
        setScores: completedScores,
        matchType,
        allPlayersAgreedToRecord: true,
        deviceId,
        idempotencyKey: Crypto.randomUUID(),
      });
      await refresh();
      setSubmitted({ matchId: result.matchId, provisionalCount });
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => undefined);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Duna could not record this result.",
      );
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep("match");
    setMatchType("competitive");
    setTeamSize(2);
    setTeamA([{ kind: "duna", person: player }, undefined]);
    setTeamB([undefined, undefined]);
    setLocation(undefined);
    setSetsToWin(2);
    setScoreDrafts([
      { a: "", b: "" },
      { a: "", b: "" },
      { a: "", b: "" },
    ]);
    setAgreed(false);
    setError(undefined);
    setSubmitted(undefined);
  };

  if (submitted) {
    return (
      <ScrollView
        contentContainerStyle={styles.successContent}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.successMark,
            { backgroundColor: rgba(palette.positiveRgb, 0.14) },
          ]}
        >
          <Text style={[styles.successMarkText, { color: palette.positive }]}>
            ✓
          </Text>
        </View>
        <Text style={[styles.eyebrow, { color: palette.aqua }]}>
          RESULT RECORDED
        </Text>
        <Text style={[styles.successTitle, { color: palette.bone }]}>
          Your match is now part of the story.
        </Text>
        <Text style={[styles.successBody, { color: palette.muted }]}>
          {submitted.provisionalCount > 0
            ? `${submitted.provisionalCount} unique ${submitted.provisionalCount === 1 ? "invitation is" : "invitations are"} on the way. Sand Rating stays locked until every required player joins Duna and the result is confirmed.`
            : matchType === "competitive" && teamSize === 2
              ? "The result is waiting for opponent confirmation before Sand Rating can update."
              : "The result has been added to match history."}
        </Text>
        {mode === "preview" && (
          <Text style={[styles.previewNote, { color: palette.warning }]}>
            Preview mode did not publish this result.
          </Text>
        )}
        <View style={styles.successActions}>
          <Pressable
            onPress={onComplete}
            style={[styles.primaryButton, { backgroundColor: palette.aqua }]}
          >
            <Text
              style={[styles.primaryButtonText, { color: palette.onAccent }]}
            >
              View performance
            </Text>
          </Pressable>
          <Pressable
            onPress={reset}
            style={[styles.secondaryButton, { borderColor: palette.aqua }]}
          >
            <Text style={[styles.secondaryButtonText, { color: palette.aqua }]}>
              Upload another score
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    );
  }

  const renderParticipant = (
    participant: ScoreParticipant | undefined,
    side: TeamSide,
    index: number,
  ) => {
    const isReporter =
      participant?.kind === "duna" && participant.person.id === player.id;
    return (
      <Pressable
        accessibilityLabel={
          participant
            ? `${participantName(participant)}${isReporter ? ", you" : ""}`
            : `Add Team ${side} player ${index + 1}`
        }
        accessibilityRole="button"
        disabled={isReporter}
        key={`${side}-${index}`}
        onPress={() => setPickerTarget({ side, index })}
        style={[
          styles.participantSlot,
          {
            backgroundColor: palette.depth,
            borderColor: participant
              ? rgba(palette.overlayRgb, 0.1)
              : rgba(palette.accentRgb, 0.24),
          },
        ]}
      >
        <ParticipantAvatar participant={participant} palette={palette} />
        <View style={styles.flex}>
          <Text
            numberOfLines={1}
            style={[
              styles.participantName,
              { color: participant ? palette.bone : palette.aqua },
            ]}
          >
            {participantName(participant)}
          </Text>
          <Text style={[styles.participantMeta, { color: palette.muted }]}>
            {participant?.kind === "duna"
              ? `${participant.person.rating.display.toFixed(2)} Sand${isReporter ? " · You" : ""}`
              : participant?.kind === "provisional"
                ? "Provisional · Invite ready"
                : "Search or invite"}
          </Text>
        </View>
        {!isReporter && participant && (
          <Pressable
            accessibilityLabel={`Remove ${participantName(participant)}`}
            hitSlop={10}
            onPress={(event) => {
              event.stopPropagation();
              setSlot({ side, index }, undefined);
            }}
            style={styles.removeSlot}
          >
            <Text style={[styles.removeSlotText, { color: palette.muted }]}>
              ×
            </Text>
          </Pressable>
        )}
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={[styles.eyebrow, { color: palette.aqua }]}>
            UPLOAD A SCORE
          </Text>
          <Text style={[styles.headerTitle, { color: palette.bone }]}>
            {step === "match"
              ? "Share a match played outside Duna"
              : step === "players"
                ? "Who played?"
                : step === "when"
                  ? "When did you play?"
                  : step === "location"
                    ? "Where did you play?"
                    : step === "score"
                      ? "Add the final score"
                      : "Review your result"}
          </Text>
        </View>
        <Text style={[styles.stepCount, { color: palette.muted }]}>
          {currentStep + 1}/{steps.length}
        </Text>
      </View>
      <View style={styles.progressRow}>
        {steps.map((item, index) => (
          <View
            key={item}
            style={[
              styles.progressSegment,
              {
                backgroundColor:
                  index <= currentStep
                    ? palette.aqua
                    : rgba(palette.overlayRgb, 0.1),
              },
            ]}
          />
        ))}
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === "match" && (
          <View style={styles.sectionStack}>
            <Text style={[styles.sectionLabel, { color: palette.muted }]}>
              HOW SHOULD THIS RESULT COUNT?
            </Text>
            <SelectionCard
              active={matchType === "competitive"}
              body="Eligible results can affect Sand Rating after player confirmation."
              icon="◇"
              onPress={() => setMatchType("competitive")}
              palette={palette}
              title="Competitive"
            />
            <SelectionCard
              active={matchType === "friendly"}
              body="Saved to match history without changing anyone's rating."
              icon="○"
              onPress={() => setMatchType("friendly")}
              palette={palette}
              title="Casual"
            />
            <Text style={[styles.sectionLabel, { color: palette.muted }]}>
              TEAM FORMAT
            </Text>
            <View style={styles.teamSizeGrid}>
              {teamSizes.map((size) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: teamSize === size }}
                  key={size}
                  onPress={() => resizeTeams(size)}
                  style={[
                    styles.teamSizeButton,
                    {
                      backgroundColor:
                        teamSize === size ? palette.aqua : palette.depth,
                      borderColor:
                        teamSize === size
                          ? palette.aqua
                          : rgba(palette.overlayRgb, 0.12),
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.teamSizeValue,
                      {
                        color:
                          teamSize === size ? palette.onAccent : palette.bone,
                      },
                    ]}
                  >
                    {size}v{size}
                  </Text>
                </Pressable>
              ))}
            </View>
            {matchType === "competitive" && teamSize !== 2 && (
              <View
                style={[
                  styles.infoCard,
                  {
                    backgroundColor: rgba(palette.warningRgb, 0.1),
                    borderColor: rgba(palette.warningRgb, 0.2),
                  },
                ]}
              >
                <Text style={[styles.noticeMark, { color: palette.warning }]}>
                  i
                </Text>
                <Text style={[styles.noticeText, { color: palette.muted }]}>
                  Duna records every format. Sand Rating currently scores
                  verified 2v2 results, so this match will remain in performance
                  history without a rating change.
                </Text>
              </View>
            )}
          </View>
        )}

        {step === "players" && (
          <View style={styles.sectionStack}>
            <View style={styles.teamHeading}>
              <Text style={[styles.teamHeadingText, { color: palette.bone }]}>
                Team A
              </Text>
              <Text style={[styles.teamHeadingMeta, { color: palette.muted }]}>
                {teamA.filter(Boolean).length}/{teamSize}
              </Text>
            </View>
            {teamA.map((participant, index) =>
              renderParticipant(participant, "A", index),
            )}
            <View style={styles.teamHeading}>
              <Text style={[styles.teamHeadingText, { color: palette.bone }]}>
                Team B
              </Text>
              <Text style={[styles.teamHeadingMeta, { color: palette.muted }]}>
                {teamB.filter(Boolean).length}/{teamSize}
              </Text>
            </View>
            {teamB.map((participant, index) =>
              renderParticipant(participant, "B", index),
            )}
            <View
              style={[
                styles.ratingNotice,
                {
                  backgroundColor: rgba(palette.warningRgb, 0.1),
                  borderColor: rgba(palette.warningRgb, 0.2),
                },
              ]}
            >
              <Text style={[styles.noticeMark, { color: palette.warning }]}>
                ◇
              </Text>
              <View style={styles.flex}>
                <Text style={[styles.noticeTitle, { color: palette.bone }]}>
                  Rating requires Duna players
                </Text>
                <Text style={[styles.noticeText, { color: palette.muted }]}>
                  {provisionalCount > 0
                    ? `${provisionalCount} provisional ${provisionalCount === 1 ? "player has" : "players have"} an invitation ready. `
                    : ""}
                  Matches without every required player on Duna are saved, but
                  will not be scored until they join and the result is
                  confirmed.
                </Text>
              </View>
            </View>
          </View>
        )}

        {step === "when" && (
          <View style={styles.sectionStack}>
            <View
              style={[
                styles.nativePickerCard,
                {
                  backgroundColor: palette.depth,
                  borderColor: rgba(palette.overlayRgb, 0.1),
                },
              ]}
            >
              <Text style={[styles.sectionLabel, { color: palette.aqua }]}>
                DATE
              </Text>
              <DateTimePicker
                accentColor={palette.aqua}
                display={Platform.OS === "ios" ? "inline" : "default"}
                maximumDate={new Date()}
                mode="date"
                onValueChange={(_event, date) =>
                  setPlayedAt((current) => mergeDatePart(current, date))
                }
                presentation="inline"
                themeVariant={themeVariant}
                value={playedAt}
              />
            </View>
            <View
              style={[
                styles.nativePickerCard,
                {
                  backgroundColor: palette.depth,
                  borderColor: rgba(palette.overlayRgb, 0.1),
                },
              ]}
            >
              <Text style={[styles.sectionLabel, { color: palette.aqua }]}>
                START TIME
              </Text>
              <DateTimePicker
                accentColor={palette.aqua}
                display={Platform.OS === "ios" ? "spinner" : "default"}
                mode="time"
                onValueChange={(_event, date) =>
                  setPlayedAt((current) => mergeTimePart(current, date))
                }
                presentation="inline"
                themeVariant={themeVariant}
                value={playedAt}
              />
            </View>
            <View
              style={[
                styles.dateSummary,
                { backgroundColor: rgba(palette.accentRgb, 0.08) },
              ]}
            >
              <Text style={[styles.dateSummaryLabel, { color: palette.aqua }]}>
                MATCH TIME
              </Text>
              <Text style={[styles.dateSummaryValue, { color: palette.bone }]}>
                {playedAt.toLocaleDateString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </Text>
              <Text style={[styles.dateSummaryTime, { color: palette.muted }]}>
                {playedAt.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </Text>
            </View>
          </View>
        )}

        {step === "location" && (
          <View style={styles.sectionStack}>
            <MobilePlacePicker
              baseUrl={dunaApiBaseUrl}
              description="Search a venue, beach, park, or address. Location is optional."
              label="Match location"
              lockedLabel="LOCATION CONFIRMED · GOOGLE"
              onChange={setLocation}
              palette={palette}
              value={location}
            />
            {location && (
              <SelectedPlaceMap palette={palette} place={location} />
            )}
            {!location && (
              <View
                style={[
                  styles.infoCard,
                  {
                    backgroundColor: rgba(palette.accentRgb, 0.07),
                    borderColor: rgba(palette.accentRgb, 0.16),
                  },
                ]}
              >
                <Text style={[styles.noticeMark, { color: palette.aqua }]}>
                  ⌖
                </Text>
                <Text style={[styles.noticeText, { color: palette.muted }]}>
                  You can continue without a location. Adding one makes the
                  match easier to recognize in performance history.
                </Text>
              </View>
            )}
          </View>
        )}

        {step === "score" && (
          <View style={styles.sectionStack}>
            <Text style={[styles.sectionLabel, { color: palette.muted }]}>
              MATCH LENGTH
            </Text>
            <View style={styles.segmentedRow}>
              {([1, 2, 3] as const).map((value) => (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: setsToWin === value }}
                  key={value}
                  onPress={() => {
                    setSetsToWin(value);
                    setScoreDrafts(
                      Array.from(
                        { length: scoreMaximumSets(value) },
                        (_, index) => scoreDrafts[index] ?? { a: "", b: "" },
                      ),
                    );
                    setError(undefined);
                  }}
                  style={[
                    styles.segment,
                    {
                      backgroundColor:
                        setsToWin === value ? palette.aqua : palette.depth,
                      borderColor:
                        setsToWin === value
                          ? palette.aqua
                          : rgba(palette.overlayRgb, 0.12),
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      {
                        color:
                          setsToWin === value ? palette.onAccent : palette.bone,
                      },
                    ]}
                  >
                    {value === 1 ? "1 set" : `Best of ${value * 2 - 1}`}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View
              style={[
                styles.scoreCard,
                {
                  backgroundColor: palette.depth,
                  borderColor: rgba(palette.overlayRgb, 0.1),
                },
              ]}
            >
              <View style={styles.scoreHeader}>
                <Text
                  numberOfLines={1}
                  style={[styles.scoreTeam, { color: palette.bone }]}
                >
                  {teamALabel}
                </Text>
                <Text style={[styles.scoreVersus, { color: palette.muted }]}>
                  VS
                </Text>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.scoreTeam,
                    styles.scoreTeamRight,
                    { color: palette.bone },
                  ]}
                >
                  {teamBLabel}
                </Text>
              </View>
              {scoreDrafts.map((draft, index) => (
                <View
                  key={index}
                  style={[
                    styles.scoreRow,
                    { borderTopColor: rgba(palette.overlayRgb, 0.08) },
                  ]}
                >
                  <Text
                    style={[styles.scoreSetLabel, { color: palette.muted }]}
                  >
                    SET {index + 1}
                  </Text>
                  <TextInput
                    accessibilityLabel={`Team A set ${index + 1} score`}
                    keyboardType="number-pad"
                    maxLength={2}
                    onChangeText={(value) =>
                      setScoreDrafts((current) =>
                        current.map((set, setIndex) =>
                          setIndex === index
                            ? { ...set, a: value.replace(/\D/g, "") }
                            : set,
                        ),
                      )
                    }
                    placeholder="0"
                    placeholderTextColor={palette.muted}
                    style={[
                      styles.scoreInput,
                      {
                        backgroundColor: rgba(palette.accentRgb, 0.07),
                        color: palette.bone,
                      },
                    ]}
                    value={draft.a}
                  />
                  <Text style={[styles.scoreDash, { color: palette.muted }]}>
                    –
                  </Text>
                  <TextInput
                    accessibilityLabel={`Team B set ${index + 1} score`}
                    keyboardType="number-pad"
                    maxLength={2}
                    onChangeText={(value) =>
                      setScoreDrafts((current) =>
                        current.map((set, setIndex) =>
                          setIndex === index
                            ? { ...set, b: value.replace(/\D/g, "") }
                            : set,
                        ),
                      )
                    }
                    placeholder="0"
                    placeholderTextColor={palette.muted}
                    style={[
                      styles.scoreInput,
                      {
                        backgroundColor: rgba(palette.accentRgb, 0.07),
                        color: palette.bone,
                      },
                    ]}
                    value={draft.b}
                  />
                </View>
              ))}
            </View>
            <Text style={[styles.scoreHint, { color: palette.muted }]}>
              Leave unused deciding sets blank. Every completed set needs a
              two-point margin.
            </Text>
          </View>
        )}

        {step === "review" && (
          <View style={styles.sectionStack}>
            <View
              style={[
                styles.reviewHero,
                {
                  backgroundColor: rgba(palette.accentRgb, 0.1),
                  borderColor: rgba(palette.accentRgb, 0.18),
                },
              ]}
            >
              <Text style={[styles.reviewEyebrow, { color: palette.aqua }]}>
                {matchType === "competitive" ? "COMPETITIVE" : "CASUAL"} ·{" "}
                {teamSize}V{teamSize}
              </Text>
              <Text style={[styles.reviewTitle, { color: palette.bone }]}>
                {teamALabel} vs {teamBLabel}
              </Text>
              <View style={styles.reviewScores}>
                {completedScores?.map((set, index) => (
                  <Text
                    key={index}
                    style={[styles.reviewScore, { color: palette.bone }]}
                  >
                    {set.a}–{set.b}
                  </Text>
                ))}
              </View>
              <Text style={[styles.reviewMeta, { color: palette.muted }]}>
                {playedAt.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}{" "}
                ·{" "}
                {playedAt.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </Text>
              <Text style={[styles.reviewMeta, { color: palette.muted }]}>
                {location
                  ? `${location.name}${location.address ? ` · ${location.address}` : ""}`
                  : "Location not added"}
              </Text>
            </View>
            <View style={styles.reviewTeams}>
              {([teamA, teamB] as const).map((team, teamIndex) => (
                <View
                  key={teamIndex}
                  style={[
                    styles.reviewTeam,
                    {
                      backgroundColor: palette.depth,
                      borderColor: rgba(palette.overlayRgb, 0.09),
                    },
                  ]}
                >
                  <Text
                    style={[styles.reviewTeamLabel, { color: palette.aqua }]}
                  >
                    TEAM {teamIndex === 0 ? "A" : "B"}
                  </Text>
                  {team.map(
                    (participant, index) =>
                      participant && (
                        <View key={index} style={styles.reviewPlayer}>
                          <ParticipantAvatar
                            participant={participant}
                            palette={palette}
                            size={38}
                          />
                          <View style={styles.flex}>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.reviewPlayerName,
                                { color: palette.bone },
                              ]}
                            >
                              {participantName(participant)}
                            </Text>
                            <Text
                              style={[
                                styles.reviewPlayerMeta,
                                { color: palette.muted },
                              ]}
                            >
                              {participant.kind === "duna"
                                ? `${participant.person.rating.display.toFixed(2)} Sand`
                                : "Invitation ready"}
                            </Text>
                          </View>
                        </View>
                      ),
                  )}
                </View>
              ))}
            </View>
            <View
              style={[
                styles.readinessCard,
                {
                  backgroundColor:
                    provisionalCount > 0
                      ? rgba(palette.warningRgb, 0.11)
                      : rgba(palette.positiveRgb, 0.1),
                  borderColor:
                    provisionalCount > 0
                      ? rgba(palette.warningRgb, 0.22)
                      : rgba(palette.positiveRgb, 0.2),
                },
              ]}
            >
              <Text
                style={[
                  styles.noticeMark,
                  {
                    color:
                      provisionalCount > 0 ? palette.warning : palette.positive,
                  },
                ]}
              >
                {provisionalCount > 0 ? "◇" : "✓"}
              </Text>
              <View style={styles.flex}>
                <Text style={[styles.noticeTitle, { color: palette.bone }]}>
                  {provisionalCount > 0
                    ? "Rating waits for player claims"
                    : matchType === "competitive" && teamSize === 2
                      ? "Eligible after confirmation"
                      : "Saved to performance history"}
                </Text>
                <Text style={[styles.noticeText, { color: palette.muted }]}>
                  {provisionalCount > 0
                    ? `${selectedDunaCount} of ${teamSize * 2} players are currently on Duna. Invitations send after submission.`
                    : matchType === "competitive" && teamSize === 2
                      ? "Opponents will confirm the result before Sand Rating updates."
                      : "This result will not change Sand Rating."}
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreed }}
              onPress={() => setAgreed((current) => !current)}
              style={[
                styles.agreement,
                {
                  backgroundColor: palette.depth,
                  borderColor: agreed
                    ? palette.aqua
                    : rgba(palette.overlayRgb, 0.12),
                },
              ]}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    backgroundColor: agreed ? palette.aqua : "transparent",
                    borderColor: agreed ? palette.aqua : palette.muted,
                  },
                ]}
              >
                {agreed && (
                  <Text
                    style={[styles.checkboxText, { color: palette.onAccent }]}
                  >
                    ✓
                  </Text>
                )}
              </View>
              <Text style={[styles.agreementText, { color: palette.bone }]}>
                I confirm every player agreed to record this result in Duna.
              </Text>
            </Pressable>
          </View>
        )}
        {!!error && (
          <Text style={[styles.errorText, { color: palette.danger }]}>
            {error}
          </Text>
        )}
      </ScrollView>
      <View
        style={[
          styles.footer,
          {
            backgroundColor: palette.canvas,
            borderTopColor: rgba(palette.overlayRgb, 0.1),
          },
        ]}
      >
        {currentStep > 0 && (
          <Pressable
            onPress={back}
            style={[styles.backButton, { borderColor: palette.aqua }]}
          >
            <Text style={[styles.backButtonText, { color: palette.aqua }]}>
              Back
            </Text>
          </Pressable>
        )}
        <Pressable
          disabled={busy}
          onPress={() => (step === "review" ? void submit() : next())}
          style={[
            styles.primaryButton,
            {
              backgroundColor: palette.aqua,
              flex: 1,
              opacity: busy ? 0.58 : 1,
            },
          ]}
        >
          {busy ? (
            <ActivityIndicator color={palette.onAccent} size="small" />
          ) : (
            <Text
              style={[styles.primaryButtonText, { color: palette.onAccent }]}
            >
              {step === "location" && !location
                ? "Continue without location"
                : step === "review"
                  ? mode === "preview"
                    ? "Preview submission"
                    : "Submit result"
                  : "Continue"}
            </Text>
          )}
        </Pressable>
      </View>
      <PlayerPickerModal
        excludedPersonIds={roster.flatMap((participant, index) => {
          if (!participant || participant.kind !== "duna") return [];
          const targetIndex = pickerTarget
            ? pickerTarget.side === "A"
              ? pickerTarget.index
              : teamSize + pickerTarget.index
            : -1;
          return index === targetIndex ? [] : [participant.person.id];
        })}
        maxSelected={1}
        onAddProvisional={() => {
          if (!pickerTarget) return;
          setProvisionalTarget(pickerTarget);
          setPickerTarget(undefined);
        }}
        onChange={(players) => {
          if (!pickerTarget) return;
          setSlot(
            pickerTarget,
            players[0] ? { kind: "duna", person: players[0] } : undefined,
          );
        }}
        onClose={() => setPickerTarget(undefined)}
        palette={palette}
        presentationStyle="pageSheet"
        selected={
          pickerTarget
            ? (() => {
                const participant =
                  pickerTarget.side === "A"
                    ? teamA[pickerTarget.index]
                    : teamB[pickerTarget.index];
                return participant?.kind === "duna" ? [participant.person] : [];
              })()
            : []
        }
        title={
          pickerTarget
            ? `Choose Team ${pickerTarget.side} player`
            : "Choose player"
        }
        visible={Boolean(pickerTarget)}
      />
      <ProvisionalPlayerModal
        onClose={() => setProvisionalTarget(undefined)}
        onSave={(participant) => {
          if (provisionalTarget) setSlot(provisionalTarget, participant);
        }}
        opponentNames={
          provisionalTarget?.side === "A"
            ? teamB.map(firstName)
            : teamA.map(firstName)
        }
        palette={palette}
        visible={Boolean(provisionalTarget)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  agreement: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 68,
    padding: 14,
  },
  agreementText: { flex: 1, fontSize: 14, lineHeight: 20 },
  backButton: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 56,
    minWidth: 82,
  },
  backButtonText: { fontSize: 14, fontWeight: "900" },
  checkbox: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1.5,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  checkboxText: { fontSize: 14, fontWeight: "900" },
  closeButton: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  closeText: { fontSize: 34, lineHeight: 36 },
  content: { paddingBottom: 132, paddingHorizontal: 18, paddingTop: 18 },
  dateSummary: { borderRadius: 20, padding: 18 },
  dateSummaryLabel: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  dateSummaryTime: { fontFamily: "Archivo-Table", fontSize: 18, marginTop: 4 },
  dateSummaryValue: {
    fontSize: 18,
    fontWeight: "800",
    lineHeight: 24,
    marginTop: 8,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
    textAlign: "center",
  },
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1.5 },
  fieldLabel: { fontSize: 13, fontWeight: "800", marginBottom: 7 },
  flex: { flex: 1 },
  footer: {
    alignItems: "center",
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    left: 0,
    padding: 18,
    paddingBottom: 96,
    position: "absolute",
    right: 0,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  headerTitle: {
    fontSize: 27,
    fontWeight: "900",
    letterSpacing: -1,
    lineHeight: 31,
    marginTop: 5,
  },
  infoCard: {
    alignItems: "flex-start",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    padding: 14,
  },
  invitePreview: { borderRadius: 20, borderWidth: 1, gap: 9, padding: 16 },
  invitePreviewLabel: { fontSize: 12, fontWeight: "900", letterSpacing: 1.1 },
  invitePreviewLink: { fontSize: 12, fontWeight: "800", lineHeight: 17 },
  invitePreviewText: { fontSize: 15, lineHeight: 22 },
  mapPin: { borderRadius: 11, borderWidth: 3, height: 22, width: 22 },
  modalFooter: { borderTopWidth: 1, padding: 18 },
  modalHeader: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  modalSafe: { flex: 1 },
  modalTitle: {
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -0.7,
    lineHeight: 29,
    marginTop: 4,
  },
  nameFields: { flexDirection: "row", gap: 10 },
  nativePickerCard: {
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
    padding: 16,
  },
  noticeMark: { fontSize: 17, fontWeight: "900", lineHeight: 22 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18 },
  noticeTitle: { fontSize: 14, fontWeight: "900", marginBottom: 3 },
  participantFallback: {
    alignItems: "center",
    borderWidth: 1,
    justifyContent: "center",
  },
  participantInitials: { fontSize: 15, fontWeight: "900" },
  participantMeta: { fontFamily: "Archivo-Table", fontSize: 12, marginTop: 3 },
  participantName: { fontSize: 15, fontWeight: "800" },
  participantSlot: {
    alignItems: "center",
    borderRadius: 19,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 78,
    padding: 12,
  },
  placeMap: {
    borderRadius: 22,
    height: 210,
    justifyContent: "flex-end",
    overflow: "hidden",
    padding: 12,
  },
  placeMapAddress: { fontSize: 12, lineHeight: 16, marginTop: 3 },
  placeMapEyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  placeMapLabel: { borderRadius: 15, padding: 12 },
  placeMapName: { fontSize: 16, fontWeight: "900", marginTop: 4 },
  previewNote: {
    fontSize: 12,
    fontWeight: "800",
    marginTop: 16,
    textAlign: "center",
  },
  primaryButton: {
    alignItems: "center",
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 18,
  },
  primaryButtonText: { fontSize: 15, fontWeight: "900", textAlign: "center" },
  progressRow: {
    flexDirection: "row",
    gap: 5,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  progressSegment: { borderRadius: 3, flex: 1, height: 4 },
  provisionalContent: { gap: 18, padding: 18, paddingBottom: 36 },
  radio: {
    alignItems: "center",
    borderRadius: 11,
    borderWidth: 2,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  radioDot: { borderRadius: 6, height: 10, width: 10 },
  ratingNotice: {
    alignItems: "flex-start",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    padding: 14,
  },
  readinessCard: {
    alignItems: "flex-start",
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 16,
  },
  removeSlot: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  removeSlotText: { fontSize: 25, lineHeight: 28 },
  reviewEyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1.1 },
  reviewHero: { borderRadius: 24, borderWidth: 1, padding: 18 },
  reviewMeta: { fontSize: 12, lineHeight: 18, marginTop: 5 },
  reviewPlayer: { alignItems: "center", flexDirection: "row", gap: 9 },
  reviewPlayerMeta: { fontFamily: "Archivo-Table", fontSize: 12, marginTop: 2 },
  reviewPlayerName: { fontSize: 12, fontWeight: "800" },
  reviewScore: {
    fontFamily: "Archivo-Table",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: -1,
  },
  reviewScores: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 13,
    marginTop: 14,
  },
  reviewTeam: {
    borderRadius: 19,
    borderWidth: 1,
    flex: 1,
    gap: 11,
    minWidth: "47%",
    padding: 12,
  },
  reviewTeamLabel: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  reviewTeams: { flexDirection: "row", gap: 10 },
  reviewTitle: {
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.7,
    lineHeight: 27,
    marginTop: 7,
  },
  scoreCard: { borderRadius: 22, borderWidth: 1, overflow: "hidden" },
  scoreDash: { fontSize: 24 },
  scoreHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    padding: 14,
  },
  scoreHint: { fontSize: 12, lineHeight: 18, textAlign: "center" },
  scoreInput: {
    borderRadius: 14,
    fontFamily: "Archivo-Table",
    fontSize: 24,
    fontWeight: "900",
    height: 54,
    textAlign: "center",
    width: 70,
  },
  scoreRow: {
    alignItems: "center",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    minHeight: 78,
    padding: 12,
  },
  scoreSetLabel: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    position: "absolute",
    left: 14,
  },
  scoreTeam: { flex: 1, fontSize: 13, fontWeight: "800" },
  scoreTeamRight: { textAlign: "right" },
  scoreVersus: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  screen: { flex: 1 },
  sectionLabel: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2 },
  sectionStack: { gap: 12 },
  secondaryButton: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 56,
    paddingHorizontal: 18,
  },
  secondaryButtonText: { fontSize: 14, fontWeight: "900" },
  segment: {
    alignItems: "center",
    borderRadius: 15,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 10,
  },
  segmentedRow: { flexDirection: "row", gap: 8 },
  segmentText: { fontSize: 12, fontWeight: "900", textAlign: "center" },
  selectionBody: { fontSize: 12, lineHeight: 18, marginTop: 4 },
  selectionCard: {
    alignItems: "center",
    borderRadius: 21,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 96,
    padding: 14,
  },
  selectionIcon: {
    alignItems: "center",
    borderRadius: 18,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  selectionTitle: { fontSize: 17, fontWeight: "900" },
  stepCount: {
    fontFamily: "Archivo-Table",
    fontSize: 12,
    fontWeight: "800",
    marginTop: 4,
  },
  successActions: { gap: 10, marginTop: 30, width: "100%" },
  successBody: {
    fontSize: 15,
    lineHeight: 23,
    marginTop: 14,
    maxWidth: 380,
    textAlign: "center",
  },
  successContent: {
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "center",
    paddingBottom: 130,
    paddingHorizontal: 24,
    paddingTop: 40,
  },
  successMark: {
    alignItems: "center",
    borderRadius: 44,
    height: 88,
    justifyContent: "center",
    marginBottom: 22,
    width: 88,
  },
  successMarkText: { fontSize: 38, fontWeight: "900" },
  successTitle: {
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -1.3,
    lineHeight: 37,
    marginTop: 8,
    textAlign: "center",
  },
  teamHeading: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 5,
  },
  teamHeadingMeta: { fontFamily: "Archivo-Table", fontSize: 12 },
  teamHeadingText: { fontSize: 18, fontWeight: "900" },
  teamSizeButton: {
    alignItems: "center",
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 60,
    width: "48%",
  },
  teamSizeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  teamSizeValue: {
    fontFamily: "Archivo-Table",
    fontSize: 18,
    fontWeight: "900",
  },
  textInput: {
    borderRadius: 16,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 56,
    paddingHorizontal: 14,
  },
});
