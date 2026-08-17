import { Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import type { ReactNode } from "react";
import {
  bookingDateTime,
  buildBookingShareMessage,
  type ShareableBookingDetails,
} from "./booking-share-message";
import { SatoshiText as Text } from "./satoshi-text";

export { buildBookingShareMessage } from "./booking-share-message";
export type { ShareableBookingDetails } from "./booking-share-message";

export async function shareBooking(details: ShareableBookingDetails) {
  await Share.share({
    title: details.title,
    message: buildBookingShareMessage(details),
    ...(details.detailsUrl ? { url: details.detailsUrl } : {}),
  });
}

function DetailRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value?: string;
}) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export function BookingConfirmationView({
  body,
  children,
  details,
  label = "Confirmed",
  onDone,
  secondaryAction,
  secondaryLabel,
  title = "You’re in.",
}: {
  readonly body?: string;
  readonly children?: ReactNode;
  readonly details: ShareableBookingDetails;
  readonly label?: string;
  readonly onDone: () => void;
  readonly secondaryAction?: () => void;
  readonly secondaryLabel?: string;
  readonly title?: string;
}) {
  const when = bookingDateTime(details);
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.icon}>
        <Text style={styles.iconText}>✓</Text>
      </View>
      <Text style={styles.status}>{label.toUpperCase()}</Text>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      <View style={styles.card}>
        <Text style={styles.bookingTitle}>{details.title}</Text>
        <DetailRow label="DATE" value={when.date} />
        <DetailRow label="TIME" value={when.time} />
        <DetailRow label="LOCATION" value={details.locationName} />
        <DetailRow label="ADDRESS" value={details.address} />
        <DetailRow label="COURT" value={details.courtName} />
        <DetailRow label="ORGANIZATION" value={details.organizationName} />
        <DetailRow
          label="PLAYERS"
          value={details.playerNames?.filter(Boolean).join(", ")}
        />
      </View>
      {children}
      <Pressable
        accessibilityLabel={`Share ${details.title}`}
        onPress={() => void shareBooking(details)}
        style={styles.share}
      >
        <Text style={styles.shareIcon}>↗</Text>
        <Text style={styles.shareText}>Share booking</Text>
      </Pressable>
      {secondaryAction && secondaryLabel ? (
        <Pressable onPress={secondaryAction} style={styles.secondary}>
          <Text style={styles.secondaryText}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={onDone} style={styles.done}>
        <Text style={styles.doneText}>Done</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    color: "#746d61",
    fontSize: 16,
    lineHeight: 24,
    marginTop: 10,
    textAlign: "center",
  },
  bookingTitle: {
    color: "#111719",
    fontSize: 23,
    fontWeight: "900",
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#dfdfda",
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 28,
    padding: 18,
    width: "100%",
  },
  content: {
    alignItems: "center",
    backgroundColor: "#f7f5ef",
    flexGrow: 1,
    padding: 24,
    paddingBottom: 48,
    paddingTop: 64,
  },
  detailLabel: {
    color: "#78858a",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.1,
    width: 92,
  },
  detailRow: {
    alignItems: "flex-start",
    borderTopColor: "#ecebe7",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingVertical: 12,
  },
  detailValue: {
    color: "#203740",
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    lineHeight: 20,
  },
  done: {
    alignItems: "center",
    backgroundColor: "#203740",
    borderRadius: 16,
    justifyContent: "center",
    marginTop: 10,
    minHeight: 56,
    width: "100%",
  },
  doneText: { color: "#ffffff", fontSize: 16, fontWeight: "900" },
  icon: {
    alignItems: "center",
    backgroundColor: "#e5efe8",
    borderColor: "#b8d0bd",
    borderRadius: 42,
    borderWidth: 1,
    height: 84,
    justifyContent: "center",
    width: 84,
  },
  iconText: { color: "#2f7445", fontSize: 42, fontWeight: "700" },
  secondary: {
    alignItems: "center",
    borderColor: "#203740",
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 10,
    minHeight: 54,
    width: "100%",
  },
  secondaryText: { color: "#203740", fontSize: 15, fontWeight: "900" },
  share: {
    alignItems: "center",
    backgroundColor: "#dce9ec",
    borderRadius: 16,
    flexDirection: "row",
    gap: 9,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 56,
    width: "100%",
  },
  shareIcon: { color: "#203740", fontSize: 22, fontWeight: "900" },
  shareText: { color: "#203740", fontSize: 16, fontWeight: "900" },
  status: {
    color: "#2f7445",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginTop: 20,
  },
  title: {
    color: "#111719",
    fontSize: 46,
    fontWeight: "900",
    letterSpacing: -1.8,
    lineHeight: 51,
    marginTop: 8,
    textAlign: "center",
  },
});
