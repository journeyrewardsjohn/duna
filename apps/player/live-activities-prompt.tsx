import { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FellixText as Text } from "./fellix-text";
import {
  hasLiveActivityOptIn,
  liveActivityHomeMode,
  rememberLiveActivityOptIn,
} from "./live-activity-preference";
import type { DunaApiClient } from "./mobile-api";
import {
  SessionArrivalCard,
  type ArrivalCardPalette,
  type ArrivalBooking,
} from "./session-arrival-card";

const liveActivityBenefits = [
  {
    icon: "◉",
    title: "Matches you follow",
    body: "See live scores for followed players, matches, and events.",
  },
  {
    icon: "✓",
    title: "Prediction outcomes",
    body: "See whether a settled prediction won or lost, plus the credit result.",
  },
  {
    icon: "↗",
    title: "Your day",
    body: "Keep the next booking, start time, and a leave-by alert on your Lock Screen.",
  },
] as const;

export function LiveActivitiesPrompt({
  booking,
  client,
  compactPalette,
}: {
  readonly booking: ArrivalBooking;
  readonly client?: DunaApiClient;
  readonly compactPalette: ArrivalCardPalette;
}) {
  const [checking, setChecking] = useState(true);
  const [optedIn, setOptedIn] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    void hasLiveActivityOptIn()
      .then((enabled) => {
        if (active) setOptedIn(enabled);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const homeMode = liveActivityHomeMode({
    checking,
    isIOS: Platform.OS === "ios",
    optedIn,
  });

  if (homeMode === "hidden") return null;

  if (homeMode === "compact") {
    return (
      <SessionArrivalCard
        booking={booking}
        client={client}
        compactPalette={compactPalette}
      />
    );
  }

  const finishOptIn = () => {
    void rememberLiveActivityOptIn();
    setOptedIn(true);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        accessibilityHint="Explains scores, predictions, and leave-time updates"
        accessibilityLabel="Turn on Duna Live Activities"
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.prompt,
          pressed && styles.promptPressed,
        ]}
      >
        <View style={styles.promptMark}>
          <Text style={styles.promptMarkText}>◉</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.promptTitle}>Live on your Lock Screen</Text>
          <Text style={styles.promptBody}>
            Scores, predictions, and leave-time alerts
          </Text>
        </View>
        <Text style={styles.promptArrow}>›</Text>
      </Pressable>

      <Modal
        animationType="slide"
        onRequestClose={() => setOpen(false)}
        presentationStyle="pageSheet"
        visible={open}
      >
        <SafeAreaView edges={["top", "bottom"]} style={styles.modal}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>DUNA LIVE ACTIVITIES</Text>
              <Text style={styles.title}>Keep the game with you.</Text>
            </View>
            <Pressable
              accessibilityLabel="Close Live Activities"
              onPress={() => setOpen(false)}
              style={styles.close}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.intro}>
              One glance shows what changed and what you need to do next—without
              reopening Duna.
            </Text>
            <View style={styles.benefits}>
              {liveActivityBenefits.map((benefit) => (
                <View key={benefit.title} style={styles.benefit}>
                  <View style={styles.benefitMark}>
                    <Text style={styles.benefitMarkText}>{benefit.icon}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.benefitTitle}>{benefit.title}</Text>
                    <Text style={styles.benefitBody}>{benefit.body}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={styles.preview}>
              <Text style={styles.previewEyebrow}>NEXT UP</Text>
              <Text style={styles.previewTitle}>{booking.title}</Text>
              <Text style={styles.previewMeta}>
                {new Date(booking.startsAt).toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                · {booking.venueName}
              </Text>
              <SessionArrivalCard
                booking={booking}
                client={client}
                onActivated={finishOptIn}
              />
            </View>
            <View style={styles.privacy}>
              <Text style={styles.privacyIcon}>⌁</Text>
              <Text style={styles.privacyText}>
                Trip Assistant is separate from scores. If you turn it on,
                location runs only from 60 minutes before through 30 minutes
                after your booking. Your coach receives a short-lived ETA—not a
                map of where you are.
              </Text>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  benefit: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    paddingVertical: 13,
  },
  benefitBody: {
    color: "#6f6b61",
    fontSize: 15,
    lineHeight: 21,
    marginTop: 3,
  },
  benefitMark: {
    alignItems: "center",
    backgroundColor: "#e9eceb",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  benefitMarkText: { color: "#203740", fontSize: 16 },
  benefitTitle: { color: "#111719", fontSize: 17, fontWeight: "700" },
  benefits: {
    borderBottomColor: "#e4e2dc",
    borderBottomWidth: 1,
    borderTopColor: "#e4e2dc",
    borderTopWidth: 1,
    marginTop: 24,
  },
  close: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  closeText: { color: "#111719", fontSize: 30, lineHeight: 34 },
  content: { padding: 22, paddingBottom: 48 },
  eyebrow: {
    color: "#203740",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  flex: { flex: 1, minWidth: 0 },
  header: {
    alignItems: "center",
    borderBottomColor: "#e4e2dc",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 22,
    paddingVertical: 16,
  },
  intro: { color: "#6f6b61", fontSize: 17, lineHeight: 25 },
  modal: { backgroundColor: "#f7f5ef", flex: 1 },
  preview: {
    backgroundColor: "#ffffff",
    borderColor: "#dfe1df",
    borderRadius: 24,
    borderWidth: 1,
    marginTop: 24,
    padding: 18,
  },
  previewEyebrow: {
    color: "#203740",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  previewMeta: { color: "#777166", fontSize: 15, marginTop: 4 },
  previewTitle: {
    color: "#111719",
    fontSize: 22,
    fontWeight: "800",
    marginTop: 5,
  },
  privacy: {
    alignItems: "flex-start",
    backgroundColor: "#eeeae1",
    borderRadius: 18,
    flexDirection: "row",
    gap: 10,
    marginTop: 18,
    padding: 16,
  },
  privacyIcon: { color: "#203740", fontSize: 20 },
  privacyText: { color: "#635f56", flex: 1, fontSize: 14, lineHeight: 21 },
  prompt: {
    alignItems: "center",
    backgroundColor: "#eceeea",
    borderRadius: 16,
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
    minHeight: 60,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  promptArrow: { color: "#203740", fontSize: 26 },
  promptBody: { color: "#777166", fontSize: 13, marginTop: 2 },
  promptMark: {
    alignItems: "center",
    backgroundColor: "#203740",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  promptMarkText: { color: "#d4b77c", fontSize: 16 },
  promptPressed: { opacity: 0.76 },
  promptTitle: { color: "#111719", fontSize: 15, fontWeight: "700" },
  title: {
    color: "#111719",
    fontSize: 27,
    fontWeight: "800",
    marginTop: 4,
  },
});
