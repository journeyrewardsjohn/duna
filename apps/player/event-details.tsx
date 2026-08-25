import { formatMoney, type EventKind, type EventSummary } from "@duna/core";
import {
  mobileControl,
  mobileGrid,
  resolveDunaMobileTokens,
} from "@duna/ui/mobile";
import type { ResolvedDunaTokens } from "@duna/ui/tokens";
import * as Crypto from "expo-crypto";
import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createDeferredModalTransition } from "./deferred-modal-transition";
import { DunaIcon, type DunaIconName } from "./duna-icon";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "./satoshi-text";
import type { DunaApiClient } from "./mobile-api";

type Phase = "upcoming" | "live" | "completed" | "cancelled";
type Destination =
  | {
      readonly kind: "registration";
      readonly event: EventSummary;
    }
  | { readonly kind: "booking"; readonly bookingId: string }
  | { readonly kind: "score" }
  | { readonly kind: "video" };

function phaseFor(event: EventSummary): Phase {
  if (event.lifecycleStatus === "cancelled") return "cancelled";
  if (
    event.lifecycleStatus === "completed" ||
    new Date(event.endsAt) <= new Date()
  ) {
    return "completed";
  }
  return event.live || new Date(event.startsAt) <= new Date()
    ? "live"
    : "upcoming";
}

function kindLabel(kind: EventKind) {
  const labels: Record<EventKind, string> = {
    clinic: "Clinic",
    "court-rental": "Court rental",
    league: "League",
    "open-play": "Open play",
    pickup: "Pickup match",
    "private-lesson": "Private lesson",
    tournament: "Tournament",
  };
  return labels[kind];
}

function phaseLabel(phase: Phase) {
  if (phase === "live") return "LIVE NOW";
  if (phase === "completed") return "EVENT ENDED";
  if (phase === "cancelled") return "CANCELLED";
  return "UPCOMING";
}

function eventSchedule(event: EventSummary) {
  const startsAt = new Date(event.startsAt);
  const date = startsAt.toLocaleDateString("en-US", {
    day: "numeric",
    month: "long",
    timeZone: event.timezone,
    weekday: "long",
  });
  const start = startsAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: event.timezone,
  });
  const end = new Date(event.endsAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: event.timezone,
  });
  return { date, time: `${start}–${end}` };
}

function DetailRow({
  icon,
  label,
  secondary,
  styles,
  value,
}: {
  readonly icon: DunaIconName;
  readonly label: string;
  readonly secondary?: string;
  readonly styles: ReturnType<typeof createStyles>;
  readonly value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <DunaIcon color={styles.iconColor.color} name={icon} size={22} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
        {secondary ? (
          <Text style={styles.detailSecondary}>{secondary}</Text>
        ) : null}
      </View>
    </View>
  );
}

