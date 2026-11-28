/**
 * Get paid: collect a payment in person (M-R4, owner's point 11).
 *
 * One flow that keeps its context on screen the whole way: who → what for
 * → how much → how → collect → result (`collect-flow.ts`). A summary card
 * on Night Court shows the player (with their avatar), the item and the
 * amount at every step; tapping a part goes back to it with every other
 * choice kept. Each way to pay says why it is or isn't available.
 *
 * The Stripe Terminal integration is the one the old screen shipped, kept
 * as it was: the same provider and token call, `initialize`, the Android
 * Tap to Pay configuration, `easyConnect` with `tapToPay`,
 * `retrievePaymentIntent`, `processPaymentIntent`, `finalizePaymentCollection`
 * and every `recordPaymentEvent` log. Only the screens around it changed.
 * A person presses Collect; nothing charges on its own.
 */
import {
  DarkMode,
  StripeTerminalProvider,
  useStripeTerminal,
  type Reader,
} from "@stripe/stripe-terminal-react-native";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ErrorState,
  fontFace,
  Icon,
  LoadingState,
  Numerals,
  Text,
  ThemeOverride,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { useLayout } from "@duna/ui/native/layout";
import type { DunaApiClient } from "../../../mobile-api";
import { useProRuntime } from "../../../runtime";
import { useShell } from "../../app/ShellContext";
import { IconButton } from "../../app/ui";
import { Avatar } from "../../shared/Avatar";
import {
  formatCredits,
  formatMoney,
  parseAmountMinor,
} from "../../shared/money-format";
import { DunaTextInput } from "../session/duna-text";
import { classifyFailure, type Failure } from "../session/failure";
import { ActionButton, Notice } from "../session/parts";
import { takeDevParam } from "../dev/dev-params";
import { initialsFrom } from "../people/people-model";
import {
  STEPS,
  STEP_TITLES,
  amountEditable,
  collectReducer,
  initialCollect,
  primaryLabel,
  ready as flowReady,
  tenderOptions,
  type CollectItem,
  type CollectStep,
  type Tender,
} from "./collect-flow";
import { TapToPayStage, type StagePhase } from "./TapToPayStage";

type PaymentWorkspace = Awaited<
  ReturnType<DunaApiClient["operator"]["paymentWorkspace"]["query"]>
>;
type PaymentCollection = PaymentWorkspace["recent"][number];
type ResultState = "approved" | "declined" | "error";

function messageForReaderInput(input: readonly Reader.InputOptions[]): string {
  if (input.includes("tapCard"))
    return "Hold the card or phone at the top of this device.";
  if (input.includes("insertCard"))
    return "Insert the card when the reader asks.";
  if (input.includes("swipeCard")) return "Swipe the card through the reader.";
  return "Follow the card prompt on this device.";
}

function messageForReaderDisplay(message: Reader.DisplayMessage): string {
  const messages: Record<Reader.DisplayMessage, string> = {
    insertCard: "Insert card",
    insertOrSwipeCard: "Insert or swipe card",
    multipleContactlessCardsDetected: "Move other cards away and try again",
    removeCard: "Remove card",
    retryCard: "Try the card again",
    swipeCard: "Swipe card",
    tryAnotherCard: "Try another card",
    tryAnotherReadMethod: "Try another way to read the card",
    checkMobileDevice: "Check the customer’s phone",
    cardRemovedTooEarly: "Card moved too soon—try again",
  };
  return messages[message];
}

function previewWorkspace(
  operator: ReturnType<typeof useProRuntime>["workspace"],
): PaymentWorkspace {
  const people = (operator?.people ?? []).map((person) => ({
    personId: person.personId,
    displayName: person.displayName,
    avatarUrl: person.avatarUrl,
    isMinor: person.isMinor,
    creditBalance: person.creditBalance,
    cashAvailableMinor: 0,
    cashCurrency: operator?.organization.currency,
    cashWalletEnabled: false,
  }));
  return {
    currency: operator?.organization.currency ?? "USD",
    terminal: {
      ready: false,
      stripeConfigured: false,
      connectedAccountReady: false,
      organizationAddressReady: false,
      merchantDisplayName: operator?.organization.name ?? "Duna Club",
      reason: "Preview builds don't take payments.",
    },
    earnings: {
      todayGrossMinor: 0,
      todayNetMinor: 0,
      periodGrossMinor: 0,
      periodNetMinor: 0,
    },
    people: people.length
      ? people
      : [
          {
            personId: "10000000-0000-4000-8000-000000000010",
            displayName: "Mara Lewis",
            isMinor: false,
            creditBalance: 4,
            cashAvailableMinor: 0,
            cashWalletEnabled: false,
          },
          {
            personId: "10000000-0000-4000-8000-000000000011",
            displayName: "Theo Park",
            isMinor: false,
            creditBalance: 0,
            cashAvailableMinor: 8_000,
            cashCurrency: "USD",
            cashWalletEnabled: true,
          },
        ],
    references: [
      {
        type: "catalog-item",
        id: "30000000-0000-4000-8000-000000000001",
        label: "Beach Elite Academy Membership",
        detail: "Monthly plan",
        suggestedAmountMinor: 5_000,
      },
      {
        type: "session",
        id: "30000000-0000-4000-8000-000000000002",
        label: "Sunset doubles clinic",
        detail: "Tomorrow · Court 2",
        suggestedAmountMinor: 3_000,
        creditAmount: 2,
      },
    ],
    recent: [],
  };
}

