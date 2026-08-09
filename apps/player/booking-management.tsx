import * as Crypto from "expo-crypto";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  FellixText as Text,
  FellixTextInput as TextInput,
} from "./fellix-text";
import { dunaWebUrl, type DunaApiClient } from "./mobile-api";

export type ManagedBooking = {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venueName: string;
  readonly status: "confirmed" | "waitlisted" | "needs-action";
  readonly amount: { readonly amountMinor: number; readonly currency: string };
  readonly participantNames?: readonly string[];
  readonly paymentStatus?: "free" | "paid" | "payment-required" | "refunded";
  readonly canEdit?: boolean;
  readonly canCancel?: boolean;
  readonly cancellationDeadline?: string;
  readonly addedBy?: {
    readonly personId: string;
    readonly displayName: string;
  };
  readonly paidBy?: {
    readonly personId: string;
    readonly displayName: string;
  };
  readonly pairedSpotCount?: number;
  readonly team?: {
    readonly claimToken: string;
    readonly expectedTeamSize: number;
    readonly paymentMode: "self" | "team";
    readonly status: string;
    readonly roster: readonly {
      readonly personId?: string;
      readonly inviteTarget?: string;
      readonly displayName: string;
      readonly status: "captain" | "selected" | "invited" | "claimed";
      readonly paid: boolean;
      readonly editable: boolean;
    }[];
  };
};

type SearchResult = Awaited<
  ReturnType<DunaApiClient["player"]["teammateSearch"]["query"]>
>[number];

