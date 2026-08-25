import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useMemo, useRef, useState } from "react";
import { dunaWebUrl, type PlayerDunaAiResponse } from "./mobile-api";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "./satoshi-text";
import { usePlayerRuntime } from "./runtime";

export interface PlayerDunaAiPalette {
  readonly canvas: string;
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly border: string;
  readonly text: string;
  readonly muted: string;
  readonly accent: string;
  readonly onAccent: string;
  readonly positive: string;
  readonly warning: string;
  readonly danger: string;
}

interface ChatTurn {
  readonly id: string;
  readonly role: "assistant" | "user";
  readonly body: string;
  readonly response?: PlayerDunaAiResponse;
}

type PlayerDunaAiCard = PlayerDunaAiResponse["cards"][number];
type ApprovalCard = Extract<PlayerDunaAiCard, { readonly kind: "approval" }>;

const initialSuggestions = [
  "What is next on my calendar?",
  "Find an event that fits my schedule",
  "Show my recent matches",
  "Help me book a court",
];

function previewResponse(): PlayerDunaAiResponse {
  return {
    reply:
      "This preview can show how Duna AI works, but it cannot read or change a live player account. Sign in to compare real events, inspect your calendar and matches, or open a secure booking flow.",
    cards: [
      {
        kind: "notice",
        title: "Preview is read-only",
        detail:
          "A signed-in player gets permission-scoped answers and native booking widgets. Purchases and consequential actions still require checkout or exact review.",
        tone: "warning",
      },
    ],
    suggestions: initialSuggestions,
    toolsUsed: [],
    reasoningEffort: "high",
    providerAvailable: false,
    researchUsed: false,
  };
}

function formatDate(value: string | undefined, timezone?: string): string {
  if (!value) return "Time to be announced";
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      ...(timezone ? { timeZone: timezone } : {}),
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}

function mediaUrl(value: string): string {
  return /^(?:data:|file:|https?:\/\/)/i.test(value)
    ? value
    : `${dunaWebUrl}${value.startsWith("/") ? value : `/${value}`}`;
}

function cardKey(card: PlayerDunaAiCard, index: number): string {
  if (card.kind === "event") return `event-${card.eventId}`;
  if (card.kind === "venue") return `venue-${card.venueId}`;
  if (card.kind === "match") return `match-${card.matchId}`;
  if (card.kind === "approval") return `approval-${card.draft.id}`;
  return `${card.kind}-${card.title}-${index}`;
}

