/**
 * Booking a group session (M-P1, PART-11) in an `AdaptiveSheet`: for me or
 * a child I'm the verified guardian of, with credits, card or at the club
 * (as the club allows), the reserve-then-return price in ONE line with the
 * most I can be charged, a confirmation that restates everything before any
 * money moves (interaction kit tier 2), then what happens next. The same
 * sheet joins the waitlist and cancels (with the late-cancel words when the
 * decision time has passed). Words about the group come from the backend's
 * copy (`player.participation.quote`), never from here.
 */
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { report } from "@duna/observability";
import { ErrorState, Icon, Text, useHaptics, useTheme } from "@duna/ui/native";
import { AdaptiveSheet } from "@duna/ui/native/layout";
import * as Crypto from "expo-crypto";
import { useEffect, useReducer, useRef, useState } from "react";
import { dunaWebUrl } from "../../../mobile-api";
import { presentNativePayment } from "../../../native-payments";
import { usePlayerRuntime } from "../../../runtime";
import { ActionButton } from "../find/parts";
import type { FindSession, FindSessionPrice } from "../find/find-sessions";
import type { ParticipationViewInput } from "@duna/ui/native/participation";
import {
  bookingReducer,
  canConfirmCancel,
  confirmVerb,
  initialBookingState,
  methodsFor,
  type Participant,
  type PaymentMethod,
} from "./booking-machine";

export type BookingSheetMode = "book" | "waitlist" | "cancel";

const METHOD_LABEL: Readonly<Record<PaymentMethod, string>> = {
  credit: "Club credits",
  card: "Card",
  cash: "Pay at the club",
};

function priceFor(
  prices: readonly FindSessionPrice[],
  method: PaymentMethod,
): FindSessionPrice | undefined {
  const matching = prices.filter((price) => price.kind === method);
  return matching.find((price) => price.audience === "everyone") ?? matching[0];
}

function money(price: FindSessionPrice | undefined): string | undefined {
  if (!price || price.amountMinor === undefined || !price.currency)
    return undefined;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency,
  }).format(price.amountMinor / 100);
}

function Choice({
  label,
  detail,
  selected,
  onPress,
}: {
  readonly label: string;
  readonly detail?: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const { colors, tokens } = useTheme();
  return (
    <Pressable
      accessibilityLabel={detail ? `${label}. ${detail}` : label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.choice,
        {
          borderRadius: tokens.radius.lg,
          borderColor: selected ? colors["selected-ring"] : colors.line,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
          backgroundColor: selected ? colors.selected : colors.surface,
          padding: tokens.space["3"],
        },
      ]}
    >
      <View style={styles.fill}>
        <Text variant="phone-body" weight={600}>
          {label}
        </Text>
        {detail ? (
          <Text tone="text-2" variant="phone-meta">
            {detail}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon name="check" size="control" /> : null}
    </Pressable>
  );
}

function Line({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <View style={styles.line}>
      <Text tone="text-2" variant="phone-meta">
        {label}
      </Text>
      <Text variant="phone-body" weight={600}>
        {value}
      </Text>
    </View>
  );
}

async function waitFor<T>(
  poll: () => Promise<T>,
  done: (value: T) => boolean,
  attempts = 16,
): Promise<T | undefined> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const value = await poll();
    if (done(value)) return value;
    await new Promise((resolve) =>
      setTimeout(resolve, attempt < 4 ? 650 : 1_100),
    );
  }
  return undefined;
}

