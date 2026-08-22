import { demoOrganization } from "@duna/core/demo";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProDunaAiResponse } from "./mobile-api";
import { SatoshiText as Text } from "./satoshi-text";
import { useProRuntime } from "./runtime";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const dunaWordmark = require("./assets/duna-horizontal-blue.png");

interface Palette {
  readonly canvas: string;
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly ink: string;
  readonly muted: string;
  readonly accent: string;
  readonly onAccent: string;
  readonly warning: string;
  readonly positive: string;
  readonly danger: string;
  readonly border: string;
}

interface ChatTurn {
  readonly id: string;
  readonly role: "assistant" | "user";
  readonly body: string;
  readonly response?: ProDunaAiResponse;
}

function previewResponse(): ProDunaAiResponse {
  return {
    reply:
      "I’m in preview mode, so I can show the workflow without changing a live schedule. In a signed-in organization I check the exact session, assigned court, coach, and player list before preparing one reviewable change.",
    cards: [
      {
        kind: "notice",
        title: "Preview is read-only",
        detail:
          "Sign in to an organization to check live availability, move a session, and queue player notifications.",
        tone: "warning",
      },
    ],
    suggestions: [
      "Which event should I market more aggressively this week?",
      "Are any event prices worth reviewing?",
      "Where do I have a court or coach conflict?",
      "Where could another coach help most?",
    ],
    toolsUsed: [],
    reasoningEffort: "high",
    providerAvailable: false,
    researchUsed: false,
  };
}

