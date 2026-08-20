import type { PersonSummary } from "@duna/core";
import { pickupInviteActionLabel, pickupInviteExplanation } from "@duna/core";
import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { DunaApiClient } from "./mobile-api";
import { PlayerPickerModal, type MobileSocialPalette } from "./player-social";
import { SatoshiText as Text } from "./satoshi-text";

type PickupManagement = Awaited<
  ReturnType<DunaApiClient["player"]["pickupManagement"]["query"]>
>;

function rgba(rgb: string, alpha: number) {
  return `rgba(${rgb},${alpha})`;
}

function displayError(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : "Duna could not complete that request.";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function requestedLabel(createdAt: string) {
  const requested = new Date(createdAt);
  if (!Number.isFinite(requested.getTime())) return "Requested";
  const hours = Math.floor((Date.now() - requested.getTime()) / 3_600_000);
  if (hours < 1) return "Requested just now";
  if (hours < 24) return `Requested ${hours}h ago`;
  return `Requested ${requested.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;
}

/**
 * Host controls for a match that already exists: invite Duna players and act on
 * the people who asked to join. Rendered inline so a booked match and a
 * just-published match can use the same surface.
 */
export function MatchHostPanel({
  client,
  onRosterChanged,
  palette,
  pickupSessionId,
}: {
  readonly client?: DunaApiClient;
  readonly onRosterChanged?: () => void;
  readonly palette: MobileSocialPalette;
  readonly pickupSessionId: string;
}) {
  const [management, setManagement] = useState<PickupManagement>();
  const [invitePlayers, setInvitePlayers] = useState<readonly PersonSummary[]>(
    [],
  );
  const [showPicker, setShowPicker] = useState(false);
  const [busyRequestId, setBusyRequestId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setManagement(
        await client.player.pickupManagement.query({ pickupSessionId }),
      );
    } catch (reason) {
      setError(displayError(reason));
    }
  }, [client, pickupSessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function review(requestId: string, decision: "approved" | "rejected") {
    if (!client) return;
    setBusyRequestId(requestId);
    setError(undefined);
    setNotice(undefined);
    try {
      await client.player.reviewPickupJoinRequest.mutate({
        requestId,
        decision,
        idempotencyKey: Crypto.randomUUID(),
      });
      setNotice(
        decision === "approved"
          ? "Approved. They now hold a confirmed place."
          : "Declined. Duna told them the spot is not available.",
      );
      await load();
      onRosterChanged?.();
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setBusyRequestId(undefined);
    }
  }

  async function sendInvitations() {
    if (!client || invitePlayers.length === 0) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const result = await client.player.invitePickupPlayers.mutate({
        pickupSessionId,
        personIds: invitePlayers.map((person) => person.id),
        idempotencyKey: Crypto.randomUUID(),
      });
      setNotice(
        result.invitedPersonIds.length > 0
          ? `Invitation sent to ${result.invitedPersonIds.length} player${
              result.invitedPersonIds.length === 1 ? "" : "s"
            }. Each one still has to accept.`
          : "Everyone you chose is already on this match.",
      );
      setInvitePlayers([]);
      await load();
      onRosterChanged?.();
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  }

  if (!client || !management?.isHost) return null;
  const pending = management.requests.filter(
    (request) => request.status === "requested",
  );
  const canInvite = management.canAddPlayers && management.spotsRemaining > 0;
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={[styles.eyebrow, { color: palette.aqua }]}>
            YOU HOST THIS MATCH
          </Text>
          <Text style={[styles.title, { color: palette.bone }]}>
            {management.confirmedParticipantCount} confirmed ·{" "}
            {management.spotsRemaining} open
          </Text>
          <Text style={[styles.meta, { color: palette.muted }]}>
            {management.invitedParticipantCount} invited and waiting to accept.
          </Text>
        </View>
      </View>

      {canInvite && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowPicker(true)}
          style={[
            styles.action,
            { backgroundColor: palette.depth, borderColor: palette.aqua },
          ]}
        >
          <Text style={[styles.actionText, { color: palette.aqua }]}>
            {invitePlayers.length > 0
              ? `${invitePlayers.length} chosen · change selection`
              : "Invite players"}
          </Text>
        </Pressable>
      )}

      {invitePlayers.length > 0 && (
        <>
          <Text style={[styles.meta, { color: palette.muted }]}>
            {pickupInviteExplanation(false)}
          </Text>
          <Pressable
            accessibilityLabel={pickupInviteActionLabel(invitePlayers.length)}
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void sendInvitations()}
            style={[
              styles.action,
              {
                backgroundColor: palette.aqua,
                borderColor: palette.aqua,
                opacity: busy ? 0.42 : 1,
              },
            ]}
          >
            <Text style={[styles.actionText, { color: palette.onAccent }]}>
              {busy
                ? "Sending…"
                : pickupInviteActionLabel(invitePlayers.length)}
            </Text>
          </Pressable>
        </>
      )}

      <Text style={[styles.sectionLabel, { color: palette.muted }]}>
        JOIN REQUESTS
      </Text>
      {!management.approvalRequired ? (
        <Text style={[styles.meta, { color: palette.muted }]}>
          Approval is off for this match, so eligible players take an open spot
          directly. Turn on approval in match details to review each request.
        </Text>
      ) : pending.length === 0 ? (
        <Text style={[styles.meta, { color: palette.muted }]}>
          No one is waiting on you. New requests appear here.
        </Text>
      ) : (
        pending.map((request) => (
          <View
            key={request.id}
            style={[
              styles.request,
              {
                backgroundColor: palette.depth,
                borderColor: rgba(palette.overlayRgb, 0.08),
              },
            ]}
          >
            <View style={styles.requestPerson}>
              {request.avatarUrl ? (
                <Image
                  accessibilityIgnoresInvertColors
                  source={{ uri: request.avatarUrl }}
                  style={styles.avatar}
                />
              ) : (
                <View
                  style={[styles.avatar, { backgroundColor: palette.navy }]}
                >
                  <Text style={[styles.avatarText, { color: palette.aqua }]}>
                    {initials(request.displayName)}
                  </Text>
                </View>
              )}
              <View style={styles.flex}>
                <Text
                  numberOfLines={1}
                  style={[styles.requestName, { color: palette.bone }]}
                >
                  {request.displayName}
                </Text>
                <Text style={[styles.meta, { color: palette.muted }]}>
                  {requestedLabel(request.createdAt)}
                </Text>
                {!!request.note && (
                  <Text style={[styles.note, { color: palette.bone }]}>
                    “{request.note}”
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.requestActions}>
              <Pressable
                accessibilityLabel={`Approve ${request.displayName}`}
                accessibilityRole="button"
                disabled={busyRequestId === request.id}
                onPress={() => void review(request.id, "approved")}
                style={[
                  styles.decision,
                  {
                    backgroundColor: palette.aqua,
                    borderColor: palette.aqua,
                    opacity: busyRequestId === request.id ? 0.42 : 1,
                  },
                ]}
              >
                <Text
                  style={[styles.decisionText, { color: palette.onAccent }]}
                >
                  Approve
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`Decline ${request.displayName}`}
                accessibilityRole="button"
                disabled={busyRequestId === request.id}
                onPress={() => void review(request.id, "rejected")}
                style={[
                  styles.decision,
                  {
                    borderColor: rgba(palette.overlayRgb, 0.2),
                    opacity: busyRequestId === request.id ? 0.42 : 1,
                  },
                ]}
              >
                <Text style={[styles.decisionText, { color: palette.bone }]}>
                  Decline
                </Text>
              </Pressable>
            </View>
          </View>
        ))
      )}

      {notice && (
        <Text style={[styles.meta, { color: palette.positive }]}>{notice}</Text>
      )}
      {error && (
        <Text style={[styles.meta, { color: palette.danger }]}>{error}</Text>
      )}

      {showPicker && (
        <PlayerPickerModal
          maxSelected={Math.max(1, management.spotsRemaining)}
          onChange={setInvitePlayers}
          onClose={() => setShowPicker(false)}
          palette={palette}
          presentationStyle="pageSheet"
          selected={invitePlayers}
          title="Invite players"
          visible
        />
      )}
    </View>
  );
}

/** The host panel presented as its own scrollable sheet. */
export function MatchHostSheet({
  client,
  matchTitle,
  onClose,
  onRosterChanged,
  palette,
  pickupSessionId,
}: {
  readonly client?: DunaApiClient;
  readonly matchTitle: string;
  readonly onClose: () => void;
  readonly onRosterChanged?: () => void;
  readonly palette: MobileSocialPalette;
  readonly pickupSessionId: string;
}) {
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible
    >
      <SafeAreaView
        edges={["top", "bottom"]}
        style={[styles.sheet, { backgroundColor: palette.canvas }]}
      >
        <View
          style={[
            styles.sheetHeader,
            { borderBottomColor: rgba(palette.overlayRgb, 0.1) },
          ]}
        >
          <View style={styles.flex}>
            <Text style={[styles.eyebrow, { color: palette.aqua }]}>
              MATCH HOSTING
            </Text>
            <Text
              numberOfLines={1}
              style={[styles.title, { color: palette.bone }]}
            >
              {matchTitle}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close match hosting"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.sheetClose}
          >
            <Text style={[styles.sheetCloseText, { color: palette.bone }]}>
              ×
            </Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          <MatchHostPanel
            client={client}
            onRosterChanged={onRosterChanged}
            palette={palette}
            pickupSessionId={pickupSessionId}
          />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  actionText: { fontSize: 15, fontWeight: "800" },
  avatar: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    overflow: "hidden",
    width: 44,
  },
  avatarText: { fontSize: 14, fontWeight: "900" },
  decision: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  decisionText: { fontSize: 14, fontWeight: "800" },
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1.3 },
  flex: { flex: 1, minWidth: 0 },
  header: { flexDirection: "row", gap: 12 },
  meta: { fontSize: 13, lineHeight: 19, marginTop: 6 },
  note: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  panel: { marginTop: 20 },
  request: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    marginTop: 10,
    padding: 14,
  },
  requestActions: { flexDirection: "row", gap: 10 },
  requestName: { fontSize: 16, fontWeight: "800" },
  requestPerson: { flexDirection: "row", gap: 12 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginTop: 22,
  },
  sheet: { flex: 1 },
  sheetClose: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  sheetCloseText: { fontSize: 30, lineHeight: 34 },
  sheetContent: { paddingBottom: 48, paddingHorizontal: 18 },
  sheetHeader: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  title: { fontSize: 20, fontWeight: "900", letterSpacing: -0.3, marginTop: 4 },
});
