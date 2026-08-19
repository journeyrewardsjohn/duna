import type { EventSummary } from "@duna/core";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "./satoshi-text";
import type { DunaApiClient } from "./mobile-api";

type Phase = "upcoming" | "live" | "completed" | "cancelled";

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

export function NativeEventDetails({
  client,
  event,
  onClose,
  onRegister,
  onScore,
  onVideo,
  visible,
}: {
  readonly client?: DunaApiClient;
  readonly event?: EventSummary;
  readonly onClose: () => void;
  readonly onRegister: () => void;
  readonly onScore: () => void;
  readonly onVideo: () => void;
  readonly visible: boolean;
}) {
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  if (!event) return null;
  const phase = phaseFor(event);
  const isPickup = event.kind === "pickup";
  const activityType = isPickup ? "pickup" : "session";
  const saveNote = async () => {
    if (!client || !note.trim()) return;
    try {
      await client.player.createEventNote.mutate({
        activityType,
        activityId: event.id,
        body: note.trim(),
        visibility: "private",
        source: "typed",
        idempotencyKey: crypto.randomUUID(),
      });
      setNote("");
      setMessage("Saved privately to this event.");
    } catch {
      setMessage("We could not save that note yet.");
    }
  };
  return (
    <Modal animationType="slide" onRequestClose={onClose} visible={visible}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <Pressable onPress={onClose}>
              <Text style={styles.back}>‹ Back</Text>
            </Pressable>
            <Text style={[styles.status, phase === "live" && styles.live]}>
              {phase === "live"
                ? "LIVE NOW"
                : phase === "completed"
                  ? "EVENT ENDED"
                  : phase.toUpperCase()}
            </Text>
          </View>
          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.meta}>
            {new Date(event.startsAt).toLocaleString()} · {event.venueName}
          </Text>
          <Text style={styles.body}>
            {event.shortSummary ??
              event.description ??
              "Everything you need for this event, in Duna."}
          </Text>
          {phase === "live" && (
            <View style={styles.primaryRow}>
              <Pressable onPress={onScore} style={styles.primary}>
                <Text style={styles.primaryText}>Keep score</Text>
              </Pressable>
              <Pressable onPress={onVideo} style={styles.secondary}>
                <Text style={styles.secondaryText}>Record video</Text>
              </Pressable>
            </View>
          )}
          {phase === "upcoming" && (
            <Pressable onPress={onRegister} style={styles.primary}>
              <Text style={styles.primaryText}>View registration</Text>
            </Pressable>
          )}
          {phase === "completed" && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Your event reflection</Text>
              <Text style={styles.cardBody}>
                Keep a private note about what worked and what you want to carry
                into the next match.
              </Text>
              <TextInput
                multiline
                onChangeText={setNote}
                placeholder="Write a private match note…"
                placeholderTextColor="#75808a"
                style={styles.input}
                value={note}
              />
              <Pressable
                disabled={!note.trim()}
                onPress={() => void saveNote()}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>Save private note</Text>
              </Pressable>
              {message ? <Text style={styles.message}>{message}</Text> : null}
            </View>
          )}
          {event.kind === "tournament" || event.kind === "league" ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Scores are verified together</Text>
              <Text style={styles.cardBody}>
                One player on each side confirms a reported match. A club can
                review disputed league and tournament scores; pickup scores
                never create an organization task.
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: "#f8f6f1", flex: 1 },
  content: { gap: 16, padding: 20, paddingBottom: 48 },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  back: { color: "#17324d", fontSize: 16, fontWeight: "800" },
  status: {
    color: "#59636e",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  live: { color: "#c84630" },
  title: { color: "#122433", fontSize: 34, fontWeight: "900", lineHeight: 38 },
  meta: { color: "#53616e", fontSize: 15, lineHeight: 22 },
  body: { color: "#394752", fontSize: 16, lineHeight: 24 },
  primaryRow: { flexDirection: "row", gap: 10 },
  primary: {
    alignItems: "center",
    backgroundColor: "#123b5d",
    borderRadius: 16,
    flex: 1,
    padding: 16,
  },
  primaryText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  secondary: {
    alignItems: "center",
    borderColor: "#123b5d",
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    padding: 15,
  },
  secondaryText: { color: "#123b5d", fontSize: 15, fontWeight: "800" },
  card: {
    backgroundColor: "#fff",
    borderColor: "#e6e1d8",
    borderRadius: 20,
    borderWidth: 1,
    gap: 10,
    padding: 18,
  },
  cardTitle: { color: "#122433", fontSize: 18, fontWeight: "900" },
  cardBody: { color: "#53616e", fontSize: 14, lineHeight: 21 },
  input: {
    backgroundColor: "#f5f2ec",
    borderRadius: 12,
    color: "#122433",
    minHeight: 100,
    padding: 12,
    textAlignVertical: "top",
  },
  message: { color: "#2f7651", fontSize: 13, fontWeight: "700" },
});
