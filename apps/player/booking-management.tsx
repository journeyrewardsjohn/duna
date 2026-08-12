import * as Crypto from "expo-crypto";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import {
  googleMapsSearchUrl,
  nativeMapUrl,
  pickupInviteActionLabel,
  pickupInviteExplanation,
  pickupInviteResult,
} from "@duna/core";
import { useEffect, useState } from "react";
import {
  Image,
  Linking,
  Modal,
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
import { dunaWebUrl, type DunaApiClient } from "./mobile-api";
import { presentNativeEventPayment } from "./native-payments";
import { shareBooking, type ShareableBookingDetails } from "./booking-share";

export type ManagedBooking = {
  readonly id: string;
  readonly source?: "registration" | "pickup" | "court";
  readonly sessionId?: string;
  readonly sessionSlug?: string;
  readonly title: string;
  readonly kind: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly venueName: string;
  readonly venueId?: string;
  readonly venueTimezone?: string;
  readonly organization?: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
  readonly location?: {
    readonly label: string;
    readonly address?: string;
    readonly googlePlaceId?: string;
    readonly latitude?: number;
    readonly longitude?: number;
  };
  readonly court?: { readonly id: string; readonly name: string };
  readonly details?: { readonly label: string; readonly path: string };
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
  readonly pickup?: {
    readonly capacity: number;
    readonly confirmedCount: number;
    readonly spotsRemaining: number;
    readonly waitlistEnabled: boolean;
    readonly approvalRequired: boolean;
    readonly visibility: "public" | "unlisted";
    readonly note?: string;
    readonly pricePerPerson: {
      readonly amountMinor: number;
      readonly currency: string;
    };
    readonly canAddPlayers: boolean;
    readonly isCreator: boolean;
    readonly invitationStatus?: "invited";
  };
  readonly team?: {
    readonly divisionId: string;
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
  const [editingPickupDetails, setEditingPickupDetails] = useState(false);
  const [pickupDraft, setPickupDraft] = useState({
    title: "",
    venueName: "",
    capacity: "4",
    note: "",
    waitlistEnabled: true,
    approvalRequired: false,
    visibility: "public" as "public" | "unlisted",
  });
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
  const [pickupPlayers, setPickupPlayers] = useState<readonly SearchResult[]>(
    [],
  );
  const [inviteTarget, setInviteTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [message, setMessage] = useState<string>();
  const [cancelled, setCancelled] = useState(false);
  const [showAttribution, setShowAttribution] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [mapImageFailed, setMapImageFailed] = useState(false);

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
    setEditingPickupDetails(false);
    setPickupDraft({
      title: booking?.title ?? "",
      venueName: booking?.venueName ?? "",
      capacity: String(booking?.pickup?.capacity ?? 4),
      note: booking?.pickup?.note ?? "",
      waitlistEnabled: booking?.pickup?.waitlistEnabled ?? true,
      approvalRequired: booking?.pickup?.approvalRequired ?? false,
      visibility: booking?.pickup?.visibility ?? "public",
    });
    setConfirmCancel(false);
    setCancelled(false);
    setMessage(undefined);
    setPickupPlayers([]);
    setShowAttribution(Boolean(booking?.addedBy));
    setCopiedAddress(false);
    setMapImageFailed(false);
  }, [booking]);

  if (!booking) return null;

  async function search(value: string) {
    setQuery(value);
    if (!client) return;
    const next = await client.player.teammateSearch
      .query({
        query: value.trim() || undefined,
        divisionId: booking?.team?.divisionId,
        limit: 12,
      })
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

  async function finishPickupCheckout(
    selectedPlayers: readonly SearchResult[] = [],
  ) {
    const pickupSessionId = booking?.sessionId;
    if (!client || !pickupSessionId) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const result = await client.player.startEventCheckout.mutate({
        sessionId: pickupSessionId,
        teamPaymentMode: selectedPlayers.length ? "team" : "self",
        teamRoster: selectedPlayers.length
          ? selectedPlayers.map(({ person }) => ({
              personId: person.id,
              displayName: person.displayName,
            }))
          : undefined,
        acceptedPolicyIds: [],
        readPolicyIds: [],
        isDunaPlus: false,
        paymentSurface: Platform.OS === "web" ? "hosted" : "native",
        successUrl: `${dunaWebUrl}/app/play?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${dunaWebUrl}/app/play?checkout=cancelled`,
        idempotencyKey: Crypto.randomUUID(),
      });
      if (result.paymentSheet) {
        const paymentIntentId = result.paymentSheet.paymentIntentId;
        const paymentResult = await presentNativeEventPayment({
          paymentSheet: result.paymentSheet,
        });
        if (paymentResult === "cancelled") return;
        let status = await client.player.checkoutStatus.query({
          paymentIntentId,
        });
        for (let attempt = 0; attempt < 5 && !status.complete; attempt += 1) {
          await new Promise((resolve) =>
            setTimeout(resolve, 450 + attempt * 250),
          );
          status = await client.player.checkoutStatus.query({
            paymentIntentId,
          });
        }
        setMessage(
          status.complete
            ? `${selectedPlayers.length || 1} ${selectedPlayers.length === 1 ? "place is" : "places are"} confirmed.`
            : "Payment succeeded. Duna is finishing confirmation now.",
        );
      } else if (result.checkoutUrl) {
        if (Platform.OS !== "web") {
          throw new Error(
            "Duna could not prepare the in-app payment. No additional player was charged.",
          );
        }
        await WebBrowser.openBrowserAsync(result.checkoutUrl);
        setMessage(
          "Checkout opened securely. Duna confirms every paid place after payment succeeds.",
        );
      } else if (result.mode === "waitlist") {
        setMessage(
          "The match filled while you were choosing. You are now on the waitlist.",
        );
      } else {
        setMessage(
          `${selectedPlayers.length || 1} free ${selectedPlayers.length === 1 ? "place is" : "places are"} confirmed.`,
        );
      }
      setPickupPlayers([]);
      setEditing(false);
      await onUpdated();
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Duna could not confirm these places.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function invitePickupSelection() {
    const pickupSessionId = booking?.sessionId;
    if (!client || !pickupSessionId || pickupPlayers.length === 0) return;
    setBusy(true);
    setMessage(undefined);
    try {
      const response = await client.player.invitePickupPlayers.mutate({
        pickupSessionId,
        personIds: pickupPlayers.map(({ person }) => person.id),
        idempotencyKey: Crypto.randomUUID(),
      });
      setMessage(
        pickupInviteResult({
          invitedCount: response.invitedPersonIds.length,
          alreadyActiveCount: response.alreadyActivePersonIds.length,
          paidMatch: (booking.pickup?.pricePerPerson.amountMinor ?? 0) > 0,
        }),
      );
      setPickupPlayers([]);
      setEditing(false);
      await onUpdated();
    } catch {
      setMessage("Invitations were not sent. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function savePickupDetails() {
    const pickupSessionId = booking?.sessionId;
    const capacity = Number.parseInt(pickupDraft.capacity, 10);
    if (!client || !pickupSessionId || !booking?.pickup) return;
    if (
      pickupDraft.title.trim().length < 2 ||
      pickupDraft.venueName.trim().length < 2 ||
      !Number.isSafeInteger(capacity) ||
      capacity < Math.max(2, booking.pickup.confirmedCount) ||
      capacity > 100
    ) {
      setMessage(
        `Use a title and venue, with ${Math.max(2, booking.pickup.confirmedCount)}–100 total spots.`,
      );
      return;
    }
    setBusy(true);
    setMessage(undefined);
    try {
      await client.player.updatePickup.mutate({
        pickupSessionId,
        title: pickupDraft.title.trim(),
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        venueName: pickupDraft.venueName.trim(),
        capacity,
        note: pickupDraft.note.trim() || undefined,
        approvalRequired: pickupDraft.approvalRequired,
        waitlistEnabled: pickupDraft.waitlistEnabled,
        visibility: pickupDraft.visibility,
        idempotencyKey: Crypto.randomUUID(),
      });
      setEditingPickupDetails(false);
      setMessage("Match details updated for everyone.");
      await onUpdated();
    } catch (reason) {
      setMessage(
        reason instanceof Error
          ? reason.message
          : "Duna could not update this match.",
      );
    } finally {
      setBusy(false);
    }
  }

  const location = booking.location ?? { label: booking.venueName };
  const detailsUrl = booking.details
    ? `${dunaWebUrl}${booking.details.path}`
    : undefined;
  const shareDetails = {
    title: booking.title,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    ...(booking.venueTimezone ? { timezone: booking.venueTimezone } : {}),
    ...(booking.organization?.name
      ? { organizationName: booking.organization.name }
      : {}),
    locationName: location.label,
    ...(location.address ? { address: location.address } : {}),
    ...(booking.court?.name ? { courtName: booking.court.name } : {}),
    ...(booking.participantNames?.length
      ? { playerNames: booking.participantNames }
      : {}),
    ...(detailsUrl ? { detailsUrl } : {}),
  } satisfies ShareableBookingDetails;
  const mapImageUrl = location.address
    ? `${dunaWebUrl}/api/places/map?${
        location.latitude !== undefined && location.longitude !== undefined
          ? `latitude=${encodeURIComponent(String(location.latitude))}&longitude=${encodeURIComponent(String(location.longitude))}`
          : `address=${encodeURIComponent(location.address)}`
      }`
    : undefined;

  async function openMap() {
    if (!location.address) return;
    const platform =
      Platform.OS === "ios"
        ? "ios"
        : Platform.OS === "android"
          ? "android"
          : "web";
    const fallback = googleMapsSearchUrl({
      address: location.address,
      googlePlaceId: location.googlePlaceId,
    });
    const destination = nativeMapUrl({
      address: location.address,
      label: location.label,
      latitude: location.latitude,
      longitude: location.longitude,
      platform,
    });
    try {
      if (platform === "web") await WebBrowser.openBrowserAsync(fallback);
      else await Linking.openURL(destination);
    } catch {
      await WebBrowser.openBrowserAsync(fallback);
    }
  }

  async function copyAddress() {
    if (!location.address) return;
    await Clipboard.setStringAsync(location.address);
    setCopiedAddress(true);
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
                ...(booking.venueTimezone
                  ? { timeZone: booking.venueTimezone }
                  : {}),
              })}
            </Text>
            <Text style={styles.meta}>{booking.venueName}</Text>

            <View style={styles.bookingDetailsCard}>
              <Text style={styles.sectionEyebrow}>BOOKING DETAILS</Text>
              <View style={styles.bookingDetailGrid}>
                <View style={styles.bookingDetailItem}>
                  <Text style={styles.bookingDetailLabel}>TIME</Text>
                  <Text style={styles.bookingDetailValue}>
                    {new Date(booking.startsAt).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      ...(booking.venueTimezone
                        ? { timeZone: booking.venueTimezone }
                        : {}),
                    })}
                    {" – "}
                    {new Date(booking.endsAt).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                      ...(booking.venueTimezone
                        ? { timeZone: booking.venueTimezone }
                        : {}),
                    })}
                  </Text>
                </View>
                {booking.court && (
                  <View style={styles.bookingDetailItem}>
                    <Text style={styles.bookingDetailLabel}>COURT</Text>
                    <Text style={styles.bookingDetailValue}>
                      {booking.court.name}
                    </Text>
                  </View>
                )}
                {booking.organization && (
                  <View style={styles.bookingDetailItem}>
                    <Text style={styles.bookingDetailLabel}>ORGANIZATION</Text>
                    <Text style={styles.bookingDetailValue}>
                      {booking.organization.name}
                    </Text>
                  </View>
                )}
              </View>
              <Pressable
                accessibilityLabel={`Share ${booking.title}`}
                onPress={() => void shareBooking(shareDetails)}
                style={styles.shareAction}
              >
                <Text style={styles.shareActionIcon}>↗</Text>
                <Text style={styles.shareActionText}>Share booking</Text>
              </Pressable>
            </View>

            {location.address && (
              <View style={styles.locationCard}>
                <Pressable
                  accessibilityLabel={`Open map for ${location.label}`}
                  onPress={() => void openMap()}
                  style={styles.locationMap}
                >
                  {mapImageUrl && !mapImageFailed ? (
                    <Image
                      accessibilityIgnoresInvertColors
                      onError={() => setMapImageFailed(true)}
                      source={{ uri: mapImageUrl }}
                      style={styles.locationMapImage}
                    />
                  ) : (
                    <View style={styles.locationMapFallback}>
                      <Text style={styles.locationMapFallbackPin}>⌖</Text>
                      <Text
                        numberOfLines={1}
                        style={styles.locationMapFallbackText}
                      >
                        {location.label}
                      </Text>
                    </View>
                  )}
                  <View style={styles.locationMapBadge}>
                    <Text style={styles.locationMapBadgeText}>OPEN MAP ↗</Text>
                  </View>
                </Pressable>
                <View style={styles.locationDetails}>
                  <Text style={styles.sectionEyebrow}>LOCATION</Text>
                  <Text style={styles.locationName}>{location.label}</Text>
                  <Pressable onPress={() => void openMap()}>
                    <Text style={styles.locationAddress}>
                      {location.address} ↗
                    </Text>
                  </Pressable>
                  <View style={styles.locationActions}>
                    <Pressable
                      onPress={() => void copyAddress()}
                      style={styles.locationSecondary}
                    >
                      <Text style={styles.locationSecondaryText}>
                        {copiedAddress ? "✓ Copied" : "Copy address"}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={() => void openMap()}
                      style={styles.locationPrimary}
                    >
                      <Text style={styles.locationPrimaryText}>Maps ↗</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            {booking.details && detailsUrl && (
              <Pressable
                accessibilityRole="link"
                onPress={() => void WebBrowser.openBrowserAsync(detailsUrl)}
                style={styles.detailsLink}
              >
                <View style={styles.flex}>
                  <Text style={styles.detailsLinkEyebrow}>KEEP EXPLORING</Text>
                  <Text style={styles.detailsLinkTitle}>
                    {booking.details.label}
                  </Text>
                </View>
                <Text style={styles.detailsLinkArrow}>↗</Text>
              </Pressable>
            )}

            {message && (
              <View style={styles.notice}>
                <Text style={styles.noticeText}>{message}</Text>
              </View>
            )}

            {!cancelled && booking.pickup?.invitationStatus === "invited" && (
              <View style={styles.invitationCard}>
                <Text style={styles.sectionEyebrow}>YOUR INVITATION</Text>
                <Text style={styles.sectionTitle}>You’re invited.</Text>
                <Text style={styles.policy}>
                  {booking.addedBy?.displayName ?? "A player"} invited you.
                  Confirm
                  {booking.pickup.pricePerPerson.amountMinor > 0
                    ? " and pay"
                    : ""}
                  {" to claim an open place."}
                </Text>
                <Pressable
                  disabled={busy}
                  onPress={() => void finishPickupCheckout()}
                  style={[styles.primary, busy && styles.actionDisabled]}
                >
                  <Text style={styles.primaryText}>
                    {busy
                      ? "Checking availability…"
                      : booking.pickup.pricePerPerson.amountMinor > 0
                        ? `Confirm & pay ${money({ ...booking, amount: booking.pickup.pricePerPerson })}`
                        : "Confirm my place"}
                  </Text>
                </Pressable>
              </View>
            )}

            {!cancelled && booking.pickup && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <View style={styles.flex}>
                    <Text style={styles.sectionEyebrow}>MATCH ROSTER</Text>
                    <Text style={styles.sectionTitle}>
                      {booking.pickup.confirmedCount} confirmed ·{" "}
                      {booking.pickup.spotsRemaining} open
                    </Text>
                  </View>
                  {booking.pickup.canAddPlayers && (
                    <Pressable
                      onPress={() => setEditing((current) => !current)}
                      style={styles.smallAction}
                    >
                      <Text style={styles.smallActionText}>
                        {editing ? "Done" : "Add players"}
                      </Text>
                    </Pressable>
                  )}
                </View>
                <Text style={styles.policy}>
                  {booking.pickup.capacity} total spots
                  {booking.pickup.waitlistEnabled
                    ? " · waitlist enabled"
                    : " · waitlist off"}
                  {booking.pickup.isCreator
                    ? " · only you can edit match details"
                    : " · you can invite or cover more players"}
                </Text>
                {booking.pickup.isCreator && (
                  <Pressable
                    onPress={() =>
                      setEditingPickupDetails((current) => !current)
                    }
                    style={styles.creatorEditAction}
                  >
                    <Text style={styles.creatorEditActionText}>
                      {editingPickupDetails ? "Close editor" : "Edit match"}
                    </Text>
                  </Pressable>
                )}
                {editingPickupDetails && booking.pickup.isCreator && (
                  <View style={styles.pickupEditor}>
                    <Text style={styles.fieldLabel}>MATCH NAME</Text>
                    <TextInput
                      maxLength={140}
                      onChangeText={(title) =>
                        setPickupDraft((current) => ({ ...current, title }))
                      }
                      placeholder="Match name"
                      placeholderTextColor="#8a857b"
                      style={styles.fieldInput}
                      value={pickupDraft.title}
                    />
                    <Text style={styles.fieldLabel}>VENUE</Text>
                    <TextInput
                      maxLength={180}
                      onChangeText={(venueName) =>
                        setPickupDraft((current) => ({
                          ...current,
                          venueName,
                        }))
                      }
                      placeholder="Venue or court"
                      placeholderTextColor="#8a857b"
                      style={styles.fieldInput}
                      value={pickupDraft.venueName}
                    />
                    <Text style={styles.fieldLabel}>TOTAL SPOTS</Text>
                    <TextInput
                      keyboardType="number-pad"
                      maxLength={3}
                      onChangeText={(capacity) =>
                        setPickupDraft((current) => ({
                          ...current,
                          capacity: capacity.replace(/\D/g, ""),
                        }))
                      }
                      placeholder="4"
                      placeholderTextColor="#8a857b"
                      style={styles.fieldInput}
                      value={pickupDraft.capacity}
                    />
                    <Text style={styles.fieldHint}>
                      At least {Math.max(2, booking.pickup.confirmedCount)} for
                      players already confirmed. Pickup formats may have more
                      than four people.
                    </Text>
                    <Text style={styles.fieldLabel}>NOTE</Text>
                    <TextInput
                      maxLength={2000}
                      multiline
                      onChangeText={(note) =>
                        setPickupDraft((current) => ({ ...current, note }))
                      }
                      placeholder="What should players know?"
                      placeholderTextColor="#8a857b"
                      style={[styles.fieldInput, styles.noteInput]}
                      value={pickupDraft.note}
                    />
                    <View style={styles.toggleStack}>
                      <Pressable
                        accessibilityRole="switch"
                        accessibilityState={{
                          checked: pickupDraft.waitlistEnabled,
                        }}
                        onPress={() =>
                          setPickupDraft((current) => ({
                            ...current,
                            waitlistEnabled: !current.waitlistEnabled,
                          }))
                        }
                        style={styles.toggleRow}
                      >
                        <View style={styles.flex}>
                          <Text style={styles.toggleTitle}>
                            Enable waitlist
                          </Text>
                          <Text style={styles.toggleBody}>
                            Players can line up after confirmed places fill.
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.toggle,
                            pickupDraft.waitlistEnabled && styles.toggleOn,
                          ]}
                        >
                          <View
                            style={[
                              styles.toggleKnob,
                              pickupDraft.waitlistEnabled &&
                                styles.toggleKnobOn,
                            ]}
                          />
                        </View>
                      </Pressable>
                      <Pressable
                        accessibilityRole="switch"
                        accessibilityState={{
                          checked: pickupDraft.approvalRequired,
                        }}
                        onPress={() =>
                          setPickupDraft((current) => ({
                            ...current,
                            approvalRequired: !current.approvalRequired,
                          }))
                        }
                        style={styles.toggleRow}
                      >
                        <View style={styles.flex}>
                          <Text style={styles.toggleTitle}>
                            Approve join requests
                          </Text>
                          <Text style={styles.toggleBody}>
                            Invited and paid-for players keep their direct path.
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.toggle,
                            pickupDraft.approvalRequired && styles.toggleOn,
                          ]}
                        >
                          <View
                            style={[
                              styles.toggleKnob,
                              pickupDraft.approvalRequired &&
                                styles.toggleKnobOn,
                            ]}
                          />
                        </View>
                      </Pressable>
                    </View>
                    <Text style={styles.fieldLabel}>DISCOVERY</Text>
                    <View style={styles.segmentedControl}>
                      {(["public", "unlisted"] as const).map((visibility) => (
                        <Pressable
                          accessibilityState={{
                            selected: pickupDraft.visibility === visibility,
                          }}
                          key={visibility}
                          onPress={() =>
                            setPickupDraft((current) => ({
                              ...current,
                              visibility,
                            }))
                          }
                          style={[
                            styles.segment,
                            pickupDraft.visibility === visibility &&
                              styles.segmentActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.segmentText,
                              pickupDraft.visibility === visibility &&
                                styles.segmentTextActive,
                            ]}
                          >
                            {visibility === "public" ? "Public" : "Unlisted"}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <Pressable
                      disabled={busy}
                      onPress={() => void savePickupDetails()}
                      style={[styles.primary, busy && styles.actionDisabled]}
                    >
                      <Text style={styles.primaryText}>
                        {busy ? "Saving…" : "Save match changes"}
                      </Text>
                    </Pressable>
                  </View>
                )}
                {editing && booking.pickup.canAddPlayers && (
                  <>
                    <View style={styles.search}>
                      <Text style={styles.searchIcon}>⌕</Text>
                      <TextInput
                        onChangeText={(value) => void search(value)}
                        placeholder="Search Duna players"
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
                      {results.map((result) => {
                        const selected = pickupPlayers.some(
                          ({ person }) => person.id === result.person.id,
                        );
                        return (
                          <Pressable
                            accessibilityLabel={`${selected ? "Remove" : "Add"} ${result.person.displayName}`}
                            disabled={!result.eligible}
                            key={result.person.id}
                            onPress={() =>
                              setPickupPlayers((current) =>
                                selected
                                  ? current.filter(
                                      ({ person }) =>
                                        person.id !== result.person.id,
                                    )
                                  : [...current, result],
                              )
                            }
                            style={[
                              styles.result,
                              selected && styles.resultSelected,
                              !result.eligible && styles.actionDisabled,
                            ]}
                          >
                            <View style={styles.resultAvatar}>
                              <Text style={styles.avatarText}>
                                {result.person.initials}
                              </Text>
                            </View>
                            <Text numberOfLines={1} style={styles.resultName}>
                              {result.person.displayName}
                            </Text>
                            <Text style={styles.resultMeta}>
                              Sand Rating{" "}
                              {result.person.rating.display.toFixed(2)}
                            </Text>
                            <Text style={styles.resultChoice}>
                              {selected
                                ? "SELECTED"
                                : result.eligible
                                  ? "SELECT"
                                  : "NOT ELIGIBLE"}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                    {pickupPlayers.length > 0 && (
                      <>
                        <Text style={styles.pickupActionHelp}>
                          {pickupInviteExplanation(
                            booking.pickup.pricePerPerson.amountMinor > 0,
                          )}
                        </Text>
                        <View style={styles.pickupActions}>
                          <Pressable
                            accessibilityLabel={pickupInviteActionLabel(
                              pickupPlayers.length,
                            )}
                            disabled={busy}
                            onPress={() => void invitePickupSelection()}
                            style={styles.secondaryPickupAction}
                          >
                            <Text style={styles.secondaryPickupActionText}>
                              {pickupInviteActionLabel(pickupPlayers.length)}
                            </Text>
                          </Pressable>
                          {booking.pickup.pricePerPerson.amountMinor > 0 && (
                            <Pressable
                              disabled={
                                busy ||
                                pickupPlayers.length >
                                  booking.pickup.spotsRemaining
                              }
                              onPress={() =>
                                void finishPickupCheckout(pickupPlayers)
                              }
                              style={[
                                styles.primaryPickupAction,
                                (busy ||
                                  pickupPlayers.length >
                                    booking.pickup.spotsRemaining) &&
                                  styles.actionDisabled,
                              ]}
                            >
                              <Text style={styles.primaryText}>
                                Pay & confirm {pickupPlayers.length}
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      </>
                    )}
                  </>
                )}
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
                            <Text
                              numberOfLines={3}
                              style={[
                                styles.resultEligibility,
                                result.eligible
                                  ? styles.resultEligible
                                  : styles.resultIneligible,
                              ]}
                            >
                              {result.eligible
                                ? "Eligible for this division"
                                : result.eligibilityReasons.join(" · ") ||
                                  "Does not meet the division criteria"}
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
                              <Text style={styles.addText}>
                                {result.eligible ? "Add" : "Not eligible"}
                              </Text>
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
  bookingDetailGrid: { gap: 2, marginTop: 8 },
  bookingDetailItem: {
    alignItems: "flex-start",
    borderTopColor: "#ecebe7",
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
  },
  bookingDetailLabel: {
    color: "#78858a",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    width: 92,
  },
  bookingDetailsCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e1dfda",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 22,
    padding: 17,
  },
  bookingDetailValue: {
    color: "#203740",
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
  },
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
  creatorEditAction: {
    alignItems: "center",
    alignSelf: "flex-start",
    borderColor: "#203740",
    borderRadius: 13,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 46,
    paddingHorizontal: 14,
  },
  creatorEditActionText: {
    color: "#203740",
    fontSize: 13,
    fontWeight: "800",
  },
  fieldHint: {
    color: "#777166",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 7,
  },
  fieldInput: {
    backgroundColor: "#f5f4f0",
    borderColor: "#e2dfd6",
    borderRadius: 13,
    borderWidth: 1,
    color: "#111719",
    fontSize: 15,
    minHeight: 49,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  fieldLabel: {
    color: "#203740",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    marginBottom: 7,
    marginTop: 16,
  },
  danger: {
    alignItems: "center",
    backgroundColor: "#a54032",
    borderRadius: 13,
    flex: 1.3,
    justifyContent: "center",
    minHeight: 48,
  },
  dangerText: { color: "#ffffff", fontSize: 13, fontWeight: "800" },
  detailsLink: {
    alignItems: "center",
    backgroundColor: "#e8eeef",
    borderRadius: 18,
    flexDirection: "row",
    marginTop: 18,
    minHeight: 76,
    padding: 16,
  },
  detailsLinkArrow: { color: "#203740", fontSize: 24, fontWeight: "900" },
  detailsLinkEyebrow: {
    color: "#718084",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  detailsLinkTitle: {
    color: "#203740",
    fontSize: 18,
    fontWeight: "900",
    marginTop: 3,
  },
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
  locationActions: { flexDirection: "row", gap: 8, marginTop: 14 },
  locationAddress: {
    color: "#706a60",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 5,
  },
  locationCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e1dfda",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 18,
    overflow: "hidden",
  },
  locationDetails: { padding: 17 },
  locationMap: {
    alignItems: "center",
    backgroundColor: "#dce5e7",
    height: 142,
    justifyContent: "center",
    overflow: "hidden",
  },
  locationMapBadge: {
    backgroundColor: "rgba(32,55,64,0.9)",
    borderRadius: 11,
    bottom: 12,
    paddingHorizontal: 11,
    paddingVertical: 7,
    position: "absolute",
    right: 12,
  },
  locationMapBadgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  locationMapImage: { height: "100%", width: "100%" },
  locationMapFallback: { alignItems: "center", paddingHorizontal: 24 },
  locationMapFallbackPin: {
    color: "#203740",
    fontSize: 34,
    fontWeight: "900",
  },
  locationMapFallbackText: {
    color: "#203740",
    fontSize: 13,
    fontWeight: "800",
    marginTop: 4,
  },
  locationName: {
    color: "#111719",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 5,
  },
  locationPrimary: {
    alignItems: "center",
    backgroundColor: "#203740",
    borderRadius: 13,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  locationPrimaryText: { color: "#ffffff", fontSize: 13, fontWeight: "900" },
  locationSecondary: {
    alignItems: "center",
    borderColor: "#cfd4d2",
    borderRadius: 13,
    borderWidth: 1,
    flex: 1.35,
    justifyContent: "center",
    minHeight: 48,
  },
  locationSecondaryText: { color: "#203740", fontSize: 13, fontWeight: "900" },
  inviteInput: {
    backgroundColor: "#f5f4f0",
    borderRadius: 13,
    color: "#111719",
    flex: 1,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  invitationCard: {
    backgroundColor: "#efe5ce",
    borderColor: "#d5bd87",
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 22,
    padding: 18,
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
  pickupEditor: {
    borderTopColor: "#e7e4dc",
    borderTopWidth: 1,
    marginTop: 16,
    paddingTop: 2,
  },
  primary: {
    alignItems: "center",
    backgroundColor: "#203740",
    borderRadius: 15,
    justifyContent: "center",
    marginTop: 16,
    minHeight: 52,
  },
  pickupActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  pickupActionHelp: {
    color: "#706a60",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 14,
  },
  primaryPickupAction: {
    alignItems: "center",
    backgroundColor: "#203740",
    borderRadius: 14,
    flex: 1.15,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 10,
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
  resultEligibility: {
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 14,
    marginTop: 7,
  },
  resultEligible: { color: "#39784d" },
  resultIneligible: { color: "#9a6b22" },
  resultName: {
    color: "#111719",
    fontSize: 14,
    fontWeight: "800",
    marginTop: 8,
  },
  resultRail: { marginTop: 12 },
  resultChoice: {
    color: "#203740",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.7,
    marginTop: 9,
  },
  resultSelected: {
    backgroundColor: "#e7efe8",
    borderColor: "#3d6672",
    borderWidth: 1,
  },
  segmentedControl: {
    backgroundColor: "#f0eee8",
    borderRadius: 14,
    flexDirection: "row",
    padding: 4,
  },
  segment: {
    alignItems: "center",
    borderRadius: 11,
    flex: 1,
    justifyContent: "center",
    minHeight: 43,
  },
  segmentActive: { backgroundColor: "#203740" },
  segmentText: { color: "#706a60", fontSize: 13, fontWeight: "800" },
  segmentTextActive: { color: "#ffffff" },
  safe: { backgroundColor: "#f7f5ef", flex: 1 },
  shareAction: {
    alignItems: "center",
    backgroundColor: "#dce9ec",
    borderRadius: 14,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 8,
    minHeight: 52,
  },
  shareActionIcon: { color: "#203740", fontSize: 20, fontWeight: "900" },
  shareActionText: { color: "#203740", fontSize: 14, fontWeight: "900" },
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
  secondaryPickupAction: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#203740",
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 10,
  },
  secondaryPickupActionText: {
    color: "#203740",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
  },
  noteInput: {
    minHeight: 96,
    textAlignVertical: "top",
  },
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
  toggle: {
    backgroundColor: "#d9d5cb",
    borderRadius: 999,
    height: 30,
    padding: 3,
    width: 51,
  },
  toggleBody: { color: "#777166", fontSize: 12, lineHeight: 17, marginTop: 2 },
  toggleKnob: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    height: 24,
    width: 24,
  },
  toggleKnobOn: { marginLeft: 21 },
  toggleOn: { backgroundColor: "#3d6672" },
  toggleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    minHeight: 68,
  },
  toggleStack: {
    borderBottomColor: "#e7e4dc",
    borderBottomWidth: 1,
    borderTopColor: "#e7e4dc",
    borderTopWidth: 1,
    marginTop: 18,
  },
  toggleTitle: { color: "#111719", fontSize: 14, fontWeight: "800" },
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