export function BookingSheet({
  visible,
  mode,
  session,
  participation,
  whenText,
  dependents,
  bookingId,
  onClose,
  onDone,
  onInvite,
}: {
  readonly visible: boolean;
  readonly mode: BookingSheetMode;
  readonly session: FindSession;
  readonly participation?: ParticipationViewInput;
  readonly whenText: string;
  readonly dependents: readonly {
    readonly personId: string;
    readonly name: string;
  }[];
  /** The person's booking, for cancelling. */
  readonly bookingId?: string;
  readonly onClose: () => void;
  /** Something changed: refresh the quote and the person's plans. */
  readonly onDone: () => void;
  readonly onInvite?: () => void;
}) {
  const runtime = usePlayerRuntime();
  const haptics = useHaptics();
  const { colors, tokens } = useTheme();
  const me: Participant = { personId: null, name: "Me", dependent: false };
  const firstMethod =
    methodsFor({ prices: session.prices, dependent: false })[0] ?? "credit";
  const [state, dispatch] = useReducer(
    bookingReducer,
    { participant: me, method: firstMethod },
    initialBookingState,
  );
  const idempotency = useRef<{ attempt: number; key: string } | null>(null);
  const [slow, setSlow] = useState(false);
  const [creditsReturned, setCreditsReturned] = useState<number>();

  useEffect(() => {
    if (!visible) return;
    dispatch({
      type: "reset",
      draft: { participant: me, method: firstMethod },
    });
    if (mode === "cancel") dispatch({ type: "start-cancel" });
    else if (mode === "waitlist") dispatch({ type: "review" });
    setCreditsReturned(undefined);
    // Reset only when the sheet opens.
  }, [visible, mode]);

  const busy = state.step.kind === "submitting" || state.step.kind === "paying";
  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(timer);
  }, [busy]);

  const keyFor = (attempt: number) => {
    if (idempotency.current?.attempt !== attempt) {
      idempotency.current = { attempt, key: Crypto.randomUUID() };
    }
    return idempotency.current.key;
  };

  const methods = methodsFor({
    prices: session.prices,
    dependent: state.draft.participant.dependent,
  });
  const method = methods.includes(state.draft.method)
    ? state.draft.method
    : (methods[0] ?? "credit");
  const price = priceFor(session.prices, method);
  const ladder = participation?.display.price;
  const credits = ladder ? ladder.maxCharge : price?.credits;
  const amount = money(price);
  // The reserve-then-return line, in the backend's words, for credit payers.
  const priceLine =
    method === "credit"
      ? (participation?.copy.price ??
        (credits !== undefined
          ? `${credits} credit${credits === 1 ? "" : "s"}`
          : undefined))
      : method === "card"
        ? amount
        : amount
          ? `${amount}, paid at the club`
          : undefined;
  const cancelLine = participation?.copy.cancellation;
  const free = participation?.display.cancellation.free ?? true;

  const fail = (reason: unknown, event: string) => {
    haptics.refused();
    const message =
      reason instanceof Error ? reason.message : "Duna could not finish that.";
    dispatch({
      type: "failed",
      message,
      reference: report(reason, { event }),
    });
  };

  const submit = async () => {
    const client = runtime.client;
    if (!client) return;
    const attempt = state.attempt + 1;
    dispatch({ type: "submit" });
    const participantPersonId = state.draft.participant.personId ?? undefined;
    try {
      if (mode === "waitlist") {
        const joined = await client.player.participation.joinWaitlist.mutate({
          subjectType: "catalog-session-occurrence",
          subjectId: session.id,
          ...(participantPersonId ? { participantPersonId } : {}),
          quantity: 1,
          idempotencyKey: keyFor(attempt),
        });
        haptics.confirmed(1);
        dispatch({
          type: "succeeded",
          outcome: "waitlisted",
          position: joined.position,
        });
        onDone();
        return;
      }
      if (mode === "cancel") {
        if (!bookingId)
          throw new Error("Duna couldn't find your booking for this session.");
        const result = await client.player.cancelCatalogSessionBooking.mutate({
          bookingId,
          acknowledgeNoRefund: !free,
          idempotencyKey: keyFor(attempt),
        });
        setCreditsReturned(result.creditsReturned);
        haptics.confirmed(2);
        dispatch({ type: "cancelled" });
        onDone();
        return;
      }
      if (!session.catalogVariantId)
        throw new Error("This session can't be booked here yet.");
      if (method === "credit") {
        const result = await client.player.bookCatalogSessions.mutate({
          bookings: [
            {
              catalogItemId: session.catalogItemId,
              catalogVariantId: session.catalogVariantId,
              catalogSessionOccurrenceId: session.id,
              ...(participantPersonId ? { participantPersonId } : {}),
              quantity: 1,
            },
          ],
          ...(participantPersonId ? { creditSource: "self" as const } : {}),
          atomic: true,
          idempotencyKey: keyFor(attempt),
        });
        if (result.status !== "booked") {
          throw new Error(
            result.results.find((entry) => entry.message)?.message ??
              "The booking didn't go through. Nothing was charged.",
          );
        }
        haptics.confirmed(2);
        dispatch({ type: "succeeded", outcome: "booked" });
        onDone();
        return;
      }
      const path = `/clubs/${session.club.slug}`;
      const checkout = await client.player.startCatalogCheckout.mutate({
        catalogItemId: session.catalogItemId,
        catalogVariantId: session.catalogVariantId,
        ...(price ? { catalogPriceId: price.priceId } : {}),
        paymentMethod: method,
        paymentSurface: Platform.OS === "web" ? "hosted" : "native",
        quantity: 1,
        catalogSessionOccurrenceId: session.id,
        successUrl: `${dunaWebUrl}${path}?checkout=success`,
        cancelUrl: `${dunaWebUrl}${path}?checkout=cancelled`,
        idempotencyKey: keyFor(attempt),
      });
      if (checkout.mode === "cash-reservation") {
        haptics.confirmed(1);
        dispatch({ type: "succeeded", outcome: "reserved" });
        onDone();
        return;
      }
      if (checkout.paymentSheet) {
        dispatch({ type: "payment-sheet" });
        const outcome = await presentNativePayment({
          paymentSheet: checkout.paymentSheet,
        });
        if (outcome === "cancelled") {
          dispatch({ type: "payment-cancelled" });
          return;
        }
      }
      const status = await waitFor(
        () =>
          client.player.catalogCheckoutStatus.query({
            orderId: checkout.orderId,
          }),
        (value) =>
          value.complete ||
          ["failed", "cancelled", "refunded"].includes(value.orderStatus),
      );
      if (!status?.complete) {
        throw new Error(
          status
            ? "The payment did not complete. No new charge was made."
            : "The payment is still processing. Your booking will appear in Plans.",
        );
      }
      haptics.confirmed(2);
      dispatch({ type: "succeeded", outcome: "booked" });
      onDone();
    } catch (reason) {
      fail(reason, `player.booking.${mode}_failed`);
    }
  };

  const title =
    mode === "cancel"
      ? "Cancel your booking"
      : mode === "waitlist"
        ? "Join the waitlist"
        : "Book";

  const step = state.step;
  let body;
  if (step.kind === "success" || step.kind === "cancelled") {
    const needsPlayers = participation?.displayState === "needs-players";
    body = (
      <View style={{ gap: tokens.space["3"] }}>
        <Icon color={colors.positive} name="success" size="nav" />
        <Text accessibilityRole="header" variant="phone-heading">
          {step.kind === "cancelled"
            ? "Booking cancelled"
            : step.outcome === "waitlisted"
              ? `You're number ${step.position ?? 1} on the waitlist`
              : step.outcome === "reserved"
                ? "You're in. Pay at the club."
                : "You're in."}
        </Text>
        <Text tone="text-2" variant="phone-body">
          {step.kind === "cancelled"
            ? creditsReturned
              ? `${creditsReturned} credit${creditsReturned === 1 ? "" : "s"} back in your wallet.`
              : "It's no longer in your plans."
            : step.outcome === "waitlisted"
              ? "When a place opens, we'll hold it for you and tell you."
              : needsPlayers
                ? "We'll tell you when it's confirmed. It's in your plans now."
                : "It's in your plans now."}
        </Text>
        {step.kind === "success" &&
        step.outcome !== "waitlisted" &&
        needsPlayers &&
        onInvite ? (
          <ActionButton
            icon="user-plus"
            kind="secondary"
            label="Invite a friend"
            onPress={onInvite}
          />
        ) : null}
        <ActionButton label="Done" onPress={onClose} testID="booking-done" />
      </View>
    );
  } else if (step.kind === "failed") {
    body = (
      <View style={{ gap: tokens.space["3"] }}>
        <ErrorState
          onRetry={() => dispatch({ type: "retry" })}
          reference={step.reference}
          text={step.message}
          title="That didn't go through"
        />
        <ActionButton kind="quiet" label="Close" onPress={onClose} />
      </View>
    );
  } else if (step.kind === "choose") {
    body = (
      <View style={{ gap: tokens.space["4"] }}>
        <View style={{ gap: tokens.space["2"] }}>
          <Text accessibilityRole="header" variant="phone-heading">
            Who's playing
          </Text>
          <Choice
            label="Me"
            onPress={() =>
              dispatch({ type: "choose-participant", participant: me })
            }
            selected={state.draft.participant.personId === null}
          />
          {dependents.map((dependent) => (
            <Choice
              detail="Paid from your club credits"
              key={dependent.personId}
              label={dependent.name}
              onPress={() =>
                dispatch({
                  type: "choose-participant",
                  participant: {
                    personId: dependent.personId,
                    name: dependent.name,
                    dependent: true,
                  },
                })
              }
              selected={state.draft.participant.personId === dependent.personId}
            />
          ))}
        </View>
        <View style={{ gap: tokens.space["2"] }}>
          <Text accessibilityRole="header" variant="phone-heading">
            Pay with
          </Text>
          {methods.length === 0 ? (
            <Text tone="text-2" variant="phone-body">
              This club hasn't set a price you can pay in the app yet.
            </Text>
          ) : (
            methods.map((option) => (
              <Choice
                key={option}
                label={METHOD_LABEL[option]}
                onPress={() =>
                  dispatch({ type: "choose-method", method: option })
                }
                selected={method === option}
              />
            ))
          )}
        </View>
        {priceLine ? (
          <Text testID="booking-price-line" variant="phone-body">
            {priceLine}
          </Text>
        ) : null}
        <ActionButton
          disabled={methods.length === 0}
          label="Review"
          onPress={() => {
            if (method !== state.draft.method)
              dispatch({ type: "choose-method", method });
            dispatch({ type: "review" });
          }}
          testID="booking-review"
        />
      </View>
    );
  } else {
    // confirm, submitting, paying, cancel-confirm: restate, then the verb.
    const cancelling = mode === "cancel";
    const waitlisting = mode === "waitlist";
    const verb = cancelling
      ? "Cancel booking"
      : waitlisting
        ? "Join the waitlist"
        : confirmVerb({
            method,
            ...(credits !== undefined ? { credits } : {}),
            ...(amount ? { amount } : {}),
          });
    body = (
      <View style={{ gap: tokens.space["3"] }}>
        <View
          style={{
            gap: tokens.space["2"],
            padding: tokens.space["3"],
            borderRadius: tokens.radius.lg,
            backgroundColor: colors["surface-sunken"],
          }}
        >
          <Line label="Session" value={session.title} />
          <Line label="When" value={whenText} />
          <Line label="Club" value={session.club.name} />
          {!cancelling ? (
            <Line label="Who's playing" value={state.draft.participant.name} />
          ) : null}
          {!cancelling && !waitlisting && priceLine ? (
            <Line label={METHOD_LABEL[method]} value={priceLine} />
          ) : null}
          {!cancelling && !waitlisting && method === "credit" && ladder ? (
            <Line
              label="The most you can be charged"
              value={`${ladder.maxCharge} credit${ladder.maxCharge === 1 ? "" : "s"}`}
            />
          ) : null}
        </View>
        {waitlisting ? (
          <Text tone="text-2" variant="phone-body">
            When a place opens, the first person waiting gets it held for 2
            hours. Nothing is charged until you book.
          </Text>
        ) : null}
        {cancelLine ? (
          <Text
            tone={cancelling && !free ? "warning" : "text-2"}
            variant="phone-body"
          >
            {cancelLine}
          </Text>
        ) : null}
        {cancelling && !free ? (
          <Pressable
            accessibilityLabel="I understand"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: state.lateAcknowledged }}
            onPress={() =>
              dispatch({
                type: "acknowledge-late",
                value: !state.lateAcknowledged,
              })
            }
            style={styles.ack}
          >
            <View
              style={[
                styles.box,
                {
                  borderColor: colors["border-control"],
                  backgroundColor: state.lateAcknowledged
                    ? colors.action
                    : "transparent",
                  borderRadius: tokens.radius.xs,
                },
              ]}
            >
              {state.lateAcknowledged ? (
                <Icon color={colors["on-action"]} name="check" size="chip" />
              ) : null}
            </View>
            <Text variant="phone-body">I understand</Text>
          </Pressable>
        ) : null}
        <ActionButton
          busy={busy}
          disabled={
            !runtime.client ||
            (cancelling &&
              !canConfirmCancel({
                free,
                lateAcknowledged: state.lateAcknowledged,
              }))
          }
          label={slow ? "Still confirming…" : verb}
          onPress={() => void submit()}
          testID="booking-confirm"
        />
        {!cancelling && !waitlisting && !busy ? (
          <ActionButton
            kind="quiet"
            label="Change"
            onPress={() => dispatch({ type: "edit" })}
          />
        ) : null}
        {!runtime.client ? (
          <Text tone="text-2" variant="phone-meta">
            Sign in to book. Preview builds can't take payments.
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <AdaptiveSheet
      accessibilityLabel={title}
      onClose={() => {
        if (!busy) onClose();
      }}
      testID="booking-sheet"
      visible={visible}
    >
      <ScrollView
        contentContainerStyle={{
          padding: tokens.space["4"],
          gap: tokens.space["3"],
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.head}>
          <Text accessibilityRole="header" variant="phone-heading">
            {title}
          </Text>
          {!busy ? (
            <Pressable
              accessibilityLabel="Close"
              accessibilityRole="button"
              hitSlop={12}
              onPress={onClose}
              style={styles.close}
            >
              <Icon name="close" size="control" />
            </Pressable>
          ) : null}
        </View>
        {body}
      </ScrollView>
    </AdaptiveSheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  close: {
    minHeight: 44,
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  choice: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 52 },
  line: { gap: 2 },
  ack: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  box: {
    width: 24,
    height: 24,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
});
