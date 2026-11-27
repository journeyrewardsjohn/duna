import { formatMoney, formatVenueTime, type PersonSummary } from "@duna/core";
import { demoPlayer } from "@duna/core/demo";
import * as Contacts from "expo-contacts";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { dunaWebUrl } from "../../../mobile-api";
import { presentNativeEventPayment } from "../../../native-payments";
import { usePlayerRuntime } from "../../../runtime";
import { MatchHostPanel } from "../../../match-host-panel";
import {
  BookingConfirmationView,
  type BookingReceiptRow,
  type ShareableBookingDetails,
} from "../../../booking-share";
import { PlayerPickerModal, PlayerProfileSheet } from "../../../player-social";
import { presentThenPollCheckout } from "../../../event-checkout-state";
import { PlayerAvatar } from "../../../components/player-identity";
import { ConfirmingReservation } from "../../../components/confirming-reservation";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "../../../satoshi-text";
import { colors } from "../../shared/palette";
import { useReducedMotion } from "../../shared/use-reduced-motion";
import type {
  CourtInventory,
  CourtAvailability,
  CourtCheckoutQuote,
  BookingParticipant,
} from "./court-types";
import { displayError } from "../../shared/display-error";
import { selectionHaptic, successHaptic } from "../../shared/haptics";
import { weatherSymbol, fahrenheit } from "../../shared/weather";
import {
  type MobilePolicyReviewDocument,
  MobilePolicyReviewCard,
  PolicyReviewModal,
} from "../../shared/policy-review-modal";
import {
  localDateValue,
  localDateAnchor,
  addLocalDateDays,
  localDateDistance,
  shortLocalWeekday,
  instantLocalDateValue,
  localSlotTime,
} from "./local-dates";
import {
  type MobileCalendarMarker,
  BookingCalendarModal,
} from "./BookingCalendarModal";
import { styles } from "../../legacy/styles";

function courtCheckoutParticipants(
  participants: readonly BookingParticipant[],
) {
  return participants.map((participant) => ({
    ...(participant.personId ? { personId: participant.personId } : {}),
    ...(participant.name ? { name: participant.name } : {}),
    ...(participant.email ? { email: participant.email } : {}),
    ...(participant.phoneE164 ? { phoneE164: participant.phoneE164 } : {}),
  }));
}

function contactPhoneE164(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (value.trim().startsWith("+") && digits.length >= 8) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return undefined;
}