function GetPaidFlow({
  onClose,
  initialPersonId,
}: {
  readonly onClose: () => void;
  readonly initialPersonId?: string;
}) {
  const { client, mode, workspace: operatorWorkspace } = useProRuntime();
  const shell = useShell();
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const insets = useSafeAreaInsets();
  const layout = useLayout();
  const [flow, dispatch] = useReducer(
    collectReducer,
    initialPersonId,
    initialCollect,
  );
  const [workspace, setWorkspace] = useState<PaymentWorkspace>();
  const [loading, setLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState<Failure>();
  const [search, setSearch] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [amountText, setAmountText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [collection, setCollection] = useState<PaymentCollection>();
  const [clientSecret, setClientSecret] = useState<string>();
  const [locationId, setLocationId] = useState<string>();
  const [readerPrompt, setReaderPrompt] = useState(
    "Preparing secure Tap to Pay…",
  );
  const [phase, setPhase] = useState<StagePhase>("preparing");
  const [result, setResult] = useState<ResultState>();
  const collectionIdRef = useRef<string | undefined>(undefined);

  const logEvent = useCallback(
    async (input: {
      readonly eventType:
        | "reader.initialized"
        | "reader.discovered"
        | "reader.connected"
        | "reader.input"
        | "reader.message"
        | "payment.processing"
        | "terminal.declined"
        | "terminal.error"
        | "payment.cancelled";
      readonly status:
        | "created"
        | "awaiting-reader"
        | "processing"
        | "succeeded"
        | "declined"
        | "failed"
        | "cancelled";
      readonly processorCode?: string;
      readonly message?: string;
      readonly details?: Record<string, string | number | boolean>;
    }) => {
      if (!client || !collectionIdRef.current || mode !== "live") return;
      await client.operator.recordPaymentEvent.mutate({
        collectionId: collectionIdRef.current,
        eventType: input.eventType,
        status: input.status,
        processorCode: input.processorCode,
        message: input.message,
        details: input.details ?? {},
        idempotencyKey: Crypto.randomUUID(),
      });
    },
    [client, mode],
  );

  const terminal = useStripeTerminal({
    onUpdateDiscoveredReaders: (readers) => {
      setReaderPrompt("This device is ready to accept the card.");
      void logEvent({
        eventType: "reader.discovered",
        status: "awaiting-reader",
        message: `${readers.length} Tap to Pay reader found.`,
        details: { readerCount: readers.length },
      });
    },
    onDidRequestReaderInput: (input) => {
      const message = messageForReaderInput(input);
      setReaderPrompt(message);
      setPhase("ready");
      void logEvent({
        eventType: "reader.input",
        status: "processing",
        message,
        details: { input: input.join(",") },
      });
    },
    onDidRequestReaderDisplayMessage: (message) => {
      const copy = messageForReaderDisplay(message);
      setReaderPrompt(copy);
      void logEvent({
        eventType: "reader.message",
        status: "processing",
        message: copy,
        details: { readerMessage: message },
      });
    },
    onDidChangeConnectionStatus: (status) => {
      if (status === "connected") {
        setReaderPrompt("Tap to Pay connected.");
        void logEvent({
          eventType: "reader.connected",
          status: "awaiting-reader",
          message: "Tap to Pay connected on this device.",
        });
      }
    },
    onDidChangePaymentStatus: (status) => {
      if (status === "processing") setPhase("reading");
      if (status === "waitingForInput") setPhase("ready");
      if (status === "processing" || status === "waitingForInput") {
        void logEvent({
          eventType: "payment.processing",
          status: "processing",
          message: `Terminal payment status: ${status}.`,
          details: { terminalStatus: status },
        });
      }
    },
  });

  const refreshWorkspace = useCallback(async () => {
    if (!client || mode !== "live") {
      setWorkspace(previewWorkspace(operatorWorkspace));
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadFailure(undefined);
    try {
      setWorkspace(await client.operator.paymentWorkspace.query());
    } catch (reason) {
      setLoadFailure(classifyFailure(reason, "pro.get_paid.load_failed"));
    } finally {
      setLoading(false);
    }
  }, [client, mode, operatorWorkspace]);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  const currency = workspace?.currency ?? "USD";
  const selectedPerson = workspace?.people.find(
    (person) => person.personId === flow.payerId,
  );
  const selectedReference = flow.item;
  const currentAmountMinor = flow.amountMinor ?? 0;
  const selectedTender = flow.tender;
  const canEditPrice = shell.audience === "owner";
  const editable = amountEditable(flow.item, canEditPrice);

  // A person opened from their page who can't pay here: choose again.
  useEffect(() => {
    if (workspace && flow.payerId && !selectedPerson && flow.step !== "who")
      dispatch({ type: "go", step: "who" });
  }, [flow.payerId, flow.step, selectedPerson, workspace]);
  // The amount field shows the flow's amount when it changes from outside.
  useEffect(() => {
    if (flow.step === "amount")
      setAmountText(
        flow.amountMinor ? (flow.amountMinor / 100).toFixed(2) : "",
      );
  }, [flow.step, flow.item?.key]);

  const options = useMemo(
    () =>
      workspace
        ? tenderOptions({
            terminal: workspace.terminal,
            payer: selectedPerson,
            item: flow.item,
            amountMinor: currentAmountMinor,
            currency,
          })
        : [],
    [currency, currentAmountMinor, flow.item, selectedPerson, workspace],
  );
  // The first way to pay that works is chosen for them.
  useEffect(() => {
    if (flow.step !== "how") return;
    const current = options.find((option) => option.tender === flow.tender);
    if (current?.available) return;
    const firstAvailable = options.find((option) => option.available);
    if (firstAvailable)
      dispatch({ type: "choose-tender", tender: firstAvailable.tender });
  }, [flow.step, flow.tender, options]);

  const runCard = async (secret: string, terminalLocationId: string) => {
    if (!client || !collectionIdRef.current) return;
    setReaderPrompt("Starting Tap to Pay securely…");
    setPhase("preparing");
    setResult(undefined);
    if (!terminal.isInitialized) {
      const initialized = await terminal.initialize();
      if (initialized.error) throw initialized.error;
      await logEvent({
        eventType: "reader.initialized",
        status: "awaiting-reader",
        message: "Tap to Pay reader initialized on this device.",
      });
    }
    if (Platform.OS === "android") {
      await terminal.setTapToPayUxConfiguration({
        tapZone: { indicator: "above", bias: 0.1 },
        darkMode: DarkMode.DARK,
        colors: { primary: "#D4B77C", success: "#85D49B", error: "#F27878" },
      });
    }
    if (!terminal.connectedReader) {
      const connected = await terminal.easyConnect({
        discoveryMethod: "tapToPay",
        simulated: false,
        locationId: terminalLocationId,
        merchantDisplayName: workspace?.terminal.merchantDisplayName,
        tosAcceptancePermitted: true,
        autoReconnectOnUnexpectedDisconnect: true,
      });
      if (connected.error) throw connected.error;
    }
    const retrieved = await terminal.retrievePaymentIntent(secret);
    if (retrieved.error) throw retrieved.error;
    setReaderPrompt("Hold the card or phone at the top of this device.");
    setPhase("ready");
    const processed = await terminal.processPaymentIntent({
      paymentIntent: retrieved.paymentIntent,
      customerCancellation: "enableIfAvailable",
      skipTipping: true,
      skipDonation: true,
    });
    if (processed.error) throw processed.error;
    const finalized = await client.operator.finalizePaymentCollection.mutate({
      collectionId: collectionIdRef.current,
    });
    setCollection(finalized);
    setResult("approved");
    setPhase("approved");
    dispatch({ type: "finish", result: "approved" });
    setReaderPrompt("Approved");
    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    await refreshWorkspace();
  };

  const failed = async (reason: unknown, fallback: string) => {
    const stripeError = reason as {
      readonly message?: string;
      readonly code?: string;
      readonly apiError?: {
        readonly code?: string;
        readonly declineCode?: string;
        readonly message?: string;
      };
    };
    const declineCode = stripeError.apiError?.declineCode;
    const declined = Boolean(declineCode);
    const cancelled = !declined && /cancel/i.test(stripeError.code ?? "");
    setResult(declined ? "declined" : "error");
    setPhase(declined ? "declined" : cancelled ? "cancelled" : "error");
    dispatch({ type: "finish", result: declined ? "declined" : "error" });
    const message =
      stripeError.apiError?.message ?? stripeError.message ?? fallback;
    setReaderPrompt(
      declined ? "Declined" : cancelled ? "Cancelled" : "We hit a snag",
    );
    setError(message);
    await logEvent({
      eventType: declined ? "terminal.declined" : "terminal.error",
      status: declined ? "declined" : "failed",
      processorCode:
        declineCode ?? stripeError.apiError?.code ?? stripeError.code,
      message,
    }).catch(() => undefined);
    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const collect = async () => {
    if (!workspace || !selectedPerson || !selectedTender) return;
    if (!client || mode !== "live") {
      setError("Preview builds show this flow but can't take money.");
      haptics.refused();
      return;
    }
    if (selectedTender === "card-present" && !workspace.terminal.ready) {
      setError(workspace.terminal.reason ?? "Tap to Pay is not ready.");
      return;
    }
    setBusy(true);
    setError(undefined);
    dispatch({ type: "start" });
    setPhase("preparing");
    try {
      const started = await client.operator.startPaymentCollection.mutate({
        amountMinor: currentAmountMinor,
        payerPersonId: selectedPerson.personId,
        referenceType: selectedReference?.type ?? "custom",
        referenceId: selectedReference?.id,
        referenceLabel: selectedReference?.label ?? "In-person payment",
        tender: selectedTender,
        creditsApplied:
          selectedTender === "organization-credit"
            ? selectedReference?.creditAmount
            : undefined,
        idempotencyKey: Crypto.randomUUID(),
      });
      collectionIdRef.current = started.collection.id;
      setCollection(started.collection);
      setClientSecret(started.clientSecret);
      setLocationId(started.terminalLocationId);
      if (selectedTender === "card-present") {
        if (!started.clientSecret || !started.terminalLocationId) {
          throw new Error(
            "Tap to Pay did not receive its secure payment details.",
          );
        }
        await runCard(started.clientSecret, started.terminalLocationId);
      } else {
        setResult("approved");
        setPhase("approved");
        dispatch({ type: "finish", result: "approved" });
        setReaderPrompt("Approved");
        if (Platform.OS !== "web") {
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        }
        await refreshWorkspace();
      }
    } catch (reason) {
      await failed(reason, "The payment could not be completed.");
      await refreshWorkspace();
    } finally {
      setBusy(false);
    }
  };

  const retryCard = async () => {
    if (!clientSecret || !locationId) {
      setError("Start a new payment attempt.");
      return;
    }
    setBusy(true);
    setError(undefined);
    setResult(undefined);
    dispatch({ type: "retry" });
    try {
      await runCard(clientSecret, locationId);
    } catch (reason) {
      await failed(reason, "The retry did not complete.");
    } finally {
      setBusy(false);
    }
  };

  const startAnother = () => {
    dispatch({ type: "reset" });
    setCollection(undefined);
    setClientSecret(undefined);
    setLocationId(undefined);
    setResult(undefined);
    setError(undefined);
    setCustomLabel("");
    setAmountText("");
    collectionIdRef.current = undefined;
  };

  // Preview builds: `collect=<step or stage>` in a dev link walks the flow
  // with the example people so a simulator can show each step and each Tap
  // to Pay state (the reader SDK cannot run in a simulator).
  const devDone = useRef(false);
  useEffect(() => {
    if (mode === "live" || !workspace || devDone.current) return;
    devDone.current = true;
    const target = takeDevParam("collect");
    if (!target) return;
    const person = workspace.people[0];
    const reference = workspace.references[0];
    if (!person || !reference) return;
    dispatch({ type: "choose-payer", payerId: person.personId });
    if (target === "what") return;
    dispatch({
      type: "choose-item",
      item: {
        key: `${reference.type}:${reference.id}`,
        type: reference.type,
        id: reference.id,
        label: reference.label,
        ...(reference.suggestedAmountMinor !== undefined
          ? { suggestedAmountMinor: reference.suggestedAmountMinor }
          : {}),
        ...(reference.creditAmount !== undefined
          ? { creditAmount: reference.creditAmount }
          : {}),
      },
    });
    if (target === "amount") return;
    dispatch({ type: "confirm-amount" });
    if (target === "how") return;
    const stage = target as StagePhase;
    dispatch({ type: "choose-tender", tender: "card-present" });
    setCollection({
      id: "preview-collection",
      orderId: "preview-order",
      payerPersonId: person.personId,
      payerName: person.displayName,
      referenceType: reference.type,
      referenceId: reference.id,
      referenceLabel: reference.label,
      tender: "card-present",
      amountMinor: reference.suggestedAmountMinor ?? 5_000,
      currency: workspace.currency,
      applicationFeeMinor: 0,
      processingFeeMinor: 0,
      commissionMinor: 0,
      creditsApplied: 0,
      walletCashAppliedMinor: 0,
      netMinor: 0,
      status: "processing",
      createdAt: new Date().toISOString(),
    } as PaymentCollection);
    setPhase(stage);
    setReaderPrompt(
      stage === "ready"
        ? "Hold the card or phone at the top of this device."
        : stage === "reading"
          ? "Reading the card"
          : stage === "approved"
            ? "Approved"
            : stage === "declined"
              ? "Declined"
              : stage === "cancelled"
                ? "Cancelled"
                : stage === "error"
                  ? "We hit a snag"
                  : "Starting Tap to Pay securely…",
    );
    if (
      stage === "approved" ||
      stage === "declined" ||
      stage === "error" ||
      stage === "cancelled"
    ) {
      const outcome: ResultState =
        stage === "approved"
          ? "approved"
          : stage === "declined"
            ? "declined"
            : "error";
      setResult(outcome);
      setClientSecret("preview");
      if (stage === "error") setError("The reader lost its connection.");
      if (stage === "declined") setError("The card was declined.");
      dispatch({ type: "finish", result: outcome });
    } else {
      setBusy(true);
      dispatch({ type: "start" });
    }
  }, [mode, workspace]);

  const ground = colors.ground;
  if (loading && !workspace) {
    return (
      <View
        style={[
          styles.fill,
          { backgroundColor: ground, paddingTop: insets.top },
        ]}
      >
        <LoadingState label="Opening payments" loading />
      </View>
    );
  }
  if (!workspace || loadFailure) {
    return (
      <View
        style={[
          styles.fill,
          styles.center,
          { backgroundColor: ground, padding: 24 },
        ]}
      >
        <ErrorState
          onRetry={() => void refreshWorkspace()}
          reference={loadFailure?.reference}
          secondary={{ label: "Close", onPress: onClose }}
          text={
            loadFailure?.kind === "denied"
              ? "You need permission to take payments at this club."
              : loadFailure?.kind === "offline"
                ? "No connection. Taking a payment needs signal."
                : "Payments didn't load. Nothing was charged."
          }
          title="Payments need attention"
        />
      </View>
    );
  }

  const summary = (
    <ThemeOverride theme="dark">
      <SummaryCard
        amount={
          currentAmountMinor ? formatMoney(currentAmountMinor, currency) : null
        }
        currency={currency}
        item={flow.item}
        locked={flow.step === "collecting" || flow.step === "result"}
        onGo={(step) => dispatch({ type: "go", step })}
        person={selectedPerson}
        tender={
          flow.step === "how" ||
          flow.step === "collecting" ||
          flow.step === "result"
            ? flow.tender
            : undefined
        }
      />
    </ThemeOverride>
  );

  const collecting =
    (flow.step === "collecting" || flow.step === "result") && collection;
  const stagePhase: StagePhase = result === "approved" ? "approved" : phase;
  const tenderTitle = options.find(
    (option) => option.tender === collection?.tender,
  )?.title;

  return (
    <View style={[styles.fill, { backgroundColor: ground }]} testID="get-paid">
      <View
        style={[
          styles.top,
          {
            paddingTop: insets.top + 4,
            paddingLeft: insets.left + 12,
            paddingRight: insets.right + 12,
            borderBottomColor: colors.line,
          },
        ]}
      >
        {flow.step !== "who" &&
        flow.step !== "collecting" &&
        flow.step !== "result" &&
        !(
          flow.step === "what" &&
          initialPersonId &&
          flow.payerId === initialPersonId
        ) ? (
          <IconButton
            icon="chevron-left"
            label="Back"
            onPress={() => dispatch({ type: "back" })}
            testID="get-paid-back"
          />
        ) : (
          <View style={styles.topSpacer} />
        )}
        <View style={styles.topTitle}>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            variant="phone-body"
            weight={600}
          >
            {collecting ? (tenderTitle ?? "Collect") : STEP_TITLES[flow.step]}
          </Text>
          {!collecting ? <Progress step={flow.step} /> : null}
        </View>
        <IconButton
          icon="close"
          label="Close"
          onPress={busy ? () => undefined : onClose}
          testID="get-paid-close"
        />
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: tokens.space["4"],
          paddingLeft: insets.left + tokens.space["4"],
          paddingRight: insets.right + tokens.space["4"],
          gap: tokens.space["4"],
          paddingBottom: tokens.space["8"],
          ...(layout.widthClass !== "compact"
            ? {
                alignSelf: "center" as const,
                width: Math.min(layout.window.width - 48, 560),
              }
            : {}),
        }}
        keyboardShouldPersistTaps="handled"
      >
        {summary}
        {collecting ? (
          <>
            <TapToPayStage
              amount={formatMoney(collection.amountMinor, collection.currency)}
              context={`${collection.payerName} · ${collection.referenceLabel}`}
              detail={result && result !== "approved" ? error : undefined}
              phase={
                collection.tender === "card-present"
                  ? stagePhase
                  : result === "approved"
                    ? "approved"
                    : result
                      ? stagePhase
                      : "preparing"
              }
              prompt={
                collection.tender === "card-present"
                  ? readerPrompt
                  : result === "approved"
                    ? "Approved"
                    : readerPrompt
              }
            />
            {busy ? (
              <Text
                style={styles.centerText}
                tone="text-2"
                variant="phone-meta"
              >
                Keep Duna Pro open while the card is working.
              </Text>
            ) : null}
            {result === "approved" ? (
              <View style={styles.buttons}>
                <ActionButton
                  kind="primary"
                  label="Collect another"
                  onPress={startAnother}
                  style={styles.grow}
                  testID="get-paid-another"
                />
                <ActionButton
                  label="Done"
                  onPress={onClose}
                  style={styles.grow}
                  testID="get-paid-done"
                />
              </View>
            ) : result ? (
              <View style={styles.buttons}>
                {collection.tender === "card-present" && clientSecret ? (
                  <ActionButton
                    busy={busy}
                    kind="primary"
                    label="Try the card again"
                    onPress={() => void retryCard()}
                    style={styles.grow}
                    testID="get-paid-retry"
                  />
                ) : null}
                <ActionButton
                  label="Choose another way to pay"
                  onPress={() => {
                    setCollection(undefined);
                    setResult(undefined);
                    setError(undefined);
                    collectionIdRef.current = undefined;
                    dispatch({ type: "change-payment" });
                  }}
                  style={styles.grow}
                  testID="get-paid-change"
                />
              </View>
            ) : null}
            <Text style={styles.centerText} tone="text-2" variant="phone-meta">
              Every attempt, including a decline or an error, is saved in the
              club's payment history.
            </Text>
          </>
        ) : flow.step === "who" ? (
          <WhoStep
            onChoose={(personId) => {
              haptics.selection();
              dispatch({ type: "choose-payer", payerId: personId });
            }}
            people={workspace.people}
            search={search}
            selected={flow.payerId}
            setSearch={setSearch}
            currency={currency}
          />
        ) : flow.step === "what" ? (
          <WhatStep
            currency={currency}
            customLabel={customLabel}
            onChoose={(item) => {
              haptics.selection();
              dispatch({ type: "choose-item", item });
            }}
            references={workspace.references}
            selected={flow.item?.key}
            setCustomLabel={setCustomLabel}
          />
        ) : flow.step === "amount" ? (
          <View style={styles.step}>
            <Text tone="text-2" variant="phone-body">
              {editable
                ? flow.item?.suggestedAmountMinor !== undefined
                  ? `Filled in from ${flow.item.label}. Change it if you agreed a different price.`
                  : "Enter the amount."
                : `The price of ${flow.item?.label ?? "this item"}. Only an owner or manager can change it.`}
            </Text>
            <View
              style={[
                styles.amountBox,
                {
                  borderColor: editable
                    ? colors["border-control"]
                    : colors.line,
                  backgroundColor: colors.surface,
                  borderRadius: tokens.radius.xl,
                },
              ]}
            >
              <Text tone="text-2" variant="figure-sm" family="mono">
                $
              </Text>
              <DunaTextInput
                accessibilityLabel="Amount"
                editable={editable}
                inputMode="decimal"
                keyboardType="decimal-pad"
                onChangeText={(text) => {
                  setAmountText(text);
                  dispatch({
                    type: "set-amount",
                    amountMinor: parseAmountMinor(text),
                  });
                }}
                placeholder="0.00"
                style={[
                  styles.amountInput,
                  { fontFamily: fontFace("mono", 600) },
                ]}
                testID="get-paid-amount"
                value={amountText}
              />
            </View>
            {editable && flow.item?.type === "custom" ? (
              <View style={styles.chips}>
                {[2_500, 5_000, 7_500, 10_000].map((minor) => (
                  <ActionButton
                    key={minor}
                    label={formatMoney(minor, currency)}
                    onPress={() => {
                      haptics.selection();
                      setAmountText((minor / 100).toFixed(2));
                      dispatch({ type: "set-amount", amountMinor: minor });
                    }}
                  />
                ))}
              </View>
            ) : null}
            {amountText && parseAmountMinor(amountText) === null ? (
              <Text tone="danger" variant="phone-meta">
                That isn't an amount. Use numbers like 45 or 45.50.
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.step} accessibilityRole="radiogroup">
            {options.map((option) => {
              const on = flow.tender === option.tender;
              return (
                <Pressable
                  accessibilityHint={option.reason}
                  accessibilityRole="radio"
                  accessibilityState={{
                    checked: on,
                    disabled: !option.available,
                  }}
                  disabled={!option.available}
                  key={option.tender}
                  onPress={() => {
                    haptics.selection();
                    dispatch({ type: "choose-tender", tender: option.tender });
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      borderColor: on ? colors.action : colors.line,
                      backgroundColor: on ? colors.selected : colors.surface,
                      borderRadius: tokens.radius.xl,
                      opacity: option.available ? 1 : 0.72,
                    },
                    pressed ? { transform: [{ scale: 0.99 }] } : null,
                  ]}
                  testID={`tender-${option.tender}`}
                >
                  <View
                    style={[
                      styles.optionIcon,
                      {
                        backgroundColor: colors["surface-sunken"],
                        borderRadius: tokens.radius.lg,
                      },
                    ]}
                  >
                    <Icon name={TENDER_ICON[option.tender]} size="control" />
                  </View>
                  <View style={styles.grow}>
                    <Text variant="phone-body" weight={600}>
                      {option.title}
                    </Text>
                    <Text
                      tone={option.available ? "text-2" : "text-3"}
                      variant="phone-meta"
                    >
                      {option.reason}
                    </Text>
                  </View>
                  <Icon
                    name={on ? "check" : "minus"}
                    size="inline"
                    tone={on ? "text" : "text-3"}
                  />
                </Pressable>
              );
            })}
            <Text tone="text-2" variant="phone-meta">
              After it's approved, Duna records the processing fee, the club's
              commission and the net separately.
            </Text>
          </View>
        )}
        {error && !collecting ? (
          <Notice text={error} title="Not collected" tone="warning" />
        ) : null}
      </ScrollView>
      {!collecting && (flow.step === "amount" || flow.step === "how") ? (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: insets.bottom + 12,
              paddingLeft: insets.left + 16,
              paddingRight: insets.right + 16,
              borderTopColor: colors.line,
              backgroundColor: ground,
            },
          ]}
        >
          <ActionButton
            busy={busy}
            disabled={
              flow.step === "amount"
                ? !(flow.amountMinor && flow.amountMinor > 0)
                : !(
                    flow.tender &&
                    flowReady(flow) &&
                    options.find((o) => o.tender === flow.tender)?.available
                  )
            }
            kind="primary"
            label={primaryLabel(flow, currency)}
            onPress={() => {
              if (flow.step === "amount") {
                haptics.confirmed(0);
                dispatch({ type: "confirm-amount" });
              } else void collect();
            }}
            testID="get-paid-primary"
          />
        </View>
      ) : null}
    </View>
  );
}