function money(booking: ManagedBooking) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: booking.amount.currency,
  }).format(booking.amount.amountMinor / 100);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function BookingManagementModal({
  booking,
  client,
  onClose,
  onUpdated,
  visible = true,
}: {
  readonly booking?: ManagedBooking;
  readonly client?: DunaApiClient;
  readonly onClose: () => void;
  readonly onUpdated: () => Promise<void>;
  readonly visible?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [roster, setRoster] = useState<
    readonly {
      readonly personId?: string;
      readonly inviteTarget?: string;
      readonly displayName?: string;
      readonly paid?: boolean;
      readonly editable?: boolean;
    }[]
  >([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly SearchResult[]>([]);
  const [inviteTarget, setInviteTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [message, setMessage] = useState<string>();
  const [cancelled, setCancelled] = useState(false);
  const [showAttribution, setShowAttribution] = useState(false);

  useEffect(() => {
    setRoster(
      booking?.team?.roster
        .filter((member) => member.status !== "captain")
        .map((member) => ({
          ...(member.personId ? { personId: member.personId } : {}),
          ...(member.inviteTarget ? { inviteTarget: member.inviteTarget } : {}),
          displayName: member.displayName,
          paid: member.paid,
          editable: member.editable,
        })) ?? [],
    );
    setEditing(false);
    setConfirmCancel(false);
    setCancelled(false);
    setMessage(undefined);
    setShowAttribution(Boolean(booking?.addedBy));
  }, [booking]);

  if (!booking) return null;

  async function search(value: string) {
    setQuery(value);
    if (!client) return;
    const next = await client.player.teammateSearch
      .query({ query: value.trim() || undefined, limit: 12 })
      .catch(() => []);
    setResults(next);
  }

  async function save() {
    const team = booking?.team;
    if (!client || !team) return;
    setBusy(true);
    setMessage(undefined);
    try {
      await client.player.updateTeamEntryRoster.mutate({
        claimToken: team.claimToken,
        roster: roster.map((member) => ({
          ...(member.personId ? { personId: member.personId } : {}),
          ...(member.inviteTarget ? { inviteTarget: member.inviteTarget } : {}),
          ...(member.displayName ? { displayName: member.displayName } : {}),
        })),
        applicationOrigin: dunaWebUrl,
        idempotencyKey: Crypto.randomUUID(),
      });
      await onUpdated();
      setEditing(false);
      setMessage(
        "Team updated. Paid players and claimed spots were preserved.",
      );
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Duna could not save the team.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    const bookingId = booking?.id;
    if (!client || !bookingId) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await client.player.cancelBooking.mutate({
        bookingId,
        idempotencyKey: Crypto.randomUUID(),
      });
      setCancelled(true);
      setConfirmCancel(false);
      setMessage(result.message);
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Duna could not cancel this booking.",
      );
    } finally {
      setBusy(false);
    }
  }

  const paid = booking.paymentStatus === "paid";
  const statusLabel =
    booking.status === "needs-action"
      ? "Action needed"
      : booking.status === "waitlisted"
        ? "Waitlisted"
        : "Registered";

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <View style={styles.modalRoot}>
        <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
          <View style={styles.header}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>YOUR BOOKING</Text>
              <Text style={styles.headerTitle}>
                {cancelled ? "Booking cancelled" : statusLabel}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close booking"
              onPress={() => {
                if (cancelled) void onUpdated();
                onClose();
              }}
              style={styles.close}
            >
              <Text style={styles.closeText}>×</Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusPill,
                  cancelled && styles.statusPillCancelled,
                ]}
              >
                <Text
                  style={[
                    styles.statusText,
                    cancelled && styles.statusTextCancelled,
                  ]}
                >
                  {cancelled ? "CANCELLED" : statusLabel.toUpperCase()}
                </Text>
              </View>
              {!cancelled && (
                <View style={styles.paymentPill}>
                  <Text style={styles.paymentText}>
                    {booking.paymentStatus === "free"
                      ? "FREE"
                      : paid
                        ? "PAID · " + money(booking)
                        : booking.paymentStatus === "refunded"
                          ? "REFUNDED"
                          : "PAYMENT NEEDED · " + money(booking)}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.title}>{booking.title}</Text>
            <Text style={styles.meta}>
              {new Date(booking.startsAt).toLocaleString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </Text>
            <Text style={styles.meta}>{booking.venueName}</Text>

            {message && (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>{message}</Text>
              </View>
            )}

            {!cancelled && booking.team && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.flex}>
                    <Text style={styles.sectionEyebrow}>YOUR TEAM</Text>
                    <Text style={styles.sectionTitle}>
                      {booking.team.roster.length} of{" "}
                      {booking.team.expectedTeamSize} players
                    </Text>
                  </View>
                  {booking.canEdit && (
                    <Pressable
                      onPress={() => setEditing((current) => !current)}
                      style={styles.smallAction}
                    >
                      <Text style={styles.smallActionText}>
                        {editing ? "Done" : "Edit"}
                      </Text>
                    </Pressable>
                  )}
                </View>
                {booking.team.roster.map((member, index) => (
                  <View
                    key={
                      String(member.personId ?? member.inviteTarget) +
                      ":" +
                      index
                    }
                    style={styles.playerRow}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>
                        {initials(member.displayName)}
                      </Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.playerName}>
                        {member.displayName}
                      </Text>
                      <Text style={styles.playerMeta}>
                        {member.status === "captain"
                          ? "Captain"
                          : member.status.replaceAll("-", " ")}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.playerPayment,
                        !member.paid && styles.playerPaymentPending,
                      ]}
                    >
                      <Text
                        style={[
                          styles.playerPaymentText,
                          !member.paid && styles.playerPaymentTextPending,
                        ]}
                      >
                        {member.paid ? "PAID" : "TO PAY"}
                      </Text>
                    </View>
                    {editing &&
                      member.status !== "captain" &&
                      member.editable && (
                        <Pressable
                          onPress={() =>
                            setRoster((current) =>
                              current.filter(
                                (candidate) =>
                                  candidate.personId !== member.personId ||
                                  candidate.inviteTarget !==
                                    member.inviteTarget,
                              ),
                            )
                          }
                          style={styles.remove}
                        >
                          <Text style={styles.removeText}>Remove</Text>
                        </Pressable>
                      )}
                  </View>
                ))}
                {editing && (
                  <>
                    <View style={styles.search}>
                      <Text style={styles.searchIcon}>⌕</Text>
                      <TextInput
                        onChangeText={(value) => void search(value)}
                        placeholder="Find a player"
                        placeholderTextColor="#8a857b"
                        style={styles.searchInput}
                        value={query}
                      />
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={styles.resultRail}
                    >
                      {results
                        .filter(
                          (result) =>
                            !roster.some(
                              (member) => member.personId === result.person.id,
                            ),
                        )
                        .map((result) => (
                          <View key={result.person.id} style={styles.result}>
                            <View style={styles.resultAvatar}>
                              <Text style={styles.avatarText}>
                                {result.person.initials}
                              </Text>
                            </View>
                            <Text numberOfLines={1} style={styles.resultName}>
                              {result.person.displayName}
                            </Text>
                            <Text numberOfLines={1} style={styles.resultMeta}>
                              {result.person.homeMarket}
                            </Text>
                            <Pressable
                              disabled={!result.eligible}
                              onPress={() =>
                                setRoster((current) => [
                                  ...current,
                                  {
                                    personId: result.person.id,
                                    displayName: result.person.displayName,
                                    paid: false,
                                    editable: true,
                                  },
                                ])
                              }
                              style={[
                                styles.add,
                                !result.eligible && styles.actionDisabled,
                              ]}
                            >
                              <Text style={styles.addText}>Add</Text>
                            </Pressable>
                          </View>
                        ))}
                    </ScrollView>
                    <View style={styles.invite}>
                      <TextInput
                        onChangeText={setInviteTarget}
                        placeholder="Email or mobile number"
                        placeholderTextColor="#8a857b"
                        style={styles.inviteInput}
                        value={inviteTarget}
                      />
                      <Pressable
                        disabled={inviteTarget.trim().length < 3}
                        onPress={() => {
                          const value = inviteTarget.trim();
                          if (!value) return;
                          setRoster((current) => [
                            ...current,
                            {
                              inviteTarget: value,
                              displayName: value,
                              paid: false,
                              editable: true,
                            },
                          ]);
                          setInviteTarget("");
                        }}
                        style={styles.inviteButton}
                      >
                        <Text style={styles.inviteButtonText}>Invite</Text>
                      </Pressable>
                    </View>
                    <Pressable
                      disabled={busy}
                      onPress={() => void save()}
                      style={[styles.primary, busy && styles.actionDisabled]}
                    >
                      <Text style={styles.primaryText}>
                        {busy ? "Saving…" : "Save & Update"}
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            )}

            {!cancelled &&
              !booking.team &&
              booking.participantNames &&
              booking.participantNames.length > 1 && (
                <View style={styles.section}>
                  <Text style={styles.sectionEyebrow}>WHO&apos;S JOINED</Text>
                  <Text style={styles.sectionTitle}>
                    {booking.participantNames.length} players
                  </Text>
                  {booking.participantNames.map((name, index) => (
                    <View key={`${name}:${index}`} style={styles.playerRow}>
                      <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{initials(name)}</Text>
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.playerName}>{name}</Text>
                        <Text style={styles.playerMeta}>Confirmed</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

            {!cancelled && (
              <View style={styles.section}>
                <Text style={styles.sectionEyebrow}>BOOKING OPTIONS</Text>
                <Text style={styles.policy}>
                  Changes close when the booking starts. Paid cancellations
                  follow the organizer’s displayed refund or credit policy; Duna
                  never promises a refund before that policy is evaluated.
                </Text>
                {confirmCancel ? (
                  <View style={styles.confirm}>
                    <Text style={styles.confirmTitle}>
                      Cancel this booking?
                    </Text>
                    <Text style={styles.confirmBody}>
                      Your spot will be released. This cannot be undone in the
                      app.
                    </Text>
                    <View style={styles.confirmActions}>
                      <Pressable
                        onPress={() => setConfirmCancel(false)}
                        style={styles.secondary}
                      >
                        <Text style={styles.secondaryText}>Keep booking</Text>
                      </Pressable>
                      <Pressable
                        disabled={busy}
                        onPress={() => void cancel()}
                        style={styles.danger}
                      >
                        <Text style={styles.dangerText}>
                          {busy ? "Cancelling…" : "Confirm cancellation"}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    disabled={!booking.canCancel || !client}
                    onPress={() => setConfirmCancel(true)}
                    style={[
                      styles.cancel,
                      (!booking.canCancel || !client) && styles.actionDisabled,
                    ]}
                  >
                    <Text style={styles.cancelText}>
                      {booking.canCancel
                        ? "Cancellation"
                        : "Cancellation window closed"}
                    </Text>
                  </Pressable>
                )}
              </View>
            )}

            {cancelled && (
              <Pressable
                onPress={() => {
                  void onUpdated();
                  onClose();
                }}
                style={styles.primary}
              >
                <Text style={styles.primaryText}>Done</Text>
              </Pressable>
            )}
          </ScrollView>
        </SafeAreaView>
        {showAttribution && booking.addedBy && (
          <View style={styles.attributionOverlay}>
            <Pressable
              accessibilityLabel="Close added-by details"
              onPress={() => setShowAttribution(false)}
              style={styles.attributionBackdrop}
            />
            <SafeAreaView edges={["bottom"]} style={styles.attributionSheet}>
              <View style={styles.attributionGrabber} />
              <Text style={styles.attributionTitle}>
                You were added to this match by {booking.addedBy.displayName}
              </Text>
              <View style={styles.attributionCard}>
                <View style={styles.attributionPayerRow}>
                  <View style={styles.attributionAvatar}>
                    <Text style={styles.attributionAvatarText}>
                      {initials(
                        booking.paidBy?.displayName ??
                          booking.addedBy.displayName,
                      )}
                    </Text>
                  </View>
                  <Text style={styles.attributionPayer}>
                    {booking.paidBy
                      ? `Spot paid by ${booking.paidBy.displayName}`
                      : `Spot added by ${booking.addedBy.displayName}`}
                  </Text>
                </View>
                <Text style={styles.attributionBody}>
                  {booking.paidBy
                    ? `${booking.paidBy.displayName} manages this paired booking. Ask them to change or cancel both places.`
                    : `${booking.addedBy.displayName} manages this place. Ask them if you need to cancel it.`}
                </Text>
              </View>
              <Pressable
                onPress={() => setShowAttribution(false)}
                style={styles.attributionDone}
              >
                <Text style={styles.attributionDoneText}>Got it</Text>
              </Pressable>
            </SafeAreaView>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  attributionAvatar: {
    alignItems: "center",
    backgroundColor: "#203740",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  attributionAvatarText: { color: "#ffffff", fontSize: 11, fontWeight: "900" },
  attributionBackdrop: {
    backgroundColor: "rgba(17,23,25,0.66)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  attributionBody: {
    borderTopColor: "#e1dfda",
    borderTopWidth: 1,
    color: "#706a60",
    fontSize: 15,
    lineHeight: 23,
    padding: 18,
  },
  attributionCard: {
    borderColor: "#e1dfda",
    borderRadius: 19,
    borderWidth: 1,
    marginTop: 22,
    overflow: "hidden",
  },
  attributionDone: {
    alignItems: "center",
    backgroundColor: "#203740",
    borderRadius: 17,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 54,
  },
  attributionDoneText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  attributionGrabber: {
    alignSelf: "center",
    backgroundColor: "#d7d3ca",
    borderRadius: 3,
    height: 5,
    marginBottom: 18,
    width: 44,
  },
  attributionOverlay: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  attributionPayer: {
    color: "#111719",
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
  },
  attributionPayerRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    padding: 16,
  },
  attributionSheet: {
    backgroundColor: "#f7f5ef",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    bottom: 0,
    left: 0,
    padding: 22,
    position: "absolute",
    right: 0,
  },
  attributionTitle: {
    color: "#111719",
    fontSize: 25,
    fontWeight: "900",
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  actionDisabled: { opacity: 0.42 },
  add: {
    alignItems: "center",
    backgroundColor: "#203740",
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 9,
    minHeight: 42,
  },
  addText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  avatar: {
    alignItems: "center",
    backgroundColor: "#ece9e1",
    borderRadius: 21,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  avatarText: { color: "#203740", fontSize: 13, fontWeight: "800" },
  cancel: {
    alignItems: "center",
    borderColor: "#bd5745",
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 16,
    minHeight: 50,
  },
  cancelText: { color: "#a54032", fontSize: 15, fontWeight: "800" },
  close: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  closeText: { color: "#111719", fontSize: 30, lineHeight: 34 },
  confirm: {
    backgroundColor: "#f5e7e2",
    borderRadius: 16,
    marginTop: 16,
    padding: 14,
  },
  confirmActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  confirmBody: { color: "#715f58", fontSize: 14, lineHeight: 20, marginTop: 4 },
  confirmTitle: { color: "#8b3227", fontSize: 17, fontWeight: "800" },
  content: { padding: 20, paddingBottom: 54 },
  danger: {
    alignItems: "center",
    backgroundColor: "#a54032",
    borderRadius: 13,
    flex: 1.3,
    justifyContent: "center",
    minHeight: 48,
  },
  dangerText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  eyebrow: {
    color: "#203740",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  flex: { flex: 1, minWidth: 0 },
  header: {
    alignItems: "center",
    borderBottomColor: "#e1dfda",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: {
    color: "#111719",
    fontSize: 25,
    fontWeight: "800",
    marginTop: 3,
  },
  invite: { flexDirection: "row", gap: 8, marginTop: 14 },
  inviteButton: {
    alignItems: "center",
    backgroundColor: "#203740",
    borderRadius: 13,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: 15,
  },
  inviteButtonText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  inviteInput: {
    backgroundColor: "#f5f4f0",
    borderRadius: 13,
    color: "#111719",
    flex: 1,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  modalRoot: { flex: 1 },
  meta: { color: "#736d62", fontSize: 16, marginTop: 5 },
  notice: {
    backgroundColor: "#e9eeeb",
    borderRadius: 14,
    marginTop: 18,
    padding: 13,
  },
  noticeText: { color: "#40585a", fontSize: 14, lineHeight: 20 },
  paymentPill: {
    backgroundColor: "#e7efe8",
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  paymentText: { color: "#2d6a3c", fontSize: 11, fontWeight: "900" },
  playerMeta: {
    color: "#777166",
    fontSize: 13,
    marginTop: 2,
    textTransform: "capitalize",
  },
  playerName: { color: "#111719", fontSize: 15, fontWeight: "700" },
  playerPayment: {
    backgroundColor: "#e7efe8",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  playerPaymentPending: { backgroundColor: "#f3e9d5" },
  playerPaymentText: { color: "#2d6a3c", fontSize: 10, fontWeight: "900" },
  playerPaymentTextPending: { color: "#8b5a1b" },
  playerRow: {
    alignItems: "center",
    borderTopColor: "#ebe9e3",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 67,
  },
  policy: { color: "#706a60", fontSize: 14, lineHeight: 21, marginTop: 8 },
  primary: {
    alignItems: "center",
    backgroundColor: "#203740",
    borderRadius: 15,
    justifyContent: "center",
    marginTop: 16,
    minHeight: 52,
  },
  primaryText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  remove: { paddingHorizontal: 4, paddingVertical: 8 },
  removeText: { color: "#a54032", fontSize: 12, fontWeight: "800" },
  result: {
    backgroundColor: "#f5f4f0",
    borderRadius: 16,
    marginRight: 10,
    padding: 12,
    width: 150,
  },
  resultAvatar: {
    alignItems: "center",
    backgroundColor: "#e8e4da",
    borderRadius: 25,
    height: 50,
    justifyContent: "center",
    width: 50,
  },
  resultMeta: { color: "#777166", fontSize: 12, marginTop: 3 },
  resultName: {
    color: "#111719",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 8,
  },
  resultRail: { marginTop: 12 },
  safe: { backgroundColor: "#f7f5ef", flex: 1 },
  search: {
    alignItems: "center",
    backgroundColor: "#f5f4f0",
    borderRadius: 14,
    flexDirection: "row",
    marginTop: 14,
    minHeight: 50,
    paddingHorizontal: 13,
  },
  searchIcon: { color: "#203740", fontSize: 20 },
  searchInput: {
    color: "#111719",
    flex: 1,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 10,
  },
  secondary: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 13,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryText: { color: "#203740", fontSize: 13, fontWeight: "800" },
  section: {
    backgroundColor: "#ffffff",
    borderColor: "#e1e2df",
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 22,
    padding: 16,
  },
  sectionEyebrow: {
    color: "#203740",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  sectionHeader: { alignItems: "center", flexDirection: "row", gap: 10 },
  sectionTitle: {
    color: "#111719",
    fontSize: 20,
    fontWeight: "800",
    marginTop: 4,
  },
  smallAction: {
    alignItems: "center",
    borderColor: "#203740",
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 14,
  },
  smallActionText: { color: "#203740", fontSize: 13, fontWeight: "800" },
  statusPill: {
    backgroundColor: "#e7efe8",
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  statusPillCancelled: { backgroundColor: "#ece9e3" },
  statusRow: { flexDirection: "row", gap: 8 },
  statusText: { color: "#2d6a3c", fontSize: 11, fontWeight: "900" },
  statusTextCancelled: { color: "#68635a" },
  title: {
    color: "#111719",
    fontSize: 35,
    fontWeight: "800",
    letterSpacing: -1.2,
    lineHeight: 39,
    marginTop: 20,
  },
});