export function VenueBookingModal({
  initialDate,
  initialDurationMinutes,
  initialIntent = "private",
  venueId,
  visible,
  onClose,
  onOpenMatch,
}: {
  readonly initialDate?: string;
  readonly initialDurationMinutes?: number;
  readonly initialIntent?: "private" | "host";
  readonly venueId?: string;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onOpenMatch?: (matchId: string, matchSlug: string) => void;
}) {
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const { client, dashboard, mode, publicClient, refresh } = usePlayerRuntime();
  const courtClient = publicClient ?? client;
  const [todayValue] = useState(() => localDateValue(new Date()));
  const [inventory, setInventory] = useState<CourtInventory>();
  const [availability, setAvailability] = useState<CourtAvailability>();
  const [selectedDate, setSelectedDate] = useState(todayValue);
  const [dateRangeEnd, setDateRangeEnd] = useState(() =>
    addLocalDateDays(todayValue, 90),
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [selectedLocalStart, setSelectedLocalStart] = useState<string>();
  const [selectedSlot, setSelectedSlot] =
    useState<CourtAvailability["slots"][number]>();
  const [bookingIntent, setBookingIntent] = useState<"private" | "host">(
    initialIntent,
  );
  const [paymentMode, setPaymentMode] = useState<"full" | "split">("full");
  const [participants, setParticipants] = useState<BookingParticipant[]>([]);
  const [quote, setQuote] = useState<CourtCheckoutQuote>();
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [profilePerson, setProfilePerson] = useState<PersonSummary>();
  const [contactOptions, setContactOptions] = useState<BookingParticipant[]>(
    [],
  );
  const [manualName, setManualName] = useState("");
  const [manualTarget, setManualTarget] = useState("");
  const [inviteError, setInviteError] = useState<string>();
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [policyRead, setPolicyRead] = useState(false);
  const [policyReviewOpen, setPolicyReviewOpen] = useState(false);
  const [timeSelectionCommitted, setTimeSelectionCommitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [lookingPostId, setLookingPostId] = useState<string>();
  const [confirmation, setConfirmation] = useState<{
    readonly bookingId: string;
    readonly details: ShareableBookingDetails;
    readonly label: string;
    readonly title: string;
    readonly body: string;
    readonly receipt?: readonly BookingReceiptRow[];
    readonly match?: {
      readonly id: string;
      readonly slug: string;
      readonly title: string;
    };
  }>();
  const bookingDateScrollRef = useRef<ScrollView>(null);
  const bookingDateScrollX = useRef(0);
  const dateRailPositioned = useRef(false);

  const dates = Array.from(
    { length: localDateDistance(todayValue, dateRangeEnd) + 1 },
    (_, index) => addLocalDateDays(todayValue, index),
  );

  const extendDateRange = (requiredEnd?: string) => {
    setDateRangeEnd((current) => {
      if (requiredEnd && requiredEnd <= current) return current;
      let next = addLocalDateDays(current, 90);
      while (requiredEnd && next < requiredEnd) {
        next = addLocalDateDays(next, 90);
      }
      return next;
    });
  };
  const calendarMarkers = useMemo(() => {
    const next = new Map<string, MobileCalendarMarker>();
    const addMarker = (date: string, tone: "booking" | "event") => {
      const current = next.get(date) ?? {
        booking: false,
        event: false,
        count: 0,
      };
      next.set(date, {
        booking: current.booking || tone === "booking",
        event: current.event || tone === "event",
        count: current.count + 1,
      });
    };
    for (const booking of dashboard?.bookings ?? []) {
      addMarker(
        instantLocalDateValue(booking.startsAt, "America/Los_Angeles"),
        "booking",
      );
    }
    for (const event of dashboard?.events ?? []) {
      if (event.lifecycleStatus === "cancelled") continue;
      if (
        dashboard?.bookings.some(
          (booking) =>
            booking.title === event.title &&
            booking.startsAt === event.startsAt,
        )
      ) {
        continue;
      }
      addMarker(instantLocalDateValue(event.startsAt, event.timezone), "event");
    }
    return next;
  }, [dashboard]);
  const durations = [
    ...new Set(
      inventory?.courts.flatMap((court) => court.durationOptionsMinutes) ?? [
        60, 90, 120,
      ],
    ),
  ].sort((left, right) => left - right);
  const selectedCourt = inventory?.courts.find(
    (court) => court.id === selectedSlot?.courtId,
  );
  const policy = selectedCourt?.cancellationPolicy;
  const policyDocument: MobilePolicyReviewDocument | undefined = policy
    ? {
        id: `court-policy-${selectedCourt?.id ?? "selected"}`,
        kind: "policy",
        markdown: policy.markdown,
        required: true,
        requireFullScroll: policy.requireFullScroll,
        title: policy.title,
      }
    : undefined;
  const policyReady =
    policyAccepted && (!policy?.requireFullScroll || policyRead);
  const listedMinor = selectedSlot?.price?.amountMinor ?? 0;
  const listedCurrency = selectedSlot?.price?.currency ?? "USD";
  /**
   * The court slot price is the public non-member subtotal. Only the server can
   * price this buyer, so the confirm surface waits for the quote rather than
   * showing a number Stripe will not charge.
   */
  const priceCurrency = quote?.currency ?? listedCurrency;
  const totalMinor = quote ? quote.totalMinor : undefined;
  const shareMinor = quote ? quote.payNowMinor : undefined;
  const participantShareMinor = quote?.participantShareMinor;
  const priceReady = Boolean(quote) || !selectedSlot;
  const freeReservation = quote?.totalMinor === 0;
  const selectedForecastDay = availability?.forecast?.days.find(
    (day) => day.date === selectedDate,
  );
  const timeOptions = useMemo(
    () =>
      [
        ...new Set([
          ...(availability?.slots ?? []).map((slot) => slot.localStartsAt),
          ...(availability?.openMatches ?? []).map(
            (match) => match.localStartsAt,
          ),
        ]),
      ].sort(),
    [availability],
  );
  const selectedOpenMatches = (availability?.openMatches ?? []).filter(
    (match) => match.localStartsAt === selectedLocalStart,
  );
  const selectedStartSlots = (availability?.slots ?? []).filter(
    (slot) => slot.localStartsAt === selectedLocalStart,
  );
  const selectedPlayWindow = selectedOpenMatches[0] ?? selectedStartSlots[0];
  const selectedDunaPlayers = useMemo(
    () =>
      participants.flatMap((participant) =>
        participant.person ? [participant.person] : [],
      ),
    [participants],
  );

  useEffect(() => {
    if (
      !visible ||
      !client ||
      mode === "preview" ||
      !venueId ||
      !selectedPlayWindow
    ) {
      setLookingPostId(undefined);
      return;
    }
    let cancelled = false;
    void client.player.matchAvailability
      .query()
      .then((posts) => {
        if (cancelled) return;
        const matching = posts.find(
          (post) =>
            post.venueId === venueId &&
            post.startsAt === selectedPlayWindow.startsAt &&
            post.endsAt === selectedPlayWindow.endsAt,
        );
        setLookingPostId(matching?.id);
      })
      .catch(() => {
        if (!cancelled) setLookingPostId(undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [
    client,
    mode,
    selectedPlayWindow?.endsAt,
    selectedPlayWindow?.startsAt,
    venueId,
    visible,
  ]);

  useEffect(() => {
    if (!visible) return;
    if (initialDate && initialDate >= todayValue) setSelectedDate(initialDate);
    if (initialDurationMinutes) setDurationMinutes(initialDurationMinutes);
    setBookingIntent(initialIntent);
  }, [initialDate, initialDurationMinutes, initialIntent, todayValue, visible]);

  useEffect(() => {
    if (!visible) {
      dateRailPositioned.current = false;
      setConfirmation(undefined);
      setConfirming(false);
      return;
    }
    if (dateRailPositioned.current) return;
    if (selectedDate < todayValue || selectedDate > dateRangeEnd) return;
    const index = localDateDistance(todayValue, selectedDate);
    const frame = requestAnimationFrame(() => {
      const target = Math.max(0, index * 72 - (width - 64) / 2);
      bookingDateScrollRef.current?.scrollTo({
        animated: false,
        x: target,
      });
      dateRailPositioned.current = true;
    });
    return () => cancelAnimationFrame(frame);
  }, [dateRangeEnd, selectedDate, todayValue, visible, width]);

  useEffect(() => {
    if (!visible || !venueId || !courtClient) return;
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    void courtClient.public.courtBookingInventory
      .query({ venueId })
      .then((nextInventory) => {
        if (cancelled) return;
        setInventory(nextInventory);
        const options = [
          ...new Set(
            nextInventory.courts.flatMap(
              (court) => court.durationOptionsMinutes,
            ),
          ),
        ];
        setDurationMinutes(
          initialDurationMinutes && options.includes(initialDurationMinutes)
            ? initialDurationMinutes
            : options.includes(90)
              ? 90
              : (options[0] ?? 60),
        );
      })
      .catch((reason) => {
        if (!cancelled) setError(displayError(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [courtClient, initialDurationMinutes, venueId, visible]);

  useEffect(() => {
    if (!visible || !venueId || !courtClient || !inventory) return;
    let cancelled = false;
    setLoading(true);
    setAvailabilityLoading(true);
    setAvailability(undefined);
    setSelectedSlot(undefined);
    setSelectedLocalStart(undefined);
    setTimeSelectionCommitted(false);
    setPolicyAccepted(false);
    setPolicyRead(false);
    setPolicyReviewOpen(false);
    void courtClient.public.courtAvailability
      .query({
        venueId,
        date: selectedDate,
        durationMinutes,
      })
      .then((nextAvailability) => {
        if (cancelled) return;
        setAvailability(nextAvailability);
        const firstStart = [
          ...nextAvailability.slots.map((slot) => slot.localStartsAt),
          ...nextAvailability.openMatches.map((match) => match.localStartsAt),
        ].sort()[0];
        setSelectedLocalStart(firstStart);
      })
      .catch((reason) => {
        if (!cancelled) setError(displayError(reason));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setAvailabilityLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [courtClient, durationMinutes, inventory, selectedDate, venueId, visible]);

  useEffect(() => {
    if (!client || !selectedSlot || mode === "preview") {
      setQuote(undefined);
      setQuoteLoading(false);
      return;
    }
    let cancelled = false;
    setQuoteLoading(true);
    void client.player.courtCheckoutQuote
      .query({
        courtId: selectedSlot.courtId,
        localStartsAt: selectedSlot.localStartsAt,
        durationMinutes,
        paymentMode,
        participants: courtCheckoutParticipants(participants),
      })
      .then((nextQuote) => {
        if (!cancelled) setQuote(nextQuote);
      })
      .catch((reason) => {
        if (cancelled) return;
        setQuote(undefined);
        setError(displayError(reason));
      })
      .finally(() => {
        if (!cancelled) setQuoteLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    client,
    durationMinutes,
    mode,
    participants,
    paymentMode,
    selectedSlot?.courtId,
    selectedSlot?.localStartsAt,
  ]);

  function reviewSlot(
    slot: CourtAvailability["slots"][number],
    intent: "private" | "host",
  ) {
    selectionHaptic();
    setBookingIntent(intent);
    setPaymentMode("full");
    setParticipants([]);
    setQuote(undefined);
    setPolicyAccepted(false);
    setPolicyRead(false);
    setPolicyReviewOpen(false);
    setSelectedSlot(slot);
  }

  function addParticipant(participant: BookingParticipant) {
    const key =
      participant.personId ?? participant.email ?? participant.phoneE164;
    if (!key) {
      setInviteError("That contact has no email address or mobile number.");
      return;
    }
    if (
      participants.some(
        (item) =>
          (item.personId ?? item.email ?? item.phoneE164)?.toLowerCase() ===
          key.toLowerCase(),
      )
    ) {
      setInviteError(
        `${participant.name ?? "That player"} is already on this reservation.`,
      );
      return;
    }
    setInviteError(undefined);
    setParticipants((current) => [...current, participant]);
  }

  function addManualParticipant() {
    const value = manualTarget.trim();
    const email = value.includes("@") ? value.toLowerCase() : undefined;
    const phoneE164 = email ? undefined : contactPhoneE164(value);
    if (!email && !phoneE164) {
      setInviteError(
        "Enter an email address, or a mobile number with its country code.",
      );
      return;
    }
    addParticipant({
      name: manualName.trim() || undefined,
      email,
      phoneE164,
    });
    setManualName("");
    setManualTarget("");
  }

  async function importContacts() {
    try {
      const permission = await Contacts.requestPermissionsAsync();
      if (permission.status !== "granted") {
        setError("Contacts permission was not granted.");
        return;
      }
      const result = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
        pageSize: 40,
        sort: Contacts.SortTypes.UserDefault,
      });
      const options = result.data
        .map((contact) => {
          const email = contact.emails?.[0]?.email?.trim().toLowerCase();
          const phoneE164 = contactPhoneE164(contact.phoneNumbers?.[0]?.number);
          return {
            name: contact.name || undefined,
            email: email || undefined,
            phoneE164,
          } satisfies BookingParticipant;
        })
        .filter((contact) => contact.email || contact.phoneE164)
        .slice(0, 20);
      setContactOptions(options);
      setNotice(
        "Contacts stay on this device. Duna receives only people you add.",
      );
    } catch (reason) {
      setError(displayError(reason));
    }
  }

  async function createAlert() {
    if (!client || !venueId || mode === "preview") return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await client.player.createAvailabilityAlert.mutate({
        venueId,
        targetDate: selectedDate,
        durationMinutes,
        earliestMinute: 0,
        latestMinute: 1_440,
        channel: "push",
      });
      setNotice(
        result.premiumRequired
          ? "Your free priority alert is active. Premium unlocks additional simultaneous alerts."
          : "Priority alert created. We’ll notify you when a matching court opens.",
      );
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function toggleLookingToPlay() {
    if (!venueId || !selectedPlayWindow) {
      setError("Choose a time before saying you are looking to play.");
      return;
    }
    if (mode === "preview") {
      selectionHaptic();
      const active = Boolean(lookingPostId);
      setLookingPostId(active ? undefined : "preview-looking-to-play");
      setNotice(
        active
          ? "You are no longer shown as looking to play at this time."
          : "You’re now visible to match creators for this time. Invitations still require your acceptance—this does not reserve or charge for a court.",
      );
      return;
    }
    if (!client) return;
    setBusy(true);
    setError(undefined);
    try {
      if (lookingPostId) {
        await client.player.cancelMatchAvailability.mutate({
          postId: lookingPostId,
          idempotencyKey: Crypto.randomUUID(),
        });
        setLookingPostId(undefined);
        setNotice("You are no longer shown as looking to play at this time.");
        return;
      }
      const post = await client.player.createMatchAvailability.mutate({
        venueId,
        startsAt: selectedPlayWindow.startsAt,
        endsAt: selectedPlayWindow.endsAt,
        matchType: "either",
        genderPreference: "open",
        formatPreferences: [],
        note: "Open to an invitation for this time.",
        idempotencyKey: Crypto.randomUUID(),
      });
      setLookingPostId(post.id);
      setNotice(
        "You’re now visible to match creators for this time. Any invitation still requires your acceptance.",
      );
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  }

  async function checkout() {
    if (!client || !selectedSlot || !policyReady || mode === "preview") {
      return;
    }
    if (paymentMode === "split" && participants.length === 0) {
      setError("Add at least one player before splitting the payment.");
      return;
    }
    if (!quote) {
      setError(
        "Duna is still confirming this court price. Try again in a moment.",
      );
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const result = await client.player.startCourtCheckout.mutate({
        courtId: selectedSlot.courtId,
        localStartsAt: selectedSlot.localStartsAt.slice(0, 16),
        durationMinutes,
        paymentMode,
        paymentSurface: Platform.OS === "web" ? "hosted" : "native",
        createMatch: bookingIntent === "host",
        participants: courtCheckoutParticipants(participants),
        expectedPayNowMinor: quote.payNowMinor,
        expectedTotalMinor: quote.totalMinor,
        policyAccepted,
        policyFullScrollConfirmed: policyRead || !policy?.requireFullScroll,
        successUrl: `${dunaWebUrl}/app?court_checkout=success`,
        cancelUrl: `${dunaWebUrl}/app?court_checkout=cancelled`,
        idempotencyKey: Crypto.randomUUID(),
      });
      if (result.mode === "free" || result.paymentSheet || result.checkoutUrl) {
        let confirmed = result.mode === "free";
        let sharePaid = result.mode === "free";
        let awaitingParticipants = false;
        let match = result.match;
        if (result.paymentSheet) {
          const payment = await presentThenPollCheckout({
            present: () =>
              presentNativeEventPayment({
                paymentSheet: result.paymentSheet!,
                customerName: dashboard?.player.displayName,
              }),
            readStatus: () =>
              client.player.courtCheckoutStatus.query({
                paymentIntentId: result.paymentSheet!.paymentIntentId,
              }),
            isComplete: (status) =>
              status.sharePaid &&
              (bookingIntent !== "host" ||
                !status.complete ||
                Boolean(status.match)),
            maxPolls: 8,
            delayMs: (attempt) => (attempt < 3 ? 450 : 900),
            onPaymentCompleted: () => setConfirming(true),
          });
          if (payment.cancelled) return;
          const { status } = payment;
          confirmed = status.complete;
          sharePaid = status.sharePaid;
          awaitingParticipants = status.awaitingParticipants;
          match = status.match;
        } else if (result.checkoutUrl) {
          if (Platform.OS !== "web") {
            throw new Error(
              "Duna could not prepare the in-app payment. Your court is not charged; please try again.",
            );
          }
          await WebBrowser.openBrowserAsync(result.checkoutUrl);
          setConfirming(true);
          if (result.checkoutSessionId) {
            for (let attempt = 0; attempt < 8; attempt += 1) {
              const status = await client.player.courtCheckoutStatus.query({
                checkoutSessionId: result.checkoutSessionId,
              });
              confirmed = status.complete;
              sharePaid = status.sharePaid;
              awaitingParticipants = status.awaitingParticipants;
              match = status.match;
              if (
                sharePaid &&
                (bookingIntent !== "host" || !confirmed || Boolean(match))
              ) {
                break;
              }
              await new Promise<void>((resolve) =>
                setTimeout(resolve, attempt < 3 ? 500 : 1_000),
              );
            }
          }
        }
        if (
          bookingIntent === "host" &&
          confirmed &&
          result.bookingId &&
          !match
        ) {
          const recovered = await client.player.ensureCourtBookingMatch.mutate({
            bookingId: result.bookingId,
            idempotencyKey: Crypto.randomUUID(),
          });
          match = recovered.match;
        }
        successHaptic();
        await refresh();
        if (result.bookingId && inventory) {
          const playerNames = result.participants?.map(
            (participant) => participant.displayName,
          ) ?? [
            dashboard?.player.displayName ?? "You",
            ...participants.flatMap(
              (participant) =>
                participant.person?.displayName ??
                participant.name ??
                participant.email ??
                participant.phoneE164 ??
                [],
            ),
          ];
          const paidMinor = result.pricing?.payNowMinor ?? quote.payNowMinor;
          const paidCurrency = result.pricing?.currency ?? quote.currency;
          setConfirming(false);
          setConfirmation({
            bookingId: result.bookingId,
            match,
            details: {
              title: `Court rental · ${selectedSlot.courtName}`,
              startsAt: result.startsAt,
              endsAt: result.endsAt,
              timezone: inventory.venue.timezone,
              organizationName: inventory.venue.organizationName,
              locationName: inventory.venue.name,
              ...(inventory.venue.address
                ? { address: inventory.venue.address }
                : {}),
              courtName: selectedSlot.courtName,
              playerNames,
              detailsUrl: match
                ? `${dunaWebUrl}/events/${encodeURIComponent(match.slug)}`
                : `${dunaWebUrl}/venues/${inventory.venue.id}`,
            },
            receipt: [
              paidMinor === 0
                ? { label: "COST", value: "No charge" }
                : {
                    label: paymentMode === "split" ? "YOU PAID" : "PAID",
                    value: formatMoney(paidMinor, paidCurrency),
                  },
              ...(paymentMode === "split" && result.pricing
                ? [
                    {
                      label: "COURT TOTAL",
                      value: formatMoney(
                        result.pricing.totalMinor,
                        paidCurrency,
                      ),
                    },
                  ]
                : []),
            ],
            label: awaitingParticipants
              ? "Share paid"
              : confirmed
                ? "Confirmed"
                : sharePaid
                  ? "Payment received"
                  : "Processing",
            title: awaitingParticipants
              ? "Your court is held."
              : match
                ? "Court + match ready."
                : confirmed
                  ? "Court reserved."
                  : "Payment received.",
            body: awaitingParticipants
              ? "Your share is paid. Invited players have secure links for their shares; the booking confirms when everyone is paid."
              : match
                ? "Your reservation created one match. Invitations are sent; track every response or adjust the roster below."
                : confirmed
                  ? bookingIntent === "host"
                    ? "Your court is confirmed. Duna is still preparing the match and will keep it in your Plans."
                    : "Everything you need is below and ready to share."
                  : "Duna is finishing the confirmation and will keep this booking in your Plans.",
          });
        } else {
          setNotice(
            sharePaid
              ? "Payment received. Duna is finishing confirmation."
              : "The court payment is still processing.",
          );
        }
      } else {
        setError("That court is no longer available. Pick another time.");
      }
    } catch (reason) {
      setConfirming(false);
      setError(displayError(reason));
    } finally {
      setConfirming(false);
      setBusy(false);
    }
  }

  if (!visible) return null;
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
        {confirming ? (
          <ConfirmingReservation
            createsMatch={bookingIntent === "host"}
            palette={colors}
            reducedMotion={reducedMotion}
            venueName={inventory?.venue.name}
          />
        ) : confirmation ? (
          <BookingConfirmationView
            body={confirmation.body}
            details={confirmation.details}
            doneLabel="Done"
            label={confirmation.label}
            onDone={onClose}
            primaryAction={
              confirmation.match
                ? () => {
                    const match = confirmation.match;
                    onClose();
                    if (match) onOpenMatch?.(match.id, match.slug);
                  }
                : undefined
            }
            primaryLabel={confirmation.match ? "Open match details" : undefined}
            receipt={confirmation.receipt}
            title={confirmation.title}
          >
            {confirmation.match && client ? (
              <View style={styles.confirmationRoster}>
                <MatchHostPanel
                  client={client}
                  onRosterChanged={() => void refresh()}
                  palette={colors}
                  pickupSessionId={confirmation.match.id}
                />
              </View>
            ) : null}
          </BookingConfirmationView>
        ) : (
          <>
            <ScrollView
              contentContainerStyle={styles.modalContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.modalHeader}>
                <Pressable
                  onPress={
                    selectedSlot ? () => setSelectedSlot(undefined) : onClose
                  }
                >
                  <Text style={styles.closeText}>
                    {selectedSlot ? "‹" : "×"}
                  </Text>
                </Pressable>
                <Text style={styles.modalHeaderTitle}>
                  {selectedSlot
                    ? bookingIntent === "host"
                      ? "Create a match"
                      : "Review"
                    : initialIntent === "host"
                      ? "Reserve to host"
                      : "Find a game"}
                </Text>
                <View style={styles.modalHeaderSpacer} />
              </View>
              {inventory && (
                <>
                  <Text style={styles.bookingVenueName}>
                    {inventory.venue.name}
                  </Text>
                  <Text style={styles.checkoutMeta}>
                    {inventory.venue.city} · {inventory.venue.organizationName}
                  </Text>
                </>
              )}
              {!selectedSlot ? (
                <>
                  <View style={styles.bookingDateToolbar}>
                    <View style={styles.flex}>
                      <Text style={styles.bookingDateToolbarLabel}>
                        WHEN DO YOU WANT TO PLAY?
                      </Text>
                      <Text style={styles.bookingDateToolbarTitle}>
                        {localDateAnchor(selectedDate).toLocaleDateString(
                          "en-US",
                          {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          },
                        )}
                      </Text>
                    </View>
                    <View style={styles.bookingDateToolbarActions}>
                      <Pressable
                        accessibilityLabel="Show earlier dates"
                        onPress={() =>
                          bookingDateScrollRef.current?.scrollTo({
                            animated: true,
                            x: Math.max(0, bookingDateScrollX.current - 252),
                          })
                        }
                        style={styles.bookingDateNavButton}
                      >
                        <Text style={styles.bookingDateNavText}>‹</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel="Open full calendar"
                        onPress={() => {
                          selectionHaptic();
                          setCalendarOpen(true);
                        }}
                        style={styles.bookingDateCalendarButton}
                      >
                        <Text style={styles.bookingDateCalendarIcon}>▦</Text>
                        <Text style={styles.bookingDateCalendarText}>
                          Calendar
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel="Show later dates"
                        onPress={() => {
                          const target = bookingDateScrollX.current + 252;
                          if (target + width >= dates.length * 72 - width) {
                            extendDateRange();
                          }
                          bookingDateScrollRef.current?.scrollTo({
                            animated: true,
                            x: target,
                          });
                        }}
                        style={styles.bookingDateNavButton}
                      >
                        <Text style={styles.bookingDateNavText}>›</Text>
                      </Pressable>
                    </View>
                  </View>
                  <ScrollView
                    contentContainerStyle={styles.bookingDateRow}
                    horizontal
                    onScroll={(event) => {
                      const { contentOffset, contentSize, layoutMeasurement } =
                        event.nativeEvent;
                      bookingDateScrollX.current = contentOffset.x;
                      if (
                        contentOffset.x + layoutMeasurement.width >=
                        contentSize.width - layoutMeasurement.width
                      ) {
                        extendDateRange();
                      }
                    }}
                    ref={bookingDateScrollRef}
                    scrollEventThrottle={16}
                    showsHorizontalScrollIndicator={false}
                    style={styles.horizontalBleed}
                  >
                    {dates.map((value) => {
                      const date = localDateAnchor(value);
                      const active = value === selectedDate;
                      const marker = calendarMarkers.get(value);
                      return (
                        <Pressable
                          accessibilityLabel={`${date.toLocaleDateString(
                            "en-US",
                            {
                              weekday: "long",
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            },
                          )}${marker ? `, ${marker.count} scheduled` : ""}`}
                          key={value}
                          onPress={() => {
                            selectionHaptic();
                            setSelectedDate(value);
                          }}
                          style={[
                            styles.bookingDate,
                            active && styles.bookingDateActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.bookingDateDay,
                              active && styles.bookingDateTextActive,
                            ]}
                          >
                            {shortLocalWeekday(value)}
                          </Text>
                          <Text
                            style={[
                              styles.bookingDateNumber,
                              active && styles.bookingDateTextActive,
                            ]}
                          >
                            {date.getDate()}
                          </Text>
                          <Text
                            style={[
                              styles.bookingDateMonth,
                              active && styles.bookingDateTextActive,
                            ]}
                          >
                            {date.toLocaleDateString("en-US", {
                              month: "short",
                            })}
                          </Text>
                          <View style={styles.bookingDateDots}>
                            {marker?.booking && (
                              <View
                                style={[
                                  styles.bookingDateDot,
                                  styles.bookingDateDotBooking,
                                ]}
                              />
                            )}
                            {marker?.event && (
                              <View
                                style={[
                                  styles.bookingDateDot,
                                  styles.bookingDateDotEvent,
                                ]}
                              />
                            )}
                          </View>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                  <View style={styles.bookingDurationRow}>
                    {durations.map((duration) => (
                      <Pressable
                        key={duration}
                        onPress={() => {
                          selectionHaptic();
                          setDurationMinutes(duration);
                        }}
                        style={[
                          styles.bookingDuration,
                          duration === durationMinutes &&
                            styles.bookingDurationActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.bookingDurationText,
                            duration === durationMinutes &&
                              styles.bookingDurationTextActive,
                          ]}
                        >
                          {duration} min
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                  {selectedForecastDay && (
                    <View style={styles.bookingWeather}>
                      <Text style={styles.bookingWeatherIcon}>
                        {weatherSymbol(selectedForecastDay.icon)}
                      </Text>
                      <View style={styles.flex}>
                        <Text style={styles.rowTitle}>
                          {selectedForecastDay.condition} ·{" "}
                          {fahrenheit(selectedForecastDay.temperatureHighC)}
                        </Text>
                        <Text style={styles.rowMeta}>
                          {selectedForecastDay.sunriseAt
                            ? `Sunrise ${formatVenueTime(
                                selectedForecastDay.sunriseAt,
                                availability?.timezone ?? "UTC",
                                "en-US",
                                { hour: "numeric", minute: "2-digit" },
                              )}`
                            : "Sunrise pending"}
                          {" · "}
                          {selectedForecastDay.sunsetAt
                            ? `Sunset ${formatVenueTime(
                                selectedForecastDay.sunsetAt,
                                availability?.timezone ?? "UTC",
                                "en-US",
                                { hour: "numeric", minute: "2-digit" },
                              )}`
                            : "Sunset pending"}
                        </Text>
                      </View>
                      <Text style={styles.bookingWeatherUpdated}>
                        Updated{" "}
                        {availability?.forecast
                          ? formatVenueTime(
                              availability.forecast.updatedAt,
                              availability.timezone,
                              "en-US",
                              { hour: "numeric", minute: "2-digit" },
                            )
                          : ""}
                      </Text>
                    </View>
                  )}
                  {loading ? (
                    <Text style={styles.bookingEmpty}>
                      Finding open courts…
                    </Text>
                  ) : timeOptions.length ? (
                    <>
                      <Text style={styles.bookingTimeSectionLabel}>
                        OPEN COURTS + MATCHES
                      </Text>
                      {timeSelectionCommitted && selectedLocalStart ? (
                        <Pressable
                          accessibilityLabel="Change selected court time"
                          onPress={() => setTimeSelectionCommitted(false)}
                          style={styles.bookingSelectedTime}
                        >
                          <View style={styles.flex}>
                            <Text style={styles.bookingSelectedTimeLabel}>
                              SELECTED TIME
                            </Text>
                            <Text style={styles.bookingSelectedTimeValue}>
                              {localSlotTime(selectedLocalStart)} ·{" "}
                              {durationMinutes} min
                            </Text>
                          </View>
                          <Text style={styles.bookingSelectedTimeAction}>
                            Change
                          </Text>
                        </Pressable>
                      ) : (
                        <View style={styles.bookingTimeGrid}>
                          {timeOptions.map((localStartsAt) => {
                            const openMatches = (
                              availability?.openMatches ?? []
                            ).filter(
                              (match) => match.localStartsAt === localStartsAt,
                            );
                            const slotCount = (
                              availability?.slots ?? []
                            ).filter(
                              (slot) => slot.localStartsAt === localStartsAt,
                            ).length;
                            const active = selectedLocalStart === localStartsAt;
                            const players = openMatches
                              .flatMap((match) => [
                                match.host,
                                ...match.attendees.filter(
                                  (player) => player.id !== match.host.id,
                                ),
                              ])
                              .slice(0, 2);
                            return (
                              <Pressable
                                accessibilityLabel={`${localSlotTime(localStartsAt)}, ${
                                  openMatches.length
                                    ? `${openMatches.length} open match${openMatches.length === 1 ? "" : "es"}`
                                    : `${slotCount} open court${slotCount === 1 ? "" : "s"}`
                                }`}
                                key={localStartsAt}
                                onPress={() => {
                                  selectionHaptic();
                                  setSelectedLocalStart(localStartsAt);
                                  setTimeSelectionCommitted(true);
                                }}
                                style={[
                                  styles.bookingTimeOption,
                                  openMatches.length > 0 &&
                                    styles.bookingTimeOptionMatch,
                                  active && styles.bookingTimeOptionActive,
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.bookingTimeOptionTime,
                                    active &&
                                      styles.bookingTimeOptionTimeActive,
                                  ]}
                                >
                                  {localSlotTime(localStartsAt)}
                                </Text>
                                {players.length > 0 && (
                                  <View style={styles.bookingTimeRoster}>
                                    {players.map((player, index) =>
                                      player.avatarUrl ? (
                                        <Image
                                          key={`${player.id}-${index}`}
                                          source={{ uri: player.avatarUrl }}
                                          style={styles.bookingTimeAvatar}
                                        />
                                      ) : (
                                        <Text
                                          key={`${player.id}-${index}`}
                                          style={
                                            styles.bookingTimeAvatarFallback
                                          }
                                        >
                                          {player.initials}
                                        </Text>
                                      ),
                                    )}
                                  </View>
                                )}
                                <Text
                                  style={[
                                    styles.bookingTimeOptionMeta,
                                    active &&
                                      styles.bookingTimeOptionMetaActive,
                                  ]}
                                >
                                  {openMatches.length
                                    ? `${openMatches.length} open match${openMatches.length === 1 ? "" : "es"}`
                                    : `${slotCount} court${slotCount === 1 ? "" : "s"}`}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}

                      {selectedOpenMatches.length > 0 && (
                        <View style={styles.bookingOpenMatchSection}>
                          <Text style={styles.bookingTimeSectionLabel}>
                            RESERVE A PLACE IN A MATCH
                          </Text>
                          {selectedOpenMatches.map((match) => {
                            const roster = [
                              match.host,
                              ...match.attendees.filter(
                                (player) => player.id !== match.host.id,
                              ),
                            ];
                            const alreadyJoined = Boolean(
                              dashboard?.player.id &&
                              roster.some(
                                (player) => player.id === dashboard.player.id,
                              ),
                            );
                            const matchMinutes = Math.round(
                              (Date.parse(match.endsAt) -
                                Date.parse(match.startsAt)) /
                                60_000,
                            );
                            return (
                              <View
                                key={match.id}
                                style={styles.bookingOpenMatch}
                              >
                                <View style={styles.rowBetween}>
                                  <View style={styles.flex}>
                                    <Text
                                      style={styles.bookingOpenMatchEyebrow}
                                    >
                                      {match.matchType.toUpperCase()} ·{" "}
                                      {match.format}
                                    </Text>
                                    <Text style={styles.bookingOpenMatchTitle}>
                                      {match.title}
                                    </Text>
                                    <Text style={styles.rowMeta}>
                                      Hosted by {match.host.displayName}
                                    </Text>
                                  </View>
                                  <View
                                    style={styles.bookingOpenMatchPriceBlock}
                                  >
                                    <Text style={styles.bookingOpenMatchPrice}>
                                      {match.price.amountMinor
                                        ? formatMoney(
                                            match.price.amountMinor,
                                            match.price.currency,
                                          )
                                        : "Free"}
                                    </Text>
                                    <Text style={styles.rowMeta}>
                                      {matchMinutes} min
                                    </Text>
                                  </View>
                                </View>
                                <View style={styles.bookingOpenMatchRoster}>
                                  {roster.slice(0, 4).map((player) => (
                                    <View
                                      key={player.id}
                                      style={styles.bookingOpenMatchPlayer}
                                    >
                                      {player.avatarUrl ? (
                                        <Image
                                          source={{ uri: player.avatarUrl }}
                                          style={styles.bookingOpenMatchAvatar}
                                        />
                                      ) : (
                                        <Text
                                          style={
                                            styles.bookingOpenMatchAvatarFallback
                                          }
                                        >
                                          {player.initials}
                                        </Text>
                                      )}
                                      <Text
                                        numberOfLines={1}
                                        style={
                                          styles.bookingOpenMatchPlayerName
                                        }
                                      >
                                        {player.displayName.split(" ")[0]}
                                      </Text>
                                    </View>
                                  ))}
                                  {Array.from(
                                    {
                                      length: Math.min(2, match.spotsRemaining),
                                    },
                                    (_, index) => (
                                      <View
                                        key={`${match.id}-open-${index}`}
                                        style={styles.bookingOpenMatchPlayer}
                                      >
                                        <Text
                                          style={
                                            styles.bookingOpenMatchAvailable
                                          }
                                        >
                                          ＋
                                        </Text>
                                        <Text
                                          style={
                                            styles.bookingOpenMatchPlayerName
                                          }
                                        >
                                          Available
                                        </Text>
                                      </View>
                                    ),
                                  )}
                                </View>
                                <View style={styles.bookingOpenMatchFooter}>
                                  <Text style={styles.bookingOpenMatchSpots}>
                                    {match.spotsRemaining} spot
                                    {match.spotsRemaining === 1 ? "" : "s"} open
                                  </Text>
                                  <Pressable
                                    disabled={alreadyJoined}
                                    onPress={() =>
                                      onOpenMatch?.(match.id, match.slug)
                                    }
                                    style={[
                                      styles.bookingOpenMatchJoin,
                                      alreadyJoined && styles.buttonDisabled,
                                    ]}
                                  >
                                    <Text style={styles.payButtonText}>
                                      {alreadyJoined
                                        ? "You’re already in"
                                        : "Reserve a spot →"}
                                    </Text>
                                  </Pressable>
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {selectedStartSlots.length > 0 && (
                        <View style={styles.bookingCreateMatchSection}>
                          <Text style={styles.bookingTimeSectionLabel}>
                            {selectedOpenMatches.length
                              ? "OR RESERVE YOUR OWN COURT"
                              : "RESERVE YOUR OWN COURT"}
                          </Text>
                          {selectedStartSlots.map((slot) => (
                            <View
                              key={`${slot.courtId}-${slot.startsAt}`}
                              style={styles.bookingCourtChoice}
                            >
                              <View style={styles.flex}>
                                <Text style={styles.rowTitle}>
                                  {slot.courtName}
                                </Text>
                                <Text style={styles.rowMeta}>
                                  {slot.weather
                                    ? `${weatherSymbol(slot.weather.icon)} ${fahrenheit(slot.weather.temperatureC)} · `
                                    : ""}
                                  {durationMinutes} minutes
                                </Text>
                              </View>
                              <Text style={styles.bookingSlotPrice}>
                                {slot.price
                                  ? formatMoney(
                                      slot.price.amountMinor,
                                      slot.price.currency,
                                    )
                                  : "Free"}
                              </Text>
                              <View style={styles.bookingCourtActions}>
                                <Pressable
                                  onPress={() => reviewSlot(slot, "host")}
                                  style={styles.bookingHostButton}
                                >
                                  <Text style={styles.bookingHostButtonText}>
                                    {initialIntent === "host"
                                      ? "Reserve to host"
                                      : "Create a Match"}
                                  </Text>
                                </Pressable>
                                {initialIntent !== "host" && (
                                  <Pressable
                                    onPress={() => reviewSlot(slot, "private")}
                                    style={styles.bookingPrivateButton}
                                  >
                                    <Text
                                      style={styles.bookingPrivateButtonText}
                                    >
                                      Reserve private
                                    </Text>
                                  </Pressable>
                                )}
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </>
                  ) : (
                    <View style={styles.bookingEmptyCard}>
                      <Text style={styles.rowTitle}>
                        No matching court is open.
                      </Text>
                      <Text style={styles.bodyText}>
                        Create a priority alert and Duna will watch
                        cancellations and newly released inventory.
                      </Text>
                    </View>
                  )}
                  {Boolean(availability?.excludedAfterDarkCount) && (
                    <Text style={styles.bookingDaylightNote}>
                      ☾ {availability?.excludedAfterDarkCount} start
                      {availability?.excludedAfterDarkCount === 1
                        ? ""
                        : "s"}{" "}
                      hidden because this court is not lit after dark.
                    </Text>
                  )}
                  {selectedPlayWindow && (
                    <Pressable
                      accessibilityHint="Makes you visible to match creators for this time without reserving or charging for a court."
                      accessibilityRole="button"
                      accessibilityState={{
                        disabled: busy,
                        selected: Boolean(lookingPostId),
                      }}
                      disabled={busy}
                      onPress={() => void toggleLookingToPlay()}
                      style={[
                        styles.bookingLookingButton,
                        lookingPostId && styles.bookingLookingButtonActive,
                      ]}
                    >
                      <Text style={styles.bookingLookingIcon}>
                        {lookingPostId ? "✓" : "◎"}
                      </Text>
                      <View style={styles.flex}>
                        <Text style={styles.rowTitle}>
                          {lookingPostId
                            ? "You’re looking to play"
                            : "I’m looking to play"}
                        </Text>
                        <Text style={styles.rowMeta}>
                          {lookingPostId
                            ? "Tap to withdraw your availability."
                            : "Let match creators invite you for this time. You choose whether to accept."}
                        </Text>
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
                  )}
                  <Pressable
                    disabled={busy || mode === "preview"}
                    onPress={() => void createAlert()}
                    style={styles.bookingAlertButton}
                  >
                    <Text style={styles.bookingAlertIcon}>♢</Text>
                    <View style={styles.flex}>
                      <Text style={styles.rowTitle}>Priority alert</Text>
                      <Text style={styles.rowMeta}>
                        One active alert is included. Premium unlocks more.
                      </Text>
                    </View>
                    <Text style={styles.chevron}>›</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <View style={styles.bookingReviewCard}>
                    <Text style={styles.bookingReviewDate}>
                      {new Date(selectedSlot.startsAt).toLocaleDateString(
                        "en-US",
                        {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        },
                      )}
                    </Text>
                    <Text style={styles.bookingReviewTime}>
                      {localSlotTime(selectedSlot.localStartsAt)} –{" "}
                      {localSlotTime(selectedSlot.localEndsAt)}
                    </Text>
                    <Text style={styles.checkoutMeta}>
                      {selectedSlot.courtName} · {durationMinutes} minutes
                    </Text>
                  </View>
                  {bookingIntent === "host" && (
                    <View style={styles.bookingHostIntent}>
                      <Text style={styles.bookingHostIntentIcon}>✦</Text>
                      <View style={styles.flex}>
                        <Text style={styles.rowTitle}>
                          Reserve first, then publish.
                        </Text>
                        <Text style={styles.rowMeta}>
                          Duna carries this confirmed court, time, and venue
                          into the match builder. You choose the format, level,
                          and open spots next.
                        </Text>
                      </View>
                    </View>
                  )}
                  {(bookingIntent === "private" ||
                    bookingIntent === "host") && (
                    <>
                      <View style={styles.purchaseKindRow}>
                        {(["full", "split"] as const).map((modeOption) => (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityState={{
                              selected: paymentMode === modeOption,
                            }}
                            key={modeOption}
                            onPress={() => setPaymentMode(modeOption)}
                            style={[
                              styles.purchaseKindButton,
                              paymentMode === modeOption &&
                                styles.purchaseKindButtonActive,
                            ]}
                          >
                            <Text
                              style={[
                                styles.purchaseKindText,
                                paymentMode === modeOption &&
                                  styles.purchaseKindTextActive,
                              ]}
                            >
                              {modeOption === "full"
                                ? totalMinor === undefined
                                  ? "Pay everything"
                                  : `Pay everything · ${formatMoney(totalMinor, priceCurrency)}`
                                : paymentMode === "split" &&
                                    shareMinor !== undefined
                                  ? `Pay your part · ${formatMoney(shareMinor, priceCurrency)}`
                                  : "Pay your part"}
                            </Text>
                            <Text
                              style={[
                                styles.purchaseKindMeta,
                                paymentMode === modeOption &&
                                  styles.purchaseKindTextActive,
                              ]}
                            >
                              {modeOption === "full"
                                ? "You cover the whole court."
                                : participants.length === 0
                                  ? "Add players to split it."
                                  : `Split ${participants.length + 1} ways.`}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <View style={styles.checkoutSection}>
                        <Text style={styles.eyebrow}>PRICE</Text>
                        {quote ? (
                          <>
                            <View style={styles.checkoutPriceRow}>
                              <Text style={styles.rowMeta}>
                                Court · {durationMinutes} minutes
                              </Text>
                              <Text style={styles.checkoutPriceValue}>
                                {formatMoney(
                                  quote.subtotalMinor,
                                  quote.currency,
                                )}
                              </Text>
                            </View>
                            {quote.feeTotalMinor > 0 && (
                              <View style={styles.checkoutPriceRow}>
                                <Text style={styles.rowMeta}>
                                  Duna service fee
                                </Text>
                                <Text style={styles.checkoutPriceValue}>
                                  {formatMoney(
                                    quote.feeTotalMinor,
                                    quote.currency,
                                  )}
                                </Text>
                              </View>
                            )}
                            <View style={styles.checkoutPriceTotalRow}>
                              <Text style={styles.rowTitle}>Court total</Text>
                              <Text style={styles.checkoutPriceTotalValue}>
                                {formatMoney(quote.totalMinor, quote.currency)}
                              </Text>
                            </View>
                            {paymentMode === "split" && (
                              <View style={styles.checkoutPriceTotalRow}>
                                <Text style={styles.rowTitle}>You pay now</Text>
                                <Text style={styles.checkoutPriceTotalValue}>
                                  {formatMoney(
                                    quote.payNowMinor,
                                    quote.currency,
                                  )}
                                </Text>
                              </View>
                            )}
                            {quote.subtotalMinor > 0 &&
                              (quote.memberRateApplied ||
                                quote.dunaPlusApplied) && (
                                <Text style={styles.rowMeta}>
                                  {[
                                    quote.memberRateApplied
                                      ? "Member rate applied."
                                      : undefined,
                                    quote.dunaPlusApplied
                                      ? "Duna Plus waives the service fee."
                                      : undefined,
                                  ]
                                    .filter(Boolean)
                                    .join(" ")}
                                </Text>
                              )}
                            {listedMinor > 0 &&
                              listedMinor !== quote.subtotalMinor && (
                                <Text style={styles.rowMeta}>
                                  This venue lists{" "}
                                  {formatMoney(listedMinor, listedCurrency)} for
                                  this slot. Your price above is what Duna
                                  charges.
                                </Text>
                              )}
                          </>
                        ) : (
                          <>
                            {listedMinor > 0 && (
                              <View style={styles.checkoutPriceRow}>
                                <Text style={styles.rowMeta}>
                                  Venue lists this slot at
                                </Text>
                                <Text style={styles.checkoutPriceValue}>
                                  {formatMoney(listedMinor, listedCurrency)}
                                </Text>
                              </View>
                            )}
                            <Text style={styles.rowMeta}>
                              {mode === "preview"
                                ? "Sign in to see your own price, including any member rate or Duna Plus benefit."
                                : quoteLoading
                                  ? "Confirming your price for this court…"
                                  : "Duna could not confirm your price for this court yet."}
                            </Text>
                          </>
                        )}
                      </View>
                      <View style={styles.checkoutSection}>
                        <Text style={styles.rowTitle}>
                          {bookingIntent === "host"
                            ? "Build your match roster"
                            : "Add players"}
                        </Text>
                        <Text style={styles.rowMeta}>
                          Frequent partners first, then everyone on Duna.
                        </Text>
                        <Pressable
                          accessibilityLabel="Open player picker"
                          onPress={() => setShowPlayerPicker(true)}
                          style={styles.bookingPlayerPickerLaunch}
                        >
                          <View style={styles.bookingPlayerPickerPlus}>
                            <Text style={styles.bookingPlayerPickerPlusText}>
                              ＋
                            </Text>
                          </View>
                          <View style={styles.flex}>
                            <Text style={styles.bookingPlayerPickerTitle}>
                              {selectedDunaPlayers.length
                                ? `${selectedDunaPlayers.length} Duna player${selectedDunaPlayers.length === 1 ? "" : "s"} selected`
                                : "Choose Duna players"}
                            </Text>
                            <Text style={styles.bookingPlayerPickerBody}>
                              Search, review Sand Rating and reliability, then
                              add.
                            </Text>
                          </View>
                          <Text style={styles.chevron}>›</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => void importContacts()}
                          style={styles.bookingImportContact}
                        >
                          <Text style={styles.linkText}>
                            Add someone outside Duna from Contacts
                          </Text>
                        </Pressable>
                        {contactOptions.length > 0 && (
                          <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.bookingPartnerScroll}
                          >
                            <View style={styles.bookingPartnerRow}>
                              {contactOptions.map((contact) => {
                                const contactKey =
                                  contact.email ?? contact.phoneE164;
                                const added = participants.some(
                                  (participant) =>
                                    (
                                      participant.email ?? participant.phoneE164
                                    )?.toLowerCase() ===
                                    contactKey?.toLowerCase(),
                                );
                                return (
                                  <Pressable
                                    accessibilityLabel={`Invite ${contact.name ?? "this contact"} to the reservation`}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: added }}
                                    disabled={added}
                                    key={contactKey}
                                    onPress={() => addParticipant(contact)}
                                    style={[
                                      styles.bookingPartner,
                                      added && styles.buttonDisabled,
                                    ]}
                                  >
                                    <PlayerAvatar
                                      badge={added ? "selected" : "add"}
                                      displayName={contact.name ?? "Contact"}
                                      palette={colors}
                                      selected={added}
                                      size={54}
                                    />
                                    <Text
                                      numberOfLines={1}
                                      style={styles.bookingPartnerName}
                                    >
                                      {contact.name ?? "Contact"}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </View>
                          </ScrollView>
                        )}
                        <View style={styles.bookingManualInvite}>
                          <TextInput
                            onChangeText={setManualName}
                            placeholder="Name"
                            placeholderTextColor={colors.muted}
                            style={[styles.formInput, styles.bookingGuestInput]}
                            value={manualName}
                          />
                          <TextInput
                            autoCapitalize="none"
                            keyboardType="email-address"
                            onChangeText={(value) => {
                              setManualTarget(value);
                              setInviteError(undefined);
                            }}
                            onSubmitEditing={addManualParticipant}
                            placeholder="Email or mobile"
                            placeholderTextColor={colors.muted}
                            returnKeyType="done"
                            style={[styles.formInput, styles.bookingGuestInput]}
                            value={manualTarget}
                          />
                          <Pressable
                            accessibilityLabel="Add someone outside Duna to this reservation"
                            accessibilityRole="button"
                            disabled={manualTarget.trim().length === 0}
                            onPress={addManualParticipant}
                            style={[
                              styles.bookingAddButton,
                              manualTarget.trim().length === 0 &&
                                styles.buttonDisabled,
                            ]}
                          >
                            <Text style={styles.payButtonText}>Add</Text>
                          </Pressable>
                        </View>
                        {inviteError && (
                          <Text style={styles.formError}>{inviteError}</Text>
                        )}
                        {participants.length > 0 && (
                          <Text style={styles.bookingRosterLabel}>
                            ROSTER · {participants.length + 1} PLAYERS
                          </Text>
                        )}
                        {participants.map((participant, index) => (
                          <View
                            key={
                              participant.personId ??
                              participant.email ??
                              participant.phoneE164
                            }
                            style={styles.bookingParticipant}
                          >
                            <Pressable
                              accessibilityLabel={
                                participant.person
                                  ? `Open ${participant.person.displayName}'s profile`
                                  : undefined
                              }
                              accessibilityRole={
                                participant.person ? "button" : undefined
                              }
                              disabled={!participant.person}
                              onPress={() =>
                                participant.person &&
                                setProfilePerson(participant.person)
                              }
                              style={styles.bookingPlayerAvatarTarget}
                            >
                              <PlayerAvatar
                                badge="selected"
                                displayName={
                                  participant.name ??
                                  participant.email ??
                                  participant.phoneE164 ??
                                  "Player"
                                }
                                palette={colors}
                                person={participant.person}
                                selected
                                size={48}
                              />
                            </Pressable>
                            <View style={styles.flex}>
                              <Text style={styles.rowTitle}>
                                {participant.name ??
                                  participant.email ??
                                  participant.phoneE164}
                              </Text>
                              <Text style={styles.rowMeta}>
                                {paymentMode === "split"
                                  ? participantShareMinor === undefined
                                    ? "Pays an equal share"
                                    : `Pays ${formatMoney(participantShareMinor, priceCurrency)}`
                                  : participant.personId
                                    ? "Included in your reservation"
                                    : "Invited by email or text · included in your reservation"}
                              </Text>
                            </View>
                            <Pressable
                              accessibilityLabel={`Remove ${participant.name ?? participant.email ?? participant.phoneE164 ?? "player"}`}
                              accessibilityRole="button"
                              onPress={() =>
                                setParticipants((current) =>
                                  current.filter(
                                    (_, itemIndex) => itemIndex !== index,
                                  ),
                                )
                              }
                              style={styles.bookingRemovePlayer}
                            >
                              <Text style={styles.closeText}>×</Text>
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                  {policy && (
                    <View style={styles.checkoutSection}>
                      <Text style={styles.eyebrow}>CANCELLATION POLICY</Text>
                      {policyDocument && (
                        <MobilePolicyReviewCard
                          accepted={policyAccepted}
                          detail={`Refund until ${policy.refundBeforeHours ?? 0} hours before · ${policy.lateCancellation}`}
                          onPress={() => {
                            selectionHaptic();
                            setPolicyReviewOpen(true);
                          }}
                          policy={policyDocument}
                        />
                      )}
                    </View>
                  )}
                  <Pressable
                    disabled={
                      busy ||
                      mode === "preview" ||
                      !policyReady ||
                      !priceReady ||
                      (paymentMode === "split" && participants.length === 0) ||
                      (!freeReservation && !inventory?.venue.paymentsReady)
                    }
                    onPress={() => void checkout()}
                    style={[
                      styles.payButton,
                      (busy ||
                        mode === "preview" ||
                        !policyReady ||
                        !priceReady ||
                        (paymentMode === "split" &&
                          participants.length === 0) ||
                        (!freeReservation &&
                          !inventory?.venue.paymentsReady)) &&
                        styles.buttonDisabled,
                    ]}
                  >
                    <Text style={styles.payButtonText}>
                      {busy
                        ? "Opening secure checkout…"
                        : shareMinor === undefined
                          ? "Confirming price…"
                          : bookingIntent === "host"
                            ? paymentMode === "full"
                              ? `Reserve full court · ${formatMoney(shareMinor, priceCurrency)}`
                              : `Reserve your share · ${formatMoney(shareMinor, priceCurrency)}`
                            : `Continue · ${formatMoney(shareMinor, priceCurrency)}`}
                    </Text>
                  </Pressable>
                </>
              )}
              {notice && <Text style={styles.bookingNotice}>{notice}</Text>}
              {error && <Text style={styles.formError}>{error}</Text>}
            </ScrollView>
            <BookingCalendarModal
              availability={availability}
              availabilityLoading={availabilityLoading}
              markers={calendarMarkers}
              maxDate={dateRangeEnd}
              minDate={todayValue}
              onClose={() => setCalendarOpen(false)}
              onExtendRange={extendDateRange}
              onSelect={(date) => {
                if (date === selectedDate) return;
                setAvailabilityLoading(true);
                setSelectedDate(date);
              }}
              selectedDate={selectedDate}
              visible={calendarOpen}
            />
            <PolicyReviewModal
              accepted={policyAccepted}
              onAccept={() => {
                setPolicyRead(true);
                setPolicyAccepted(true);
                setPolicyReviewOpen(false);
              }}
              onClose={() => setPolicyReviewOpen(false)}
              policy={policyDocument}
              read={policyRead}
              visible={policyReviewOpen}
            />
            {profilePerson && (
              <PlayerProfileSheet
                onClose={() => setProfilePerson(undefined)}
                palette={colors}
                person={profilePerson}
                primaryAction={{
                  label: "Add Player",
                  activeLabel: "Added · Remove player",
                  active: true,
                  onPress: () => {
                    setParticipants((current) =>
                      current.filter(
                        (participant) =>
                          participant.personId !== profilePerson.id,
                      ),
                    );
                    setProfilePerson(undefined);
                  },
                }}
              />
            )}
            {showPlayerPicker && (
              <PlayerPickerModal
                excludedPersonIds={[dashboard?.player.id ?? demoPlayer.id]}
                maxSelected={11}
                onChange={(players) =>
                  setParticipants((current) => [
                    ...current.filter((participant) => !participant.personId),
                    ...players.map((person) => ({
                      personId: person.id,
                      name: person.displayName,
                      person,
                    })),
                  ])
                }
                onClose={() => setShowPlayerPicker(false)}
                palette={colors}
                presentationStyle="pageSheet"
                selected={selectedDunaPlayers}
                title="Add players"
                visible
              />
            )}
          </>
        )}
      </SafeAreaView>
    </Modal>
  );
}