export function DunaAiScreen({
  onClose,
  palette,
  pathname,
}: {
  readonly onClose: () => void;
  readonly palette: Palette;
  readonly pathname: string;
}) {
  const runtime = useProRuntime();
  const scroll = useRef<ScrollView>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [suggestions, setSuggestions] = useState<string[]>([
    "Which event should I market more aggressively this week?",
    "Are any event prices worth reviewing?",
    "Where do I have a court or coach conflict?",
    "Where could another coach help most?",
  ]);
  const [turns, setTurns] = useState<ChatTurn[]>([
    {
      id: "welcome",
      role: "assistant",
      body: "I’m ready to help run the operation. I can compare event demand, marketing reach, price, schedule conflicts, and coach coverage using the organization context your role allows you to see.",
    },
  ]);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const organizationName =
    runtime.dashboard?.organization.name ?? demoOrganization.name;

  useEffect(() => {
    if (!runtime.getDunaAiSuggestions) return;
    let active = true;
    void runtime
      .getDunaAiSuggestions({
        pathname,
        pageTitle: "Duna Pro copilot",
      })
      .then((response) => {
        if (!active) return;
        setSuggestions([...response.suggestions]);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pathname, runtime]);

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
            pageTitle: "Duna Pro copilot",
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

  const approve = async (
    card: Extract<
      ProDunaAiResponse["cards"][number],
      { readonly kind: "approval" }
    >,
  ) => {
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

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.safe}
      >
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Image
              accessibilityLabel="Duna"
              resizeMode="contain"
              source={dunaWordmark}
              style={styles.wordmark}
            />
            <View style={styles.aiPill}>
              <Text style={styles.aiPillText}>AI</Text>
            </View>
          </View>
          <View style={styles.headerCopy}>
            <Text numberOfLines={1} style={styles.organization}>
              {organizationName}
            </Text>
            <Text style={styles.context}>PRIVATE ORGANIZATION COPILOT</Text>
          </View>
          <Pressable
            accessibilityLabel="Close Duna AI"
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
              {turn.response?.cards.map((card, index) => (
                <View
                  key={`${turn.id}-${card.kind}-${index}`}
                  style={[
                    styles.card,
                    card.kind === "approval" && styles.approvalCard,
                  ]}
                >
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  <Text style={styles.cardDetail}>{card.detail}</Text>
                  {card.kind === "approval" && (
                    <>
                      <View style={styles.changeList}>
                        {card.changes.map((change) => (
                          <View key={change} style={styles.changeRow}>
                            <Text style={styles.changeMark}>✓</Text>
                            <Text style={styles.changeText}>{change}</Text>
                          </View>
                        ))}
                      </View>
                      <Pressable
                        disabled={busy}
                        onPress={() => void approve(card)}
                        style={styles.approveButton}
                      >
                        <Text style={styles.approveText}>
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
                    </>
                  )}
                </View>
              ))}
            </View>
          ))}
          {busy && (
            <View style={styles.thinking}>
              <ActivityIndicator color={palette.accent} size="small" />
              <Text style={styles.thinkingText}>
                Checking live Duna context…
              </Text>
            </View>
          )}
          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        <View style={styles.composerShell}>
          <ScrollView
            contentContainerStyle={styles.suggestions}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {suggestions.map((suggestion) => (
              <Pressable
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
              onSubmitEditing={() => void ask(message)}
              placeholder="Ask Duna AI to help run your day…"
              placeholderTextColor={palette.muted}
              style={styles.input}
              value={message}
            />
            <Pressable
              accessibilityLabel="Send to Duna AI"
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
            Duna checks your role again before every action. Nothing
            consequential changes without your review.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    safe: { backgroundColor: palette.canvas, flex: 1 },
    header: {
      alignItems: "center",
      backgroundColor: palette.surface,
      borderBottomColor: palette.border,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    brandRow: { alignItems: "center", flexDirection: "row", gap: 6 },
    wordmark: { height: 30, width: 96 },
    aiPill: {
      backgroundColor: palette.accent,
      borderRadius: 7,
      paddingHorizontal: 7,
      paddingVertical: 4,
    },
    aiPillText: { color: palette.onAccent, fontSize: 12, fontWeight: "900" },
    headerCopy: { flex: 1, minWidth: 0 },
    organization: { color: palette.ink, fontSize: 13, fontWeight: "800" },
    context: {
      color: palette.muted,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.9,
      marginTop: 2,
    },
    close: {
      alignItems: "center",
      backgroundColor: palette.surfaceAlt,
      borderRadius: 19,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    closeText: { color: palette.ink, fontSize: 24, lineHeight: 26 },
    conversation: { gap: 12, padding: 16, paddingBottom: 24 },
    bubble: { borderRadius: 20, gap: 8, maxWidth: "92%", padding: 15 },
    aiBubble: {
      alignSelf: "flex-start",
      backgroundColor: palette.surface,
      borderColor: palette.border,
      borderWidth: 1,
    },
    userBubble: {
      alignSelf: "flex-end",
      backgroundColor: palette.accent,
      maxWidth: "84%",
    },
    bubbleLabel: {
      color: palette.warning,
      fontSize: 12,
      fontWeight: "900",
      letterSpacing: 1.1,
    },
    bubbleText: { color: palette.ink, fontSize: 15, lineHeight: 22 },
    userBubbleText: { color: palette.onAccent },
    card: {
      backgroundColor: palette.surfaceAlt,
      borderColor: palette.border,
      borderRadius: 15,
      borderWidth: 1,
      gap: 6,
      padding: 13,
    },
    approvalCard: { borderColor: palette.warning, borderWidth: 1.5 },
    cardTitle: { color: palette.ink, fontSize: 14, fontWeight: "900" },
    cardDetail: { color: palette.muted, fontSize: 12, lineHeight: 18 },
    changeList: { gap: 8, marginTop: 5 },
    changeRow: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
    changeMark: { color: palette.positive, fontSize: 12, fontWeight: "900" },
    changeText: { color: palette.ink, flex: 1, fontSize: 12, lineHeight: 17 },
    approveButton: {
      alignItems: "center",
      backgroundColor: palette.accent,
      borderRadius: 12,
      marginTop: 8,
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 14,
    },
    approveText: { color: palette.onAccent, fontSize: 13, fontWeight: "900" },
    expiry: { color: palette.muted, fontSize: 12, textAlign: "center" },
    thinking: {
      alignItems: "center",
      flexDirection: "row",
      gap: 9,
      padding: 10,
    },
    thinkingText: { color: palette.muted, fontSize: 12 },
    error: { color: palette.danger, fontSize: 12, lineHeight: 18, padding: 8 },
    composerShell: {
      backgroundColor: palette.surface,
      borderTopColor: palette.border,
      borderTopWidth: 1,
      gap: 9,
      paddingHorizontal: 12,
      paddingTop: 10,
      paddingBottom: Platform.OS === "ios" ? 8 : 12,
    },
    suggestions: { gap: 7, paddingRight: 12 },
    suggestion: {
      backgroundColor: palette.surfaceAlt,
      borderColor: palette.border,
      borderRadius: 999,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    suggestionText: { color: palette.ink, fontSize: 12, fontWeight: "700" },
    composer: {
      alignItems: "flex-end",
      backgroundColor: palette.surfaceAlt,
      borderColor: palette.border,
      borderRadius: 22,
      borderWidth: 1,
      flexDirection: "row",
      gap: 8,
      padding: 6,
      paddingLeft: 15,
    },
    input: {
      color: palette.ink,
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
      maxHeight: 100,
      minHeight: 42,
      paddingBottom: 10,
      paddingTop: 10,
    },
    send: {
      alignItems: "center",
      backgroundColor: palette.accent,
      borderRadius: 19,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    sendDisabled: { opacity: 0.35 },
    sendText: { color: palette.onAccent, fontSize: 21, fontWeight: "900" },
    safety: {
      color: palette.muted,
      fontSize: 12,
      lineHeight: 16,
      paddingHorizontal: 8,
      textAlign: "center",
    },
  });
}
