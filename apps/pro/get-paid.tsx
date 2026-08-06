import {
  DarkMode,
  StripeTerminalProvider,
  useStripeTerminal,
  type Reader,
} from "@stripe/stripe-terminal-react-native";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  FellixText as Text,
  FellixTextInput as TextInput,
} from "./fellix-text";
import type { DunaApiClient } from "./mobile-api";
import { useProRuntime } from "./runtime";

type PaymentWorkspace = Awaited<
  ReturnType<DunaApiClient["operator"]["paymentWorkspace"]["query"]>
>;
type PaymentCollection = PaymentWorkspace["recent"][number];
type Tender = PaymentCollection["tender"];
type ResultState = "approved" | "declined" | "error";

function money(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(value / 100);
}

function amountMinor(value: string): number {
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed * 100)) : 0;
}

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

function ProgressHeader({ step }: { readonly step: number }) {
  return (
    <View style={styles.progressRow}>
      {[0, 1, 2, 3].map((value) => (
        <View
          key={value}
          style={[styles.progress, value <= step && styles.progressOn]}
        />
      ))}
    </View>
  );
}

function PaymentMotion({
  amount,
  currency,
  state,
  prompt,
}: {
  readonly amount: number;
  readonly currency: string;
  readonly state: "ready" | "processing" | ResultState;
  readonly prompt: string;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  const success = useRef(new Animated.Value(0.85)).current;
  useEffect(() => {
    if (state === "processing" || state === "ready") {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, {
            toValue: 1,
            duration: 1_250,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(pulse, {
            toValue: 0,
            duration: 1_250,
            easing: Easing.inOut(Easing.cubic),
            useNativeDriver: true,
          }),
        ]),
      );
      animation.start();
      return () => animation.stop();
    }
    Animated.spring(success, {
      toValue: 1,
      damping: 11,
      stiffness: 160,
      useNativeDriver: true,
    }).start();
  }, [pulse, state, success]);
  const background =
    state === "approved"
      ? "#167b55"
      : state === "declined"
        ? "#a13e47"
        : state === "error"
          ? "#814c2a"
          : "#143d67";
  return (
    <View style={[styles.motion, { backgroundColor: background }]}>
      {(state === "ready" || state === "processing") && (
        <>
          <Animated.View
            style={[
              styles.orbit,
              {
                opacity: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.18, 0.55],
                }),
                transform: [
                  {
                    scale: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.82, 1.12],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.phone,
              {
                transform: [
                  {
                    translateY: pulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [3, -4],
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={styles.phoneSpeaker} />
            <View style={styles.tapZone}>
              <Text style={styles.tapZoneIcon}>)))</Text>
            </View>
          </Animated.View>
          <View style={styles.cardShape}>
            <View style={styles.cardChip} />
            <Text style={styles.cardMark}>DUNA</Text>
          </View>
        </>
      )}
      {(state === "approved" || state === "declined" || state === "error") && (
        <Animated.View style={{ transform: [{ scale: success }] }}>
          <View style={styles.resultIcon}>
            <Text style={styles.resultIconText}>
              {state === "approved" ? "✓" : state === "declined" ? "×" : "!"}
            </Text>
          </View>
        </Animated.View>
      )}
      <Text style={styles.motionAmount}>{money(amount, currency)}</Text>
      <Text style={styles.motionPrompt}>{prompt}</Text>
    </View>
  );
}

