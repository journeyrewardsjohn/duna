/**
 * Book a court, ONE flow (M-P3; owner feedback 28 Nov, points 2 to 5,
 * images 37 to 42). Replaces the legacy `VenueBookingModal`, which asked for
 * the time a second time. The choice made on the court-times screen arrives
 * here and is never asked for again:
 *
 *   pick time and court → who's playing → pay → confirming → confirmed
 *
 * Everything the legacy modal did, on the same procedures: the person's own
 * quote (member rate and Duna Plus wording from the backend), pay everything
 * or pay your part (shares from the backend's quote), the roster from Duna
 * players (Sand Rating, reliability) and people outside Duna, the venue's
 * cancellation policy (read, to the end when required), Apple Pay or card
 * through the existing payment sheet, an open match with invitations, the
 * checkout status polled to the end, and errors with a reference. Open
 * matches at the chosen time, "I'm looking to play" and a priority alert live
 * on the time step (`CourtTimePicker`).
 *
 * Design (feedback standard a to g): grounds beyond Salt (Night Court for
 * confirming and the confirmed hero), the booker in the roster first with
 * their avatar, haptics on every step, one Jost title per step, back always
 * there until money moves, sheets that close, Dynamic Type, VoiceOver.
 */
import {
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import type { PersonSummary } from "@duna/core";
import { formatMoney } from "@duna/core";
import { report } from "@duna/observability";
import {
  Cross,
  Icon,
  LoadingState,
  ErrorState,
  Rally,
  Rise,
  Text,
  ThemeOverride,
  Title,
  useHaptics,
  useTheme,
  type GlyphName,
} from "@duna/ui/native";
import { AdaptiveSheet } from "@duna/ui/native/layout";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { buildBookingShareMessage } from "../../../../booking-share-message";
import { dunaWebUrl } from "../../../../mobile-api";
import { presentNativePayment } from "../../../../native-payments";
import { usePlayerRuntime } from "../../../../runtime";
import { PersonAvatar } from "../../../shared/PersonAvatar";
import { ActionButton } from "../../find/parts";
import type {
  BookingParticipant,
  CourtBookingRequest,
} from "../../courts/court-types";
import {
  addToCalendar,
  directionsUrl,
  openDirections,
} from "./calendar-and-places";
import {
  canContinue,
  checkoutSettled,
  confirmingPhase,
  courtFlowReducer,
  initialFlowState,
  moneyOutcome,
  MONEY_WORDS,
  type CheckoutStatusLike,
  type CourtFlowState,
  type MoneyOutcome,
} from "./court-flow";
import { localMinute, slotsAt } from "./court-times";
import { CourtTimePicker } from "./CourtTimePicker";
import { bookingInviteUrl, inviteMessage, matchUrl } from "./invite-links";
import { ActionRow, Card, Fact, Seat, SectionLabel, Segmented } from "./parts";
import { ReservationCrest } from "./ReservationCrest";
import {
  addGuest,
  guestKey,
  MAX_GUESTS,
  payLines,
  removeGuest,
  rosterSeats,
  withDunaPlayers,
  checkoutParticipants,
  type Booker,
} from "./roster";
import { DunaPlayersSheet, InviteSheet, PolicySheet } from "./sheets";
import {
  useCourtAvailability,
  useCourtInventory,
  useCourtQuote,
} from "./use-court-data";
import { VenueMap } from "./VenueMap";
import type { CourtFlowPreview } from "./preview-fixtures";

type Client = NonNullable<ReturnType<typeof usePlayerRuntime>["client"]>;
type CheckoutStatus = Awaited<
  ReturnType<Client["player"]["courtCheckoutStatus"]["query"]>
>;
type BookingRosterEntry = NonNullable<CheckoutStatus["participants"]>[number];

/** What the confirmed screen shows; built from the checkout's own answer. */
export interface ConfirmedBooking {
  readonly bookingId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  /** False while a split booking waits for the others' shares. */
  readonly complete: boolean;
  readonly awaitingParticipants: boolean;
  readonly paidMinor: number;
  readonly totalMinor: number;
  readonly currency: string;
  readonly paymentMode: "full" | "split";
  readonly match?: {
    readonly id: string;
    readonly slug: string;
    readonly title: string;
  };
  readonly participants: readonly BookingRosterEntry[];
}

export type CourtFlowRequest = CourtBookingRequest & {
  readonly localStartsAt?: string;
  readonly courtId?: string;
};

class FlowError extends Error {
  constructor(
    message: string,
    readonly money: MoneyOutcome,
  ) {
    super(message);
  }
}

const POLLS = 24;
const delayFor = (attempt: number) => (attempt < 3 ? 450 : 900);
const SLOW_AFTER_MS = 8_000;
const STEP_TITLES = {
  time: "Pick a time",
  players: "Who's playing",
  pay: "Review and pay",
} as const;

export function CourtBookingFlow({
  request,
  onClose,
  onOpenMatch,
  onViewBooking,
  preview,
}: {
  readonly request?: CourtFlowRequest;
  readonly onClose: () => void;
  readonly onOpenMatch?: (matchId: string, matchSlug: string) => void;
  readonly onViewBooking?: (bookingId: string) => void;
  /** Preview builds only: open on a step with fixture data (screenshots). */
  readonly preview?: CourtFlowPreview;
}) {
  const key = request
    ? `${request.venueId}-${request.date}-${request.localStartsAt ?? ""}-${request.courtId ?? ""}`
    : "closed";
  if (!request) return null;
  return (
    <Flow
      key={key}
      onClose={onClose}
      onOpenMatch={onOpenMatch}
      onViewBooking={onViewBooking}
      preview={preview}
      request={request}
    />
  );
}

function Flow({
  request,
  onClose,
  onOpenMatch,
  onViewBooking,
  preview,
}: {
  readonly request: CourtFlowRequest;
  readonly onClose: () => void;
  readonly onOpenMatch?: (matchId: string, matchSlug: string) => void;
  readonly onViewBooking?: (bookingId: string) => void;
  readonly preview?: CourtFlowPreview;
}) {
  const runtime = usePlayerRuntime();
  const haptics = useHaptics();
  const { colors, tokens } = useTheme();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const live = runtime.mode === "live" ? runtime.client : undefined;
  const {
    inventory,
    error: inventoryError,
    retry,
  } = useCourtInventory(request.venueId);
  const [state, dispatch] = useReducer(
    courtFlowReducer,
    {
      selection: {
        venueId: request.venueId,
        date: request.date,
        durationMinutes: request.durationMinutes,
        ...(request.localStartsAt
          ? { localStartsAt: request.localStartsAt }
          : {}),
        ...(request.courtId ? { courtId: request.courtId } : {}),
      },
      ...(request.intent ? { intent: request.intent } : {}),
    },
    (input) => {
      const initial = initialFlowState(input);
      return preview ? { ...initial, ...preview.state(initial) } : initial;
    },
  );
  const [confirmed, setConfirmed] = useState<ConfirmedBooking | undefined>(
    preview?.confirmed,
  );
  const [slow, setSlow] = useState(false);
  const [pendingBookingId, setPendingBookingId] = useState<string>();
  const [playersOpen, setPlayersOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const idempotency = useRef<{ attempt: number; key: string } | null>(null);
  const stepRef = useRef(state.step);

  // A designed response to every step change.
  useEffect(() => {
    if (stepRef.current !== state.step) haptics.selection();
    stepRef.current = state.step;
  }, [haptics, state.step]);

  useEffect(() => {
    if (state.step !== "confirming") {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [state.step]);

  const { availability } = useCourtAvailability({
    venueId: request.venueId,
    date: state.selection.date,
    durationMinutes: state.selection.durationMinutes,
    enabled:
      state.step === "players" || state.step === "pay" || state.step === "time",
  });
  const minute = state.selection.localStartsAt
    ? localMinute(state.selection.localStartsAt)
    : null;
  const slot =
    slotsAt(availability, minute).find(
      (entry) => entry.courtId === state.selection.courtId,
    ) ?? preview?.slot;
  const court = inventory?.courts.find(
    (entry) => entry.id === state.selection.courtId,
  );
  const policy = court?.cancellationPolicy;
  const venue = inventory?.venue;

  const quoteState = useCourtQuote({
    courtId: state.selection.courtId,
    localStartsAt: state.selection.localStartsAt,
    durationMinutes: state.selection.durationMinutes,
    paymentMode: state.paymentMode,
    guests: state.guests,
    enabled: (state.step === "players" || state.step === "pay") && !preview,
  });
  const quote =
    preview?.quote ??
    (quoteState.kind === "ready"
      ? quoteState.quote
      : quoteState.kind === "loading"
        ? quoteState.previous
        : undefined);

  const player = runtime.dashboard?.player as PersonSummary | undefined;
  const booker: Booker = {
    ...(player?.id ? { personId: player.id } : {}),
    name: player?.displayName ?? preview?.bookerName ?? "You",
    ...(player?.avatarUrl ? { photoUrl: player.avatarUrl } : {}),
  };

  const whenText = slot
    ? `${new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: venue?.timezone ?? "UTC",
      }).format(
        new Date(slot.startsAt),
      )}, ${timeRange(slot.startsAt, slot.endsAt, venue?.timezone)}`
    : "";

  const keyFor = (attempt: number) => {
    if (idempotency.current?.attempt !== attempt)
      idempotency.current = { attempt, key: Crypto.randomUUID() };
    return idempotency.current.key;
  };

  const pay = async () => {
    if (!live || !slot || !quote || !state.selection.localStartsAt) return;
    const attempt = state.attempt + 1;
    const intent = state.intent;
    dispatch({ type: "pay" });
    let charged = false;
    let lastStatus: CheckoutStatusLike | undefined;
    try {
      const result = await live.player.startCourtCheckout.mutate({
        courtId: slot.courtId,
        localStartsAt: state.selection.localStartsAt.slice(0, 16),
        durationMinutes: state.selection.durationMinutes,
        paymentMode: state.paymentMode,
        paymentSurface: Platform.OS === "web" ? "hosted" : "native",
        createMatch: intent === "host",
        participants: [...checkoutParticipants(state.guests)],
        expectedPayNowMinor: quote.payNowMinor,
        expectedTotalMinor: quote.totalMinor,
        policyAccepted: state.policyAccepted,
        policyFullScrollConfirmed:
          state.policyRead || !policy?.requireFullScroll,
        successUrl: `${dunaWebUrl}/app?court_checkout=success`,
        cancelUrl: `${dunaWebUrl}/app?court_checkout=cancelled`,
        idempotencyKey: keyFor(attempt),
      });
      if (result.mode === "unavailable" || !result.bookingId)
        throw new FlowError(
          "That court was taken a moment ago. Pick another time.",
          "not-charged",
        );
      setPendingBookingId(result.bookingId);

      const readStatus = (): Promise<CheckoutStatus> =>
        result.paymentSheet
          ? live.player.courtCheckoutStatus.query({
              paymentIntentId: result.paymentSheet.paymentIntentId,
            })
          : live.player.courtCheckoutStatus.query({
              checkoutSessionId: result.checkoutSessionId!,
            });

      let status: CheckoutStatus | undefined;
      if (result.paymentSheet) {
        const outcome = await presentNativePayment({
          paymentSheet: result.paymentSheet,
          ...(player?.displayName ? { customerName: player.displayName } : {}),
        });
        if (outcome === "cancelled") {
          dispatch({ type: "payment-cancelled" });
          return;
        }
        charged = true;
        dispatch({ type: "progress", phase: 1 });
      } else if (result.checkoutUrl) {
        if (Platform.OS !== "web")
          throw new FlowError(
            "Duna couldn't open the in-app payment. Your court isn't booked; try again.",
            "not-charged",
          );
        await WebBrowser.openBrowserAsync(result.checkoutUrl);
        charged = true;
      } else if (result.mode !== "free") {
        throw new FlowError(
          "That court is no longer available. Pick another time.",
          "not-charged",
        );
      }

      if (
        result.mode !== "free" &&
        (result.paymentSheet || result.checkoutSessionId)
      ) {
        for (let poll = 0; poll < POLLS; poll += 1) {
          status = await readStatus();
          lastStatus = status;
          dispatch({
            type: "progress",
            phase: confirmingPhase(status, intent),
          });
          if (checkoutSettled(status, intent)) break;
          await new Promise<void>((resolve) =>
            setTimeout(resolve, delayFor(poll)),
          );
        }
        if (!status || !checkoutSettled(status, intent)) {
          // The payment sheet finished: unless the order says it failed,
          // the money is with Duna and the booking is still settling.
          const orderFailed = ["failed", "cancelled"].includes(
            status?.orderStatus ?? "",
          );
          throw new FlowError(
            "Still confirming",
            orderFailed ? moneyOutcome(status) : "received-pending",
          );
        }
        if (confirmingPhase(status, intent) < 2 && !status.awaitingParticipants)
          throw new FlowError(
            "The court couldn't be held.",
            moneyOutcome(status),
          );
      }

      let match = status?.match ?? result.match;
      const secured =
        result.mode === "free"
          ? result.bookingStatus === "confirmed"
          : Boolean(status?.complete);
      if (intent === "host" && secured && !match) {
        const recovered = await live.player.ensureCourtBookingMatch.mutate({
          bookingId: result.bookingId,
          idempotencyKey: Crypto.randomUUID(),
        });
        match = recovered.match;
      }
      dispatch({ type: "progress", phase: 3 });
      haptics.confirmed(2);
      setConfirmed({
        bookingId: result.bookingId,
        startsAt: result.startsAt,
        endsAt: result.endsAt,
        complete: result.mode === "free" ? secured : Boolean(status?.complete),
        awaitingParticipants: Boolean(status?.awaitingParticipants),
        paidMinor: result.pricing?.payNowMinor ?? quote.payNowMinor,
        totalMinor: result.pricing?.totalMinor ?? quote.totalMinor,
        currency: result.pricing?.currency ?? quote.currency,
        paymentMode: state.paymentMode,
        ...(match ? { match } : {}),
        participants: status?.participants ?? result.participants ?? [],
      });
      dispatch({ type: "confirmed", bookingId: result.bookingId });
      void runtime.refresh();
    } catch (reason) {
      haptics.refused();
      const money =
        reason instanceof FlowError
          ? reason.money
          : charged
            ? moneyOutcome(lastStatus)
            : "not-charged";
      const reference = report(reason, {
        event: "player.court.checkout_failed",
      });
      const message =
        reason instanceof FlowError
          ? reason.message
          : reason instanceof Error && reason.message
            ? reason.message
            : "Duna couldn't finish the booking.";
      dispatch({ type: "failed", failure: { message, money, reference } });
    }
  };

  const busy = state.step === "confirming";
  const dark = state.step === "confirming";
  // Fills the sheet without passing its frame (bottom sheet or centred).
  const sheetHeight = Math.min(height - insets.top - insets.bottom - 64, 940);

  let body: ReactNode;
  if (!inventory || !venue) {
    body = (
      <View style={[styles.center, { padding: tokens.space["6"] }]}>
        {inventoryError ? (
          <ErrorState
            onRetry={retry}
            reference={inventoryError}
            text="Check your connection and try again."
            title="Couldn't load this venue"
          />
        ) : (
          <LoadingState label="Loading courts" loading skeleton="card" />
        )}
      </View>
    );
  } else if (state.step === "confirming") {
    body = (
      <ConfirmingStep
        phase={state.phase}
        slow={slow}
        intent={state.intent}
        venueName={venue.name}
      />
    );
  } else if (state.step === "failed" && state.failure) {
    body = (
      <FailedStep
        failure={state.failure}
        onClose={onClose}
        onPlans={
          state.failure.money === "received-pending" &&
          onViewBooking &&
          pendingBookingId
            ? () => onViewBooking(pendingBookingId)
            : undefined
        }
        onRetry={() => dispatch({ type: "retry" })}
      />
    );
  } else if (state.step === "confirmed" && confirmed) {
    body = (
      <ConfirmedStep
        booker={booker}
        booking={confirmed}
        courtName={slot?.courtName ?? court?.name ?? "Court"}
        guests={state.guests}
        intent={state.intent}
        onDone={onClose}
        onOpenMatch={onOpenMatch}
        onViewBooking={onViewBooking}
        venue={venue}
      />
    );
  } else {
    const step =
      state.step === "time" || state.step === "players" || state.step === "pay"
        ? state.step
        : "pay";
    const stepNumber = step === "time" ? 1 : step === "players" ? 2 : 3;
    const lines = quote ? payLines(quote, state.paymentMode) : undefined;
    const policyRequired = Boolean(policy);
    const free = quote?.totalMinor === 0;
    const paymentsReady = venue.paymentsReady || free;
    const ready = canContinue(state, {
      policyRequired,
      requireFullScroll: policy?.requireFullScroll ?? false,
    });
    const footer =
      step === "time" ? (
        <ActionButton
          disabled={!ready}
          label={
            slot
              ? `Continue · ${slot.courtName}, ${timeOf(slot.startsAt, venue.timezone)}`
              : "Choose a time and a court"
          }
          onPress={() => dispatch({ type: "continue" })}
          testID="flow-continue-time"
        />
      ) : step === "players" ? (
        <ActionButton
          disabled={!ready || !slot}
          label="Continue to payment"
          onPress={() => dispatch({ type: "continue" })}
          testID="flow-continue-players"
        />
      ) : (
        <View style={{ gap: tokens.space["2"] }}>
          {!live && !preview ? (
            <Text tone="text-2" variant="phone-meta">
              Sign in to book. Preview builds can't take payments.
            </Text>
          ) : !paymentsReady ? (
            <Text tone="warning" variant="phone-meta">
              {`${venue.organizationName} hasn't finished setting up Duna Pay, so this court can't be paid for in the app yet.`}
            </Text>
          ) : policyRequired && !state.policyAccepted ? (
            <Text tone="text-2" variant="phone-meta">
              Read and accept the cancellation policy to pay.
            </Text>
          ) : null}
          <ActionButton
            busy={quoteState.kind === "loading" && !preview}
            disabled={!ready || !quote || !paymentsReady || (!live && !preview)}
            label={
              !lines
                ? "Confirming your price…"
                : free
                  ? "Reserve, no charge"
                  : `Pay ${formatMoney(lines.payNowMinor, quote!.currency)}`
            }
            onPress={() => void pay()}
            testID="flow-pay"
          />
        </View>
      );
    body = (
      <>
        <FlowHeader
          onBack={
            step === "time" ? undefined : () => dispatch({ type: "back" })
          }
          onClose={onClose}
          stepLabel={`Step ${stepNumber} of 3`}
        />
        <ScrollView
          contentContainerStyle={{
            padding: tokens.space["4"],
            paddingBottom: tokens.space["8"],
            gap: tokens.space["4"],
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Cross
            crossKey={step}
            direction={stepNumber >= 2 ? "forward" : "back"}
          >
            <View style={{ gap: tokens.space["4"] }}>
              <View style={{ gap: tokens.space["1"] }}>
                <Title>{STEP_TITLES[step]}</Title>
                <Text tone="text-2" variant="phone-meta">
                  {[venue.name, venue.city].filter(Boolean).join(" · ")}
                </Text>
              </View>
              {step !== "time" && slot ? (
                <ChosenTime
                  courtName={slot.courtName}
                  onChange={() => {
                    dispatch({ type: "back" });
                    if (step === "pay") dispatch({ type: "back" });
                  }}
                  whenText={whenText}
                />
              ) : null}
              {step === "time" ? (
                <CourtTimePicker
                  inventory={inventory}
                  onCourt={(courtId) =>
                    dispatch({ type: "choose-court", courtId })
                  }
                  onDate={(date) => dispatch({ type: "set-date", date })}
                  onDuration={(minutes) =>
                    dispatch({ type: "set-duration", durationMinutes: minutes })
                  }
                  onOpenMatch={onOpenMatch}
                  onTime={(localStartsAt, openCourtIds) =>
                    dispatch({
                      type: "choose-time",
                      localStartsAt,
                      openCourtIds,
                    })
                  }
                  selection={state.selection}
                />
              ) : step === "players" ? (
                <PlayersStep
                  booker={booker}
                  capacity={court?.capacity}
                  onChoosePlayers={() => setPlayersOpen(true)}
                  onIntent={(intent) =>
                    dispatch({ type: "set-intent", intent })
                  }
                  onInvite={() => setInviteOpen(true)}
                  onRemove={(key) =>
                    dispatch({
                      type: "set-guests",
                      guests: removeGuest(state.guests, key),
                    })
                  }
                  state={state}
                />
              ) : (
                <PayStep
                  booker={booker}
                  courtCapacity={court?.capacity}
                  listedMinor={slot?.price?.amountMinor}
                  listedCurrency={slot?.price?.currency}
                  onMode={(mode) =>
                    dispatch({ type: "set-payment-mode", mode })
                  }
                  onPolicy={() => setPolicyOpen(true)}
                  policy={policy}
                  quoteError={
                    quoteState.kind === "error"
                      ? quoteState.reference
                      : undefined
                  }
                  quote={quote}
                  quoteRetry={quoteState.retry}
                  signedOut={!live && !preview}
                  state={state}
                />
              )}
            </View>
          </Cross>
        </ScrollView>
        <View
          style={{
            paddingHorizontal: tokens.space["4"],
            paddingTop: tokens.space["3"],
            paddingBottom: tokens.space["3"],
            borderTopColor: colors.line,
            borderTopWidth: StyleSheet.hairlineWidth,
            backgroundColor: colors.surface,
          }}
        >
          {footer}
        </View>
      </>
    );
  }

  const content = (
    <View
      style={{
        height: sheetHeight,
        backgroundColor: dark ? tokens.brand["night-court"] : colors.ground,
      }}
    >
      {body}
    </View>
  );

  return (
    <AdaptiveSheet
      accessibilityLabel="Book a court"
      kind="dialog"
      onClose={() => {
        // Money may be moving: the sheet stays until the checkout answers.
        if (!busy) onClose();
      }}
      testID="court-booking-flow"
      theme={dark ? { sheet: tokens.brand["night-court"] } : undefined}
      visible
    >
      {dark ? <ThemeOverride theme="dark">{content}</ThemeOverride> : content}
      <DunaPlayersSheet
        excludedPersonIds={booker.personId ? [booker.personId] : []}
        maxSelected={
          MAX_GUESTS - state.guests.filter((guest) => !guest.personId).length
        }
        onChange={(players) =>
          dispatch({
            type: "set-guests",
            guests: withDunaPlayers(state.guests, players, booker),
          })
        }
        onClose={() => setPlayersOpen(false)}
        selected={state.guests.flatMap((guest) =>
          guest.person ? [guest.person] : [],
        )}
        visible={playersOpen}
      />
      <InviteSheet
        onAdd={(guest) => {
          const result = addGuest(state.guests, guest, booker);
          if (!result.ok) return result.message;
          dispatch({ type: "set-guests", guests: result.guests });
          return undefined;
        }}
        onClose={() => setInviteOpen(false)}
        shareNote={
          state.paymentMode === "split" && quote
            ? `They pay their share (about ${formatMoney(quote.participantShareMinor, quote.currency)})`
            : undefined
        }
        visible={inviteOpen}
      />
      {policy ? (
        <PolicySheet
          accepted={state.policyAccepted}
          markdown={policy.markdown}
          onAccept={(read) => {
            haptics.confirmed(0);
            dispatch({ type: "accept-policy", read });
            setPolicyOpen(false);
          }}
          onClose={() => setPolicyOpen(false)}
          requireFullScroll={policy.requireFullScroll}
          title={policy.title}
          visible={policyOpen}
        />
      ) : null}
    </AdaptiveSheet>
  );
}

function timeOf(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timeZone ?? "UTC",
  }).format(new Date(iso));
}

function timeRange(
  startsAt: string,
  endsAt: string,
  timeZone?: string,
): string {
  return `${timeOf(startsAt, timeZone)}–${timeOf(endsAt, timeZone)}`;
}

function dayOf(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: timeZone ?? "UTC",
  }).format(new Date(iso));
}

function FlowHeader({
  stepLabel,
  onBack,
  onClose,
}: {
  readonly stepLabel: string;
  readonly onBack?: () => void;
  readonly onClose: () => void;
}) {
  const { colors, tokens } = useTheme();
  return (
    <View
      style={[
        styles.headerRow,
        {
          paddingHorizontal: tokens.space["2"],
          borderBottomColor: colors.line,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <HeaderButton icon="chevron-left" label="Back" onPress={onBack} />
      <Text
        family="mono"
        style={styles.fillCenter}
        tone="text-2"
        variant="micro"
      >
        {stepLabel.toUpperCase()}
      </Text>
      <HeaderButton icon="close" label="Close" onPress={onClose} />
    </View>
  );
}

function HeaderButton({
  icon,
  label,
  onPress,
}: {
  readonly icon: GlyphName;
  readonly label: string;
  readonly onPress?: () => void;
}) {
  const { colors } = useTheme();
  if (!onPress) return <View style={styles.headerButton} />;
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        styles.headerButton,
        { opacity: pressed ? 0.55 : 1 },
      ]}
      testID={`flow-${label.toLowerCase()}`}
    >
      <Icon color={colors.text} name={icon} size="control" />
    </Pressable>
  );
}

/** The time and court already chosen: shown, never asked again; tap to change. */
function ChosenTime({
  whenText,
  courtName,
  onChange,
}: {
  readonly whenText: string;
  readonly courtName: string;
  readonly onChange: () => void;
}) {
  const { colors, tokens } = useTheme();
  return (
    <Pressable
      accessibilityHint="Goes back to the times; your players stay"
      accessibilityLabel={`${whenText}, ${courtName}. Change`}
      accessibilityRole="button"
      onPress={onChange}
      style={({ pressed }) => [
        styles.chosen,
        {
          gap: tokens.space["3"],
          padding: tokens.space["3"],
          borderRadius: tokens.radius.xl,
          backgroundColor: tokens.brand["night-court"],
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      testID="flow-chosen-time"
    >
      <Icon color={tokens.brand.dune} name="schedule" size="control" />
      <View style={styles.fill}>
        <Text
          style={{ color: tokens.brand.salt }}
          variant="phone-body"
          weight={600}
        >
          {whenText}
        </Text>
        <Text style={{ color: colors["text-3"] }} variant="phone-meta">
          {courtName}
        </Text>
      </View>
      <Text
        style={{ color: tokens.brand.dune }}
        variant="phone-meta"
        weight={600}
      >
        Change
      </Text>
    </Pressable>
  );
}

function PlayersStep({
  state,
  booker,
  capacity,
  onIntent,
  onChoosePlayers,
  onInvite,
  onRemove,
}: {
  readonly state: CourtFlowState;
  readonly booker: Booker;
  readonly capacity?: number;
  readonly onIntent: (intent: "private" | "host") => void;
  readonly onChoosePlayers: () => void;
  readonly onInvite: () => void;
  readonly onRemove: (key: string) => void;
}) {
  const { tokens } = useTheme();
  const seats = rosterSeats({
    booker,
    guests: state.guests,
    ...(capacity ? { capacity } : {}),
  });
  const duna = state.guests.filter((guest) => guest.personId).length;
  return (
    <View style={{ gap: tokens.space["4"] }}>
      <Card testID="roster">
        <View style={styles.rowBetween}>
          <SectionLabel>{`Roster · ${seats.filter((seat) => seat.kind !== "open").length} of ${Math.max(seats.length, 2)}`}</SectionLabel>
        </View>
        <View style={[styles.seats, { gap: tokens.space["2"] }]}>
          <Rally mode="grow" trigger={state.guests.length}>
            {seats.map((seat) => (
              <Seat
                key={seat.key}
                onPress={seat.kind === "open" ? onChoosePlayers : undefined}
                onRemove={
                  seat.kind === "guest" ? () => onRemove(seat.key) : undefined
                }
                seat={seat}
                status={
                  seat.kind === "booker"
                    ? "Booking"
                    : seat.kind === "guest"
                      ? seat.onDuna
                        ? "On Duna"
                        : seat.channel === "text"
                          ? "By text"
                          : "By email"
                      : undefined
                }
              />
            ))}
          </Rally>
        </View>
      </Card>
      <View style={{ gap: tokens.space["2"] }}>
        <ActionRow
          detail="Frequent partners first, with Sand Rating and reliability"
          icon="users"
          onPress={onChoosePlayers}
          selected={duna > 0}
          testID="choose-duna-players"
          title={
            duna
              ? `${duna} Duna player${duna === 1 ? "" : "s"} added`
              : "Choose Duna players"
          }
        />
        <ActionButton
          icon="user-plus"
          kind="secondary"
          label="Invite someone"
          onPress={onInvite}
          testID="invite-someone"
        />
      </View>
      <View style={{ gap: tokens.space["2"] }}>
        <SectionLabel>Make it</SectionLabel>
        <Segmented
          label="Booking kind"
          onChange={onIntent}
          options={[
            {
              value: "private",
              title: "Private court",
              detail: "Just the people you add",
            },
            {
              value: "host",
              title: "Open match",
              detail: "Duna players can find it and ask to join",
            },
          ]}
          value={state.intent}
        />
      </View>
    </View>
  );
}

function PayStep({
  state,
  booker,
  courtCapacity,
  quote,
  quoteError,
  quoteRetry,
  listedMinor,
  listedCurrency,
  policy,
  signedOut,
  onMode,
  onPolicy,
}: {
  readonly state: CourtFlowState;
  readonly booker: Booker;
  readonly courtCapacity?: number;
  readonly quote?: Parameters<typeof payLines>[0] & {
    readonly currency: string;
    readonly subtotalMinor: number;
    readonly memberRateApplied: boolean;
    readonly dunaPlusApplied: boolean;
  };
  readonly quoteError?: string;
  readonly quoteRetry: () => void;
  readonly listedMinor?: number;
  readonly listedCurrency?: string;
  readonly policy?: {
    readonly title: string;
    readonly refundBeforeHours?: number;
    readonly lateCancellation?: string;
    readonly requireFullScroll: boolean;
  };
  readonly signedOut: boolean;
  readonly onMode: (mode: "full" | "split") => void;
  readonly onPolicy: () => void;
}) {
  const { colors, tokens } = useTheme();
  const seats = rosterSeats({
    booker,
    guests: state.guests,
    ...(courtCapacity ? { capacity: courtCapacity } : {}),
  });
  const playing = seats.filter((seat) => seat.kind !== "open").length;
  const lines = quote ? payLines(quote, state.paymentMode) : undefined;
  const money = (minor: number) =>
    formatMoney(minor, quote?.currency ?? listedCurrency ?? "USD");
  return (
    <View style={{ gap: tokens.space["4"] }}>
      <Card>
        <SectionLabel>{`Who's playing · ${playing}`}</SectionLabel>
        <View style={[styles.avatarRow, { gap: tokens.space["2"] }]}>
          {seats.map((seat) =>
            seat.kind === "open" ? null : (
              <PersonAvatar
                key={seat.key}
                label={seat.kind === "booker" ? `${seat.name}, you` : seat.name}
                name={seat.name}
                photoUrl={seat.photoUrl}
                ring={seat.kind === "booker"}
                size={44}
              />
            ),
          )}
        </View>
        <Text tone="text-2" variant="phone-meta">
          {state.intent === "host"
            ? "An open match: Duna players can find it and ask to join. Invitations go out when you pay."
            : state.guests.length
              ? "Invitations go out when you pay."
              : "Just you for now. You can invite people after booking too."}
        </Text>
      </Card>
      <Segmented
        label="How to pay"
        onChange={onMode}
        options={[
          {
            value: "full",
            title:
              state.paymentMode === "full" && lines
                ? `Pay everything · ${money(lines.payNowMinor)}`
                : "Pay everything",
            detail: "You cover the whole court",
          },
          {
            value: "split",
            title:
              state.paymentMode === "split" && lines
                ? `Pay your part · ${money(lines.payNowMinor)}`
                : "Pay your part",
            detail: state.guests.length
              ? `Split ${state.guests.length + 1} ways`
              : "Add players to split it",
            disabled: state.guests.length === 0,
          },
        ]}
        value={state.paymentMode}
      />
      <Card testID="price">
        <SectionLabel>Price</SectionLabel>
        {quote && lines ? (
          <View style={{ gap: tokens.space["2"] }}>
            <PriceLine
              label={`Court · ${state.selection.durationMinutes} min`}
              value={money(quote.subtotalMinor)}
            />
            {lines.feeMinor > 0 ? (
              <PriceLine
                label="Duna service fee"
                value={money(lines.feeMinor)}
              />
            ) : null}
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                backgroundColor: colors.line,
              }}
            />
            <PriceLine
              label="Court total"
              strong
              value={money(lines.totalMinor)}
            />
            {state.paymentMode === "split" &&
            lines.eachGuestMinor !== undefined ? (
              <>
                <PriceLine
                  label="You pay now"
                  strong
                  value={money(lines.payNowMinor)}
                />
                <PriceLine
                  label={`Each of the other ${lines.shareCount - 1} pays`}
                  value={money(lines.eachGuestMinor)}
                />
              </>
            ) : null}
            {quote.subtotalMinor > 0 &&
            (quote.memberRateApplied || quote.dunaPlusApplied) ? (
              <View style={[styles.row, { gap: tokens.space["2"] }]}>
                <Icon color={colors.positive} name="verified" size="inline" />
                <Text style={styles.fill} tone="positive" variant="phone-meta">
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
              </View>
            ) : null}
            {listedMinor && listedMinor !== quote.subtotalMinor ? (
              <Text tone="text-2" variant="phone-meta">
                {`The venue lists ${formatMoney(listedMinor, listedCurrency ?? quote.currency)} for this time. Your price above is what Duna charges.`}
              </Text>
            ) : null}
          </View>
        ) : quoteError ? (
          <ErrorState
            onRetry={quoteRetry}
            reference={quoteError}
            text="Duna couldn't confirm your price for this court."
            title="Price didn't load"
          />
        ) : (
          <View style={{ gap: tokens.space["2"] }}>
            {listedMinor ? (
              <PriceLine
                label="The venue lists this time at"
                value={formatMoney(listedMinor, listedCurrency ?? "USD")}
              />
            ) : null}
            <Text tone="text-2" variant="phone-meta">
              {signedOut
                ? "Sign in to see your own price, with any member rate or Duna Plus benefit."
                : "Confirming your price for this court…"}
            </Text>
          </View>
        )}
      </Card>
      {policy ? (
        <Card testID="policy">
          <ActionRow
            detail={[
              policy.refundBeforeHours !== undefined
                ? `Refund until ${policy.refundBeforeHours} hours before`
                : undefined,
              policy.lateCancellation,
            ]
              .filter(Boolean)
              .join(" · ")}
            icon={state.policyAccepted ? "success" : "policy"}
            onPress={onPolicy}
            selected={state.policyAccepted}
            testID="policy-open"
            title={
              state.policyAccepted
                ? `${policy.title} · accepted`
                : `${policy.title} · read and accept`
            }
          />
        </Card>
      ) : null}
      <View style={[styles.row, { gap: tokens.space["2"] }]}>
        <Icon color={colors["text-2"]} name="pay" size="inline" />
        <Text style={styles.fill} tone="text-2" variant="phone-meta">
          Pay with Apple Pay or a card on the next sheet. Nothing is charged
          until you confirm there.
        </Text>
      </View>
    </View>
  );
}

function PriceLine({
  label,
  value,
  strong = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly strong?: boolean;
}) {
  return (
    <View style={styles.rowBetween}>
      <Text
        style={styles.fill}
        tone={strong ? "text" : "text-2"}
        variant="phone-body"
        weight={strong ? 600 : 400}
      >
        {label}
      </Text>
      <Text
        tabular
        variant={strong ? "phone-heading" : "phone-body"}
        weight={600}
      >
        {value}
      </Text>
    </View>
  );
}

const CONFIRMING_STEPS = [
  "Payment received",
  "Securing your court",
  "Creating the match and invitations",
] as const;

function ConfirmingStep({
  phase,
  slow,
  intent,
  venueName,
}: {
  readonly phase: number;
  readonly slow: boolean;
  readonly intent: "private" | "host";
  readonly venueName: string;
}) {
  const { colors, tokens } = useTheme();
  const steps = [
    CONFIRMING_STEPS[0],
    CONFIRMING_STEPS[1],
    intent === "host" ? CONFIRMING_STEPS[2] : "Sending invitations",
  ];
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[
        styles.confirming,
        { padding: tokens.space["6"], gap: tokens.space["6"] },
      ]}
      testID="flow-confirming"
    >
      <ReservationCrest done={phase} size={120} />
      <View style={{ alignItems: "center", gap: tokens.space["2"] }}>
        <Title>Confirming your court</Title>
        <Text style={styles.centerText} tone="text-2" variant="phone-body">
          {`Duna is holding your time at ${venueName}.`}
        </Text>
      </View>
      <View style={{ gap: tokens.space["3"], alignSelf: "stretch" }}>
        {steps.map((label, index) => {
          const done = index < phase;
          const current = index === phase;
          return (
            <View
              accessibilityLabel={`${label}${done ? ", done" : current ? ", in progress" : ", waiting"}`}
              accessible
              key={label}
              style={[styles.row, { gap: tokens.space["3"], minHeight: 32 }]}
            >
              <View
                style={[
                  styles.stepMark,
                  {
                    backgroundColor: done ? tokens.brand.dune : "transparent",
                    borderColor:
                      done || current
                        ? tokens.brand.dune
                        : colors["line-strong"],
                  },
                ]}
              >
                {done ? (
                  <Icon
                    color={tokens.brand["night-court"]}
                    name="check"
                    size="chip"
                  />
                ) : null}
              </View>
              <Text
                tone={done || current ? "text" : "text-3"}
                variant="phone-body"
                weight={current ? 600 : 400}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>
      <Text style={styles.centerText} tone="text-2" variant="phone-meta">
        {slow
          ? "This is taking longer than usual, probably a slow connection. Keep Duna open; your payment won't be taken twice."
          : "Keep Duna open for a moment."}
      </Text>
    </View>
  );
}

function FailedStep({
  failure,
  onRetry,
  onClose,
  onPlans,
}: {
  readonly failure: {
    readonly message: string;
    readonly money: MoneyOutcome;
    readonly reference?: string;
  };
  readonly onRetry: () => void;
  readonly onClose: () => void;
  readonly onPlans?: () => void;
}) {
  const { colors, tokens } = useTheme();
  const pending = failure.money === "received-pending";
  return (
    <ScrollView
      contentContainerStyle={{
        padding: tokens.space["6"],
        gap: tokens.space["4"],
      }}
      testID="flow-failed"
    >
      <ReservationCrest done={pending ? 1 : 0} failed={!pending} size={88} />
      <Title>{pending ? "Still confirming" : "That didn't go through"}</Title>
      {!pending ? (
        <Text tone="text-2" variant="phone-body">
          {failure.message}
        </Text>
      ) : null}
      <View
        style={{
          gap: tokens.space["1"],
          padding: tokens.space["3"],
          borderRadius: tokens.radius.lg,
          backgroundColor:
            failure.money === "not-charged" || failure.money === "refunded"
              ? colors["positive-wash"]
              : colors["warning-wash"],
        }}
      >
        <SectionLabel>Your money</SectionLabel>
        <Text variant="phone-body" weight={600}>
          {MONEY_WORDS[failure.money]}
        </Text>
      </View>
      {failure.reference ? (
        <Text selectable tone="text-2" variant="phone-meta">
          {`Reference ${failure.reference}`}
        </Text>
      ) : null}
      {pending ? (
        onPlans ? (
          <ActionButton label="See it in Plans" onPress={onPlans} />
        ) : null
      ) : failure.money === "not-charged" ? (
        <ActionButton label="Try again" onPress={onRetry} testID="flow-retry" />
      ) : null}
      <ActionButton
        kind={pending ? "primary" : "quiet"}
        label="Close"
        onPress={onClose}
      />
    </ScrollView>
  );
}

const STATUS_WORDS: Readonly<Record<string, string>> = {
  organizer: "Booked it",
  invited: "Invited",
  accepted: "In",
  "payment-pending": "Share to pay",
  paid: "Paid",
  declined: "Declined",
  cancelled: "Cancelled",
};

function ConfirmedStep({
  booking,
  booker,
  guests,
  intent,
  venue,
  courtName,
  onDone,
  onOpenMatch,
  onViewBooking,
}: {
  readonly booking: ConfirmedBooking;
  readonly booker: Booker;
  readonly guests: readonly BookingParticipant[];
  readonly intent: "private" | "host";
  readonly venue: {
    readonly id: string;
    readonly name: string;
    readonly city: string;
    readonly region: string;
    readonly timezone: string;
    readonly organizationName: string;
    readonly address?: string;
    readonly latitude?: number;
    readonly longitude?: number;
  };
  readonly courtName: string;
  readonly onDone: () => void;
  readonly onOpenMatch?: (matchId: string, matchSlug: string) => void;
  readonly onViewBooking?: (bookingId: string) => void;
}) {
  const runtime = usePlayerRuntime();
  const haptics = useHaptics();
  const { colors, tokens } = useTheme();
  const [note, setNote] = useState<string>();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [toInvite, setToInvite] = useState<readonly PersonSummary[]>([]);
  const [invitedIds, setInvitedIds] = useState<readonly string[]>([]);
  const [sending, setSending] = useState(false);
  const day = dayOf(booking.startsAt, venue.timezone);
  const time = timeRange(booking.startsAt, booking.endsAt, venue.timezone);
  const place = [venue.address ?? `${venue.city}, ${venue.region}`].join("");
  const link = booking.match
    ? matchUrl(dunaWebUrl, booking.match.slug)
    : `${dunaWebUrl}/venues/${venue.id}`;
  const directions = directionsUrl({
    name: venue.name,
    ...(venue.latitude !== undefined ? { latitude: venue.latitude } : {}),
    ...(venue.longitude !== undefined ? { longitude: venue.longitude } : {}),
    ...(venue.address ? { address: venue.address } : {}),
  });
  const title = booking.match
    ? "Match ready"
    : booking.complete
      ? "Court booked"
      : "Your share is paid";

  const people = useMemo(() => {
    const byPerson = new Map(
      guests.flatMap((guest) =>
        guest.personId ? [[guest.personId, guest] as const] : [],
      ),
    );
    const rows = booking.participants
      .filter((entry) => entry.role !== "organizer")
      .map((entry) => ({
        key: entry.id,
        name: entry.displayName,
        photoUrl: entry.personId
          ? byPerson.get(entry.personId)?.person?.avatarUrl
          : undefined,
        status:
          entry.status === "payment-pending" && entry.shareAmountMinor > 0
            ? `${formatMoney(entry.shareAmountMinor, booking.currency)} to pay`
            : (STATUS_WORDS[entry.status] ?? "Invited"),
        inviteToken: entry.personId ? undefined : entry.inviteToken,
        shareMinor: entry.shareAmountMinor,
      }));
    // The checkout's own roster when it sent one; else the people added.
    if (rows.length > 0 || guests.length === 0) return rows;
    return guests.map((guest) => ({
      key: guestKey(guest) ?? guest.name ?? "guest",
      name:
        guest.person?.displayName ??
        guest.name ??
        guest.phoneE164 ??
        guest.email ??
        "Player",
      photoUrl: guest.person?.avatarUrl,
      status: "Invited",
      inviteToken: undefined,
      shareMinor: 0,
    }));
  }, [booking.currency, booking.participants, guests]);

  const share = async () => {
    haptics.selection();
    try {
      await Share.share({
        title: `${venue.name} · ${day}`,
        message: buildBookingShareMessage({
          title: booking.match?.title ?? `Court at ${venue.name}`,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          timezone: venue.timezone,
          organizationName: venue.organizationName,
          locationName: venue.name,
          ...(venue.address ? { address: venue.address } : {}),
          courtName,
          playerNames: [booker.name, ...people.map((person) => person.name)],
          detailsUrl: link,
        }),
        url: link,
      });
    } catch (reason) {
      setNote(
        `Sharing didn't open. Reference ${report(reason, { event: "player.court.share_failed" })}.`,
      );
    }
  };

  const sendLink = async (person: {
    readonly name: string;
    readonly inviteToken?: string;
    readonly shareMinor: number;
  }) => {
    if (!person.inviteToken) return;
    haptics.selection();
    try {
      await Share.share({
        message: inviteMessage({
          inviteeName: person.name,
          organizerName: booker.name.split(/\s+/)[0] ?? booker.name,
          venueName: venue.name,
          whenText: `${day}, ${time}`,
          url: bookingInviteUrl(dunaWebUrl, person.inviteToken),
          ...(person.shareMinor > 0
            ? { shareText: formatMoney(person.shareMinor, booking.currency) }
            : {}),
        }),
      });
    } catch (reason) {
      setNote(
        `Sharing didn't open. Reference ${report(reason, { event: "player.court.invite_share_failed" })}.`,
      );
    }
  };

  const calendar = async () => {
    haptics.selection();
    try {
      const outcome = await addToCalendar({
        title: booking.match?.title ?? `Beach court · ${venue.name}`,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        location: [venue.name, venue.address].filter(Boolean).join(", "),
        notes: `${courtName}. Booked on Duna.`,
        url: link,
      });
      if (outcome === "saved") {
        haptics.confirmed(0);
        setNote("Added to your calendar.");
      } else if (outcome === "denied")
        setNote(
          "Calendar access is off for Duna. Turn it on in Settings to add bookings.",
        );
      else if (outcome === "unavailable")
        setNote("No calendar on this phone takes new events.");
    } catch (reason) {
      setNote(
        `The calendar didn't open. Reference ${report(reason, { event: "player.court.calendar_failed" })}.`,
      );
    }
  };

  const sendInvites = async () => {
    const client = runtime.mode === "live" ? runtime.client : undefined;
    if (!client || !booking.match || toInvite.length === 0) return;
    setSending(true);
    try {
      const result = await client.player.invitePickupPlayers.mutate({
        pickupSessionId: booking.match.id,
        personIds: toInvite.map((person) => person.id),
        idempotencyKey: Crypto.randomUUID(),
      });
      haptics.confirmed(1);
      setInvitedIds((current) => [...current, ...result.invitedPersonIds]);
      setNote(
        `${result.invitedPersonIds.length} invitation${result.invitedPersonIds.length === 1 ? "" : "s"} sent.${result.alreadyActivePersonIds.length ? ` ${result.alreadyActivePersonIds.length} already in.` : ""}`,
      );
      setToInvite([]);
    } catch (reason) {
      haptics.refused();
      setNote(
        `Invitations didn't send. Reference ${report(reason, { event: "player.court.invite_more_failed" })}.`,
      );
    } finally {
      setSending(false);
    }
  };

  const actions: readonly {
    readonly icon: GlyphName;
    readonly label: string;
    readonly onPress?: () => void;
    readonly testID: string;
  }[] = [
    {
      icon: "send",
      label: "Share",
      onPress: () => void share(),
      testID: "confirmed-share",
    },
    {
      icon: "calendar",
      label: "Calendar",
      onPress: () => void calendar(),
      testID: "confirmed-calendar",
    },
    {
      icon: "directions",
      label: "Directions",
      ...(directions ? { onPress: () => void openDirections(directions) } : {}),
      testID: "confirmed-directions",
    },
    {
      icon: "user-plus",
      label: "Invite more",
      onPress: () => {
        haptics.selection();
        if (booking.match) setInviteOpen(true);
        else void share();
      },
      testID: "confirmed-invite",
    },
  ];

  return (
    <ScrollView
      contentContainerStyle={{ paddingBottom: tokens.space["8"] }}
      testID="flow-confirmed"
    >
      <ThemeOverride theme="dark">
        <View
          style={{
            backgroundColor: tokens.brand["night-court"],
            paddingHorizontal: tokens.space["5"],
            paddingTop: tokens.space["6"],
            paddingBottom: tokens.space["6"],
            gap: tokens.space["3"],
          }}
        >
          <View style={styles.rowBetween}>
            <ReservationCrest done={3} size={56} />
            <Pressable
              accessibilityLabel="Done"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onDone}
              style={({ pressed }) => [
                styles.headerButton,
                { opacity: pressed ? 0.6 : 1 },
              ]}
              testID="confirmed-done"
            >
              <Text
                style={{ color: tokens.brand.dune }}
                variant="phone-body"
                weight={600}
              >
                Done
              </Text>
            </Pressable>
          </View>
          <Rise>
            <View style={{ gap: tokens.space["1"] }}>
              <Text
                family="mono"
                style={{ color: tokens.brand.dune }}
                variant="micro"
              >
                {booking.match
                  ? "CONFIRMED · OPEN MATCH"
                  : booking.complete
                    ? "CONFIRMED"
                    : "HELD FOR YOUR PLAYERS"}
              </Text>
              <Title>{title}</Title>
              <Text variant="phone-body" weight={600}>
                {`${day} · ${time}`}
              </Text>
              <Text tone="text-2" variant="phone-body">
                {`${venue.name} · ${courtName}`}
              </Text>
            </View>
          </Rise>
        </View>
      </ThemeOverride>
      <View style={{ padding: tokens.space["4"], gap: tokens.space["4"] }}>
        <View style={[styles.actions, { gap: tokens.space["2"] }]}>
          {actions.map((action) => (
            <Pressable
              accessibilityLabel={
                action.label === "Calendar" ? "Add to calendar" : action.label
              }
              accessibilityRole="button"
              accessibilityState={{ disabled: !action.onPress }}
              disabled={!action.onPress}
              key={action.label}
              onPress={action.onPress}
              style={({ pressed }) => [
                styles.action,
                {
                  borderRadius: tokens.radius.xl,
                  backgroundColor: colors.surface,
                  borderColor: colors.line,
                  gap: tokens.space["1"],
                  opacity: !action.onPress ? 0.45 : pressed ? 0.7 : 1,
                },
              ]}
              testID={action.testID}
            >
              <Icon color={colors.text} name={action.icon} size="nav" />
              <Text numberOfLines={1} variant="phone-meta" weight={600}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {note ? (
          <Text
            accessibilityLiveRegion="polite"
            tone="text-2"
            variant="phone-meta"
          >
            {note}
          </Text>
        ) : null}
        <Card testID="confirmed-players">
          <SectionLabel>{`Playing · ${people.length + 1}`}</SectionLabel>
          <PersonLine
            name={booker.name}
            photoUrl={booker.photoUrl}
            ring
            status="You booked it"
          />
          {people.map((person) => (
            <PersonLine
              action={
                person.inviteToken
                  ? { label: "Send link", onPress: () => void sendLink(person) }
                  : undefined
              }
              key={person.key}
              name={person.name}
              photoUrl={person.photoUrl}
              status={person.status}
            />
          ))}
          {invitedIds.length ? (
            <Text tone="positive" variant="phone-meta">
              {`${invitedIds.length} more invited from Duna.`}
            </Text>
          ) : null}
          {toInvite.length ? (
            <View style={{ gap: tokens.space["2"] }}>
              <View style={[styles.avatarRow, { gap: tokens.space["2"] }]}>
                {toInvite.map((person) => (
                  <PersonAvatar
                    key={person.id}
                    label={person.displayName}
                    name={person.displayName}
                    photoUrl={person.avatarUrl}
                    size={36}
                  />
                ))}
              </View>
              <ActionButton
                busy={sending}
                label={`Send ${toInvite.length} invitation${toInvite.length === 1 ? "" : "s"}`}
                onPress={() => void sendInvites()}
                testID="confirmed-send-invites"
              />
            </View>
          ) : null}
          {people.some((person) => person.inviteToken) ? (
            <Text tone="text-2" variant="phone-meta">
              Duna texts or emails each invitation. "Send link" lets you send it
              yourself too.
            </Text>
          ) : null}
        </Card>
        <Card>
          <SectionLabel>Booking</SectionLabel>
          <Fact icon="calendar" label="When" value={`${day}, ${time}`} />
          <Fact
            icon="court"
            label="Court"
            value={`${courtName} · ${venue.name}`}
          />
          <Fact icon="pin" label="Where" value={place} />
          <Fact icon="venue" label="Club" value={venue.organizationName} />
          <Fact
            icon="pay"
            label={
              booking.paymentMode === "split" ? "You paid (your share)" : "Paid"
            }
            value={
              booking.paidMinor === 0
                ? "No charge"
                : booking.paymentMode === "split"
                  ? `${formatMoney(booking.paidMinor, booking.currency)} of ${formatMoney(booking.totalMinor, booking.currency)}`
                  : formatMoney(booking.paidMinor, booking.currency)
            }
          />
          {booking.awaitingParticipants ? (
            <Text tone="warning" variant="phone-meta">
              The court confirms when everyone has paid their share. Each person
              has their own secure link.
            </Text>
          ) : null}
        </Card>
        {venue.latitude !== undefined && venue.longitude !== undefined ? (
          <VenueMap
            latitude={venue.latitude}
            longitude={venue.longitude}
            name={venue.name}
            {...(directions
              ? { onPress: () => void openDirections(directions) }
              : {})}
          />
        ) : null}
        {booking.match && onOpenMatch ? (
          <ActionButton
            kind="secondary"
            label="Open the match"
            onPress={() => onOpenMatch(booking.match!.id, booking.match!.slug)}
          />
        ) : null}
        {onViewBooking ? (
          <ActionButton
            kind="secondary"
            label="View booking"
            onPress={() => onViewBooking(booking.bookingId)}
            testID="confirmed-view-booking"
          />
        ) : null}
        <Text style={styles.centerText} tone="text-2" variant="phone-meta">
          {`It's in Play, under Plans${intent === "host" ? ", with the match" : ""}.`}
        </Text>
        <ActionButton label="Done" onPress={onDone} />
      </View>
      {booking.match ? (
        <DunaPlayersSheet
          excludedPersonIds={[
            ...(booker.personId ? [booker.personId] : []),
            ...guests.flatMap((guest) =>
              guest.personId ? [guest.personId] : [],
            ),
            ...invitedIds,
          ]}
          maxSelected={10}
          onChange={setToInvite}
          onClose={() => setInviteOpen(false)}
          selected={toInvite}
          visible={inviteOpen}
        />
      ) : null}
    </ScrollView>
  );
}

function PersonLine({
  name,
  photoUrl,
  status,
  ring = false,
  action,
}: {
  readonly name: string;
  readonly photoUrl?: string;
  readonly status: string;
  readonly ring?: boolean;
  readonly action?: { readonly label: string; readonly onPress: () => void };
}) {
  const { colors, tokens } = useTheme();
  return (
    <View style={[styles.row, { gap: tokens.space["3"], minHeight: 52 }]}>
      <PersonAvatar name={name} photoUrl={photoUrl} ring={ring} size={44} />
      <View style={styles.fill}>
        <Text numberOfLines={1} variant="phone-body" weight={600}>
          {name}
        </Text>
        <Text tone="text-2" variant="phone-meta">
          {status}
        </Text>
      </View>
      {action ? (
        <Pressable
          accessibilityLabel={`${action.label} to ${name}`}
          accessibilityRole="button"
          onPress={action.onPress}
          style={({ pressed }) => [
            styles.pill,
            {
              borderRadius: tokens.radius.pill,
              borderColor: colors["line-strong"],
              paddingHorizontal: tokens.space["3"],
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Text variant="phone-meta" weight={600}>
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fillCenter: { flex: 1, textAlign: "center" },
  center: { flex: 1, justifyContent: "center" },
  centerText: { textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  headerRow: { flexDirection: "row", alignItems: "center", minHeight: 52 },
  headerButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  chosen: { flexDirection: "row", alignItems: "center", minHeight: 56 },
  seats: { flexDirection: "row", flexWrap: "wrap" },
  avatarRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  confirming: { flex: 1, alignItems: "center", justifyContent: "center" },
  stepMark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { flexDirection: "row", flexWrap: "wrap" },
  action: {
    flexGrow: 1,
    flexBasis: 72,
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
  },
  pill: {
    minHeight: 36,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
