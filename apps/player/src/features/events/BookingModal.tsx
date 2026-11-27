import {
  defaultEventMedia,
  eventDivisionAgeLabel,
  eventDivisionCompetitionLabel,
  eventDivisionEntryLabel,
  eventDivisionFieldLabel,
  eventDivisionFilledCount,
  eventDivisionFilledPercent,
  eventDivisionRatingLabel,
  eventDivisionSeedingLabel,
  eventDivisionTeamSize,
  formatMoney,
  formatVenueTime,
  type EventSummary,
  type PersonSummary,
} from "@duna/core";
import { demoEvents, demoPeople, demoPlayer } from "@duna/core/demo";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useRef, useState } from "react";
import {
  Image,
  ImageBackground,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { dunaWebUrl, type DunaApiClient } from "../../../mobile-api";
import { presentNativeEventPayment } from "../../../native-payments";
import { usePlayerRuntime } from "../../../runtime";
import { TournamentWalletConfirmation } from "../../../tournament-passes";
import {
  BookingManagementModal,
  type ManagedBooking,
} from "../../../booking-management";
import {
  BookingConfirmationView,
  type ShareableBookingDetails,
} from "../../../booking-share";
import { LocalTournamentPanel } from "../../../local-tournament";
import {
  PlayerPickerModal,
  usePlayerProfileNavigation,
} from "../../../player-social";
import {
  admissionPassReady,
  checkoutRosterComplete,
  initialPurchaseKind,
  presentThenPollCheckout,
} from "../../../event-checkout-state";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "../../../satoshi-text";
import {
  type RegistrationParticipant,
  registrationParticipantEligibility,
  registrationParticipantAge,
} from "./registration-participants";
import { colors } from "../../shared/palette";
import { displayError } from "../../shared/display-error";
import { selectionHaptic } from "../../shared/haptics";
import { Pill } from "../../shared/Pill";
import {
  type MobilePolicyReviewDocument,
  MobilePolicyReviewCard,
  PolicyReviewModal,
} from "../../shared/policy-review-modal";
import { styles } from "../../legacy/styles";

type TeammateSearchResult = Awaited<
  ReturnType<DunaApiClient["player"]["teammateSearch"]["query"]>
>[number];

export function BookingModal({
  eventIndex,
  eventOverride,
  onClose,
}: {
  readonly eventIndex: number | null;
  readonly eventOverride?: EventSummary;
  readonly onClose: () => void;
}) {
  const { client, dashboard, mode, people, refresh, settings } =
    usePlayerRuntime();
  const { openPlayerProfile } = usePlayerProfileNavigation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [complete, setComplete] = useState<{
    readonly title: string;
    readonly body: string;
    readonly label: string;
    readonly admissionReady: boolean;
    readonly admissionKind: "player-registration" | "fan-ticket";
  }>();
  const [purchaseKind, setPurchaseKind] = useState<"entry" | "ticket">("entry");
  const [divisionId, setDivisionId] = useState<string>();
  const [ticketTypeId, setTicketTypeId] = useState<string>();
  const [ticketQuantity, setTicketQuantity] = useState(1);
  const [teamPaymentMode, setTeamPaymentMode] = useState<"self" | "team">(
    "self",
  );
  const [teamRoster, setTeamRoster] = useState<
    readonly {
      readonly personId?: string;
      readonly inviteTarget?: string;
      readonly displayName?: string;
    }[]
  >([]);
  const [teammateQuery, setTeammateQuery] = useState("");
  const [teammateResults, setTeammateResults] = useState<
    readonly TeammateSearchResult[]
  >([]);
  const [inviteTarget, setInviteTarget] = useState("");
  const [pickupPartner, setPickupPartner] = useState<readonly PersonSummary[]>(
    [],
  );
  const [showPickupPartnerPicker, setShowPickupPartnerPicker] = useState(false);
  const [acceptedPolicyIds, setAcceptedPolicyIds] = useState<readonly string[]>(
    [],
  );
  const [readPolicyIds, setReadPolicyIds] = useState<readonly string[]>([]);
  const [reviewingPolicyId, setReviewingPolicyId] = useState<string>();
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>();
  const teammateSearchTimeout = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);
  const events = dashboard?.events ?? demoEvents;
  const player = dashboard?.player ?? demoPlayer;
  const event =
    eventOverride ?? (eventIndex === null ? undefined : events[eventIndex]);
  const eventId = event?.id;
  const defaultDivisionId = event?.divisions?.[0]?.id;
  const defaultTicketTypeId = event?.tickets?.[0]?.id;
  const activeDivisionId = divisionId ?? defaultDivisionId;

  useEffect(() => {
    if (!eventId) return;
    setPurchaseKind(
      initialPurchaseKind({
        hasDivisions: Boolean(defaultDivisionId),
        hasTickets: Boolean(defaultTicketTypeId),
      }),
    );
    setDivisionId(defaultDivisionId);
    setTicketTypeId(defaultTicketTypeId);
    setTeamRoster([]);
    setTeammateQuery("");
    setTeammateResults([]);
    setError(undefined);
  }, [defaultDivisionId, defaultTicketTypeId, eventId]);

  useEffect(() => {
    if (
      !client ||
      mode === "preview" ||
      !eventId ||
      purchaseKind !== "entry" ||
      !activeDivisionId
    ) {
      return;
    }
    let cancelled = false;
    void client.player.teammateSearch
      .query({ divisionId: activeDivisionId, limit: 12 })
      .then((results) => {
        if (!cancelled) setTeammateResults(results);
      })
      .catch(() => {
        if (!cancelled) setTeammateResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [activeDivisionId, client, eventId, mode, purchaseKind]);

  useEffect(
    () => () => {
      if (teammateSearchTimeout.current) {
        clearTimeout(teammateSearchTimeout.current);
      }
    },
    [],
  );

  if (!event) return null;
  const selectedEvent = event;
  const reviewingPolicy = selectedEvent.policies?.find(
    (policy) => policy.id === reviewingPolicyId,
  );
  const division =
    event.divisions?.find((candidate) => candidate.id === divisionId) ??
    event.divisions?.[0];
  const ticket =
    event.tickets?.find((candidate) => candidate.id === ticketTypeId) ??
    event.tickets?.[0];
  const participantOptions: readonly RegistrationParticipant[] = settings
    ? [
        {
          person: settings.profile.person,
          label: "You",
          available: settings.profile.ageBand === "adult",
          birthDate: settings.profile.birthDate,
          ageBand: settings.profile.ageBand,
          genderCategory: settings.profile.genderCategory,
        },
        ...settings.household
          .filter((member) => member.role === "dependent")
          .map((member) => ({
            person: member.person,
            label: member.relationship,
            available: member.verified,
            birthDate: member.birthDate,
            ageBand: member.ageBand,
            genderCategory: member.genderCategory,
          })),
      ]
    : [{ person: player, label: "You", available: true }];
  const selectedParticipant =
    participantOptions.find(
      (participant) => participant.person.id === selectedParticipantId,
    ) ?? participantOptions.find((participant) => participant.available);
  const selectedParticipantEligibility = registrationParticipantEligibility(
    selectedParticipant,
    division,
    event.startsAt,
  );
  const listedPrice =
    event.kind === "pickup"
      ? {
          ...event.price,
          amountMinor:
            event.price.amountMinor * (pickupPartner.length > 0 ? 2 : 1),
        }
      : purchaseKind === "ticket"
        ? (ticket?.price ?? event.price)
        : teamPaymentMode === "team"
          ? (division?.teamPrice ?? division?.price ?? event.price)
          : (division?.playerPrice ?? division?.price ?? event.price);
  const selectedTeamSize =
    event.kind === "pickup"
      ? 2
      : (division?.teamSize ??
        {
          solo: 1,
          doubles: 2,
          "three-person": 3,
          "four-person": 4,
          "six-person": 6,
        }[division?.teamFormat ?? "solo"]);
  const requiredPolicies =
    event.policies?.filter(
      (policy) => policy.required && policy.kind !== "waiver",
    ) ?? [];
  const rosterComplete = checkoutRosterComplete({
    eventKind: event.kind,
    purchaseKind,
    selectedTeamSize,
    teammateCount: teamRoster.length,
  });
  const policiesComplete = requiredPolicies.every((policy) =>
    acceptedPolicyIds.includes(policy.id),
  );
  const listedSubtotalMinor =
    listedPrice.amountMinor * (purchaseKind === "ticket" ? ticketQuantity : 1);
  const teammateCandidates =
    mode !== "preview"
      ? teammateResults
      : (people ?? demoPeople)
          .filter(
            (candidate) => candidate.id !== selectedParticipant?.person.id,
          )
          .slice(0, 8)
          .map((candidate) => ({
            person: candidate,
            relationship:
              candidate.homeMarket === selectedParticipant?.person.homeMarket
                ? ("nearby" as const)
                : ("search" as const),
            sharedTeams: 0,
            following: false,
            followsYou: false,
            reliability: {
              label: "new" as const,
              tracked: 0,
              attended: 0,
              noShows: 0,
            },
            gender: "Not listed",
            eligible: true,
            eligibilityReasons: [],
          }));
  const confirmationPlayerNames = [
    selectedParticipant?.person.displayName,
    ...(selectedEvent.kind === "pickup"
      ? pickupPartner.map((partner) => partner.displayName)
      : teamRoster.flatMap((member) =>
          member.displayName ? [member.displayName] : [],
        )),
  ].filter((name): name is string => Boolean(name));
  const completionDetails = {
    title: selectedEvent.title,
    startsAt: selectedEvent.startsAt,
    endsAt: selectedEvent.endsAt,
    timezone: selectedEvent.timezone,
    organizationName: selectedEvent.organizationName,
    locationName: selectedEvent.location?.venueName ?? selectedEvent.venueName,
    ...(selectedEvent.location?.address
      ? { address: selectedEvent.location.address }
      : {}),
    ...(selectedEvent.location?.courtNames?.length
      ? { courtName: selectedEvent.location.courtNames.join(", ") }
      : {}),
    ...(confirmationPlayerNames.length
      ? { playerNames: confirmationPlayerNames }
      : {}),
    detailsUrl: `${dunaWebUrl}/events/${encodeURIComponent(selectedEvent.slug)}`,
  } satisfies ShareableBookingDetails;

  function searchTeammates(value: string) {
    setTeammateQuery(value);
    if (teammateSearchTimeout.current) {
      clearTimeout(teammateSearchTimeout.current);
    }
    teammateSearchTimeout.current = setTimeout(() => {
      if (!client || mode === "preview") return;
      void client.player.teammateSearch
        .query({
          query: value.trim() || undefined,
          divisionId: division?.id,
          limit: 12,
        })
        .then(setTeammateResults)
        .catch((reason) => setError(displayError(reason)));
    }, 220);
  }

  function close() {
    setError(undefined);
    setComplete(undefined);
    setPurchaseKind("entry");
    setDivisionId(undefined);
    setTicketTypeId(undefined);
    setTicketQuantity(1);
    setTeamPaymentMode("self");
    setTeamRoster([]);
    setTeammateQuery("");
    setTeammateResults([]);
    setInviteTarget("");
    setPickupPartner([]);
    setShowPickupPartnerPicker(false);
    setAcceptedPolicyIds([]);
    setReadPolicyIds([]);
    setReviewingPolicyId(undefined);
    setSelectedParticipantId(undefined);
    setBusy(false);
    onClose();
  }

  async function checkout() {
    if (!client || mode === "preview") return;
    if (!selectedParticipantEligibility.eligible && purchaseKind === "entry") {
      setError(
        `${selectedParticipantEligibility.reason}. Choose a different player or division.`,
      );
      return;
    }
    if (!rosterComplete) {
      setError(`Add ${selectedTeamSize - 1} teammates before continuing.`);
      return;
    }
    if (!policiesComplete) {
      setError("Read and accept every required event agreement.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await client.player.startEventCheckout.mutate({
        sessionId: selectedEvent.id,
        divisionId: purchaseKind === "entry" ? division?.id : undefined,
        ticketTypeId: purchaseKind === "ticket" ? ticket?.id : undefined,
        ticketQuantity: purchaseKind === "ticket" ? ticketQuantity : undefined,
        teamPaymentMode:
          selectedEvent.kind === "pickup"
            ? pickupPartner.length
              ? "team"
              : "self"
            : purchaseKind === "entry" && selectedTeamSize > 1
              ? teamPaymentMode
              : undefined,
        teamRoster:
          selectedEvent.kind === "pickup"
            ? pickupPartner.map((partner) => ({
                personId: partner.id,
                displayName: partner.displayName,
              }))
            : purchaseKind === "entry" && selectedTeamSize > 1
              ? [...teamRoster]
              : undefined,
        subjectPersonId:
          purchaseKind === "entry" ? selectedParticipant?.person.id : undefined,
        acceptedPolicyIds: [...acceptedPolicyIds],
        readPolicyIds: [...readPolicyIds],
        isDunaPlus: Boolean(settings?.membership),
        paymentSurface: Platform.OS === "web" ? "hosted" : "native",
        successUrl: `${dunaWebUrl}/app/checkout/${selectedEvent.slug}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${dunaWebUrl}/events/${selectedEvent.slug}?checkout=cancelled`,
        idempotencyKey: Crypto.randomUUID(),
      });
      if (result.paymentSheet) {
        const paymentIntentId = result.paymentSheet.paymentIntentId;
        const payment = await presentThenPollCheckout({
          present: () =>
            presentNativeEventPayment({
              paymentSheet: result.paymentSheet!,
              customerName: player.displayName,
            }),
          readStatus: () =>
            client.player.checkoutStatus.query({ paymentIntentId }),
          isComplete: (status) => status.complete,
          maxPolls: 5,
          delayMs: (attempt) => 450 + attempt * 250,
        });
        if (payment.cancelled) return;
        const { status } = payment;
        const pendingApproval = status.fulfillmentStatus === "pending-approval";
        setComplete(
          status.complete
            ? {
                admissionKind:
                  purchaseKind === "ticket"
                    ? "fan-ticket"
                    : "player-registration",
                admissionReady: admissionPassReady({
                  checkoutComplete: status.complete,
                  eventKind: selectedEvent.kind,
                  fulfillmentStatus: status.fulfillmentStatus,
                  purchaseKind,
                  registrationStatus: status.registrationStatus,
                }),
                label: pendingApproval ? "Pending approval" : "Confirmed",
                title: pendingApproval ? "Request received." : "You’re in.",
                body: pendingApproval
                  ? `${selectedEvent.title} is paid and waiting for organizer approval. Your admission pass will appear as soon as the ticket is issued.`
                  : `${selectedEvent.title} is confirmed and now appears with your bookings.`,
              }
            : {
                admissionKind:
                  purchaseKind === "ticket"
                    ? "fan-ticket"
                    : "player-registration",
                admissionReady: false,
                label: "Pending",
                title: "Payment received.",
                body: "Duna is finishing the registration and will add it to your bookings shortly.",
              },
        );
      } else if (result.checkoutUrl) {
        if (Platform.OS !== "web") {
          throw new Error(
            "Duna could not prepare the in-app payment. You were not charged; please try again.",
          );
        }
        await WebBrowser.openBrowserAsync(result.checkoutUrl);
        const status = result.checkoutSessionId
          ? await client.player.checkoutStatus.query({
              checkoutSessionId: result.checkoutSessionId,
            })
          : undefined;
        const pendingApproval =
          status?.fulfillmentStatus === "pending-approval";
        setComplete(
          status?.complete
            ? {
                admissionKind:
                  purchaseKind === "ticket"
                    ? "fan-ticket"
                    : "player-registration",
                admissionReady: admissionPassReady({
                  checkoutComplete: true,
                  eventKind: selectedEvent.kind,
                  fulfillmentStatus: status.fulfillmentStatus,
                  purchaseKind,
                  registrationStatus: status.registrationStatus,
                }),
                label: pendingApproval ? "Pending approval" : "Confirmed",
                title: pendingApproval ? "Request received." : "You’re in.",
                body: pendingApproval
                  ? `${selectedEvent.title} is paid and waiting for organizer approval. Your admission pass will appear as soon as the ticket is issued.`
                  : `${selectedEvent.title} is confirmed and now appears with your bookings.`,
              }
            : {
                admissionKind:
                  purchaseKind === "ticket"
                    ? "fan-ticket"
                    : "player-registration",
                admissionReady: false,
                label: "Pending",
                title: "Checkout is still processing.",
                body: "Duna will confirm the booking after the payment succeeds.",
              },
        );
      } else {
        const waitlisted = result.mode === "waitlist";
        const alreadyRegistered = result.mode === "already-registered";
        const pendingApproval = result.fulfillmentStatus === "pending-approval";
        setComplete({
          admissionKind:
            purchaseKind === "ticket" ? "fan-ticket" : "player-registration",
          admissionReady: admissionPassReady({
            checkoutComplete: !waitlisted,
            eventKind: selectedEvent.kind,
            fulfillmentStatus: result.fulfillmentStatus,
            purchaseKind,
            registrationStatus: result.registrationStatus,
          }),
          label: waitlisted
            ? "Waitlisted"
            : pendingApproval
              ? "Pending approval"
              : alreadyRegistered
                ? "Already registered"
                : "Confirmed",
          title: waitlisted
            ? "You’re on the list."
            : pendingApproval
              ? "Request received."
              : alreadyRegistered
                ? "You already have this booking."
                : "You’re in.",
          body: waitlisted
            ? `${selectedEvent.title} will notify you if a place opens.`
            : pendingApproval
              ? `${selectedEvent.title} is waiting for organizer approval. Your admission pass will appear as soon as the ticket is issued.`
              : `${selectedEvent.title} now appears with your bookings.`,
        });
      }
      if (
        purchaseKind === "entry" &&
        selectedEvent.organizationId &&
        selectedParticipant?.person.id
      ) {
        const waiverDocumentIds = selectedEvent.policies
          ?.filter(
            (policy) =>
              policy.kind === "waiver" && Boolean(policy.waiverDocumentId),
          )
          .map((policy) => policy.waiverDocumentId!)
          .slice(0, 20);
        if (waiverDocumentIds?.length) {
          const requirements = await client.player.waiverRequirements
            .query({
              organizationId: selectedEvent.organizationId,
              subjectPersonId: selectedParticipant.person.id,
              waiverDocumentIds,
            })
            .catch(() => []);
          const next = requirements.find(
            (requirement) => !requirement.complete,
          );
          if (next) {
            const completionUrl = new URL("/waivers/complete", dunaWebUrl);
            completionUrl.searchParams.set(
              "organizationId",
              selectedEvent.organizationId,
            );
            completionUrl.searchParams.set("waiverDocumentId", next.documentId);
            completionUrl.searchParams.set(
              "subjectPersonId",
              next.subjectPersonId,
            );
            await WebBrowser.openBrowserAsync(completionUrl.toString());
          }
        }
      }
      await refresh();
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  }

  const existingBooking = (dashboard?.bookings ?? []).find(
    (booking) =>
      booking.sessionId === selectedEvent.id ||
      (booking.title === selectedEvent.title &&
        Math.abs(
          Date.parse(booking.startsAt) - Date.parse(selectedEvent.startsAt),
        ) <
          15 * 60_000),
  );
  if (existingBooking && !complete && selectedEvent.kind === "tournament") {
    return (
      <Modal
        animationType="slide"
        onRequestClose={close}
        presentationStyle="pageSheet"
        visible={Boolean(event)}
      >
        <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Pressable accessibilityLabel="Close tournament" onPress={close}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
              <Text style={styles.modalHeaderTitle}>Tournament day</Text>
              <Text style={styles.rowMeta}>Updates stay here</Text>
            </View>
            <Text style={styles.checkoutTitle}>{selectedEvent.title}</Text>
            <Text style={styles.checkoutMeta}>
              {selectedEvent.venueName} ·{" "}
              {formatVenueTime(selectedEvent.startsAt, selectedEvent.timezone)}
            </Text>
            <LocalTournamentPanel
              client={client}
              sessionId={selectedEvent.id}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    );
  }

  if (existingBooking && !complete) {
    return (
      <BookingManagementModal
        booking={existingBooking as ManagedBooking}
        client={client}
        onClose={close}
        onUpdated={refresh}
        palette={colors}
      />
    );
  }

  if (selectedEvent.kind === "pickup") {
    const startsAt = new Date(selectedEvent.startsAt);
    const endsAt = new Date(selectedEvent.endsAt);
    const durationMinutes = Math.max(
      1,
      Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000),
    );
    const partner = pickupPartner[0];
    const canAddPartner = selectedEvent.spotsRemaining >= 2;
    return (
      <>
        <Modal
          animationType="slide"
          onRequestClose={close}
          presentationStyle="pageSheet"
          visible={Boolean(event)}
        >
          {showPickupPartnerPicker ? (
            <PlayerPickerModal
              embedded
              excludedPersonIds={[player.id]}
              maxSelected={1}
              onChange={setPickupPartner}
              onClose={() => setShowPickupPartnerPicker(false)}
              palette={colors}
              selected={pickupPartner}
              title="Choose your partner"
              visible
            />
          ) : (
            <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
              {complete ? (
                <BookingConfirmationView
                  body={complete.body}
                  details={completionDetails}
                  label={complete.label}
                  onDone={close}
                  title={complete.title}
                >
                  {complete.admissionReady ? (
                    <TournamentWalletConfirmation
                      kind={complete.admissionKind}
                      sessionId={selectedEvent.id}
                    />
                  ) : null}
                </BookingConfirmationView>
              ) : (
                <>
                  <View style={styles.hostedReviewHeader}>
                    <View style={styles.flex}>
                      <Text style={styles.eyebrow}>HOSTED MATCH</Text>
                      <Text style={styles.hostedReviewTitle}>Review</Text>
                    </View>
                    <Pressable
                      accessibilityLabel="Close match review"
                      onPress={close}
                      style={styles.hostedReviewClose}
                    >
                      <Text style={styles.closeText}>×</Text>
                    </Pressable>
                  </View>
                  <ScrollView
                    contentContainerStyle={styles.hostedReviewContent}
                    showsVerticalScrollIndicator={false}
                  >
                    <View style={styles.hostedReviewSummary}>
                      <View style={styles.flex}>
                        <Text style={styles.hostedReviewDate}>
                          {startsAt.toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          })}
                        </Text>
                        <Text style={styles.hostedReviewTime}>
                          {startsAt.toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}{" "}
                          –{" "}
                          {endsAt.toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </Text>
                        <Text style={styles.hostedReviewMeta}>
                          {selectedEvent.tags.includes("Competitive")
                            ? "Competitive"
                            : "Casual"}{" "}
                          · {selectedEvent.format?.replace("-", " ") ?? "Beach"}{" "}
                          · {selectedEvent.venueName}
                        </Text>
                        {selectedEvent.ratingRange && (
                          <Text style={styles.hostedReviewMeta}>
                            Sand Rating{" "}
                            {selectedEvent.ratingRange[0].toFixed(2)}–
                            {selectedEvent.ratingRange[1].toFixed(2)}
                          </Text>
                        )}
                      </View>
                      <View style={styles.hostedReviewDuration}>
                        <Text style={styles.hostedReviewDurationMark}>◷</Text>
                        <Text style={styles.hostedReviewDurationValue}>
                          {durationMinutes}
                        </Text>
                        <Text style={styles.hostedReviewDurationLabel}>
                          MIN
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.hostedPartnerCard,
                        !canAddPartner && styles.hostedPartnerCardDisabled,
                      ]}
                    >
                      <View style={styles.hostedPartnerTop}>
                        <View style={styles.flex}>
                          <Text style={styles.hostedPartnerTitle}>
                            Join with a partner
                          </Text>
                          <Text style={styles.hostedPartnerMeta}>
                            Reserve and pay for two places together.
                          </Text>
                        </View>
                        <View style={styles.hostedPartnerIllustration}>
                          <View style={styles.hostedPartnerSilhouette} />
                          <View
                            style={[
                              styles.hostedPartnerSilhouette,
                              styles.hostedPartnerSilhouetteBack,
                            ]}
                          />
                        </View>
                      </View>
                      {partner ? (
                        <View style={styles.hostedSelectedPartner}>
                          <Pressable
                            accessibilityLabel={
                              "Open " + partner.displayName + "'s profile"
                            }
                            onPress={() => openPlayerProfile(partner)}
                          >
                            {partner.avatarUrl ? (
                              <Image
                                accessibilityIgnoresInvertColors
                                source={{ uri: partner.avatarUrl }}
                                style={styles.hostedPartnerAvatar}
                              />
                            ) : (
                              <View style={styles.hostedPartnerAvatarFallback}>
                                <Text style={styles.hostedPartnerAvatarText}>
                                  {partner.initials}
                                </Text>
                              </View>
                            )}
                          </Pressable>
                          <Pressable
                            onPress={() => openPlayerProfile(partner)}
                            style={styles.flex}
                          >
                            <Text style={styles.hostedSelectedPartnerName}>
                              {partner.displayName}
                            </Text>
                            <Text style={styles.hostedSelectedPartnerMeta}>
                              {partner.homeMarket} ·{" "}
                              {partner.rating.display.toFixed(2)} Sand
                            </Text>
                          </Pressable>
                          <Pressable
                            accessibilityLabel="Remove partner"
                            onPress={() => setPickupPartner([])}
                            style={styles.hostedRemovePartner}
                          >
                            <Text style={styles.hostedRemovePartnerText}>
                              ×
                            </Text>
                          </Pressable>
                        </View>
                      ) : (
                        <Pressable
                          disabled={!canAddPartner}
                          onPress={() => setShowPickupPartnerPicker(true)}
                          style={styles.hostedAddPartner}
                        >
                          <Text style={styles.hostedAddPartnerText}>
                            {canAddPartner
                              ? "Add partner (0/1)"
                              : "Two places are not available"}
                          </Text>
                          <Text style={styles.hostedAddPartnerArrow}>＋</Text>
                        </Pressable>
                      )}
                      {partner && (
                        <Text style={styles.hostedPartnerPolicy}>
                          Both places are managed as one paid booking.
                          Cancelling releases both places together.
                        </Text>
                      )}
                    </View>

                    <View style={styles.hostedTotalCard}>
                      <View style={styles.flex}>
                        <Text style={styles.hostedTotalLabel}>Total</Text>
                        <Text style={styles.hostedTotalMeta}>
                          {partner ? "2 places" : "1 place"} · Service fees
                          shown before payment
                        </Text>
                      </View>
                      <Text style={styles.hostedTotalValue}>
                        {listedPrice.amountMinor
                          ? formatMoney(
                              listedPrice.amountMinor,
                              listedPrice.currency,
                            )
                          : "FREE"}
                      </Text>
                    </View>

                    <View style={styles.hostedPolicyCard}>
                      <Text style={styles.hostedPolicyMark}>i</Text>
                      <View style={styles.flex}>
                        <Text style={styles.hostedPolicyTitle}>
                          Cancellation policy
                        </Text>
                        <Text style={styles.hostedPolicyBody}>
                          Registration closes when the match begins. Any
                          eligible refund follows the host and venue policy
                          shown at checkout.
                        </Text>
                      </View>
                    </View>

                    {error && (
                      <View style={styles.errorBanner}>
                        <Text style={styles.errorText}>{error}</Text>
                      </View>
                    )}
                  </ScrollView>
                  <View style={styles.hostedReviewFooter}>
                    <Pressable
                      disabled={busy || mode === "preview"}
                      onPress={() => void checkout()}
                      style={[
                        styles.hostedReviewContinue,
                        (busy || mode === "preview") && styles.buttonDisabled,
                      ]}
                    >
                      <Text style={styles.hostedReviewContinueText}>
                        {mode === "preview"
                          ? "Sign in to reserve"
                          : busy
                            ? "Securing places…"
                            : listedPrice.amountMinor
                              ? "Continue payment"
                              : partner
                                ? "Confirm both places"
                                : "Confirm place"}
                      </Text>
                    </Pressable>
                  </View>
                </>
              )}
            </SafeAreaView>
          )}
        </Modal>
      </>
    );
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={close}
      presentationStyle="pageSheet"
      visible={Boolean(event)}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
        {complete ? (
          <BookingConfirmationView
            body={complete.body}
            details={completionDetails}
            label={complete.label}
            onDone={close}
            title={complete.title}
          >
            {complete.admissionReady ? (
              <TournamentWalletConfirmation
                kind={complete.admissionKind}
                sessionId={selectedEvent.id}
              />
            ) : null}
          </BookingConfirmationView>
        ) : (
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Pressable onPress={close}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
              <Text style={styles.modalHeaderTitle}>Secure checkout</Text>
              <Text style={styles.rowMeta}>Secure payment</Text>
            </View>
            <ImageBackground
              imageStyle={styles.checkoutArtImage}
              source={{
                uri:
                  event.imageUrl ??
                  `${dunaWebUrl}${
                    defaultEventMedia(event.kind, event.id).path
                  }`,
              }}
              style={styles.checkoutArt}
            >
              <View style={styles.eventArtWash} />
              <Pill>{event.kind}</Pill>
            </ImageBackground>
            <Text style={styles.checkoutTitle}>{event.title}</Text>
            <Text style={styles.checkoutMeta}>
              {event.venueName} ·{" "}
              {formatVenueTime(event.startsAt, event.timezone)}
            </Text>
            {event.shortSummary && (
              <Text style={styles.checkoutSummaryText}>
                {event.shortSummary}
              </Text>
            )}
            {selectedEvent.kind === "tournament" && (
              <LocalTournamentPanel
                client={client}
                sessionId={selectedEvent.id}
              />
            )}
            {event.divisions?.length && event.tickets?.length ? (
              <View style={styles.purchaseKindRow}>
                <Pressable
                  onPress={() => {
                    setPurchaseKind("entry");
                    setError(undefined);
                  }}
                  style={[
                    styles.purchaseKindButton,
                    purchaseKind === "entry" && styles.purchaseKindButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.purchaseKindText,
                      purchaseKind === "entry" && styles.purchaseKindTextActive,
                    ]}
                  >
                    PLAY
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setPurchaseKind("ticket");
                    setTeamRoster([]);
                    setError(undefined);
                  }}
                  style={[
                    styles.purchaseKindButton,
                    purchaseKind === "ticket" &&
                      styles.purchaseKindButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.purchaseKindText,
                      purchaseKind === "ticket" &&
                        styles.purchaseKindTextActive,
                    ]}
                  >
                    ATTEND
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {purchaseKind === "entry" &&
              event.divisions &&
              event.divisions.length > 0 && (
                <View style={styles.checkoutSection}>
                  <Text style={styles.eyebrow}>DIVISION</Text>
                  <ScrollView
                    contentContainerStyle={
                      event.divisions.length === 1
                        ? styles.mobileDivisionRailSingle
                        : undefined
                    }
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.mobileDivisionRail}
                  >
                    {event.divisions.map((option) => (
                      <Pressable
                        key={option.id}
                        onPress={() => {
                          setDivisionId(option.id);
                          setTeamPaymentMode("self");
                          setTeamRoster([]);
                          setTeammateQuery("");
                          setTeammateResults([]);
                          setError(undefined);
                        }}
                        style={[
                          styles.mobileDivisionOption,
                          event.divisions!.length === 1 &&
                            styles.mobileDivisionOptionSingle,
                          division?.id === option.id &&
                            styles.mobileDivisionOptionActive,
                        ]}
                      >
                        <View style={styles.mobileDivisionOptionHeader}>
                          <View style={styles.flex}>
                            <Text
                              style={[
                                styles.mobileDivisionOptionName,
                                division?.id === option.id &&
                                  styles.mobileDivisionOptionNameActive,
                              ]}
                            >
                              {option.name}
                            </Text>
                            <Text style={styles.mobileDivisionOptionMeta}>
                              {eventDivisionAgeLabel(option)} ·{" "}
                              {eventDivisionEntryLabel(option)}
                            </Text>
                          </View>
                          {division?.id === option.id && (
                            <View style={styles.mobileDivisionSelectedChip}>
                              <Text
                                style={styles.mobileDivisionSelectedChipText}
                              >
                                SELECTED
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.mobileDivisionCompetition}>
                          {eventDivisionCompetitionLabel(option)}
                        </Text>
                        <View style={styles.mobileDivisionCapacityRow}>
                          <Text style={styles.mobileDivisionCapacityStrong}>
                            {option.spotsRemaining} spots open
                          </Text>
                          <Text style={styles.mobileDivisionCapacityMeta}>
                            {eventDivisionFilledCount(option)}/{option.capacity}{" "}
                            claimed
                          </Text>
                        </View>
                        <View style={styles.mobileDivisionCapacityTrack}>
                          <View
                            style={[
                              styles.mobileDivisionCapacityFill,
                              {
                                width: `${eventDivisionFilledPercent(option)}%`,
                              },
                            ]}
                          />
                        </View>
                        <View style={styles.mobileDivisionPriceRow}>
                          <Text style={styles.mobileDivisionPriceLabel}>
                            {eventDivisionTeamSize(option) === 1
                              ? "PLAYER ENTRY"
                              : "FROM PER PLAYER"}
                          </Text>
                          <Text style={styles.mobileDivisionPrice}>
                            {formatMoney(
                              option.playerPrice.amountMinor,
                              option.playerPrice.currency,
                            )}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                  {division && (
                    <View style={styles.mobileDivisionDetail}>
                      <View style={styles.mobileDivisionDetailHeader}>
                        <View style={styles.flex}>
                          <Text style={styles.mobileDivisionDetailEyebrow}>
                            HOW THIS DIVISION WORKS
                          </Text>
                          <Text style={styles.mobileDivisionDetailTitle}>
                            {eventDivisionCompetitionLabel(division)}
                          </Text>
                        </View>
                        <View style={styles.mobileDivisionEntryChip}>
                          <Text style={styles.mobileDivisionEntryChipText}>
                            {eventDivisionEntryLabel(division)}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.mobileDivisionFactGrid}>
                        <View style={styles.mobileDivisionFact}>
                          <Text style={styles.mobileDivisionFactLabel}>
                            ELIGIBILITY
                          </Text>
                          <Text style={styles.mobileDivisionFactValue}>
                            {eventDivisionAgeLabel(division)} ·{" "}
                            {eventDivisionRatingLabel(division)}
                          </Text>
                        </View>
                        <View style={styles.mobileDivisionFact}>
                          <Text style={styles.mobileDivisionFactLabel}>
                            FIELD
                          </Text>
                          <Text style={styles.mobileDivisionFactValue}>
                            {eventDivisionFieldLabel(division)}
                          </Text>
                        </View>
                        <View style={styles.mobileDivisionFact}>
                          <Text style={styles.mobileDivisionFactLabel}>
                            SEEDING
                          </Text>
                          <Text style={styles.mobileDivisionFactValue}>
                            {eventDivisionSeedingLabel(division)}
                          </Text>
                        </View>
                        <View style={styles.mobileDivisionFact}>
                          <Text style={styles.mobileDivisionFactLabel}>
                            {eventDivisionTeamSize(division) === 1
                              ? "PRICE"
                              : "FULL TEAM"}
                          </Text>
                          <Text style={styles.mobileDivisionFactValue}>
                            {formatMoney(
                              eventDivisionTeamSize(division) === 1
                                ? division.playerPrice.amountMinor
                                : division.teamPrice.amountMinor,
                              eventDivisionTeamSize(division) === 1
                                ? division.playerPrice.currency
                                : division.teamPrice.currency,
                            )}
                          </Text>
                        </View>
                      </View>
                      {division.description && (
                        <Text style={styles.mobileDivisionDescription}>
                          {division.description}
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}
            {purchaseKind === "ticket" && event.tickets?.length ? (
              <View style={styles.checkoutSection}>
                <Text style={styles.eyebrow}>TICKET</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.mobileTicketRail}
                >
                  {event.tickets
                    .filter((option) => option.availableOnline)
                    .map((option) => (
                      <Pressable
                        key={option.id}
                        onPress={() => {
                          setTicketTypeId(option.id);
                          setTicketQuantity(1);
                        }}
                        style={[
                          styles.mobileTicketCard,
                          ticket?.id === option.id &&
                            styles.mobileTicketCardActive,
                        ]}
                      >
                        <Text style={styles.mobileTicketPrice}>
                          {option.price.amountMinor
                            ? formatMoney(
                                option.price.amountMinor,
                                option.price.currency,
                              )
                            : "FREE"}
                        </Text>
                        <View style={styles.mobileTicketCardBody}>
                          <Text style={styles.mobileTicketName}>
                            {option.name}
                          </Text>
                          <Text
                            numberOfLines={4}
                            style={styles.mobileTicketDescription}
                          >
                            {option.description ??
                              `${option.remaining ?? "Unlimited"} available`}
                          </Text>
                        </View>
                        {ticket?.id === option.id && (
                          <View style={styles.mobileTicketQuantity}>
                            <Pressable
                              disabled={ticketQuantity <= 1}
                              onPress={() =>
                                setTicketQuantity((current) =>
                                  Math.max(1, current - 1),
                                )
                              }
                              style={styles.mobileQuantityButton}
                            >
                              <Text style={styles.mobileQuantityButtonText}>
                                −
                              </Text>
                            </Pressable>
                            <Text style={styles.mobileQuantityValue}>
                              {ticketQuantity}
                            </Text>
                            <Pressable
                              disabled={
                                ticketQuantity >=
                                Math.min(10, option.remaining ?? 10)
                              }
                              onPress={() =>
                                setTicketQuantity((current) =>
                                  Math.min(10, current + 1),
                                )
                              }
                              style={styles.mobileQuantityButton}
                            >
                              <Text style={styles.mobileQuantityButtonText}>
                                +
                              </Text>
                            </Pressable>
                          </View>
                        )}
                      </Pressable>
                    ))}
                </ScrollView>
              </View>
            ) : null}
            {purchaseKind === "entry" && (
              <View style={styles.checkoutSection}>
                <Text style={styles.eyebrow}>WHO’S PLAYING</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.mobileParticipantRail}
                >
                  {participantOptions.map((participant) => {
                    const rating = participant.person.rating.display;
                    const eligibility = registrationParticipantEligibility(
                      participant,
                      division,
                      event.startsAt,
                    );
                    const selected =
                      participant.person.id === selectedParticipant?.person.id;
                    return (
                      <Pressable
                        disabled={!eligibility.eligible}
                        key={participant.person.id}
                        onPress={() =>
                          setSelectedParticipantId(participant.person.id)
                        }
                        style={[
                          styles.mobileParticipantCard,
                          selected && styles.mobileParticipantCardActive,
                          !eligibility.eligible &&
                            styles.mobileParticipantCardDisabled,
                        ]}
                      >
                        {participant.person.avatarUrl ? (
                          <Image
                            source={{ uri: participant.person.avatarUrl }}
                            style={styles.mobileParticipantAvatar}
                          />
                        ) : (
                          <View style={styles.mobileParticipantAvatarFallback}>
                            <Text style={styles.miniAvatarText}>
                              {participant.person.initials}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.mobileParticipantName}>
                          {participant.person.displayName}
                        </Text>
                        <Text style={styles.mobileParticipantMeta}>
                          {participant.label} ·{" "}
                          {registrationParticipantAge(
                            participant,
                            event.startsAt,
                          )}{" "}
                          · {rating.toFixed(2)}
                        </Text>
                        <Text
                          style={[
                            styles.mobileParticipantEligibility,
                            eligibility.eligible
                              ? styles.mobileParticipantEligible
                              : styles.mobileParticipantIneligible,
                          ]}
                        >
                          {eligibility.reason}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            )}
            {purchaseKind === "entry" && selectedTeamSize > 1 && (
              <View style={styles.checkoutSection}>
                <Text style={styles.eyebrow}>COMPLETE YOUR TEAM</Text>
                <Text style={styles.mobileTeamHeading}>
                  {teamRoster.length + 1} of {selectedTeamSize} players added
                </Text>
                <Text style={styles.checkoutSummaryText}>
                  Registration completes when all {selectedTeamSize} players
                  claim their spot and the required entries are paid.
                </Text>
                <View style={styles.mobileRosterRow}>
                  <View style={styles.mobileRosterPlayer}>
                    <View style={styles.miniAvatar}>
                      <Text style={styles.miniAvatarText}>
                        {selectedParticipant?.person.initials ??
                          player.initials}
                      </Text>
                    </View>
                    <Text numberOfLines={1} style={styles.mobileRosterName}>
                      {selectedParticipant?.person.displayName ??
                        player.displayName}
                    </Text>
                    <Text style={styles.mobileRosterStatus}>Captain</Text>
                  </View>
                  {teamRoster.map((member, index) => {
                    const person = (people ?? demoPeople).find(
                      (candidate) => candidate.id === member.personId,
                    );
                    return (
                      <View
                        key={`${member.personId ?? member.inviteTarget}:${index}`}
                        style={styles.mobileRosterPlayer}
                      >
                        <View style={styles.miniAvatar}>
                          <Text style={styles.miniAvatarText}>
                            {person?.initials ?? "✉"}
                          </Text>
                        </View>
                        <Text numberOfLines={1} style={styles.mobileRosterName}>
                          {person?.displayName ??
                            member.displayName ??
                            "Invite"}
                        </Text>
                        <Pressable
                          onPress={() =>
                            setTeamRoster((current) =>
                              current.filter(
                                (_, memberIndex) => memberIndex !== index,
                              ),
                            )
                          }
                        >
                          <Text style={styles.mobileRosterRemove}>Remove</Text>
                        </Pressable>
                      </View>
                    );
                  })}
                  {Array.from({
                    length: Math.max(
                      0,
                      selectedTeamSize - 1 - teamRoster.length,
                    ),
                  }).map((_, index) => (
                    <View
                      key={`open:${index}`}
                      style={styles.mobileRosterPlayer}
                    >
                      <View style={styles.mobileRosterOpen}>
                        <Text style={styles.mobileRosterOpenText}>+</Text>
                      </View>
                      <Text style={styles.mobileRosterName}>Open</Text>
                      <Text style={styles.mobileRosterStatus}>Teammate</Text>
                    </View>
                  ))}
                </View>
                {teamRoster.length < selectedTeamSize - 1 && (
                  <>
                    <View style={styles.mobilePlayerSearch}>
                      <Text style={styles.mobilePlayerSearchIcon}>⌕</Text>
                      <TextInput
                        onChangeText={searchTeammates}
                        placeholder="Player, location, or rating"
                        placeholderTextColor={colors.muted}
                        style={styles.mobilePlayerSearchInput}
                        value={teammateQuery}
                      />
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.mobileSuggestionRail}
                    >
                      {teammateCandidates
                        .filter(
                          (candidate) =>
                            !teamRoster.some(
                              (member) =>
                                member.personId === candidate.person.id,
                            ),
                        )
                        .map((candidate) => (
                          <View
                            key={candidate.person.id}
                            style={[
                              styles.mobileSuggestionCard,
                              !candidate.eligible &&
                                styles.mobileSuggestionCardDisabled,
                            ]}
                          >
                            {candidate.person.avatarUrl ? (
                              <Image
                                source={{ uri: candidate.person.avatarUrl }}
                                style={styles.mobileSuggestionAvatar}
                              />
                            ) : (
                              <View
                                style={styles.mobileSuggestionAvatarFallback}
                              >
                                <Text style={styles.miniAvatarText}>
                                  {candidate.person.initials}
                                </Text>
                              </View>
                            )}
                            <Text
                              numberOfLines={1}
                              style={styles.mobileSuggestionName}
                            >
                              {candidate.person.displayName}
                            </Text>
                            <Text
                              numberOfLines={1}
                              style={styles.mobileSuggestionMeta}
                            >
                              {candidate.person.homeMarket}
                            </Text>
                            <Text style={styles.mobileSuggestionMeta}>
                              {candidate.gender.replaceAll("-", " ")} ·{" "}
                              {candidate.person.rating.display.toFixed(2)}
                            </Text>
                            <Text
                              numberOfLines={3}
                              style={[
                                styles.mobileSuggestionEligibility,
                                candidate.eligible
                                  ? styles.mobileSuggestionEligible
                                  : styles.mobileSuggestionIneligible,
                              ]}
                            >
                              {candidate.eligible
                                ? `Eligible${division ? ` for ${division.name}` : ""}`
                                : candidate.eligibilityReasons.join(" · ") ||
                                  "This player does not meet the division criteria"}
                            </Text>
                            <Pressable
                              disabled={!candidate.eligible}
                              onPress={() =>
                                setTeamRoster((current) => [
                                  ...current,
                                  {
                                    personId: candidate.person.id,
                                    displayName: candidate.person.displayName,
                                  },
                                ])
                              }
                              style={[
                                styles.mobileSuggestionAdd,
                                !candidate.eligible &&
                                  styles.mobileSuggestionAddDisabled,
                              ]}
                            >
                              <Text style={styles.mobileSuggestionAddText}>
                                {candidate.eligible ? "Add" : "Not eligible"}
                              </Text>
                            </Pressable>
                          </View>
                        ))}
                    </ScrollView>
                    <View style={styles.mobileInviteRow}>
                      <TextInput
                        onChangeText={setInviteTarget}
                        placeholder="Email or mobile number"
                        placeholderTextColor={colors.muted}
                        style={styles.mobileInviteInput}
                        value={inviteTarget}
                      />
                      <Pressable
                        disabled={inviteTarget.trim().length < 3}
                        onPress={() => {
                          const value = inviteTarget.trim();
                          if (!value) return;
                          setTeamRoster((current) => [
                            ...current,
                            { inviteTarget: value, displayName: value },
                          ]);
                          setInviteTarget("");
                        }}
                        style={styles.mobileInviteButton}
                      >
                        <Text style={styles.mobileInviteButtonText}>
                          Invite
                        </Text>
                      </Pressable>
                    </View>
                  </>
                )}
                <View style={styles.mobileTeamPaymentChoices}>
                  <Pressable
                    onPress={() => setTeamPaymentMode("self")}
                    style={[
                      styles.mobileTeamPaymentChoice,
                      teamPaymentMode === "self" &&
                        styles.mobileTeamPaymentChoiceActive,
                    ]}
                  >
                    <Text style={styles.rowTitle}>Pay my registration</Text>
                    <Text style={styles.rowMeta}>Teammates claim + pay</Text>
                    <Text style={styles.moneyAmount}>
                      {formatMoney(
                        division?.playerPrice.amountMinor ??
                          listedPrice.amountMinor,
                        division?.playerPrice.currency ?? listedPrice.currency,
                      )}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setTeamPaymentMode("team")}
                    style={[
                      styles.mobileTeamPaymentChoice,
                      teamPaymentMode === "team" &&
                        styles.mobileTeamPaymentChoiceActive,
                    ]}
                  >
                    <Text style={styles.rowTitle}>Pay for the team</Text>
                    <Text style={styles.rowMeta}>You cover every player</Text>
                    <Text style={styles.moneyAmount}>
                      {formatMoney(
                        division?.teamPrice.amountMinor ??
                          listedPrice.amountMinor,
                        division?.teamPrice.currency ?? listedPrice.currency,
                      )}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
            {event.features && event.features.length > 0 && (
              <View style={styles.checkoutSection}>
                <Text style={styles.eyebrow}>EVENT FEATURES</Text>
                {event.features.map((feature) =>
                  feature.kind === "guest" ? (
                    <Pressable
                      disabled={!feature.personHandle}
                      key={feature.id}
                      onPress={() =>
                        feature.personHandle
                          ? void WebBrowser.openBrowserAsync(
                              `${dunaWebUrl}/players/${feature.personHandle}`,
                            )
                          : undefined
                      }
                      style={styles.mobileGuestCard}
                    >
                      {feature.imageUrl ? (
                        <Image
                          source={{ uri: feature.imageUrl }}
                          style={styles.mobileGuestImage}
                        />
                      ) : (
                        <View style={styles.mobileGuestImageFallback}>
                          <Text style={styles.mobileGuestInitials}>
                            {feature.personInitials ?? "★"}
                          </Text>
                        </View>
                      )}
                      <View style={styles.flex}>
                        <Text style={styles.mobileGuestLabel}>
                          FEATURED GUEST
                        </Text>
                        <Text style={styles.mobileGuestName}>
                          {feature.personName ?? feature.title}
                        </Text>
                        <Text style={styles.mobileGuestMeta}>
                          {[
                            feature.personHomeMarket,
                            feature.personRating !== undefined
                              ? `${feature.personRating.toFixed(2)} rating`
                              : undefined,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                        {feature.description && (
                          <Text numberOfLines={3} style={styles.rowMeta}>
                            {feature.description}
                          </Text>
                        )}
                        {feature.personHandle && (
                          <Text style={styles.mobileGuestLink}>
                            View profile →
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  ) : (
                    <View key={feature.id} style={styles.mobileFeatureRow}>
                      <Text style={styles.mobileFeatureIcon}>
                        {feature.kind === "activity" ? "✦" : "◇"}
                      </Text>
                      <View style={styles.flex}>
                        <Text style={styles.rowTitle}>{feature.title}</Text>
                        {feature.description && (
                          <Text style={styles.rowMeta}>
                            {feature.description}
                          </Text>
                        )}
                      </View>
                    </View>
                  ),
                )}
              </View>
            )}
            {event.policies?.some((policy) => policy.kind !== "waiver") && (
              <View style={styles.checkoutSection}>
                <Text style={styles.eyebrow}>AGREEMENTS</Text>
                <Text style={styles.checkoutSummaryText}>
                  Read every required document here. Each acceptance is stored
                  with the exact version shown to you.
                </Text>
                <View style={styles.mobilePolicyList}>
                  {event.policies
                    .filter((policy) => policy.kind !== "waiver")
                    .map((policy) => {
                      const accepted = acceptedPolicyIds.includes(policy.id);
                      const document: MobilePolicyReviewDocument = policy;
                      return (
                        <MobilePolicyReviewCard
                          accepted={accepted}
                          key={policy.id}
                          onPress={() => {
                            selectionHaptic();
                            setReviewingPolicyId(policy.id);
                          }}
                          policy={document}
                        />
                      );
                    })}
                </View>
              </View>
            )}
            <View style={styles.orderMath}>
              <View>
                <Text style={styles.bodyText}>
                  {purchaseKind === "ticket"
                    ? `${ticketQuantity} ticket${ticketQuantity === 1 ? "" : "s"}`
                    : teamPaymentMode === "team" && selectedTeamSize > 1
                      ? "Full team entry"
                      : "Player entry"}
                </Text>
                <Text style={styles.moneyAmount}>
                  {formatMoney(listedSubtotalMinor, listedPrice.currency)}
                </Text>
              </View>
              <View>
                <Text style={styles.bodyText}>Taxes and service fees</Text>
                <Text style={styles.moneyAmount}>Calculated securely</Text>
              </View>
              <View style={styles.totalRow}>
                <Text style={styles.rowTitle}>Listed price</Text>
                <Text style={styles.totalAmount}>
                  {formatMoney(listedSubtotalMinor, listedPrice.currency)}
                </Text>
              </View>
            </View>
            {error && <Text style={styles.formError}>{error}</Text>}
            <Pressable
              disabled={
                mode === "preview" ||
                busy ||
                !rosterComplete ||
                !policiesComplete ||
                (purchaseKind === "entry" &&
                  !selectedParticipantEligibility.eligible)
              }
              onPress={() => void checkout()}
              style={[
                styles.payButton,
                (mode === "preview" ||
                  busy ||
                  !rosterComplete ||
                  !policiesComplete ||
                  (purchaseKind === "entry" &&
                    !selectedParticipantEligibility.eligible)) &&
                  styles.buttonDisabled,
              ]}
            >
              <Text style={styles.payButtonText}>
                {mode === "preview"
                  ? "Preview only · checkout disabled"
                  : busy
                    ? "Preparing in-app payment…"
                    : !rosterComplete
                      ? "Complete your team"
                      : !policiesComplete
                        ? "Accept required agreements"
                        : listedSubtotalMinor
                          ? "Choose payment method"
                          : purchaseKind === "ticket"
                            ? "Confirm free tickets"
                            : "Confirm free registration"}
              </Text>
            </Pressable>
            <Text style={styles.paymentTrust}>
              Eligibility, capacity, pricing, and guardian requirements are
              rechecked by Duna before registration.
            </Text>
          </ScrollView>
        )}
        <PolicyReviewModal
          accepted={Boolean(
            reviewingPolicy && acceptedPolicyIds.includes(reviewingPolicy.id),
          )}
          onAccept={() => {
            if (!reviewingPolicy) return;
            setReadPolicyIds((current) =>
              current.includes(reviewingPolicy.id)
                ? current
                : [...current, reviewingPolicy.id],
            );
            setAcceptedPolicyIds((current) =>
              current.includes(reviewingPolicy.id)
                ? current
                : [...current, reviewingPolicy.id],
            );
            setReviewingPolicyId(undefined);
          }}
          onClose={() => setReviewingPolicyId(undefined)}
          policy={reviewingPolicy}
          read={Boolean(
            reviewingPolicy && readPolicyIds.includes(reviewingPolicy.id),
          )}
          visible={Boolean(reviewingPolicy)}
        />
      </SafeAreaView>
    </Modal>
  );
}
