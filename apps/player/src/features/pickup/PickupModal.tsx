import { formatMoney, type PersonSummary } from "@duna/core";
import { demoPlayer } from "@duna/core/demo";
import * as Crypto from "expo-crypto";
import { DateTimePicker } from "@expo/ui/community/datetime-picker";
import { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { dunaWebUrl, type DunaApiClient } from "../../../mobile-api";
import { usePlayerRuntime } from "../../../runtime";
import { MatchHostView } from "../../../match-host-panel";
import {
  BookingConfirmationView,
  type BookingReceiptRow,
  type ShareableBookingDetails,
} from "../../../booking-share";
import { DunaIcon } from "../../../duna-icon";
import { PlayerPickerModal } from "../../../player-social";
import {
  MobilePlacePicker,
  type MobilePlaceSelection,
} from "../../../components/mobile-place-picker";
import { PlayerAvatar } from "../../../components/player-identity";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "../../../satoshi-text";
import { colors, rgba } from "../../shared/palette";
import type { CourtBookingRequest } from "../courts/court-types";
import { displayError } from "../../shared/display-error";
import { styles } from "../../legacy/styles";

type HostedMatchSeed = {
  readonly courtBookingId: string;
  readonly venueId: string;
  readonly venueName: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly localStartsAt: string;
  readonly localEndsAt: string;
  readonly durationMinutes: number;
  readonly invitedPlayers?: readonly PersonSummary[];
  readonly courtPaymentMode?: "full" | "split";
  readonly courtPaidMinor?: number;
  readonly courtCurrency?: string;
};

function defaultPickupStart(): string {
  const date = new Date(Date.now() + 2 * 60 * 60 * 1_000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

type LookingToPlayCandidate = Awaited<
  ReturnType<DunaApiClient["player"]["matchAvailabilityCandidates"]["query"]>
>[number];

type PickupGuest = {
  readonly id: string;
  readonly givenName: string;
  readonly familyName: string;
};

export function PickupModal({
  visible,
  onClose,
  onCreated,
  initialCourtBooking,
  onReserveCourtVenue,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onCreated?: (title: string) => void;
  readonly initialCourtBooking?: HostedMatchSeed;
  readonly onReserveCourtVenue?: (request: CourtBookingRequest) => void;
}) {
  const { client, dashboard, mode, refresh, venues } = usePlayerRuntime();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [venueName, setVenueName] = useState("");
  const [venueId, setVenueId] = useState<string>();
  const [placeSelection, setPlaceSelection] = useState<MobilePlaceSelection>();
  const [courtBookingId, setCourtBookingId] = useState<string>();
  const [startsAt, setStartsAt] = useState(defaultPickupStart);
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [capacity, setCapacity] = useState(4);
  const [format, setFormat] = useState<
    "2s" | "3s" | "4s" | "6s" | "king-queen"
  >("2s");
  const [matchType, setMatchType] = useState<"competitive" | "casual">(
    "competitive",
  );
  const [genderPreference, setGenderPreference] = useState<
    "open" | "mens" | "womens" | "mixed"
  >("open");
  const [ratingEnabled, setRatingEnabled] = useState(true);
  const [ratingMinimum, setRatingMinimum] = useState("1.00");
  const [ratingMaximum, setRatingMaximum] = useState("8.00");
  const [note, setNote] = useState("");
  const [recordMatches, setRecordMatches] = useState(true);
  const [visibility, setVisibility] = useState<"public" | "unlisted">("public");
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<
    readonly PersonSummary[]
  >([]);
  const [guestPlayers, setGuestPlayers] = useState<readonly PickupGuest[]>([]);
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [showGuestEditor, setShowGuestEditor] = useState(false);
  const [guestGivenName, setGuestGivenName] = useState("");
  const [guestFamilyName, setGuestFamilyName] = useState("");
  const [published, setPublished] = useState<{
    readonly pickupSessionId: string;
    readonly title: string;
    readonly details: ShareableBookingDetails;
    readonly receipt: readonly BookingReceiptRow[];
  }>();
  const [hostSheetOpen, setHostSheetOpen] = useState(false);
  const [lookingCandidates, setLookingCandidates] = useState<
    readonly LookingToPlayCandidate[]
  >([]);
  const [lookingCandidatesLoading, setLookingCandidatesLoading] =
    useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const linkedCourtLocked = Boolean(initialCourtBooking && courtBookingId);
  const courtReservations = (dashboard?.bookings ?? []).filter(
    (booking) =>
      booking.kind === "court-rental" && new Date(booking.endsAt) > new Date(),
  );
  const host = dashboard?.player ?? demoPlayer;
  const start = new Date(startsAt);
  const dayChoices = Array.from({ length: 7 }, (_, index) => {
    const day = new Date();
    day.setHours(start.getHours(), start.getMinutes(), 0, 0);
    day.setDate(day.getDate() + index);
    return day;
  });
  const timeChoices = [
    { label: "9:00 AM", hour: 9 },
    { label: "12:00 PM", hour: 12 },
    { label: "5:00 PM", hour: 17 },
    { label: "7:00 PM", hour: 19 },
  ] as const;
  const steps = ["Match", "When + where", "Players", "Access", "Review"];

  function localInputValue(date: Date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }

  useEffect(() => {
    if (!visible || !initialCourtBooking) return;
    setStep(0);
    setVenueName(initialCourtBooking.venueName);
    setVenueId(initialCourtBooking.venueId);
    setCourtBookingId(initialCourtBooking.courtBookingId);
    setStartsAt(initialCourtBooking.localStartsAt.slice(0, 16));
    setDurationMinutes(initialCourtBooking.durationMinutes);
    setSelectedPlayers(initialCourtBooking.invitedPlayers ?? []);
    setCapacity((current) =>
      Math.max(current, (initialCourtBooking.invitedPlayers?.length ?? 0) + 1),
    );
    setError(undefined);
  }, [initialCourtBooking, visible]);

  useEffect(() => {
    if (!visible || step !== 2 || !client || mode === "preview") {
      setLookingCandidates([]);
      return;
    }
    const windowStart = new Date(startsAt);
    if (!Number.isFinite(windowStart.getTime()) || windowStart <= new Date()) {
      setLookingCandidates([]);
      return;
    }
    let cancelled = false;
    setLookingCandidatesLoading(true);
    void client.player.matchAvailabilityCandidates
      .query({
        venueId,
        startsAt: windowStart.toISOString(),
        endsAt: new Date(
          windowStart.getTime() + durationMinutes * 60_000,
        ).toISOString(),
        matchType,
        genderPreference,
        format,
      })
      .then((candidates) => {
        if (!cancelled) setLookingCandidates(candidates);
      })
      .catch(() => {
        if (!cancelled) setLookingCandidates([]);
      })
      .finally(() => {
        if (!cancelled) setLookingCandidatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    client,
    durationMinutes,
    format,
    genderPreference,
    matchType,
    mode,
    startsAt,
    step,
    venueId,
    visible,
  ]);

  function chooseDay(day: Date) {
    const next = new Date(start);
    next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    setStartsAt(localInputValue(next));
    setCourtBookingId(undefined);
  }

  function chooseTime(hour: number) {
    const next = new Date(start);
    next.setHours(hour, 0, 0, 0);
    setStartsAt(localInputValue(next));
    setCourtBookingId(undefined);
  }

  function chooseDate(date: Date) {
    const next = new Date(start);
    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    setStartsAt(localInputValue(next));
    setCourtBookingId(undefined);
  }

  function chooseStartTime(date: Date) {
    const next = new Date(start);
    next.setHours(date.getHours(), date.getMinutes(), 0, 0);
    setStartsAt(localInputValue(next));
    setCourtBookingId(undefined);
  }

  function choosePlace(value: MobilePlaceSelection | undefined) {
    setPlaceSelection(value);
    setVenueName(value?.name ?? "");
    setVenueId(value?.venueId);
    setCourtBookingId(undefined);
    if (value?.venueId && onReserveCourtVenue) {
      close();
      onReserveCourtVenue({
        venueId: value.venueId,
        date: startsAt.slice(0, 10),
        durationMinutes,
        intent: "host",
      });
    }
  }

  function close() {
    setError(undefined);
    setShowPlayerPicker(false);
    setShowGuestEditor(false);
    setGuestGivenName("");
    setGuestFamilyName("");
    setPlaceSelection(undefined);
    setHostSheetOpen(false);
    if (published) {
      setPublished(undefined);
      setTitle("");
      setVenueName("");
      setNote("");
      setStep(0);
      setSelectedPlayers([]);
      setGuestPlayers([]);
      setCourtBookingId(undefined);
      setVenueId(undefined);
    }
    onClose();
  }

  function nextStep() {
    setError(undefined);
    if (step === 0 && title.trim().length < 3) {
      setError("Give the match a short, recognizable name.");
      return;
    }
    if (
      step === 1 &&
      (venueName.trim().length < 2 || !Number.isFinite(start.getTime()))
    ) {
      setError("Choose a valid place, day, and time.");
      return;
    }
    if (step === 1 && venueId && !courtBookingId) {
      setError(
        "This is a Duna venue. Reserve a court first so every player sees a confirmed time and court.",
      );
      return;
    }
    if (step === 1 && start.getTime() <= Date.now()) {
      setError("Choose a future start time.");
      return;
    }
    if (
      step === 2 &&
      selectedPlayers.length + guestPlayers.length + 1 > capacity
    ) {
      setError("Remove a player or increase the match capacity.");
      return;
    }
    setStep((current) => Math.min(4, current + 1));
  }

  async function publish() {
    if (!client || mode === "preview") return;
    const ratingMin = Number(ratingMinimum);
    const ratingMax = Number(ratingMaximum);
    if (!Number.isFinite(start.getTime())) {
      setError("Enter the start as YYYY-MM-DDTHH:MM.");
      return;
    }
    if (
      ratingEnabled &&
      matchType === "competitive" &&
      (!Number.isFinite(ratingMin) ||
        !Number.isFinite(ratingMax) ||
        ratingMin < 1 ||
        ratingMax > 8 ||
        ratingMax < ratingMin)
    ) {
      setError("Choose a Sand Rating range from 1.00 to 8.00.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const event = await client.player.createPickup.mutate({
        title: title.trim(),
        startsAt: start.toISOString(),
        endsAt: new Date(
          start.getTime() + durationMinutes * 60 * 1_000,
        ).toISOString(),
        venueName: venueName.trim(),
        venueId,
        courtBookingId,
        capacity,
        format,
        matchType,
        genderPreference,
        note: note.trim() || undefined,
        visibility,
        approvalRequired,
        costMinor: 0,
        currency: "USD",
        recordMatches,
        participantPersonIds: selectedPlayers.map((player) => player.id),
        provisionalParticipants: guestPlayers.map((guest) => ({
          givenName: guest.givenName,
          familyName: guest.familyName,
        })),
        ratingMinimum:
          ratingEnabled && matchType === "competitive" ? ratingMin : undefined,
        ratingMaximum:
          ratingEnabled && matchType === "competitive" ? ratingMax : undefined,
        idempotencyKey: Crypto.randomUUID(),
      });
      await refresh();
      onCreated?.(event.title);
      /**
       * The flow used to reset to step one here, which read as if the match had
       * not been created. It now ends on a receipt the host can act from.
       */
      setPublished({
        pickupSessionId: event.id,
        title: event.title,
        details: {
          title: event.title,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          timezone: event.timezone,
          organizationName: event.organizationName,
          locationName: event.venueName,
          ...(placeSelection?.address
            ? { address: placeSelection.address }
            : {}),
          playerNames: [
            host.displayName,
            ...selectedPlayers.map((player) => player.displayName),
            ...guestPlayers.map(
              (guest) => `${guest.givenName} ${guest.familyName}`,
            ),
          ],
          detailsUrl: `${dunaWebUrl}/events/${event.slug}`,
        },
        receipt: [
          {
            label: "FORMAT",
            value: `${format === "king-queen" ? "King / Queen" : format.toUpperCase()} · ${matchType === "competitive" ? "Competitive" : "Casual"}`,
          },
          { label: "SPOTS", value: `${capacity} total` },
          { label: "MATCH FEE", value: "Free in Duna" },
          ...(initialCourtBooking?.courtPaidMinor
            ? [
                {
                  label:
                    initialCourtBooking.courtPaymentMode === "split"
                      ? "COURT · YOU PAID"
                      : "COURT PAID",
                  value: formatMoney(
                    initialCourtBooking.courtPaidMinor,
                    initialCourtBooking.courtCurrency ?? "USD",
                  ),
                },
              ]
            : []),
        ],
      });
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Modal
        animationType="slide"
        onRequestClose={close}
        presentationStyle="pageSheet"
        visible={visible}
      >
        {published ? (
          hostSheetOpen ? (
            <MatchHostView
              client={client}
              matchTitle={published.title}
              onClose={() => setHostSheetOpen(false)}
              onRosterChanged={() => void refresh()}
              palette={colors}
              pickupSessionId={published.pickupSessionId}
            />
          ) : (
            <BookingConfirmationView
              body="Your match is live in Duna. Invite players and review anyone who asks to join."
              details={published.details}
              doneLabel="Done"
              label="Match booked"
              onDone={close}
              primaryAction={() => setHostSheetOpen(true)}
              primaryLabel="Invite players & requests"
              receipt={published.receipt}
              title={`${published.title} is on.`}
            />
          )
        ) : showPlayerPicker ? (
          <PlayerPickerModal
            embedded
            excludedPersonIds={[host.id]}
            maxSelected={Math.max(1, capacity - guestPlayers.length - 1)}
            onAddProvisional={() => {
              setShowPlayerPicker(false);
              setShowGuestEditor(true);
            }}
            onChange={setSelectedPlayers}
            onClose={() => setShowPlayerPicker(false)}
            palette={colors}
            selected={selectedPlayers}
            title="Add players"
            visible
          />
        ) : showGuestEditor ? (
          <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
            <View style={styles.hostFlowHeader}>
              <Pressable
                accessibilityLabel="Back to match players"
                onPress={() => setShowGuestEditor(false)}
                style={styles.hostFlowClose}
              >
                <DunaIcon color={colors.bone} name="arrow-left" size={22} />
              </Pressable>
              <View style={styles.flex}>
                <Text style={styles.hostFlowEyebrow}>GUEST PLAYER</Text>
                <Text style={styles.hostFlowHeaderTitle}>Add by name</Text>
              </View>
            </View>
            <ScrollView contentContainerStyle={styles.hostFlowContent}>
              <Text style={styles.hostFlowTitle}>Who is playing?</Text>
              <Text style={styles.hostFlowBody}>
                No email or phone is required. Their place remains private and
                can be claimed when the match result is reported.
              </Text>
              <TextInput
                autoCapitalize="words"
                onChangeText={setGuestGivenName}
                placeholder="First name"
                placeholderTextColor={colors.muted}
                style={styles.hostFlowInput}
                value={guestGivenName}
              />
              <TextInput
                autoCapitalize="words"
                onChangeText={setGuestFamilyName}
                placeholder="Last name"
                placeholderTextColor={colors.muted}
                style={styles.hostFlowInput}
                value={guestFamilyName}
              />
              {!!error && <Text style={styles.formError}>{error}</Text>}
            </ScrollView>
            <View style={styles.hostFlowFooter}>
              <Pressable
                onPress={() => {
                  const givenName = guestGivenName.trim();
                  const familyName = guestFamilyName.trim();
                  if (!givenName || !familyName) {
                    setError("Add the guest's first and last name.");
                    return;
                  }
                  if (
                    selectedPlayers.length + guestPlayers.length + 1 >=
                    capacity
                  ) {
                    setError("This match roster is full.");
                    return;
                  }
                  setGuestPlayers((current) => [
                    ...current,
                    { id: Crypto.randomUUID(), givenName, familyName },
                  ]);
                  setGuestGivenName("");
                  setGuestFamilyName("");
                  setError(undefined);
                  setShowGuestEditor(false);
                }}
                style={styles.hostFlowContinue}
              >
                <Text style={styles.hostFlowContinueText}>
                  Add guest player
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        ) : (
          <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
            <View style={styles.hostFlowHeader}>
              <Pressable
                accessibilityLabel="Close create match"
                onPress={close}
                style={styles.hostFlowClose}
              >
                <Text style={styles.closeText}>×</Text>
              </Pressable>
              <View style={styles.flex}>
                <Text style={styles.hostFlowEyebrow}>
                  STEP {step + 1} OF {steps.length}
                </Text>
                <Text style={styles.hostFlowHeaderTitle}>{steps[step]}</Text>
              </View>
              <Text style={styles.hostFlowProgressValue}>
                {Math.round(((step + 1) / steps.length) * 100)}%
              </Text>
            </View>
            <View style={styles.hostFlowProgressTrack}>
              <View
                style={[
                  styles.hostFlowProgressFill,
                  { width: `${((step + 1) / steps.length) * 100}%` },
                ]}
              />
            </View>
            <ScrollView
              contentContainerStyle={styles.hostFlowContent}
              showsVerticalScrollIndicator={false}
            >
              {step === 0 && (
                <>
                  <Text style={styles.hostFlowTitle}>
                    What are you hosting?
                  </Text>
                  <Text style={styles.hostFlowBody}>
                    Start with the game. You can add the place, players, and
                    access rules next.
                  </Text>
                  <TextInput
                    autoFocus
                    onChangeText={setTitle}
                    placeholder="e.g. Saturday doubles at Hermosa"
                    placeholderTextColor={colors.muted}
                    style={styles.hostFlowInput}
                    value={title}
                  />
                  <Text style={styles.hostFlowLabel}>MATCH FEEL</Text>
                  <View style={styles.hostFlowChoiceGrid}>
                    {(["competitive", "casual"] as const).map((option) => (
                      <Pressable
                        key={option}
                        onPress={() => {
                          setMatchType(option);
                          setRatingEnabled(option === "competitive");
                        }}
                        style={[
                          styles.hostFlowChoice,
                          matchType === option && styles.hostFlowChoiceActive,
                        ]}
                      >
                        <Text style={styles.hostFlowChoiceTitle}>
                          {option === "competitive" ? "Competitive" : "Casual"}
                        </Text>
                        <Text style={styles.hostFlowChoiceBody}>
                          {option === "competitive"
                            ? "Verified results can affect Sand Rating."
                            : "Social play without rating impact."}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.hostFlowLabel}>FORMAT</Text>
                  <View style={styles.hostFlowChipWrap}>
                    {(["2s", "3s", "4s", "6s", "king-queen"] as const).map(
                      (option) => (
                        <Pressable
                          key={option}
                          onPress={() => {
                            setFormat(option);
                            const nextCapacity =
                              option === "2s"
                                ? 4
                                : option === "3s"
                                  ? 6
                                  : option === "4s"
                                    ? 8
                                    : option === "6s"
                                      ? 12
                                      : 8;
                            setCapacity(nextCapacity);
                            setSelectedPlayers((current) =>
                              current.slice(0, nextCapacity - 1),
                            );
                            setGuestPlayers((current) =>
                              current.slice(
                                0,
                                Math.max(
                                  0,
                                  nextCapacity -
                                    1 -
                                    Math.min(
                                      selectedPlayers.length,
                                      nextCapacity - 1,
                                    ),
                                ),
                              ),
                            );
                          }}
                          style={[
                            styles.hostFlowChip,
                            format === option && styles.hostFlowChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.hostFlowChipText,
                              format === option &&
                                styles.hostFlowChipTextActive,
                            ]}
                          >
                            {option === "king-queen"
                              ? "King / Queen"
                              : option.toUpperCase()}
                          </Text>
                        </Pressable>
                      ),
                    )}
                  </View>
                </>
              )}

              {step === 1 && (
                <>
                  <Text style={styles.hostFlowTitle}>When and where?</Text>
                  <Text style={styles.hostFlowBody}>
                    Choose a court you already booked or set a clear place and
                    start time.
                  </Text>
                  {linkedCourtLocked && (
                    <View style={styles.hostFlowLinkedCourt}>
                      <Text style={styles.hostFlowLinkedCourtMark}>✓</Text>
                      <View style={styles.flex}>
                        <Text style={styles.hostFlowCourtTitle}>
                          Court reserved
                        </Text>
                        <Text style={styles.hostFlowCourtMeta}>
                          {venueName} ·{" "}
                          {start.toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "short",
                            day: "numeric",
                          })}{" "}
                          at{" "}
                          {start.toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </Text>
                        <Text style={styles.hostFlowCourtMeta}>
                          This match stays attached to the court you just
                          confirmed.
                        </Text>
                      </View>
                    </View>
                  )}
                  {courtReservations.length > 0 && (
                    <>
                      <Text style={styles.hostFlowLabel}>YOUR COURTS</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.hostFlowHorizontal}
                      >
                        {courtReservations.map((booking) => (
                          <Pressable
                            disabled={linkedCourtLocked}
                            key={booking.id}
                            onPress={() => {
                              const bookingStart = new Date(booking.startsAt);
                              const bookingEnd = new Date(booking.endsAt);
                              setCourtBookingId(booking.id);
                              setVenueName(booking.venueName);
                              setStartsAt(localInputValue(bookingStart));
                              setDurationMinutes(
                                Math.round(
                                  (bookingEnd.getTime() -
                                    bookingStart.getTime()) /
                                    60_000,
                                ),
                              );
                            }}
                            style={[
                              styles.hostFlowCourt,
                              courtBookingId === booking.id &&
                                styles.hostFlowCourtActive,
                            ]}
                          >
                            <Text style={styles.hostFlowCourtTitle}>
                              {booking.venueName}
                            </Text>
                            <Text style={styles.hostFlowCourtMeta}>
                              {new Date(booking.startsAt).toLocaleString(
                                "en-US",
                                {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                },
                              )}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    </>
                  )}
                  <Text style={styles.hostFlowLabel}>PLACE</Text>
                  {linkedCourtLocked ? (
                    <View style={styles.hostFlowLockedPlace}>
                      <Text style={styles.hostFlowLockedPlaceMark}>✓</Text>
                      <View style={styles.flex}>
                        <Text style={styles.hostFlowLockedPlaceTitle}>
                          {venueName}
                        </Text>
                        <Text style={styles.hostFlowLockedPlaceBody}>
                          Confirmed court reservation · time stays locked
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <>
                      <MobilePlacePicker
                        baseUrl={dunaWebUrl}
                        description="Search Duna venues first, or choose any beach, club, or address with Google Places."
                        dunaVenues={venues}
                        label="Venue, beach, or court"
                        lockedLabel="LOCATION LOCKED · GOOGLE"
                        onChange={choosePlace}
                        palette={colors}
                        selectedPresentation="map"
                        value={placeSelection}
                      />
                      {placeSelection && !placeSelection.venueId && (
                        <View style={styles.hostFlowLocationNotice}>
                          <Text style={styles.hostFlowLocationNoticeMark}>
                            ✓
                          </Text>
                          <View style={styles.flex}>
                            <Text style={styles.hostFlowLocationNoticeTitle}>
                              CONFIRMED WITH GOOGLE
                            </Text>
                            <Text style={styles.hostFlowLocationNoticeBody}>
                              This is not a Duna venue. Duna does not reserve or
                              guarantee court availability at this location.
                            </Text>
                          </View>
                        </View>
                      )}
                    </>
                  )}
                  <Text style={styles.hostFlowLabel}>DAY</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.hostFlowHorizontal}
                  >
                    {dayChoices.map((day) => {
                      const selected =
                        day.toDateString() === start.toDateString();
                      return (
                        <Pressable
                          disabled={linkedCourtLocked}
                          key={day.toISOString()}
                          onPress={() => chooseDay(day)}
                          style={[
                            styles.hostFlowDay,
                            selected && styles.hostFlowDayActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.hostFlowDayName,
                              selected && styles.hostFlowDayTextActive,
                            ]}
                          >
                            {day
                              .toLocaleDateString("en-US", {
                                weekday: "short",
                              })
                              .toUpperCase()}
                          </Text>
                          <Text
                            style={[
                              styles.hostFlowDayNumber,
                              selected && styles.hostFlowDayTextActive,
                            ]}
                          >
                            {day.getDate()}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <Text style={styles.hostFlowLabel}>START</Text>
                  <View style={styles.hostFlowChipWrap}>
                    {timeChoices.map((time) => (
                      <Pressable
                        disabled={linkedCourtLocked}
                        key={time.hour}
                        onPress={() => chooseTime(time.hour)}
                        style={[
                          styles.hostFlowChip,
                          start.getHours() === time.hour &&
                            start.getMinutes() === 0 &&
                            styles.hostFlowChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.hostFlowChipText,
                            start.getHours() === time.hour &&
                              start.getMinutes() === 0 &&
                              styles.hostFlowChipTextActive,
                          ]}
                        >
                          {time.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {!linkedCourtLocked && !venueId && (
                    <View style={styles.hostFlowDatePickerCard}>
                      <Text style={styles.hostFlowDatePickerLabel}>
                        ANY DATE + START TIME
                      </Text>
                      <Text style={styles.hostFlowDatePickerBody}>
                        This is a non-Duna location, so you can choose any
                        future date, time, and duration. Joining this match is
                        free in Duna.
                      </Text>
                      <DateTimePicker
                        accentColor={colors.aqua}
                        display={Platform.OS === "ios" ? "inline" : "default"}
                        minimumDate={new Date()}
                        mode="date"
                        onValueChange={(_event, date) => chooseDate(date)}
                        presentation="inline"
                        themeVariant="light"
                        value={start}
                      />
                      <DateTimePicker
                        accentColor={colors.aqua}
                        display={Platform.OS === "ios" ? "spinner" : "default"}
                        mode="time"
                        onValueChange={(_event, date) => chooseStartTime(date)}
                        presentation="inline"
                        themeVariant="light"
                        value={start}
                      />
                    </View>
                  )}
                  <Text style={styles.hostFlowLabel}>DURATION</Text>
                  <View style={styles.hostFlowChipWrap}>
                    {[60, 90, 120].map((minutes) => (
                      <Pressable
                        disabled={linkedCourtLocked}
                        key={minutes}
                        onPress={() => setDurationMinutes(minutes)}
                        style={[
                          styles.hostFlowChip,
                          durationMinutes === minutes &&
                            styles.hostFlowChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.hostFlowChipText,
                            durationMinutes === minutes &&
                              styles.hostFlowChipTextActive,
                          ]}
                        >
                          {minutes} min
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              {step === 2 && (
                <>
                  <Text style={styles.hostFlowTitle}>Who is playing?</Text>
                  <Text style={styles.hostFlowBody}>
                    You are already in. Add Duna players, name a guest without
                    an email or phone, or leave places open for discovery.
                  </Text>
                  <View style={styles.hostFlowRosterSummary}>
                    <View>
                      <Text style={styles.hostFlowRosterCount}>
                        {selectedPlayers.length + guestPlayers.length + 1} /{" "}
                        {capacity}
                      </Text>
                      <Text style={styles.hostFlowRosterMeta}>
                        {capacity -
                          selectedPlayers.length -
                          guestPlayers.length -
                          1}{" "}
                        places available
                      </Text>
                    </View>
                    <Pressable
                      accessibilityLabel="Add players"
                      accessibilityRole="button"
                      disabled={
                        selectedPlayers.length + guestPlayers.length >=
                        capacity - 1
                      }
                      onPress={() => setShowPlayerPicker(true)}
                      style={styles.hostFlowAddPlayers}
                    >
                      <Text style={styles.hostFlowAddPlayersText}>
                        ＋ Add players
                      </Text>
                    </Pressable>
                  </View>
                  <Pressable
                    accessibilityLabel="Add a guest by name"
                    accessibilityRole="button"
                    disabled={
                      selectedPlayers.length + guestPlayers.length >=
                      capacity - 1
                    }
                    onPress={() => setShowGuestEditor(true)}
                    style={styles.hostFlowAddPlayers}
                  >
                    <Text style={styles.hostFlowAddPlayersText}>
                      ＋ Add guest without contact details
                    </Text>
                  </Pressable>
                  <View style={styles.hostFlowLookingSection}>
                    <View style={styles.hostFlowLookingHeader}>
                      <View style={styles.flex}>
                        <Text style={styles.hostFlowLabelInline}>
                          LOOKING TO PLAY
                        </Text>
                        <Text style={styles.hostFlowLookingTitle}>
                          Players available for this match
                        </Text>
                      </View>
                      <Text style={styles.hostFlowLookingCount}>
                        {lookingCandidatesLoading
                          ? "…"
                          : lookingCandidates.length}
                      </Text>
                    </View>
                    <Text style={styles.hostFlowLookingBody}>
                      These players explicitly opted in for an overlapping time
                      and match. Adding one sends an invitation—they still have
                      to accept or decline.
                    </Text>
                    {lookingCandidates.map((candidate) => {
                      const selected = selectedPlayers.some(
                        (player) => player.id === candidate.person.id,
                      );
                      const full =
                        selectedPlayers.length + guestPlayers.length >=
                        capacity - 1;
                      return (
                        <View
                          key={candidate.postId}
                          style={styles.hostFlowLookingPlayer}
                        >
                          <PlayerAvatar
                            badge={selected ? "selected" : "add"}
                            palette={colors}
                            person={candidate.person}
                            selected={selected}
                            size={52}
                          />
                          <View style={styles.flex}>
                            <Text style={styles.hostFlowPlayerName}>
                              {candidate.person.displayName}
                            </Text>
                            <Text style={styles.hostFlowPlayerMeta}>
                              {candidate.person.rating.display.toFixed(2)} Sand
                              {candidate.reliability.score !== undefined
                                ? ` · ${candidate.reliability.score}% reliability`
                                : ` · ${candidate.reliability.label.replaceAll("-", " ")}`}
                            </Text>
                            {candidate.note && (
                              <Text
                                numberOfLines={2}
                                style={styles.hostFlowLookingNote}
                              >
                                {candidate.note}
                              </Text>
                            )}
                          </View>
                          <Pressable
                            disabled={selected || full}
                            onPress={() =>
                              setSelectedPlayers((current) => [
                                ...current,
                                candidate.person,
                              ])
                            }
                            style={[
                              styles.hostFlowLookingInvite,
                              selected && styles.hostFlowLookingInviteSelected,
                            ]}
                          >
                            <Text style={styles.hostFlowLookingInviteText}>
                              {selected ? "Added" : "Invite"}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                    {!lookingCandidatesLoading &&
                      lookingCandidates.length === 0 && (
                        <Text style={styles.hostFlowLookingEmpty}>
                          No opted-in players match this exact place and time
                          yet. You can still add someone you know.
                        </Text>
                      )}
                  </View>
                  <View style={styles.hostFlowRoster}>
                    {[host, ...selectedPlayers].map((player, index) => (
                      <View key={player.id} style={styles.hostFlowPlayerRow}>
                        <PlayerAvatar
                          palette={colors}
                          person={player}
                          size={52}
                        />
                        <View style={styles.flex}>
                          <Text style={styles.hostFlowPlayerName}>
                            {player.displayName}
                          </Text>
                          <Text style={styles.hostFlowPlayerMeta}>
                            {index === 0
                              ? "Host"
                              : `${player.homeMarket} · ${player.rating.display.toFixed(2)} Sand`}
                          </Text>
                        </View>
                        {index > 0 && (
                          <Pressable
                            accessibilityLabel={"Remove " + player.displayName}
                            onPress={() =>
                              setSelectedPlayers((current) =>
                                current.filter(
                                  (candidate) => candidate.id !== player.id,
                                ),
                              )
                            }
                            style={styles.hostFlowRemovePlayer}
                          >
                            <Text style={styles.hostFlowRemovePlayerText}>
                              ×
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    ))}
                    {guestPlayers.map((guest) => {
                      const displayName = `${guest.givenName} ${guest.familyName}`;
                      return (
                        <View key={guest.id} style={styles.hostFlowPlayerRow}>
                          <PlayerAvatar
                            displayName={displayName}
                            palette={colors}
                            size={52}
                          />
                          <View style={styles.flex}>
                            <Text style={styles.hostFlowPlayerName}>
                              {displayName}
                            </Text>
                            <Text style={styles.hostFlowPlayerMeta}>
                              Guest · claim after the result is reported
                            </Text>
                          </View>
                          <Pressable
                            accessibilityLabel={`Remove ${displayName}`}
                            onPress={() =>
                              setGuestPlayers((current) =>
                                current.filter(
                                  (candidate) => candidate.id !== guest.id,
                                ),
                              )
                            }
                            style={styles.hostFlowRemovePlayer}
                          >
                            <Text style={styles.hostFlowRemovePlayerText}>
                              ×
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                    {Array.from({
                      length: Math.min(
                        4,
                        Math.max(
                          0,
                          capacity -
                            selectedPlayers.length -
                            guestPlayers.length -
                            1,
                        ),
                      ),
                    }).map((_, index) => (
                      <Pressable
                        accessibilityLabel={`Add player to place ${index + selectedPlayers.length + guestPlayers.length + 2}`}
                        accessibilityRole="button"
                        key={index}
                        onPress={() => setShowPlayerPicker(true)}
                        style={styles.hostFlowOpenPlayer}
                      >
                        <PlayerAvatar
                          badge="add"
                          displayName="Available place"
                          palette={colors}
                          size={52}
                        />
                        <Text style={styles.hostFlowOpenPlayerText}>
                          Available place
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={styles.hostFlowLabel}>WHO CAN JOIN</Text>
                  <View style={styles.hostFlowChipWrap}>
                    {(["open", "mixed", "womens", "mens"] as const).map(
                      (option) => (
                        <Pressable
                          key={option}
                          onPress={() => setGenderPreference(option)}
                          style={[
                            styles.hostFlowChip,
                            genderPreference === option &&
                              styles.hostFlowChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.hostFlowChipText,
                              genderPreference === option &&
                                styles.hostFlowChipTextActive,
                            ]}
                          >
                            {option === "open"
                              ? "All players"
                              : option === "mixed"
                                ? "Mixed"
                                : option === "womens"
                                  ? "Women"
                                  : "Men"}
                          </Text>
                        </Pressable>
                      ),
                    )}
                  </View>
                </>
              )}

              {step === 3 && (
                <>
                  <Text style={styles.hostFlowTitle}>Access and details</Text>
                  <Text style={styles.hostFlowBody}>
                    Set the level and whether the match is discoverable. Court
                    payment is handled only through a Duna venue reservation.
                  </Text>
                  <Text style={styles.hostFlowLabel}>VISIBILITY</Text>
                  <View style={styles.hostFlowChoiceGrid}>
                    {(["public", "unlisted"] as const).map((option) => (
                      <Pressable
                        key={option}
                        onPress={() => setVisibility(option)}
                        style={[
                          styles.hostFlowChoice,
                          visibility === option && styles.hostFlowChoiceActive,
                        ]}
                      >
                        <Text style={styles.hostFlowChoiceTitle}>
                          {option === "public" ? "Public" : "Link only"}
                        </Text>
                        <Text style={styles.hostFlowChoiceBody}>
                          {option === "public"
                            ? "Eligible players can discover open places."
                            : "Only people with the match link can join."}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {matchType === "competitive" && (
                    <>
                      <View style={styles.hostFlowToggle}>
                        <View style={styles.flex}>
                          <Text style={styles.hostFlowToggleTitle}>
                            Sand Rating range
                          </Text>
                          <Text style={styles.hostFlowToggleBody}>
                            Keep the level clear for everyone.
                          </Text>
                        </View>
                        <Switch
                          accessibilityLabel="Toggle Sand Rating range"
                          onValueChange={setRatingEnabled}
                          thumbColor="#ffffff"
                          trackColor={{
                            false: rgba(colors.overlayRgb, 0.16),
                            true: colors.aqua,
                          }}
                          value={ratingEnabled}
                        />
                      </View>
                      {ratingEnabled && (
                        <View style={styles.hostFlowInputRow}>
                          <TextInput
                            keyboardType="decimal-pad"
                            onChangeText={setRatingMinimum}
                            placeholder="Minimum"
                            placeholderTextColor={colors.muted}
                            style={[styles.hostFlowInput, styles.flex]}
                            value={ratingMinimum}
                          />
                          <TextInput
                            keyboardType="decimal-pad"
                            onChangeText={setRatingMaximum}
                            placeholder="Maximum"
                            placeholderTextColor={colors.muted}
                            style={[styles.hostFlowInput, styles.flex]}
                            value={ratingMaximum}
                          />
                        </View>
                      )}
                    </>
                  )}
                  <View style={styles.hostFlowToggle}>
                    <View style={styles.flex}>
                      <Text style={styles.hostFlowToggleTitle}>
                        Approve join requests
                      </Text>
                      <Text style={styles.hostFlowToggleBody}>
                        Players ask for an open place and you approve or decline
                        each one. Leave this off and eligible players take an
                        open place directly.
                      </Text>
                    </View>
                    <Switch
                      accessibilityLabel="Toggle join request approval"
                      onValueChange={setApprovalRequired}
                      thumbColor="#ffffff"
                      trackColor={{
                        false: rgba(colors.overlayRgb, 0.16),
                        true: colors.aqua,
                      }}
                      value={approvalRequired}
                    />
                  </View>
                  <Text style={styles.hostFlowLabel}>COST TO JOIN</Text>
                  <View style={styles.hostFlowFreeMatchCard}>
                    <View style={styles.hostFlowFreeMatchMark}>
                      <Text style={styles.hostFlowFreeMatchMarkText}>✓</Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.hostFlowToggleTitle}>
                        Free in Duna
                      </Text>
                      <Text style={styles.hostFlowToggleBody}>
                        Players join without a match fee. A connected Duna venue
                        reservation handles any court cost separately.
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.hostFlowLabel}>NOTE</Text>
                  <TextInput
                    multiline
                    onChangeText={setNote}
                    placeholder="Parking, court number, what to bring…"
                    placeholderTextColor={colors.muted}
                    style={[styles.hostFlowInput, styles.hostFlowTextarea]}
                    value={note}
                  />
                  <View style={styles.hostFlowToggle}>
                    <View style={styles.flex}>
                      <Text style={styles.hostFlowToggleTitle}>
                        Record results
                      </Text>
                      <Text style={styles.hostFlowToggleBody}>
                        Let confirmed players submit the final score.
                      </Text>
                    </View>
                    <Switch
                      accessibilityLabel="Toggle Record results"
                      onValueChange={setRecordMatches}
                      thumbColor="#ffffff"
                      trackColor={{
                        false: rgba(colors.overlayRgb, 0.16),
                        true: colors.aqua,
                      }}
                      value={recordMatches}
                    />
                  </View>
                </>
              )}

              {step === 4 && (
                <>
                  <Text style={styles.hostFlowTitle}>Ready to create?</Text>
                  <Text style={styles.hostFlowBody}>
                    Review the match exactly as players will see it.
                  </Text>
                  <View style={styles.hostFlowReviewCard}>
                    <Text style={styles.hostFlowReviewTitle}>{title}</Text>
                    <Text style={styles.hostFlowReviewWhen}>
                      {start.toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      })}{" "}
                      ·{" "}
                      {start.toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </Text>
                    <Text style={styles.hostFlowReviewVenue}>{venueName}</Text>
                    <View style={styles.hostFlowReviewRule} />
                    <View style={styles.hostFlowReviewGrid}>
                      <View>
                        <Text style={styles.hostFlowReviewLabel}>MATCH</Text>
                        <Text style={styles.hostFlowReviewValue}>
                          {matchType === "competitive"
                            ? "Competitive"
                            : "Casual"}{" "}
                          · {format}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.hostFlowReviewLabel}>PLAYERS</Text>
                        <Text style={styles.hostFlowReviewValue}>
                          {selectedPlayers.length + 1} in ·{" "}
                          {capacity - selectedPlayers.length - 1} available
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.hostFlowReviewLabel}>ACCESS</Text>
                        <Text style={styles.hostFlowReviewValue}>
                          {visibility === "public" ? "Public" : "Link only"} ·{" "}
                          {genderPreference}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.hostFlowReviewLabel}>JOIN</Text>
                        <Text style={styles.hostFlowReviewValue}>
                          Free in Duna
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.hostFlowTrust}>
                    <Text style={styles.hostFlowTrustMark}>✓</Text>
                    <Text style={styles.hostFlowTrustText}>
                      Added players are locked into the initial roster. They
                      will see that you added them when they open the match.
                    </Text>
                  </View>
                </>
              )}

              {error && <Text style={styles.formError}>{error}</Text>}
            </ScrollView>
            <View style={styles.hostFlowFooter}>
              {step > 0 && (
                <Pressable
                  disabled={busy}
                  onPress={() => {
                    setError(undefined);
                    setStep((current) => Math.max(0, current - 1));
                  }}
                  style={styles.hostFlowBack}
                >
                  <Text style={styles.hostFlowBackText}>Back</Text>
                </Pressable>
              )}
              <Pressable
                disabled={busy || (step === 4 && mode === "preview")}
                onPress={() => (step === 4 ? void publish() : nextStep())}
                style={[
                  styles.hostFlowContinue,
                  (busy || (step === 4 && mode === "preview")) &&
                    styles.buttonDisabled,
                ]}
              >
                <Text style={styles.hostFlowContinueText}>
                  {step < 4
                    ? "Continue"
                    : mode === "preview"
                      ? "Sign in to publish"
                      : busy
                        ? "Publishing…"
                        : "Create match"}
                </Text>
              </Pressable>
            </View>
          </SafeAreaView>
        )}
      </Modal>
    </>
  );
}