export function NativeEventDetails({
  bookingId,
  client,
  event,
  onClose,
  onOpenBooking,
  onRegister,
  onScore,
  onVideo,
  visible,
}: {
  readonly bookingId?: string;
  readonly client?: DunaApiClient;
  readonly event?: EventSummary;
  readonly onClose: () => void;
  readonly onOpenBooking: (bookingId: string) => void;
  readonly onRegister: (event: EventSummary) => void;
  readonly onScore: () => void;
  readonly onVideo: () => void;
  readonly visible: boolean;
}) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const actionHandlersRef = useRef({
    onOpenBooking,
    onRegister,
    onScore,
    onVideo,
  });
  actionHandlersRef.current = {
    onOpenBooking,
    onRegister,
    onScore,
    onVideo,
  };
  const destinationTransitionRef = useRef<
    ReturnType<typeof createDeferredModalTransition<Destination>> | undefined
  >(undefined);
  if (!destinationTransitionRef.current) {
    destinationTransitionRef.current =
      createDeferredModalTransition<Destination>({
        onComplete: (destination) => {
          const handlers = actionHandlersRef.current;
          if (destination.kind === "registration") {
            handlers.onRegister(destination.event);
          }
          if (destination.kind === "booking") {
            handlers.onOpenBooking(destination.bookingId);
          }
          if (destination.kind === "score") handlers.onScore();
          if (destination.kind === "video") handlers.onVideo();
        },
      });
  }
  const destinationTransition = destinationTransitionRef.current;
  const phase = event ? phaseFor(event) : "upcoming";
  const tokens = useMemo(
    () =>
      resolveDunaMobileTokens("light", phase === "live" ? "live" : "athletic"),
    [phase],
  );
  const styles = useMemo(() => createStyles(tokens), [tokens]);

  useEffect(() => {
    setNote("");
    setMessage("");
    setSaving(false);
  }, [event?.id]);

  useEffect(
    () => () => {
      destinationTransition.cancel();
    },
    [destinationTransition],
  );

  if (!event) return null;

  const activityType = event.kind === "pickup" ? "pickup" : "session";
  const schedule = eventSchedule(event);
  const joinedCount = Math.max(0, event.capacity - event.spotsRemaining);
  const locationSecondary = [
    event.location?.address,
    event.location?.courtNames?.join(", "),
  ]
    .filter(Boolean)
    .join(" · ");
  const price =
    event.price.amountMinor === 0
      ? "Free"
      : formatMoney(event.price.amountMinor, event.price.currency);
  const leaveFor = (destination: Destination) => {
    destinationTransition.schedule(destination);
    onClose();
  };
  const saveNote = async () => {
    if (!client || !note.trim() || saving) return;
    setSaving(true);
    setMessage("");
    try {
      await client.player.createEventNote.mutate({
        activityType,
        activityId: event.id,
        body: note.trim(),
        visibility: "private",
        source: "typed",
        idempotencyKey: Crypto.randomUUID(),
      });
      setNote("");
      setMessage("Saved privately to this event.");
    } catch {
      setMessage("We could not save that note yet. Try again when connected.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      onDismiss={destinationTransition.complete}
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityLabel="Back"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.pressed,
              ]}
            >
              <DunaIcon color={tokens.text1} name="arrow-left" size={20} />
              <Text style={styles.backText}>Back</Text>
            </Pressable>
            <View
              style={[styles.status, phase === "live" && styles.statusLive]}
            >
              <Text
                style={[
                  styles.statusText,
                  phase === "live" && styles.statusTextLive,
                ]}
              >
                {phaseLabel(phase)}
              </Text>
            </View>
          </View>

          <Text style={styles.eyebrow}>
            {kindLabel(event.kind).toUpperCase()} ·{" "}
            {event.organizationName.toUpperCase()}
          </Text>
          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.lede}>
            {event.shortSummary ??
              event.description ??
              "Everything you need for this event, in one place."}
          </Text>

          <View style={styles.detailCard}>
            <DetailRow
              icon="calendar"
              label="WHEN"
              secondary={schedule.time}
              styles={styles}
              value={schedule.date}
            />
            <View style={styles.divider} />
            <DetailRow
              icon="court"
              label="WHERE"
              secondary={locationSecondary || undefined}
              styles={styles}
              value={event.location?.venueName ?? event.venueName}
            />
            <View style={styles.divider} />
            <DetailRow
              icon="user"
              label="PLAYERS"
              secondary={`${event.spotsRemaining} ${event.spotsRemaining === 1 ? "spot" : "spots"} remaining`}
              styles={styles}
              value={`${joinedCount} of ${event.capacity} joined`}
            />
            <View style={styles.divider} />
            <DetailRow
              icon="wallet"
              label="ENTRY"
              styles={styles}
              value={price}
            />
          </View>

          {event.tags.length > 0 ? (
            <View style={styles.tagRow}>
              {event.tags.slice(0, 4).map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {phase === "live" ? (
            <View style={styles.primaryRow}>
              <PrimaryAction
                icon="score"
                label="Keep score"
                onPress={() => leaveFor({ kind: "score" })}
                styles={styles}
              />
              <SecondaryAction
                icon="video"
                label="Record video"
                onPress={() => leaveFor({ kind: "video" })}
                styles={styles}
              />
            </View>
          ) : null}

          {phase === "upcoming" ? (
            <PrimaryAction
              icon="arrow-right"
              label={
                bookingId
                  ? "Open your booking"
                  : event.spotsRemaining > 0
                    ? "View registration"
                    : "View event options"
              }
              onPress={() =>
                bookingId
                  ? leaveFor({ kind: "booking", bookingId })
                  : leaveFor({
                      kind: "registration",
                      event,
                    })
              }
              styles={styles}
            />
          ) : null}

          {phase === "cancelled" ? (
            <View style={styles.noticeCard}>
              <Text style={styles.cardTitle}>This event was cancelled.</Text>
              <Text style={styles.cardBody}>
                Registration and live actions are no longer available.
              </Text>
            </View>
          ) : null}

          {phase === "completed" ? (
            <View style={styles.noteCard}>
              <View style={styles.noteHeading}>
                <View style={styles.detailIcon}>
                  <DunaIcon
                    color={styles.iconColor.color}
                    name="sparkles"
                    size={22}
                  />
                </View>
                <View style={styles.flex}>
                  <Text style={styles.cardTitle}>Your event reflection</Text>
                  <Text style={styles.cardBody}>
                    Private by default. Capture what worked and what to carry
                    into your next match.
                  </Text>
                </View>
              </View>
              <TextInput
                accessibilityLabel="Private event reflection"
                multiline
                onChangeText={setNote}
                placeholder="Write a private match note…"
                placeholderTextColor={tokens.text3}
                style={styles.input}
                value={note}
              />
              <SecondaryAction
                disabled={!client || !note.trim() || saving}
                icon="lock"
                label={saving ? "Saving…" : "Save private note"}
                onPress={() => void saveNote()}
                styles={styles}
              />
              {message ? <Text style={styles.message}>{message}</Text> : null}
            </View>
          ) : null}

          {event.kind === "tournament" || event.kind === "league" ? (
            <View style={styles.noticeCard}>
              <Text style={styles.cardTitle}>Scores are verified together</Text>
              <Text style={styles.cardBody}>
                One player on each side confirms a reported match. Clubs can
                review disputed league and tournament scores.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function PrimaryAction({
  icon,
  label,
  onPress,
  styles,
}: {
  readonly icon: DunaIconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.primary, pressed && styles.pressed]}
    >
      <Text style={styles.primaryText}>{label}</Text>
      <DunaIcon color={styles.primaryIconColor.color} name={icon} size={22} />
    </Pressable>
  );
}

function SecondaryAction({
  disabled = false,
  icon,
  label,
  onPress,
  styles,
}: {
  readonly disabled?: boolean;
  readonly icon: DunaIconName;
  readonly label: string;
  readonly onPress: () => void;
  readonly styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondary,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <DunaIcon color={styles.iconColor.color} name={icon} size={20} />
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

function createStyles(token: ResolvedDunaTokens) {
  return StyleSheet.create({
    safe: { backgroundColor: token.ground, flex: 1 },
    content: {
      gap: mobileGrid[4],
      padding: mobileControl.pageInset,
      paddingBottom: mobileGrid[10],
    },
    flex: { flex: 1, minWidth: 0 },
    header: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    backButton: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileGrid[1],
      minHeight: mobileControl.minimumTarget,
      paddingRight: mobileGrid[3],
    },
    backText: { color: token.text1, fontSize: 16, fontWeight: "700" },
    status: {
      backgroundColor: token.surface2,
      borderRadius: mobileControl.pillRadius,
      paddingHorizontal: mobileGrid[3],
      paddingVertical: mobileGrid[2],
    },
    statusLive: {
      backgroundColor: token.flareFill,
      borderColor: token.flareBorder,
      borderWidth: mobileGrid.hairline,
    },
    statusText: {
      color: token.text2,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1,
    },
    statusTextLive: { color: token.flareText },
    eyebrow: {
      color: token.text3,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.2,
      marginTop: mobileGrid[1],
    },
    title: {
      color: token.text1,
      fontSize: 38,
      fontWeight: "700",
      letterSpacing: -0.45,
      lineHeight: 42,
    },
    lede: { color: token.text2, fontSize: 16, lineHeight: 24 },
    detailCard: {
      backgroundColor: token.surface1,
      borderColor: token.hairlineStrong,
      borderRadius: mobileControl.cardRadius,
      borderWidth: mobileGrid.hairline,
      padding: mobileGrid[4],
    },
    detailRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: mobileGrid[3],
      minHeight: mobileGrid[12],
    },
    detailIcon: {
      alignItems: "center",
      backgroundColor: token.surface2,
      borderRadius: mobileGrid[4],
      height: mobileGrid[8],
      justifyContent: "center",
      width: mobileGrid[8],
    },
    iconColor: { color: token.text2 },
    primaryIconColor: { color: token.buttonPrimaryForeground },
    detailLabel: {
      color: token.text3,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1,
    },
    detailValue: {
      color: token.text1,
      fontSize: 16,
      fontWeight: "700",
      lineHeight: 22,
    },
    detailSecondary: { color: token.text2, fontSize: 14, lineHeight: 20 },
    divider: {
      backgroundColor: token.hairline,
      height: mobileGrid.hairline,
      marginVertical: mobileGrid[2],
    },
    tagRow: { flexDirection: "row", flexWrap: "wrap", gap: mobileGrid[2] },
    tag: {
      backgroundColor: token.surface2,
      borderRadius: mobileControl.pillRadius,
      paddingHorizontal: mobileGrid[3],
      paddingVertical: mobileGrid[2],
    },
    tagText: { color: token.text2, fontSize: 12, fontWeight: "500" },
    primaryRow: { flexDirection: "row", gap: mobileGrid[2] },
    primary: {
      alignItems: "center",
      backgroundColor: token.buttonPrimaryBackground,
      borderRadius: mobileControl.nestedRadius,
      flex: 1,
      flexDirection: "row",
      gap: mobileGrid[2],
      justifyContent: "space-between",
      minHeight: mobileControl.primaryTarget,
      paddingHorizontal: mobileGrid[4],
    },
    primaryText: {
      color: token.buttonPrimaryForeground,
      fontSize: 16,
      fontWeight: "700",
    },
    secondary: {
      alignItems: "center",
      borderColor: token.buttonGhostBorder,
      borderRadius: mobileControl.nestedRadius,
      borderWidth: mobileGrid.hairline,
      flex: 1,
      flexDirection: "row",
      gap: mobileGrid[2],
      justifyContent: "center",
      minHeight: mobileControl.primaryTarget,
      paddingHorizontal: mobileGrid[3],
    },
    secondaryText: { color: token.text1, fontSize: 15, fontWeight: "700" },
    disabled: { opacity: 0.42 },
    pressed: { opacity: 0.72 },
    noticeCard: {
      backgroundColor: token.surface2,
      borderRadius: mobileControl.cardRadius,
      gap: mobileGrid[2],
      padding: mobileGrid[4],
    },
    noteCard: {
      backgroundColor: token.surface1,
      borderColor: token.hairlineStrong,
      borderRadius: mobileControl.cardRadius,
      borderWidth: mobileGrid.hairline,
      gap: mobileGrid[3],
      padding: mobileGrid[4],
    },
    noteHeading: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: mobileGrid[3],
    },
    cardTitle: { color: token.text1, fontSize: 18, fontWeight: "700" },
    cardBody: { color: token.text2, fontSize: 15, lineHeight: 22 },
    input: {
      backgroundColor: token.surface2,
      borderColor: token.hairline,
      borderRadius: mobileControl.nestedRadius,
      borderWidth: mobileGrid.hairline,
      color: token.text1,
      fontSize: 16,
      minHeight: 110,
      padding: mobileGrid[3],
      textAlignVertical: "top",
    },
    message: { color: token.gain, fontSize: 14, fontWeight: "500" },
  });
}
