import type { PersonSummary } from "@duna/core";
import { pickupInviteActionLabel } from "@duna/core";
import * as Crypto from "expo-crypto";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { PlayerAvatar } from "./components/player-identity";
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

function rosterStatusLabel(
  status: PickupManagement["participants"][number]["status"],
  isHost: boolean,
) {
  if (isHost) return "Host · confirmed";
  if (status === "invited") return "Invited · waiting to accept";
  if (status === "pending") return "Payment in progress";
  if (status === "checked-in") return "Checked in";
  if (status === "waitlisted") return "Waitlisted";
  return "Confirmed";
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
  const [replacementTargetId, setReplacementTargetId] = useState<string>();
  const [replacementPickerOpen, setReplacementPickerOpen] = useState(false);
  const [replacementPlayers, setReplacementPlayers] = useState<
    readonly PersonSummary[]
  >([]);
  const [busyRequestId, setBusyRequestId] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const load = useCallback(async () => {
    if (!client) return;
    setError(undefined);
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
          ? "Approved. They can now reserve a spot while one is still open."
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

  async function replacePlayer() {
    const replacement = replacementPlayers[0];
    if (!client || !replacementTargetId || !replacement) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      await client.player.replacePickupPlayer.mutate({
        pickupSessionId,
        participantId: replacementTargetId,
        replacementPersonId: replacement.id,
        idempotencyKey: Crypto.randomUUID(),
      });
      setNotice(
        `${replacement.displayName} was invited. The previous player was removed from this roster place.`,
      );
      setReplacementTargetId(undefined);
      setReplacementPlayers([]);
      await load();
      onRosterChanged?.();
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  }

  if (!client) return null;
  if (!management) {
    return (
      <View style={styles.panel}>
        <Text style={[styles.eyebrow, { color: palette.aqua }]}>
          MATCH ROSTER
        </Text>
        <Text style={[styles.title, { color: palette.bone }]}>
          Loading player responses…
        </Text>
        <Text
          style={[
            styles.meta,
            { color: error ? palette.danger : palette.muted },
          ]}
        >
          {error
            ? error
            : "Duna is connecting the confirmed court, match, and invitations."}
        </Text>
        {error && (
          <Pressable
            accessibilityRole="button"
            onPress={() => void load()}
            style={[
              styles.action,
              { backgroundColor: palette.depth, borderColor: palette.aqua },
            ]}
          >
            <Text style={[styles.actionText, { color: palette.aqua }]}>
              Try again
            </Text>
          </Pressable>
        )}
      </View>
    );
  }
  if (!management.isHost) return null;
  const pending = management.requests.filter(
    (request) => request.status === "requested",
  );
  const assignedRosterCount = management.participants.filter(
    (participant) => participant.status !== "waitlisted",
  ).length;
  const invitePlaces = management.isCourtBookingMatch
    ? Math.max(0, management.capacity - assignedRosterCount)
    : management.spotsRemaining;
  const canInvite = management.canAddPlayers && invitePlaces > 0;
  const replacementTarget = management.participants.find(
    (participant) => participant.id === replacementTargetId,
  );
  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.flex}>
          <Text style={[styles.eyebrow, { color: palette.aqua }]}>
            MATCH ROSTER
          </Text>
          <Text style={[styles.title, { color: palette.bone }]}>
            {management.confirmedParticipantCount} confirmed ·{" "}
            {management.isCourtBookingMatch &&
            management.invitedParticipantCount > 0
              ? `${management.invitedParticipantCount} awaiting`
              : `${management.spotsRemaining} open`}
          </Text>
          <Text style={[styles.meta, { color: palette.muted }]}>
            {management.invitedParticipantCount > 0
              ? `${management.invitedParticipantCount} invitation${management.invitedParticipantCount === 1 ? "" : "s"} waiting for a response.`
              : "Player responses appear here as they arrive."}
          </Text>
        </View>
      </View>

      <View style={styles.roster}>
        {management.participants.map((participant) => {
          const waiting = participant.status === "invited";
          return (
            <View
              key={participant.id}
              style={[
                styles.rosterRow,
                {
                  backgroundColor: palette.depth,
                  borderColor: rgba(palette.overlayRgb, 0.09),
                },
              ]}
            >
              <PlayerAvatar
                avatarUrl={participant.avatarUrl}
                displayName={participant.displayName}
                palette={palette}
                size={50}
              />
              <View style={styles.flex}>
                <Text
                  numberOfLines={1}
                  style={[styles.rosterName, { color: palette.bone }]}
                >
                  {participant.displayName}
                </Text>
                <Text
                  style={[
                    styles.rosterStatus,
                    { color: waiting ? palette.warning : palette.positive },
                  ]}
                >
                  {rosterStatusLabel(participant.status, participant.isHost)}
                </Text>
              </View>
              {participant.canReplace && (
                <Pressable
                  accessibilityLabel={`Replace ${participant.displayName}`}
                  accessibilityRole="button"
                  onPress={() => {
                    setReplacementTargetId(participant.id);
                    setReplacementPlayers([]);
                    setReplacementPickerOpen(true);
                  }}
                  style={[
                    styles.replaceAction,
                    { borderColor: rgba(palette.overlayRgb, 0.18) },
                  ]}
                >
                  <Text
                    style={[styles.replaceActionText, { color: palette.aqua }]}
                  >
                    Replace
                  </Text>
                </Pressable>
              )}
            </View>
          );
        })}
      </View>

      {replacementTarget && replacementPlayers[0] && (
        <View
          style={[
            styles.replacementCard,
            {
              backgroundColor: `rgba(${palette.positiveRgb},0.08)`,
              borderColor: `rgba(${palette.positiveRgb},0.24)`,
            },
          ]}
        >
          <View style={styles.replacementPeople}>
            <PlayerAvatar
              palette={palette}
              person={replacementPlayers[0]}
              selected
              size={48}
            />
            <View style={styles.flex}>
              <Text style={[styles.requestName, { color: palette.bone }]}>
                Replace {replacementTarget.displayName}?
              </Text>
              <Text style={[styles.meta, { color: palette.muted }]}>
                {replacementPlayers[0].displayName} will receive a new
                invitation.
              </Text>
            </View>
          </View>
          <View style={styles.requestActions}>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => {
                setReplacementTargetId(undefined);
                setReplacementPlayers([]);
              }}
              style={[
                styles.decision,
                { borderColor: rgba(palette.overlayRgb, 0.18) },
              ]}
            >
              <Text style={[styles.decisionText, { color: palette.bone }]}>
                Keep current
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={busy}
              onPress={() => void replacePlayer()}
              style={[
                styles.decision,
                {
                  backgroundColor: palette.positive,
                  borderColor: palette.positive,
                  opacity: busy ? 0.42 : 1,
                },
              ]}
            >
              <Text style={[styles.decisionText, { color: palette.onAccent }]}>
                {busy ? "Replacing…" : "Replace + invite"}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

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
            {management.isCourtBookingMatch
              ? "Each invited player confirms their own place. The host-paid court is already covered."
              : "Each invited player accepts their own place and covers any match fee themselves. Spots stay open until they accept."}
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

      {management.approvalRequired && (
        <>
          <Text style={[styles.sectionLabel, { color: palette.muted }]}>
            JOIN REQUESTS
          </Text>
          {pending.length === 0 ? (
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
                  <PlayerAvatar
                    avatarUrl={request.avatarUrl}
                    displayName={request.displayName}
                    palette={palette}
                    size={44}
                  />
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
                    <Text
                      style={[styles.decisionText, { color: palette.bone }]}
                    >
                      Decline
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </>
      )}

      {notice && (
        <Text style={[styles.meta, { color: palette.positive }]}>{notice}</Text>
      )}
      {error && (
        <Text style={[styles.meta, { color: palette.danger }]}>{error}</Text>
      )}

      {showPicker && (
        <PlayerPickerModal
          maxSelected={Math.max(1, invitePlaces)}
          onChange={setInvitePlayers}
          onClose={() => setShowPicker(false)}
          palette={palette}
          presentationStyle="pageSheet"
          selected={invitePlayers}
          title="Invite players"
          visible
        />
      )}
      {replacementPickerOpen && replacementTarget && (
        <PlayerPickerModal
          excludedPersonIds={management.participants.map(
            (participant) => participant.personId,
          )}
          maxSelected={1}
          onChange={setReplacementPlayers}
          onClose={() => {
            setReplacementPickerOpen(false);
            if (replacementPlayers.length === 0) {
              setReplacementTargetId(undefined);
            }
          }}
          palette={palette}
          presentationStyle="pageSheet"
          selected={replacementPlayers}
          title={`Replace ${replacementTarget.displayName}`}
          visible
        />
      )}
    </View>
  );
}

/**
 * Full-height host surface without a modal of its own, for callers that already
 * own a modal and can swap their content.
 */
export function MatchHostView({
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
  replaceAction: {
    alignItems: "center",
    borderRadius: 15,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 46,
    minWidth: 82,
    paddingHorizontal: 12,
  },
  replaceActionText: { fontSize: 13, fontWeight: "800" },
  replacementCard: {
    borderRadius: 18,
    borderWidth: 1,
    gap: 13,
    marginTop: 12,
    padding: 14,
  },
  replacementPeople: { alignItems: "center", flexDirection: "row", gap: 12 },
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
  roster: { gap: 9, marginTop: 14 },
  rosterName: { fontSize: 15, fontWeight: "800" },
  rosterRow: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 76,
    padding: 12,
  },
  rosterStatus: { fontSize: 12, fontWeight: "800", marginTop: 4 },
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