function GoalCard({
  workspace,
  onUpdated,
}: {
  readonly workspace: PaymentWorkspace;
  readonly onUpdated: (workspace: PaymentWorkspace) => void;
}) {
  const { client, mode } = useProRuntime();
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState("");
  const [period, setPeriod] = useState<"week" | "month" | "quarter" | "year">(
    "month",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const goal = workspace.earnings.goal;
  const progress = goal ? Math.min(1, goal.progressBps / 10_000) : 0;
  const save = async () => {
    if (!client || mode !== "live") {
      setError("Preview mode does not save goals.");
      return;
    }
    const minor = amountMinor(target);
    if (!minor) {
      setError("Enter a goal greater than zero.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const next = await client.operator.setEarningsGoal.mutate({
        targetMinor: minor,
        period,
      });
      onUpdated(next);
      setEditing(false);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Goal could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={styles.goalCard}>
      <View style={styles.goalTop}>
        <View>
          <Text style={styles.goalEyebrow}>YOUR EARNINGS</Text>
          <Text style={styles.goalAmount}>
            {money(workspace.earnings.periodNetMinor, workspace.currency)}
          </Text>
        </View>
        <Pressable
          onPress={() => setEditing((value) => !value)}
          style={styles.goalButton}
        >
          <Text style={styles.goalButtonText}>
            {goal ? "Edit goal" : "Set goal"}
          </Text>
        </Pressable>
      </View>
      {goal ? (
        <>
          <View style={styles.goalTrack}>
            <View
              style={[
                styles.goalFill,
                { width: `${Math.max(2, progress * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.goalMeta}>
            {Math.round(goal.progressBps / 100)}% of{" "}
            {money(goal.targetMinor, workspace.currency)} this {goal.period}
          </Text>
        </>
      ) : (
        <Text style={styles.goalMeta}>
          Add a goal and watch every approved payment move you closer.
        </Text>
      )}
      {editing && (
        <View style={styles.goalEditor}>
          <View style={styles.goalInputWrap}>
            <Text style={styles.goalCurrency}>$</Text>
            <TextInput
              keyboardType="decimal-pad"
              onChangeText={setTarget}
              placeholder="5,000"
              placeholderTextColor="#97a1b0"
              style={styles.goalInput}
              value={target}
            />
          </View>
          <View style={styles.goalPeriods}>
            {(["week", "month", "quarter", "year"] as const).map((value) => (
              <Pressable
                key={value}
                onPress={() => setPeriod(value)}
                style={[
                  styles.goalPeriod,
                  period === value && styles.goalPeriodOn,
                ]}
              >
                <Text
                  style={[
                    styles.goalPeriodText,
                    period === value && styles.goalPeriodTextOn,
                  ]}
                >
                  {value}
                </Text>
              </Pressable>
            ))}
          </View>
          {error && <Text style={styles.inlineError}>{error}</Text>}
          <Pressable
            disabled={busy}
            onPress={() => void save()}
            style={styles.goalSave}
          >
            {busy ? (
              <ActivityIndicator color="#22343b" />
            ) : (
              <Text style={styles.goalSaveText}>Save earnings goal</Text>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

function GetPaidFlow({
  onClose,
  onCreate,
}: {
  readonly onClose: () => void;
  readonly onCreate: () => void;
}) {
  const { client, mode, workspace: operatorWorkspace } = useProRuntime();
  const [workspace, setWorkspace] = useState<PaymentWorkspace>();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState("");
  const [search, setSearch] = useState("");
  const [payerId, setPayerId] = useState<string>();
  const [referenceKey, setReferenceKey] = useState("custom");
  const [customLabel, setCustomLabel] = useState("In-person payment");
  const [selectedTender, setSelectedTender] = useState<Tender>("card-present");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [collection, setCollection] = useState<PaymentCollection>();
  const [clientSecret, setClientSecret] = useState<string>();
  const [locationId, setLocationId] = useState<string>();
  const [readerPrompt, setReaderPrompt] = useState(
    "Preparing secure Tap to Pay…",
  );
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
      const previewPeople = (operatorWorkspace?.people ?? []).map((person) => ({
        personId: person.personId,
        displayName: person.displayName,
        avatarUrl: person.avatarUrl,
        isMinor: person.isMinor,
        creditBalance: person.creditBalance,
        cashAvailableMinor: 0,
        cashCurrency: operatorWorkspace?.organization.currency,
        cashWalletEnabled: false,
      }));
      const preview: PaymentWorkspace = {
        currency: operatorWorkspace?.organization.currency ?? "USD",
        terminal: {
          ready: false,
          stripeConfigured: false,
          connectedAccountReady: false,
          organizationAddressReady: false,
          merchantDisplayName:
            operatorWorkspace?.organization.name ?? "Duna Club",
          reason: "Preview mode does not process money.",
        },
        earnings: {
          todayGrossMinor: 42_500,
          todayNetMinor: 39_830,
          periodGrossMinor: 312_500,
          periodNetMinor: 294_300,
          goal: {
            id: "10000000-0000-4000-8000-000000000999",
            targetMinor: 500_000,
            period: "month",
            periodStartsAt: new Date().toISOString(),
            periodEndsAt: new Date(
              Date.now() + 30 * 24 * 60 * 60_000,
            ).toISOString(),
            progressMinor: 294_300,
            progressBps: 5_886,
          },
        },
        people: previewPeople,
        references: [],
        recent: [],
      };
      setWorkspace(preview);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(undefined);
    try {
      setWorkspace(await client.operator.paymentWorkspace.query());
    } catch (reason) {
      setLoadError(
        reason instanceof Error ? reason.message : "Payments could not load.",
      );
    } finally {
      setLoading(false);
    }
  }, [client, mode, operatorWorkspace]);

  useEffect(() => {
    void refreshWorkspace();
  }, [refreshWorkspace]);

  const selectedPerson = workspace?.people.find(
    (person) => person.personId === payerId,
  );
  const selectedReference = workspace?.references.find(
    (reference) => `${reference.type}:${reference.id}` === referenceKey,
  );
  const visiblePeople = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return (workspace?.people ?? []).filter((person) =>
      person.displayName.toLowerCase().includes(normalized),
    );
  }, [search, workspace]);
  const currentAmountMinor = amountMinor(amount);

  const next = () => {
    setError(undefined);
    if (step === 0 && currentAmountMinor <= 0) {
      setError("Enter the amount you want to collect.");
      return;
    }
    if (step === 1 && !payerId) {
      setError("Choose the player paying.");
      return;
    }
    if (
      step === 2 &&
      referenceKey === "custom" &&
      customLabel.trim().length < 2
    ) {
      setError("Add a short reason for this payment.");
      return;
    }
    setStep((value) => Math.min(3, value + 1));
  };

  const runCard = async (secret: string, terminalLocationId: string) => {
    if (!client || !collectionIdRef.current) return;
    setReaderPrompt("Starting Tap to Pay securely…");
    setResult(undefined);
    if (!terminal.isInitialized) {
      const initialized = await terminal.initialize();
      if (initialized.error) throw initialized.error;
      await logEvent({
        eventType: "reader.initialized",
        status: "awaiting-reader",
        message: "Stripe Terminal initialized on this device.",
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
    setReaderPrompt("Approved");
    if (Platform.OS !== "web") {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    await refreshWorkspace();
  };

  const collect = async () => {
    if (!workspace || !selectedPerson) return;
    if (!client || mode !== "live") {
      setError("Preview mode shows this flow but cannot collect live money.");
      return;
    }
    if (selectedTender === "card-present" && !workspace.terminal.ready) {
      setError(workspace.terminal.reason ?? "Tap to Pay is not ready.");
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const started = await client.operator.startPaymentCollection.mutate({
        amountMinor: currentAmountMinor,
        payerPersonId: selectedPerson.personId,
        referenceType: selectedReference?.type ?? "custom",
        referenceId: selectedReference?.id,
        referenceLabel: selectedReference?.label ?? customLabel.trim(),
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
        setReaderPrompt("Approved");
        if (Platform.OS !== "web") {
          void Haptics.notificationAsync(
            Haptics.NotificationFeedbackType.Success,
          );
        }
        await refreshWorkspace();
      }
    } catch (reason) {
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
      setResult(declined ? "declined" : "error");
      const message =
        stripeError.apiError?.message ??
        stripeError.message ??
        "The payment could not be completed.";
      setReaderPrompt(declined ? "Declined" : "We hit a snag");
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
    try {
      await runCard(clientSecret, locationId);
    } catch (reason) {
      const stripeError = reason as {
        readonly message?: string;
        readonly code?: string;
        readonly apiError?: {
          readonly code?: string;
          readonly declineCode?: string;
          readonly message?: string;
        };
      };
      const declined = Boolean(stripeError.apiError?.declineCode);
      const message =
        stripeError.apiError?.message ??
        stripeError.message ??
        "The retry did not complete.";
      setResult(declined ? "declined" : "error");
      setReaderPrompt(declined ? "Declined" : "We hit a snag");
      setError(message);
      await logEvent({
        eventType: declined ? "terminal.declined" : "terminal.error",
        status: declined ? "declined" : "failed",
        processorCode:
          stripeError.apiError?.declineCode ??
          stripeError.apiError?.code ??
          stripeError.code,
        message,
      }).catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const startAnother = () => {
    setStep(0);
    setAmount("");
    setPayerId(undefined);
    setReferenceKey("custom");
    setSelectedTender("card-present");
    setCollection(undefined);
    setClientSecret(undefined);
    setLocationId(undefined);
    setResult(undefined);
    setError(undefined);
    collectionIdRef.current = undefined;
  };

  if (loading && !workspace) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color="#3d6672" size="large" />
          <Text style={styles.centerText}>Opening payments…</Text>
        </View>
      </SafeAreaView>
    );
  }
  if (!workspace || loadError) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.loadTitle}>Payments need attention</Text>
          <Text style={styles.centerText}>
            {loadError ?? "Duna could not load this workspace."}
          </Text>
          <Pressable
            onPress={() => void refreshWorkspace()}
            style={styles.primaryButton}
          >
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.closeTextButton}>
            <Text style={styles.closeText}>Close</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
  if (collection && (busy || result)) {
    const motionState = result ?? "processing";
    return (
      <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
        <View style={styles.paymentTopbar}>
          <Pressable disabled={busy} onPress={onClose} style={styles.topButton}>
            <Text style={styles.topButtonText}>Close</Text>
          </Pressable>
          <Text style={styles.topTitle}>Get Paid</Text>
          <View style={styles.topButton} />
        </View>
        <ScrollView contentContainerStyle={styles.resultPage}>
          <PaymentMotion
            amount={collection.amountMinor}
            currency={collection.currency}
            prompt={readerPrompt}
            state={motionState}
          />
          {busy && (
            <View style={styles.secureLine}>
              <ActivityIndicator color="#3d6672" />
              <Text style={styles.secureText}>
                Keep Duna Pro open while the card is working.
              </Text>
            </View>
          )}
          {error && <Text style={styles.paymentError}>{error}</Text>}
          {result === "approved" && workspace && (
            <GoalCard onUpdated={setWorkspace} workspace={workspace} />
          )}
          {result === "approved" && (
            <View style={styles.resultActions}>
              <Pressable onPress={startAnother} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Collect another</Text>
              </Pressable>
              <Pressable onPress={onClose} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Done</Text>
              </Pressable>
            </View>
          )}
          {(result === "declined" || result === "error") && (
            <View style={styles.resultActions}>
              {collection.tender === "card-present" && clientSecret ? (
                <Pressable
                  disabled={busy}
                  onPress={() => void retryCard()}
                  style={styles.primaryButton}
                >
                  <Text style={styles.primaryButtonText}>Try card again</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={startAnother} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Change payment</Text>
              </Pressable>
            </View>
          )}
          <Text style={styles.loggedTrust}>
            This attempt—including a decline or error—is saved in transaction
            history.
          </Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
      <View style={styles.paymentTopbar}>
        <Pressable
          onPress={step ? () => setStep(step - 1) : onClose}
          style={styles.topButton}
        >
          <Text style={styles.topButtonText}>{step ? "‹ Back" : "Close"}</Text>
        </Pressable>
        <Text style={styles.topTitle}>Get Paid</Text>
        <Pressable onPress={onCreate} style={styles.topButton}>
          <Text style={[styles.topButtonText, styles.topButtonRight]}>
            Create
          </Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ProgressHeader step={step} />
        {step === 0 && (
          <>
            <GoalCard onUpdated={setWorkspace} workspace={workspace} />
            <Text style={styles.eyebrow}>AMOUNT</Text>
            <Text style={styles.title}>How much?</Text>
            <View style={styles.amountInputWrap}>
              <Text style={styles.amountCurrency}>$</Text>
              <TextInput
                autoFocus
                keyboardType="decimal-pad"
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor="#c2c8d0"
                style={styles.amountInput}
                value={amount}
              />
            </View>
            <View style={styles.quickAmounts}>
              {[50, 75, 100, 150].map((value) => (
                <Pressable
                  key={value}
                  onPress={() => setAmount(String(value))}
                  style={styles.quickAmount}
                >
                  <Text style={styles.quickAmountText}>${value}</Text>
                </Pressable>
              ))}
            </View>
            {workspace.recent.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>RECENT TRANSACTIONS</Text>
                <View style={styles.history}>
                  {workspace.recent.slice(0, 5).map((item) => (
                    <View key={item.id} style={styles.historyRow}>
                      <View
                        style={[
                          styles.historyDot,
                          item.status === "succeeded"
                            ? styles.historyDotGood
                            : item.status === "declined"
                              ? styles.historyDotBad
                              : styles.historyDotWait,
                        ]}
                      />
                      <View style={styles.flex}>
                        <Text style={styles.historyTitle}>
                          {item.payerName}
                        </Text>
                        <Text style={styles.historyMeta}>
                          {item.referenceLabel} · {item.status}
                        </Text>
                      </View>
                      <Text style={styles.historyAmount}>
                        {money(item.amountMinor, item.currency)}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </>
        )}
        {step === 1 && (
          <>
            <Text style={styles.eyebrow}>PLAYER</Text>
            <Text style={styles.title}>Who is paying?</Text>
            <TextInput
              onChangeText={setSearch}
              placeholder="Search people"
              placeholderTextColor="#98a2b3"
              style={styles.search}
              value={search}
            />
            <View style={styles.peopleList}>
              {visiblePeople.map((person) => (
                <Pressable
                  key={person.personId}
                  onPress={() => setPayerId(person.personId)}
                  style={[
                    styles.personRow,
                    payerId === person.personId && styles.personRowOn,
                  ]}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {person.displayName
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((part) => part[0])
                        .join("")}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.personName}>{person.displayName}</Text>
                    <Text style={styles.personMeta}>
                      {person.creditBalance} credits
                      {person.cashAvailableMinor
                        ? ` · ${money(person.cashAvailableMinor, person.cashCurrency ?? workspace.currency)} wallet`
                        : ""}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.radio,
                      payerId === person.personId && styles.radioOn,
                    ]}
                  >
                    {payerId === person.personId && (
                      <View style={styles.radioDot} />
                    )}
                  </View>
                </Pressable>
              ))}
              {visiblePeople.length === 0 && (
                <Text style={styles.empty}>
                  No connected people match that search.
                </Text>
              )}
            </View>
          </>
        )}
        {step === 2 && (
          <>
            <Text style={styles.eyebrow}>LINK</Text>
            <Text style={styles.title}>What is it for?</Text>
            <Pressable
              onPress={() => setReferenceKey("custom")}
              style={[
                styles.referenceRow,
                referenceKey === "custom" && styles.referenceRowOn,
              ]}
            >
              <View style={styles.referenceIcon}>
                <Text style={styles.referenceIconText}>＋</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.referenceTitle}>Custom payment</Text>
                <Text style={styles.referenceMeta}>
                  Add a clear note for the ledger
                </Text>
              </View>
            </Pressable>
            {referenceKey === "custom" && (
              <TextInput
                onChangeText={setCustomLabel}
                placeholder="What is this payment for?"
                placeholderTextColor="#98a2b3"
                style={styles.search}
                value={customLabel}
              />
            )}
            {workspace.references.map((reference) => {
              const key = `${reference.type}:${reference.id}`;
              return (
                <Pressable
                  key={key}
                  onPress={() => {
                    setReferenceKey(key);
                    if (!amount && reference.suggestedAmountMinor)
                      setAmount(String(reference.suggestedAmountMinor / 100));
                  }}
                  style={[
                    styles.referenceRow,
                    referenceKey === key && styles.referenceRowOn,
                  ]}
                >
                  <View style={styles.referenceIcon}>
                    <Text style={styles.referenceIconText}>
                      {reference.type === "session" ? "▦" : "◇"}
                    </Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.referenceTitle}>{reference.label}</Text>
                    <Text style={styles.referenceMeta}>
                      {reference.detail}
                      {reference.creditAmount
                        ? ` · ${reference.creditAmount} credits`
                        : ""}
                    </Text>
                  </View>
                  {reference.suggestedAmountMinor !== undefined && (
                    <Text style={styles.referencePrice}>
                      {money(
                        reference.suggestedAmountMinor,
                        workspace.currency,
                      )}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </>
        )}
        {step === 3 && (
          <>
            <Text style={styles.eyebrow}>COLLECT</Text>
            <Text style={styles.title}>Choose payment.</Text>
            <View style={styles.summary}>
              <View>
                <Text style={styles.summaryAmount}>
                  {money(currentAmountMinor, workspace.currency)}
                </Text>
                <Text style={styles.summaryMeta}>
                  {selectedPerson?.displayName} ·{" "}
                  {selectedReference?.label ?? customLabel}
                </Text>
              </View>
            </View>
            <View style={styles.tenders}>
              <Pressable
                onPress={() => setSelectedTender("card-present")}
                style={[
                  styles.tender,
                  selectedTender === "card-present" && styles.tenderOn,
                ]}
              >
                <View style={styles.tenderIcon}>
                  <Text style={styles.tenderIconText}>)))</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.tenderTitle}>Tap to Pay</Text>
                  <Text style={styles.tenderMeta}>
                    {workspace.terminal.ready
                      ? "Accept a contactless card or phone now"
                      : workspace.terminal.reason}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    selectedTender === "card-present" && styles.radioOn,
                  ]}
                >
                  {selectedTender === "card-present" && (
                    <View style={styles.radioDot} />
                  )}
                </View>
              </Pressable>
              <Pressable
                disabled={
                  !selectedReference?.creditAmount ||
                  (selectedPerson?.creditBalance ?? 0) <
                    (selectedReference?.creditAmount ?? 0)
                }
                onPress={() => setSelectedTender("organization-credit")}
                style={[
                  styles.tender,
                  selectedTender === "organization-credit" && styles.tenderOn,
                  (!selectedReference?.creditAmount ||
                    (selectedPerson?.creditBalance ?? 0) <
                      (selectedReference?.creditAmount ?? 0)) &&
                    styles.disabled,
                ]}
              >
                <View style={styles.tenderIcon}>
                  <Text style={styles.tenderIconText}>✦</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.tenderTitle}>Club credits</Text>
                  <Text style={styles.tenderMeta}>
                    {selectedReference?.creditAmount
                      ? `${selectedReference.creditAmount} needed · ${selectedPerson?.creditBalance ?? 0} available`
                      : "Link an item with a credit price"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    selectedTender === "organization-credit" && styles.radioOn,
                  ]}
                >
                  {selectedTender === "organization-credit" && (
                    <View style={styles.radioDot} />
                  )}
                </View>
              </Pressable>
              <Pressable
                disabled={
                  !selectedPerson?.cashWalletEnabled ||
                  selectedPerson.cashAvailableMinor < currentAmountMinor
                }
                onPress={() => setSelectedTender("wallet-cash")}
                style={[
                  styles.tender,
                  selectedTender === "wallet-cash" && styles.tenderOn,
                  (!selectedPerson?.cashWalletEnabled ||
                    selectedPerson.cashAvailableMinor < currentAmountMinor) &&
                    styles.disabled,
                ]}
              >
                <View style={styles.tenderIcon}>
                  <Text style={styles.tenderIconText}>$</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.tenderTitle}>Cash wallet</Text>
                  <Text style={styles.tenderMeta}>
                    {selectedPerson?.cashWalletEnabled
                      ? `${money(selectedPerson.cashAvailableMinor, selectedPerson.cashCurrency ?? workspace.currency)} available`
                      : "Not available for this player"}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    selectedTender === "wallet-cash" && styles.radioOn,
                  ]}
                >
                  {selectedTender === "wallet-cash" && (
                    <View style={styles.radioDot} />
                  )}
                </View>
              </Pressable>
            </View>
            <View style={styles.netCard}>
              <Text style={styles.netLabel}>PAYMENT TOTAL</Text>
              <Text style={styles.netAmount}>
                {money(currentAmountMinor, workspace.currency)}
              </Text>
              <Text style={styles.netMeta}>
                After approval, Duna records processing, commission, refunds,
                and the club’s net earnings separately.
              </Text>
            </View>
          </>
        )}
        {error && <Text style={styles.paymentError}>{error}</Text>}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable
          disabled={busy}
          onPress={step < 3 ? next : () => void collect()}
          style={[styles.primaryButton, busy && styles.disabled]}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryButtonText}>
              {step < 3
                ? "Continue"
                : selectedTender === "card-present"
                  ? `Collect ${money(currentAmountMinor, workspace.currency)}`
                  : "Confirm wallet payment"}
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

export function GetPaidScreen({
  onClose,
  onCreate,
}: {
  readonly onClose: () => void;
  readonly onCreate: () => void;
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
      <GetPaidFlow onClose={onClose} onCreate={onCreate} />
    </StripeTerminalProvider>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: "#f6f5f1", flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  center: {
    alignItems: "center",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 28,
  },
  centerText: {
    color: "#766f61",
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  loadTitle: {
    color: "#1b1b19",
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
  },
  paymentTopbar: {
    alignItems: "center",
    borderBottomColor: "#e7e4dc",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 58,
    paddingHorizontal: 16,
  },
  topButton: { justifyContent: "center", minHeight: 48, minWidth: 72 },
  topButtonText: { color: "#3d6672", fontSize: 15, fontWeight: "800" },
  topButtonRight: { textAlign: "right" },
  topTitle: { color: "#1b1b19", fontSize: 17, fontWeight: "900" },
  content: { padding: 20, paddingBottom: 128 },
  progressRow: { flexDirection: "row", gap: 6, marginBottom: 28, marginTop: 8 },
  progress: { backgroundColor: "#dfe3e8", borderRadius: 4, flex: 1, height: 5 },
  progressOn: { backgroundColor: "#3d6672" },
  eyebrow: {
    color: "#3d6672",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    marginTop: 10,
  },
  title: {
    color: "#1b1b19",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1.2,
    lineHeight: 39,
    marginTop: 7,
  },
  amountInputWrap: {
    alignItems: "center",
    borderBottomColor: "#cbd2dc",
    borderBottomWidth: 2,
    flexDirection: "row",
    marginTop: 36,
    paddingBottom: 8,
  },
  amountCurrency: {
    color: "#3d6672",
    fontFamily: "Archivo-ExtraBold",
    fontSize: 38,
    fontWeight: "900",
    marginRight: 6,
  },
  amountInput: {
    color: "#1b1b19",
    flex: 1,
    fontFamily: "Archivo-ExtraBold",
    fontSize: 56,
    fontWeight: "900",
    letterSpacing: -2,
    minHeight: 78,
    padding: 0,
  },
  quickAmounts: { flexDirection: "row", gap: 8, marginTop: 14 },
  quickAmount: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#d9dee7",
    borderRadius: 13,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 50,
  },
  quickAmountText: { color: "#3d6672", fontSize: 13, fontWeight: "900" },
  goalCard: {
    backgroundColor: "#22343b",
    borderRadius: 22,
    marginBottom: 28,
    padding: 18,
  },
  goalTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  goalEyebrow: {
    color: "#d9bd82",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  goalAmount: {
    color: "#fff",
    fontFamily: "Archivo-ExtraBold",
    fontSize: 24,
    fontWeight: "900",
    marginTop: 4,
  },
  goalButton: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,.22)",
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 13,
  },
  goalButtonText: { color: "#fff", fontSize: 11, fontWeight: "900" },
  goalTrack: {
    backgroundColor: "rgba(255,255,255,.14)",
    borderRadius: 6,
    height: 8,
    marginTop: 17,
    overflow: "hidden",
  },
  goalFill: { backgroundColor: "#d4b77c", borderRadius: 6, height: 8 },
  goalMeta: {
    color: "rgba(255,255,255,.68)",
    fontSize: 10,
    lineHeight: 15,
    marginTop: 8,
  },
  goalEditor: { gap: 10, marginTop: 16 },
  goalInputWrap: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,.12)",
    borderRadius: 13,
    flexDirection: "row",
    minHeight: 54,
    paddingHorizontal: 13,
  },
  goalCurrency: { color: "#fff", fontSize: 18, fontWeight: "900" },
  goalInput: {
    color: "#fff",
    flex: 1,
    fontSize: 20,
    fontWeight: "900",
    minHeight: 52,
    paddingHorizontal: 8,
  },
  goalPeriods: { flexDirection: "row", gap: 6 },
  goalPeriod: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,.2)",
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 40,
  },
  goalPeriodOn: { backgroundColor: "#fff" },
  goalPeriodText: {
    color: "rgba(255,255,255,.7)",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  goalPeriodTextOn: { color: "#22343b" },
  goalSave: {
    alignItems: "center",
    backgroundColor: "#d4b77c",
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 48,
  },
  goalSaveText: { color: "#22343b", fontSize: 11, fontWeight: "900" },
  inlineError: { color: "#ffd0d0", fontSize: 10, lineHeight: 15 },
  sectionLabel: {
    color: "#766f61",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 34,
  },
  history: {
    backgroundColor: "#fff",
    borderColor: "#e5e8ed",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 10,
    overflow: "hidden",
  },
  historyRow: {
    alignItems: "center",
    borderBottomColor: "#edf0f3",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 68,
    paddingHorizontal: 13,
  },
  historyDot: { borderRadius: 5, height: 10, width: 10 },
  historyDotGood: { backgroundColor: "#2f6b3a" },
  historyDotBad: { backgroundColor: "#9a4a2e" },
  historyDotWait: { backgroundColor: "#ba7d24" },
  historyTitle: { color: "#1b1b19", fontSize: 12, fontWeight: "900" },
  historyMeta: {
    color: "#766f61",
    fontSize: 10,
    marginTop: 3,
    textTransform: "capitalize",
  },
  historyAmount: {
    color: "#1b1b19",
    fontFamily: "Archivo-Bold",
    fontSize: 12,
    fontWeight: "900",
  },
  search: {
    backgroundColor: "#fff",
    borderColor: "#d9dee7",
    borderRadius: 15,
    borderWidth: 1,
    color: "#1b1b19",
    fontSize: 15,
    marginTop: 22,
    minHeight: 56,
    paddingHorizontal: 15,
  },
  peopleList: { gap: 9, marginTop: 13 },
  personRow: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e2e5ea",
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 76,
    padding: 12,
  },
  personRowOn: { backgroundColor: "#edece6", borderColor: "#3d6672" },
  avatar: {
    alignItems: "center",
    backgroundColor: "#e9edf3",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  avatarText: { color: "#3d6672", fontSize: 13, fontWeight: "900" },
  personName: { color: "#1b1b19", fontSize: 14, fontWeight: "900" },
  personMeta: { color: "#766f61", fontSize: 10, marginTop: 4 },
  radio: {
    alignItems: "center",
    borderColor: "#bfc6d0",
    borderRadius: 12,
    borderWidth: 2,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  radioOn: { borderColor: "#3d6672" },
  radioDot: {
    backgroundColor: "#3d6672",
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  empty: { color: "#766f61", fontSize: 13, padding: 24, textAlign: "center" },
  referenceRow: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e2e5ea",
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
    minHeight: 78,
    padding: 12,
  },
  referenceRowOn: { backgroundColor: "#edece6", borderColor: "#3d6672" },
  referenceIcon: {
    alignItems: "center",
    backgroundColor: "#eef3f8",
    borderRadius: 13,
    height: 46,
    justifyContent: "center",
    width: 46,
  },
  referenceIconText: { color: "#3d6672", fontSize: 20, fontWeight: "900" },
  referenceTitle: { color: "#1b1b19", fontSize: 13, fontWeight: "900" },
  referenceMeta: {
    color: "#766f61",
    fontSize: 10,
    lineHeight: 13,
    marginTop: 4,
  },
  referencePrice: {
    color: "#1b1b19",
    fontFamily: "Archivo-Bold",
    fontSize: 12,
    fontWeight: "900",
  },
  summary: {
    backgroundColor: "#22343b",
    borderRadius: 20,
    marginTop: 22,
    padding: 18,
  },
  summaryAmount: {
    color: "#fff",
    fontFamily: "Archivo-ExtraBold",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
  },
  summaryMeta: { color: "rgba(255,255,255,.68)", fontSize: 11, marginTop: 6 },
  tenders: { gap: 10, marginTop: 16 },
  tender: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#e2e5ea",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 86,
    padding: 13,
  },
  tenderOn: { backgroundColor: "#edece6", borderColor: "#3d6672" },
  tenderIcon: {
    alignItems: "center",
    backgroundColor: "#22343b",
    borderRadius: 14,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  tenderIconText: { color: "#d4b77c", fontSize: 17, fontWeight: "900" },
  tenderTitle: { color: "#1b1b19", fontSize: 14, fontWeight: "900" },
  tenderMeta: { color: "#766f61", fontSize: 10, lineHeight: 13, marginTop: 4 },
  disabled: { opacity: 0.45 },
  netCard: {
    backgroundColor: "#eef5f1",
    borderRadius: 17,
    marginTop: 16,
    padding: 15,
  },
  netLabel: {
    color: "#3d7d66",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  netAmount: {
    color: "#245b46",
    fontFamily: "Archivo-ExtraBold",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 5,
  },
  netMeta: { color: "#587466", fontSize: 10, lineHeight: 14, marginTop: 5 },
  paymentError: {
    backgroundColor: "#fff0f0",
    borderRadius: 13,
    color: "#9a4a2e",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 16,
    padding: 13,
  },
  footer: {
    backgroundColor: "rgba(248,247,243,.96)",
    borderTopColor: "#e7e4dc",
    borderTopWidth: 1,
    bottom: 0,
    left: 0,
    padding: 14,
    position: "absolute",
    right: 0,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#3d6672",
    borderRadius: 16,
    justifyContent: "center",
    minHeight: 58,
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: "#fff", fontSize: 15, fontWeight: "900" },
  secondaryButton: {
    alignItems: "center",
    backgroundColor: "#fff",
    borderColor: "#d9dee7",
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 56,
  },
  secondaryButtonText: { color: "#3d6672", fontSize: 14, fontWeight: "900" },
  closeTextButton: { minHeight: 48, padding: 14 },
  closeText: { color: "#3d6672", fontSize: 13, fontWeight: "900" },
  resultPage: { padding: 18, paddingBottom: 50 },
  motion: {
    alignItems: "center",
    borderRadius: 28,
    justifyContent: "center",
    minHeight: 430,
    overflow: "hidden",
    padding: 24,
  },
  orbit: {
    borderColor: "#d4b77c",
    borderRadius: 150,
    borderWidth: 2,
    height: 280,
    position: "absolute",
    top: 42,
    width: 280,
  },
  phone: {
    alignItems: "center",
    backgroundColor: "#091b2f",
    borderColor: "rgba(255,255,255,.45)",
    borderRadius: 30,
    borderWidth: 2,
    height: 190,
    justifyContent: "flex-start",
    paddingTop: 14,
    width: 104,
  },
  phoneSpeaker: {
    backgroundColor: "rgba(255,255,255,.25)",
    borderRadius: 3,
    height: 5,
    width: 30,
  },
  tapZone: {
    alignItems: "center",
    backgroundColor: "rgba(212,183,124,.12)",
    borderColor: "#d4b77c",
    borderRadius: 32,
    borderWidth: 2,
    height: 64,
    justifyContent: "center",
    marginTop: 20,
    width: 64,
  },
  tapZoneIcon: {
    color: "#d4b77c",
    fontSize: 17,
    fontWeight: "900",
    transform: [{ rotate: "90deg" }],
  },
  cardShape: {
    backgroundColor: "#f5dfaa",
    borderRadius: 15,
    height: 92,
    padding: 13,
    position: "absolute",
    right: 30,
    top: 158,
    transform: [{ rotate: "-11deg" }],
    width: 146,
  },
  cardChip: {
    backgroundColor: "#c3a356",
    borderRadius: 4,
    height: 24,
    width: 32,
  },
  cardMark: {
    color: "#604b24",
    fontSize: 10,
    fontWeight: "900",
    marginTop: "auto",
    textAlign: "right",
  },
  resultIcon: {
    alignItems: "center",
    borderColor: "rgba(255,255,255,.7)",
    borderRadius: 70,
    borderWidth: 3,
    height: 140,
    justifyContent: "center",
    width: 140,
  },
  resultIconText: {
    color: "#fff",
    fontSize: 78,
    fontWeight: "800",
    lineHeight: 88,
  },
  motionAmount: {
    bottom: 64,
    color: "#fff",
    fontFamily: "Archivo-ExtraBold",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: -1,
    position: "absolute",
  },
  motionPrompt: {
    bottom: 33,
    color: "rgba(255,255,255,.72)",
    fontSize: 11,
    fontWeight: "700",
    maxWidth: 280,
    position: "absolute",
    textAlign: "center",
  },
  secureLine: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    marginTop: 16,
  },
  secureText: { color: "#766f61", fontSize: 10, fontWeight: "700" },
  resultActions: { gap: 9, marginTop: 18 },
  loggedTrust: {
    color: "#766f61",
    fontSize: 10,
    lineHeight: 14,
    marginTop: 15,
    textAlign: "center",
  },
});