export function PlayerDunaAiScreen({
  onClose,
  onOpenBooking,
  onOpenEvent,
  onOpenMatch,
  onOpenPath,
  onOpenVenue,
  palette,
  pathname,
}: {
  readonly onClose: () => void;
  readonly onOpenBooking: (bookingId: string) => void;
  readonly onOpenEvent: (
    eventId: string,
    action: "book-event" | "view-event",
    href: string,
  ) => void;
  readonly onOpenMatch: (matchId: string, href?: string) => void;
  readonly onOpenPath: (href: string) => void;
  readonly onOpenVenue: (venueId: string, href: string) => void;
  readonly palette: PlayerDunaAiPalette;
  readonly pathname: string;
}) {
  const runtime = usePlayerRuntime();
  const scroll = useRef<ScrollView>(null);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [suggestions, setSuggestions] = useState<string[]>(initialSuggestions);
  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      id: "welcome",
      role: "assistant",
      body: "I’m Duna AI for your game. Ask me to find and compare places to play, explain your matches, check your calendar, gather booking details, or prepare an account action for review.",
    },
  ]);
  const getSuggestions = runtime.getDunaAiSuggestions;

  useEffect(() => {
    if (!getSuggestions) return;
    let active = true;
    void getSuggestions({
      pathname,
      pageTitle: "Duna Player copilot",
    })
      .then((response) => {
        if (!active) return;
        setSuggestions([...response.suggestions]);
        if (response.cards.length > 0) {
          setTurns((current) =>
            current.some(
              (turn) => turn.id === "player-context" || turn.role === "user",
            )
              ? current
              : [
                  ...current,
                  {
                    id: "player-context",
                    role: "assistant",
                    body: response.reply,
                    response,
                  },
                ],
          );
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [getSuggestions, pathname]);

  const ask = async (text: string) => {
    const value = text.trim();
    if (!value || busy) return;
    const userTurn: ChatTurn = {
      id: `user-${Date.now()}`,
      role: "user",
      body: value,
    };
    const nextTurns = [...turns, userTurn];
    setTurns(nextTurns);
    setMessage("");
    setError(undefined);
    setBusy(true);
    try {
      const response = runtime.askDunaAi
        ? await runtime.askDunaAi({
            message: value,
            pathname,
            pageTitle: "Duna Player copilot",
            history: nextTurns.slice(-8).map(({ role, body }) => ({
              role,
              body,
            })),
          })
        : previewResponse();
      setSuggestions([...response.suggestions]);
      setTurns((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          body: response.reply,
          response,
        },
      ]);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Duna AI could not complete that request.",
      );
    } finally {
      setBusy(false);
      requestAnimationFrame(() =>
        scroll.current?.scrollToEnd({ animated: true }),
      );
    }
  };

  const approve = async (card: ApprovalCard) => {
    if (!runtime.confirmDunaAiAction || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const outcome = await runtime.confirmDunaAiAction({
        draftId: card.draft.id,
        confirmationNonce: card.draft.confirmationNonce,
      });
      await runtime.refresh();
      setTurns((current) => [
        ...current,
        {
          id: `outcome-${Date.now()}`,
          role: "assistant",
          body: outcome.reply,
        },
      ]);
      if (outcome.href) onOpenPath(outcome.href);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The approved action could not be applied.",
      );
    } finally {
      setBusy(false);
    }
  };

  const renderCard = (card: PlayerDunaAiCard, index: number) => {
    if (card.kind === "event") {
      return (
        <View key={cardKey(card, index)} style={styles.card}>
          {card.imageUrl && (
            <Image
              accessibilityLabel=""
              resizeMode="cover"
              source={{ uri: mediaUrl(card.imageUrl) }}
              style={styles.heroImage}
            />
          )}
          <Text style={styles.cardEyebrow}>EVENT</Text>
          <Text style={styles.cardTitle}>{card.title}</Text>
          <Text style={styles.cardDetail}>{card.detail}</Text>
          <View style={styles.factList}>
            {card.startsAt && (
              <Text style={styles.fact}>{formatDate(card.startsAt)}</Text>
            )}
            {card.price && <Text style={styles.fact}>{card.price}</Text>}
            {card.spotsRemaining !== undefined && (
              <Text style={styles.fact}>
                {card.spotsRemaining === 0
                  ? "Waitlist or availability details"
                  : `${card.spotsRemaining} spot${card.spotsRemaining === 1 ? "" : "s"} left`}
              </Text>
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              onOpenEvent(
                card.eventId,
                card.primaryAction ?? "view-event",
                card.href,
              )
            }
            style={styles.primaryAction}
          >
            <Text style={styles.primaryActionText}>
              {card.primaryAction === "book-event"
                ? "Choose division and book"
                : "View event"}
            </Text>
          </Pressable>
        </View>
      );
    }

    if (card.kind === "venue") {
      return (
        <View key={cardKey(card, index)} style={styles.card}>
          {card.imageUrl && (
            <Image
              accessibilityLabel=""
              resizeMode="cover"
              source={{ uri: mediaUrl(card.imageUrl) }}
              style={styles.heroImage}
            />
          )}
          <Text style={styles.cardEyebrow}>VENUE</Text>
          <Text style={styles.cardTitle}>{card.title}</Text>
          <Text style={styles.cardDetail}>{card.detail}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenVenue(card.venueId, card.href)}
            style={styles.primaryAction}
          >
            <Text style={styles.primaryActionText}>
              Check courts and reserve
            </Text>
          </Pressable>
        </View>
      );
    }

    if (card.kind === "calendar") {
      return (
        <View key={cardKey(card, index)} style={styles.card}>
          <Text style={styles.cardEyebrow}>YOUR CALENDAR</Text>
          <Text style={styles.cardTitle}>{card.title}</Text>
          <Text style={styles.cardDetail}>{card.detail}</Text>
          <View style={styles.stack}>
            {card.entries.map((entry) => (
              <Pressable
                accessibilityRole="button"
                disabled={!entry.bookingId && !entry.eventId}
                key={entry.id}
                onPress={() => {
                  if (entry.bookingId) onOpenBooking(entry.bookingId);
                  else if (entry.eventId)
                    onOpenEvent(
                      entry.eventId,
                      "view-event",
                      `/events/${entry.eventId}`,
                    );
                }}
                style={styles.calendarRow}
              >
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{entry.title}</Text>
                  <Text style={styles.rowDetail}>
                    {formatDate(entry.startsAt, entry.timezone)}
                  </Text>
                  <Text style={styles.rowDetail}>{entry.venue}</Text>
                </View>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>{entry.status}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      );
    }

    if (card.kind === "match") {
      return (
        <View key={cardKey(card, index)} style={styles.card}>
          <View style={styles.cardHeadingRow}>
            <Text style={styles.cardEyebrow}>
              {card.live ? "LIVE MATCH" : "MATCH"}
            </Text>
            {card.ratingDelta !== undefined && (
              <Text
                style={[
                  styles.delta,
                  card.ratingDelta >= 0
                    ? styles.positiveText
                    : styles.dangerText,
                ]}
              >
                {card.ratingDelta > 0 ? "+" : ""}
                {card.ratingDelta}
              </Text>
            )}
          </View>
          <Text style={styles.cardTitle}>{card.title}</Text>
          {(card.playedAt || card.startsAt) && (
            <Text style={styles.cardDetail}>
              {formatDate(card.playedAt ?? card.startsAt)}
              {card.venue ? ` · ${card.venue}` : ""}
            </Text>
          )}
          <View style={styles.matchup}>
            <Text style={styles.team}>{card.teamA.join(" / ")}</Text>
            <Text style={styles.score}>
              {card.score?.length
                ? card.score
                    .map(([left, right]) => `${left}–${right}`)
                    .join("  ")
                : "VS"}
            </Text>
            <Text style={styles.team}>{card.teamB.join(" / ")}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenMatch(card.matchId, card.href)}
            style={styles.secondaryAction}
          >
            <Text style={styles.secondaryActionText}>Open match details</Text>
          </Pressable>
        </View>
      );
    }

    if (card.kind === "map") {
      return (
        <View key={cardKey(card, index)} style={styles.card}>
          <Text style={styles.cardEyebrow}>NEARBY OPTIONS</Text>
          <Text style={styles.cardTitle}>{card.title}</Text>
          <Text style={styles.cardDetail}>{card.detail}</Text>
          <View style={styles.stack}>
            {card.points.map((point) => (
              <Pressable
                accessibilityRole="button"
                key={point.id}
                onPress={() => onOpenPath(point.href)}
                style={styles.optionRow}
              >
                <View style={styles.rowCopy}>
                  <Text style={styles.rowTitle}>{point.title}</Text>
                  <Text style={styles.rowDetail}>{point.subtitle}</Text>
                  {point.startsAt && (
                    <Text style={styles.rowDetail}>
                      {formatDate(point.startsAt)}
                    </Text>
                  )}
                </View>
                <Text style={styles.rowArrow}>→</Text>
              </Pressable>
            ))}
          </View>
        </View>
      );
    }

    if (card.kind === "metric") {
      return (
        <View key={cardKey(card, index)} style={styles.card}>
          <Text style={styles.cardEyebrow}>YOUR GAME</Text>
          <Text style={styles.cardTitle}>{card.title}</Text>
          <Text style={styles.cardDetail}>{card.detail}</Text>
          <View style={styles.metricGrid}>
            {card.metrics.map((metric) => (
              <View key={metric.label} style={styles.metric}>
                <Text style={styles.metricValue}>{metric.value}</Text>
                <Text style={styles.metricLabel}>{metric.label}</Text>
                {metric.change && (
                  <Text style={styles.metricChange}>{metric.change}</Text>
                )}
              </View>
            ))}
          </View>
        </View>
      );
    }

    if (card.kind === "approval") {
      return (
        <View
          key={cardKey(card, index)}
          style={[styles.card, styles.approvalCard]}
        >
          <Text style={styles.cardEyebrow}>REVIEW REQUIRED</Text>
          <Text style={styles.cardTitle}>{card.title}</Text>
          <Text style={styles.cardDetail}>{card.detail}</Text>
          <View style={styles.stack}>
            {card.changes.map((change) => (
              <View key={change} style={styles.changeRow}>
                <Text style={styles.changeMark}>✓</Text>
                <Text style={styles.changeText}>{change}</Text>
              </View>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void approve(card)}
            style={styles.primaryAction}
          >
            <Text style={styles.primaryActionText}>
              Approve this exact change
            </Text>
          </Pressable>
          <Text style={styles.expiry}>
            Review expires at{" "}
            {new Date(card.draft.expiresAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </Text>
        </View>
      );
    }

    return (
      <View key={cardKey(card, index)} style={styles.card}>
        <Text style={styles.cardTitle}>{card.title}</Text>
        <Text style={styles.cardDetail}>{card.detail}</Text>
        {card.href && (
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenPath(card.href!)}
            style={styles.secondaryAction}
          >
            <Text style={styles.secondaryActionText}>Open in Duna</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView edges={["bottom"]} style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.safe}
      >
        <View style={styles.header}>
          <View style={styles.brandLockup}>
            <View style={styles.aiMark}>
              <Text style={styles.aiMarkText}>AI</Text>
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.headerTitle}>Duna AI</Text>
              <Text style={styles.headerContext}>PRIVATE PLAYER COPILOT</Text>
            </View>
          </View>
          <Pressable
            accessibilityLabel="Close Duna AI"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.close}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.conversation}
          keyboardShouldPersistTaps="handled"
          ref={scroll}
        >
          {turns.map((turn) => (
            <View
              key={turn.id}
              style={[
                styles.bubble,
                turn.role === "user" ? styles.userBubble : styles.aiBubble,
              ]}
            >
              {turn.role === "assistant" && (
                <Text style={styles.bubbleLabel}>DUNA AI</Text>
              )}
              <Text
                style={[
                  styles.bubbleText,
                  turn.role === "user" && styles.userBubbleText,
                ]}
              >
                {turn.body}
              </Text>
              {turn.response?.cards.map(renderCard)}
            </View>
          ))}
          {busy && (
            <View style={styles.thinking}>
              <ActivityIndicator color={palette.accent} size="small" />
              <Text style={styles.thinkingText}>
                Checking your live Duna context…
              </Text>
            </View>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.composerShell}>
          <ScrollView
            contentContainerStyle={styles.suggestions}
            horizontal
            keyboardShouldPersistTaps="handled"
            showsHorizontalScrollIndicator={false}
          >
            {suggestions.map((suggestion) => (
              <Pressable
                accessibilityRole="button"
                disabled={busy}
                key={suggestion}
                onPress={() => void ask(suggestion)}
                style={styles.suggestion}
              >
                <Text style={styles.suggestionText}>{suggestion}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.composer}>
            <TextInput
              accessibilityLabel="Ask Duna AI"
              editable={!busy}
              multiline
              onChangeText={setMessage}
              placeholder="Ask about matches, plans, events, or booking…"
              placeholderTextColor={palette.muted}
              style={styles.input}
              value={message}
            />
            <Pressable
              accessibilityLabel="Send to Duna AI"
              accessibilityRole="button"
              disabled={!message.trim() || busy}
              onPress={() => void ask(message)}
              style={[
                styles.send,
                (!message.trim() || busy) && styles.sendDisabled,
              ]}
            >
              <Text style={styles.sendText}>↑</Text>
            </Pressable>
          </View>
          <Text style={styles.safety}>
            Duna reads only the account context your permissions allow.
            Purchases, cancellations, and other consequential actions require
            the exact checkout or review shown here.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(palette: PlayerDunaAiPalette) {
  return StyleSheet.create({
    safe: { backgroundColor: palette.canvas, flex: 1 },
    header: {
      alignItems: "center",
      backgroundColor: palette.surface,
      borderBottomColor: palette.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 10,
    },
    brandLockup: { alignItems: "center", flexDirection: "row", gap: 10 },
    aiMark: {
      alignItems: "center",
      backgroundColor: palette.accent,
      borderRadius: 13,
      height: 46,
      justifyContent: "center",
      width: 46,
    },
    aiMarkText: { color: palette.onAccent, fontSize: 15, fontWeight: "900" },
    headerCopy: { gap: 1 },
    headerTitle: { color: palette.text, fontSize: 18, fontWeight: "900" },
    headerContext: {
      color: palette.muted,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.8,
    },
    close: {
      alignItems: "center",
      backgroundColor: palette.surfaceAlt,
      borderRadius: 24,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    closeText: { color: palette.text, fontSize: 27, lineHeight: 29 },
    conversation: { gap: 12, padding: 16, paddingBottom: 24 },
    bubble: { borderRadius: 20, gap: 10, maxWidth: "94%", padding: 15 },
    aiBubble: {
      alignSelf: "flex-start",
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderWidth: 1,
    },
    userBubble: {
      alignSelf: "flex-end",
      backgroundColor: palette.accent,
      maxWidth: "86%",
    },
    bubbleLabel: {
      color: palette.warning,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1,
    },
    bubbleText: { color: palette.text, fontSize: 15, lineHeight: 22 },
    userBubbleText: { color: palette.onAccent },
    card: {
      backgroundColor: palette.surfaceAlt,
      borderColor: palette.border,
      borderRadius: 16,
      borderWidth: 1,
      gap: 7,
      overflow: "hidden",
      padding: 13,
    },
    approvalCard: { borderColor: palette.warning, borderWidth: 1.5 },
    heroImage: {
      borderRadius: 11,
      height: 128,
      marginBottom: 4,
      width: "100%",
    },
    cardHeadingRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    cardEyebrow: {
      color: palette.warning,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    cardTitle: { color: palette.text, fontSize: 16, fontWeight: "900" },
    cardDetail: { color: palette.muted, fontSize: 14, lineHeight: 20 },
    factList: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    fact: {
      backgroundColor: palette.surface,
      borderRadius: 8,
      color: palette.text,
      fontSize: 12,
      fontWeight: "700",
      overflow: "hidden",
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    stack: { gap: 8, marginTop: 3 },
    calendarRow: {
      alignItems: "center",
      backgroundColor: palette.surface,
      borderRadius: 12,
      flexDirection: "row",
      gap: 8,
      minHeight: 64,
      padding: 11,
    },
    optionRow: {
      alignItems: "center",
      backgroundColor: palette.surface,
      borderRadius: 12,
      flexDirection: "row",
      minHeight: 58,
      padding: 11,
    },
    rowCopy: { flex: 1, gap: 2, minWidth: 0 },
    rowTitle: { color: palette.text, fontSize: 14, fontWeight: "800" },
    rowDetail: { color: palette.muted, fontSize: 12, lineHeight: 17 },
    rowArrow: { color: palette.accent, fontSize: 20, fontWeight: "700" },
    statusPill: {
      backgroundColor: palette.surfaceAlt,
      borderRadius: 999,
      maxWidth: 92,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    statusText: {
      color: palette.muted,
      fontSize: 12,
      fontWeight: "800",
      textTransform: "capitalize",
    },
    matchup: {
      backgroundColor: palette.surface,
      borderRadius: 12,
      gap: 5,
      marginTop: 3,
      padding: 12,
    },
    team: { color: palette.text, fontSize: 14, fontWeight: "800" },
    score: {
      color: palette.accent,
      fontSize: 20,
      fontWeight: "900",
      letterSpacing: -0.4,
    },
    delta: { fontSize: 14, fontWeight: "900" },
    positiveText: { color: palette.positive },
    dangerText: { color: palette.danger },
    metricGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 3,
    },
    metric: {
      backgroundColor: palette.surface,
      borderRadius: 12,
      minHeight: 78,
      padding: 10,
      width: "48%",
    },
    metricValue: { color: palette.text, fontSize: 21, fontWeight: "900" },
    metricLabel: { color: palette.muted, fontSize: 12, lineHeight: 16 },
    metricChange: {
      color: palette.positive,
      fontSize: 12,
      fontWeight: "800",
      marginTop: 3,
    },
    changeRow: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
    changeMark: { color: palette.positive, fontSize: 14, fontWeight: "900" },
    changeText: { color: palette.text, flex: 1, fontSize: 14, lineHeight: 20 },
    primaryAction: {
      alignItems: "center",
      backgroundColor: palette.accent,
      borderRadius: 12,
      justifyContent: "center",
      marginTop: 5,
      minHeight: 48,
      paddingHorizontal: 14,
    },
    primaryActionText: {
      color: palette.onAccent,
      fontSize: 14,
      fontWeight: "900",
      textAlign: "center",
    },
    secondaryAction: {
      alignItems: "center",
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderRadius: 12,
      borderWidth: 1,
      justifyContent: "center",
      marginTop: 4,
      minHeight: 48,
      paddingHorizontal: 14,
    },
    secondaryActionText: {
      color: palette.text,
      fontSize: 14,
      fontWeight: "800",
      textAlign: "center",
    },
    expiry: {
      color: palette.muted,
      fontSize: 12,
      lineHeight: 17,
      textAlign: "center",
    },
    thinking: {
      alignItems: "center",
      flexDirection: "row",
      gap: 9,
      minHeight: 48,
      paddingHorizontal: 10,
    },
    thinkingText: { color: palette.muted, fontSize: 13 },
    error: { color: palette.danger, fontSize: 14, lineHeight: 20, padding: 8 },
    composerShell: {
      backgroundColor: palette.surface,
      borderTopColor: palette.border,
      borderTopWidth: 1,
      gap: 9,
      paddingBottom: Platform.OS === "ios" ? 8 : 12,
      paddingHorizontal: 12,
      paddingTop: 10,
    },
    suggestions: { gap: 7, paddingRight: 12 },
    suggestion: {
      alignItems: "center",
      backgroundColor: palette.surfaceAlt,
      borderColor: palette.border,
      borderRadius: 999,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 14,
    },
    suggestionText: { color: palette.text, fontSize: 13, fontWeight: "700" },
    composer: {
      alignItems: "flex-end",
      backgroundColor: palette.surfaceAlt,
      borderColor: palette.border,
      borderRadius: 24,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      padding: 6,
      paddingLeft: 15,
    },
    input: {
      color: palette.text,
      flex: 1,
      fontSize: 16,
      lineHeight: 22,
      maxHeight: 110,
      minHeight: 48,
      paddingBottom: 12,
      paddingTop: 12,
    },
    send: {
      alignItems: "center",
      backgroundColor: palette.accent,
      borderRadius: 24,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    sendDisabled: { opacity: 0.35 },
    sendText: { color: palette.onAccent, fontSize: 23, fontWeight: "900" },
    safety: {
      color: palette.muted,
      fontSize: 12,
      lineHeight: 17,
      paddingHorizontal: 8,
      textAlign: "center",
    },
  });
}