const TENDER_ICON: Readonly<
  Record<Tender, "tap-to-pay" | "credit-pack" | "wallet">
> = {
  "card-present": "tap-to-pay",
  "organization-credit": "credit-pack",
  "wallet-cash": "wallet",
};

function Progress({ step }: { readonly step: CollectStep }) {
  const { colors } = useTheme();
  const index = STEPS.indexOf(step);
  return (
    <View
      accessibilityLabel={`Step ${index + 1} of ${STEPS.length}`}
      style={styles.progress}
    >
      {STEPS.map((key, i) => (
        <View
          key={key}
          style={[
            styles.progressBar,
            { backgroundColor: i <= index ? colors.action : colors.line },
          ]}
        />
      ))}
    </View>
  );
}

function SummaryCard({
  person,
  item,
  amount,
  tender,
  locked,
  onGo,
  currency,
}: {
  readonly person?: PaymentWorkspace["people"][number];
  readonly item?: CollectItem;
  readonly amount: string | null;
  readonly tender?: Tender;
  readonly locked: boolean;
  readonly onGo: (step: CollectStep) => void;
  readonly currency: string;
}) {
  const { colors, tokens } = useTheme();
  const part = (
    step: CollectStep,
    children: React.ReactNode,
    label: string,
  ) => (
    <Pressable
      accessibilityHint={locked ? undefined : "Goes back to change it"}
      accessibilityLabel={label}
      accessibilityRole={locked ? undefined : "button"}
      disabled={locked}
      hitSlop={4}
      onPress={() => onGo(step)}
      style={({ pressed }) => [pressed ? { opacity: 0.7 } : null]}
    >
      {children}
    </Pressable>
  );
  return (
    <View
      style={[
        styles.summary,
        {
          backgroundColor: tokens.brand["night-court"],
          borderColor: colors.line,
          borderRadius: tokens.radius["2xl"],
        },
      ]}
      testID="get-paid-summary"
    >
      {part(
        "who",
        <View style={styles.summaryWho}>
          {person ? (
            <Avatar
              id={person.personId}
              initials={initialsFrom(person.displayName)}
              size={40}
              url={person.avatarUrl}
            />
          ) : (
            <View
              style={[
                styles.emptyAvatar,
                { borderColor: colors["line-strong"] },
              ]}
            >
              <Icon name="you" size="inline" tone="text-3" />
            </View>
          )}
          <View style={styles.grow}>
            <Text
              numberOfLines={1}
              variant="phone-body"
              weight={600}
              tone={person ? "text" : "text-3"}
            >
              {person?.displayName ?? "Who is paying?"}
            </Text>
            <Text numberOfLines={1} tone="text-2" variant="phone-meta">
              {item ? item.label : "What it's for comes next"}
            </Text>
          </View>
        </View>,
        person
          ? `Paying: ${person.displayName}${item ? `, for ${item.label}` : ""}`
          : "No player chosen yet",
      )}
      <View style={styles.summaryFoot}>
        {part(
          "amount",
          <Numerals tone={amount ? "text" : "text-3"} variant="figure">
            {amount ?? formatMoney(0, currency)}
          </Numerals>,
          amount ? `Amount ${amount}` : "No amount yet",
        )}
        {tender ? (
          <View
            style={[
              styles.tenderChip,
              { backgroundColor: colors["surface-raised"] },
            ]}
          >
            <Icon name={TENDER_ICON[tender]} size="chip" tone="sun" />
            <Text
              maxFontSizeMultiplier={1.4}
              numberOfLines={1}
              style={{ color: tokens.brand.dune }}
              variant="micro"
              weight={600}
            >
              {tender === "card-present"
                ? "Tap to Pay"
                : tender === "organization-credit"
                  ? item?.creditAmount
                    ? formatCredits(item.creditAmount)
                    : "Credits"
                  : "Cash wallet"}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function WhoStep({
  people,
  search,
  setSearch,
  selected,
  onChoose,
  currency,
}: {
  readonly people: PaymentWorkspace["people"];
  readonly search: string;
  readonly setSearch: (value: string) => void;
  readonly selected?: string;
  readonly onChoose: (personId: string) => void;
  readonly currency: string;
}) {
  const { colors, tokens } = useTheme();
  const needle = search.trim().toLowerCase();
  const visible = people.filter((person) =>
    person.displayName.toLowerCase().includes(needle),
  );
  return (
    <View style={styles.step}>
      <DunaTextInput
        accessibilityLabel="Search people"
        autoCorrect={false}
        onChangeText={setSearch}
        placeholder={`Search ${people.length} people`}
        testID="get-paid-search"
        value={search}
      />
      {visible.map((person) => {
        const on = person.personId === selected;
        return (
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            key={person.personId}
            onPress={() => onChoose(person.personId)}
            style={({ pressed }) => [
              styles.option,
              {
                borderColor: on ? colors.action : colors.line,
                backgroundColor: on ? colors.selected : colors.surface,
                borderRadius: tokens.radius.xl,
              },
              pressed ? { transform: [{ scale: 0.99 }] } : null,
            ]}
            testID={`payer-${person.personId}`}
          >
            <Avatar
              id={person.personId}
              initials={initialsFrom(person.displayName)}
              url={person.avatarUrl}
            />
            <View style={styles.grow}>
              <Text numberOfLines={1} variant="phone-body" weight={600}>
                {person.displayName}
              </Text>
              <Text numberOfLines={1} tone="text-2" variant="phone-meta">
                {[
                  person.isMinor ? "Junior · guardian pays" : null,
                  formatCredits(person.creditBalance),
                  person.cashWalletEnabled
                    ? `${formatMoney(person.cashAvailableMinor, person.cashCurrency ?? currency)} wallet`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            </View>
            <Icon
              name={on ? "check" : "chevron-right"}
              size="inline"
              tone={on ? "text" : "text-3"}
            />
          </Pressable>
        );
      })}
      {!visible.length ? (
        <Text tone="text-2" variant="phone-meta">
          {people.length
            ? "No one matches that name."
            : "No one at your club can pay here yet. Add people in People."}
        </Text>
      ) : null}
    </View>
  );
}

function WhatStep({
  references,
  selected,
  onChoose,
  customLabel,
  setCustomLabel,
  currency,
}: {
  readonly references: PaymentWorkspace["references"];
  readonly selected?: string;
  readonly onChoose: (item: CollectItem) => void;
  readonly customLabel: string;
  readonly setCustomLabel: (value: string) => void;
  readonly currency: string;
}) {
  const { colors, tokens } = useTheme();
  const row = (
    item: CollectItem,
    icon: "lesson" | "member-card" | "plus",
    meta: string,
  ) => {
    const on = selected === item.key;
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        key={item.key}
        onPress={() => onChoose(item)}
        style={({ pressed }) => [
          styles.option,
          {
            borderColor: on ? colors.action : colors.line,
            backgroundColor: on ? colors.selected : colors.surface,
            borderRadius: tokens.radius.xl,
          },
          pressed ? { transform: [{ scale: 0.99 }] } : null,
        ]}
        testID={`item-${item.key}`}
      >
        <View
          style={[
            styles.optionIcon,
            {
              backgroundColor: colors["surface-sunken"],
              borderRadius: tokens.radius.lg,
            },
          ]}
        >
          <Icon name={icon} size="control" />
        </View>
        <View style={styles.grow}>
          <Text numberOfLines={1} variant="phone-body" weight={600}>
            {item.label}
          </Text>
          <Text numberOfLines={1} tone="text-2" variant="phone-meta">
            {meta}
          </Text>
        </View>
        {item.suggestedAmountMinor !== undefined ? (
          <Numerals family="mono" variant="phone-body" weight={600}>
            {formatMoney(item.suggestedAmountMinor, currency)}
          </Numerals>
        ) : null}
      </Pressable>
    );
  };
  return (
    <View style={styles.step}>
      {references.length ? (
        references.map((reference) =>
          row(
            {
              key: `${reference.type}:${reference.id}`,
              type: reference.type,
              id: reference.id,
              label: reference.label,
              detail: reference.detail,
              ...(reference.suggestedAmountMinor !== undefined
                ? { suggestedAmountMinor: reference.suggestedAmountMinor }
                : {}),
              ...(reference.creditAmount !== undefined
                ? { creditAmount: reference.creditAmount }
                : {}),
            },
            reference.type === "session" ? "lesson" : "member-card",
            [
              reference.detail,
              reference.creditAmount
                ? `or ${formatCredits(reference.creditAmount)}`
                : null,
            ]
              .filter(Boolean)
              .join(" · "),
          ),
        )
      ) : (
        <Text tone="text-2" variant="phone-meta">
          No sessions or products to link yet. Add them in Create, or take a
          custom payment.
        </Text>
      )}
      <View
        style={[
          styles.custom,
          {
            borderColor: colors.line,
            borderRadius: tokens.radius.xl,
            backgroundColor: colors.surface,
          },
        ]}
      >
        <Text variant="phone-body" weight={600}>
          Something else
        </Text>
        <DunaTextInput
          accessibilityLabel="What this payment is for"
          onChangeText={setCustomLabel}
          placeholder="What it's for, for the receipt"
          testID="get-paid-custom-label"
          value={customLabel}
        />
        <ActionButton
          disabled={customLabel.trim().length < 2}
          hint={
            customLabel.trim().length < 2
              ? "Say what it's for in a few words"
              : undefined
          }
          label="Use this"
          onPress={() =>
            onChoose({
              key: "custom",
              type: "custom",
              label: customLabel.trim(),
            })
          }
          testID="get-paid-custom"
        />
      </View>
    </View>
  );
}

export function GetPaidScreen({
  onClose,
  initialPersonId,
}: {
  readonly onClose: () => void;
  readonly initialPersonId?: string;
}) {
  const { client, mode } = useProRuntime();
  const tokenProvider = useCallback(async () => {
    if (!client || mode !== "live")
      throw new Error("Tap to Pay is disabled in preview mode.");
    const token = await client.operator.terminalConnectionToken.mutate();
    return token.secret;
  }, [client, mode]);
  return (
    <StripeTerminalProvider
      localeConfig={{ type: "hardcoded", locale: "en-US" }}
      logLevel={process.env.NODE_ENV === "development" ? "verbose" : "none"}
      tokenProvider={tokenProvider}
    >
      <GetPaidFlow initialPersonId={initialPersonId} onClose={onClose} />
    </StripeTerminalProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: "center", justifyContent: "center" },
  grow: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topSpacer: { width: 44, height: 44 },
  topTitle: { flex: 1, alignItems: "center", gap: 6 },
  progress: { flexDirection: "row", gap: 4 },
  progressBar: { width: 28, height: 3, borderRadius: 2 },
  summary: { padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  summaryWho: { flexDirection: "row", alignItems: "center", gap: 12 },
  emptyAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  summaryFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  tenderChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    flexShrink: 0,
  },
  step: { gap: 10 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 64,
    padding: 12,
    borderWidth: 1,
  },
  optionIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  custom: { padding: 14, gap: 10, borderWidth: 1 },
  amountBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    minHeight: 72,
    borderWidth: 1,
  },
  amountInput: {
    flex: 1,
    borderWidth: 0,
    backgroundColor: "transparent",
    fontSize: 32,
    lineHeight: 40,
    minHeight: 64,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  centerText: { textAlign: "center" },
  footer: { paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
