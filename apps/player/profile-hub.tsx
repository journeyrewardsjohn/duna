import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { demoPlayer } from "@duna/core/demo";
import { SatoshiText as Text } from "./satoshi-text";
import { dunaWebUrl } from "./mobile-api";
import { usePlayerRuntime } from "./runtime";
import {
  defaultVideoNetworkPreferences,
  loadVideoNetworkPreferences,
  saveVideoNetworkPreferences,
  type VideoNetworkPreferences,
} from "./video-offline";

type HubDestination =
  "profile" | "wallet" | "predictions" | "health" | "performance";

const notificationOptions = [
  {
    scope: "marketing-email" as const,
    title: "Email updates",
    body: "Nearby play, programs, and product news.",
    disclosure:
      "Duna may send optional email updates about nearby play, programs, product news, and offers. You can turn these emails off at any time.",
  },
  {
    scope: "marketing-sms" as const,
    title: "Text updates",
    body: "Optional discovery and offers by SMS.",
    disclosure:
      "Duna may send optional text messages about nearby play, programs, product news, and offers. Message and data rates may apply. Reply STOP to opt out.",
  },
  {
    scope: "marketing-push" as const,
    title: "Push updates",
    body: "Optional device updates beyond account activity.",
    disclosure:
      "Duna may send optional device notifications about nearby play, programs, product news, and offers. You can disable these notifications at any time.",
  },
] as const;

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value / 100);
}

function NotificationPreferencesModal({
  onClose,
  visible,
}: {
  readonly onClose: () => void;
  readonly visible: boolean;
}) {
  const { client, mode, refresh, settings } = usePlayerRuntime();
  const [saving, setSaving] =
    useState<(typeof notificationOptions)[number]["scope"]>();
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const granted = (scope: (typeof notificationOptions)[number]["scope"]) =>
    settings?.consents.find((consent) => consent.scope === scope)?.granted ??
    false;
  const setPreference = async (
    option: (typeof notificationOptions)[number],
    next: boolean,
  ) => {
    if (!client || mode === "preview") return;
    setSaving(option.scope);
    setError(undefined);
    setNotice(undefined);
    try {
      await client.player.recordConsent.mutate({
        scope: option.scope,
        granted: next,
        disclosureText: option.disclosure,
        idempotencyKey: Crypto.randomUUID(),
      });
      await refresh();
      setNotice(
        `${next ? "Enabled" : "Disabled"} ${option.title.toLowerCase()}.`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Duna could not save that notification preference.",
      );
    } finally {
      setSaving(undefined);
    }
  };
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>COMMUNICATION</Text>
            <Text style={styles.modalTitle}>Notifications.</Text>
          </View>
          <Pressable
            accessibilityLabel="Close notification preferences"
            onPress={onClose}
            style={styles.close}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.subscriptionContent}>
          <Text style={styles.subscriptionIntro}>
            Booking, payment, safety, wallet, and guardian notices stay on so
            Duna can operate your account. Choose the optional updates below.
          </Text>
          {notice && <Text style={styles.subscriptionNotice}>{notice}</Text>}
          {error && <Text style={styles.subscriptionError}>{error}</Text>}
          {notificationOptions.map((option) => {
            const enabled = granted(option.scope);
            return (
              <View key={option.scope} style={styles.notificationRow}>
                <View style={styles.flex}>
                  <Text style={styles.notificationTitle}>{option.title}</Text>
                  <Text style={styles.notificationBody}>{option.body}</Text>
                </View>
                <Switch
                  accessibilityLabel={`${enabled ? "Disable" : "Enable"} ${option.title}`}
                  disabled={Boolean(saving) || mode === "preview"}
                  onValueChange={(next) => void setPreference(option, next)}
                  trackColor={{ false: "#d9ddda", true: "#5c8a93" }}
                  value={enabled}
                />
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function VideoDataPreferencesModal({
  onClose,
  visible,
}: {
  readonly onClose: () => void;
  readonly visible: boolean;
}) {
  const [preferences, setPreferences] = useState<VideoNetworkPreferences>(
    defaultVideoNetworkPreferences,
  );
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    void loadVideoNetworkPreferences().then((next) => {
      if (active) {
        setPreferences(next);
        setReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [visible]);

  const update = (next: VideoNetworkPreferences) => {
    setPreferences(next);
    void saveVideoNetworkPreferences(next);
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>VIDEO + DATA</Text>
            <Text style={styles.modalTitle}>Offline first.</Text>
          </View>
          <Pressable
            accessibilityLabel="Close video data preferences"
            onPress={onClose}
            style={styles.close}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.subscriptionContent}>
          <Text style={styles.subscriptionIntro}>
            Recording stays available without service. Duna keeps a protected
            copy on this device, then starts the cloud upload and processing
            automatically when the connection you allow is available.
          </Text>
          <View style={styles.notificationRow}>
            <View style={styles.flex}>
              <Text style={styles.notificationTitle}>
                Use cellular for uploads
              </Text>
              <Text style={styles.notificationBody}>
                When off, recordings and library videos wait for Wi‑Fi.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Use cellular data for video uploads"
              disabled={!ready}
              onValueChange={(allowCellularUploads) =>
                update({ ...preferences, allowCellularUploads })
              }
              trackColor={{ false: "#d9ddda", true: "#5c8a93" }}
              value={preferences.allowCellularUploads}
            />
          </View>
          <View style={styles.notificationRow}>
            <View style={styles.flex}>
              <Text style={styles.notificationTitle}>
                Use cellular for live video
              </Text>
              <Text style={styles.notificationBody}>
                When off, Duna only starts a live stream on Wi‑Fi.
              </Text>
            </View>
            <Switch
              accessibilityLabel="Use cellular data for live video"
              disabled={!ready}
              onValueChange={(allowCellularLive) =>
                update({ ...preferences, allowCellularLive })
              }
              trackColor={{ false: "#d9ddda", true: "#5c8a93" }}
              value={preferences.allowCellularLive}
            />
          </View>
          <View style={styles.videoOfflineNote}>
            <Text style={styles.videoOfflineNoteTitle}>What works offline</Text>
            <Text style={styles.videoOfflineNoteBody}>
              Capture, score, favorite moments, and prepare an existing video.
              Live streaming needs an allowed internet connection; queued videos
              never begin uploading over cellular unless you enable it here.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function ProfileDetailsModal({
  onArtwork,
  onClose,
  onEditProfile,
  visible,
}: {
  readonly onArtwork: () => void;
  readonly onClose: () => void;
  readonly onEditProfile: () => void;
  readonly visible: boolean;
}) {
  const { dashboard, settings } = usePlayerRuntime();
  const player = dashboard?.player ?? demoPlayer;
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>PLAYER PROFILE</Text>
            <Text style={styles.modalTitle}>Your public story.</Text>
          </View>
          <Pressable
            accessibilityLabel="Close profile details"
            onPress={onClose}
            style={styles.close}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.modalContent}>
          <View style={styles.profileIdentity}>
            {player.avatarUrl ? (
              <Image
                source={{ uri: player.avatarUrl }}
                style={styles.profilePhoto}
              />
            ) : (
              <View style={styles.profilePhotoFallback}>
                <Text style={styles.profilePhotoText}>{player.initials}</Text>
              </View>
            )}
            <Text style={styles.profileDetailsName}>{player.displayName}</Text>
            <Text style={styles.profileDetailsHandle}>@{player.handle}</Text>
            <Text style={styles.profileDetailsMeta}>
              {player.homeMarket} · {player.rating.display.toFixed(2)} Sand
              Rating
            </Text>
          </View>
          <View style={styles.detailFacts}>
            <View style={styles.detailFact}>
              <Text style={styles.detailFactValue}>
                {player.rating.display.toFixed(2)}
              </Text>
              <Text style={styles.detailFactLabel}>CURRENT</Text>
            </View>
            <View style={styles.detailFact}>
              <Text style={styles.detailFactValue}>
                {player.rating.percentile
                  ? String(player.rating.percentile) + "%"
                  : "—"}
              </Text>
              <Text style={styles.detailFactLabel}>PERCENTILE</Text>
            </View>
            <View style={styles.detailFact}>
              <Text style={styles.detailFactValue}>
                {settings?.sourceConnections.length ?? 0}
              </Text>
              <Text style={styles.detailFactLabel}>SOURCES</Text>
            </View>
          </View>
          <View style={styles.artworkCard}>
            <Text style={styles.eyebrow}>PROFILE + ARTWORK</Text>
            <Text style={styles.artworkTitle}>
              Keep your details and visuals current.
            </Text>
            <Text style={styles.artworkBody}>
              Your playing profile, evidence sources, action photos, and
              reviewed artwork all live together here.
            </Text>
            <View style={styles.artworkActions}>
              <Pressable onPress={onEditProfile} style={styles.primary}>
                <Text style={styles.primaryText}>Edit profile</Text>
              </Pressable>
              <Pressable onPress={onArtwork} style={styles.secondary}>
                <Text style={styles.secondaryText}>Artwork</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function subscriptionPrice(
  amountMinor: number | undefined,
  currency: string | undefined,
  interval: "month" | "year" | undefined,
) {
  if (amountMinor === undefined || !currency || !interval) return undefined;
  return `${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amountMinor / 100)} / ${interval}`;
}

function periodLabel(value: string | undefined, ending: boolean) {
  if (!value) return undefined;
  const formatted = new Date(value).toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `${ending ? "Access through" : "Renews"} ${formatted}`;
}

function SubscriptionManagementModal({
  onClose,
  visible,
}: {
  readonly onClose: () => void;
  readonly visible: boolean;
}) {
  const { client, mode, organizationWallets, refresh, settings } =
    usePlayerRuntime();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const dunaMembership = settings?.membership;
  const organizationMemberships = (organizationWallets ?? []).filter(
    (organization) =>
      organization.membershipId &&
      !["canceled", "cancelled", "incomplete_expired"].includes(
        organization.membershipStatus ?? "",
      ),
  );

  const run = async (key: string, action: () => Promise<unknown>) => {
    if (!client || mode === "preview") return;
    setBusy(key);
    setError(undefined);
    setNotice(undefined);
    try {
      await action();
      await refresh?.();
      setNotice("Your subscription was updated.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Duna could not update that subscription.",
      );
    } finally {
      setBusy(undefined);
    }
  };

  const confirmCancellation = (
    title: string,
    detail: string,
    actionLabel: string,
    onConfirm: () => Promise<unknown>,
  ) => {
    Alert.alert(`Cancel ${title}?`, detail, [
      { text: "Keep membership", style: "cancel" },
      {
        text: actionLabel,
        style: "destructive",
        onPress: () => void onConfirm(),
      },
    ]);
  };

  const openBilling = async () => {
    if (!client || mode === "preview") return;
    setBusy("billing");
    setError(undefined);
    try {
      const result = await client.player.openPlayerBillingPortal.mutate({
        returnUrl: `${dunaWebUrl}/app/settings#membership`,
      });
      await WebBrowser.openBrowserAsync(result.url);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Duna could not open secure billing management.",
      );
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>SUBSCRIPTIONS + BILLING</Text>
            <Text style={styles.modalTitle}>Your memberships.</Text>
          </View>
          <Pressable
            accessibilityLabel="Close subscription management"
            onPress={onClose}
            style={styles.close}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.subscriptionContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.subscriptionIntro}>
            Manage Duna and organization renewals here. Payment details are
            encrypted and stored by Stripe—not on Duna’s servers.
          </Text>
          {notice ? (
            <Text style={styles.subscriptionNotice}>{notice}</Text>
          ) : null}
          {error ? <Text style={styles.subscriptionError}>{error}</Text> : null}

          {dunaMembership ? (
            <View style={styles.subscriptionCard}>
              <View style={styles.subscriptionTopRow}>
                <View style={styles.flex}>
                  <Text style={styles.subscriptionOwner}>DUNA</Text>
                  <Text style={styles.subscriptionTitle}>
                    {dunaMembership.tierName}
                  </Text>
                </View>
                <View style={styles.subscriptionStatusPill}>
                  <Text style={styles.subscriptionStatusText}>
                    {dunaMembership.pausedUntil
                      ? "Paused"
                      : dunaMembership.cancelAtPeriodEnd
                        ? "Ending"
                        : dunaMembership.status}
                  </Text>
                </View>
              </View>
              <Text style={styles.subscriptionMeta}>
                {subscriptionPrice(
                  dunaMembership.priceMinor,
                  dunaMembership.currency,
                  dunaMembership.interval,
                )}
              </Text>
              <Text style={styles.subscriptionPeriod}>
                {periodLabel(
                  dunaMembership.currentPeriodEndsAt,
                  dunaMembership.cancelAtPeriodEnd,
                )}
              </Text>
              <View style={styles.subscriptionActions}>
                {dunaMembership.cancelAtPeriodEnd ||
                dunaMembership.pausedUntil ? (
                  <Pressable
                    disabled={Boolean(busy)}
                    onPress={() =>
                      void run("duna-resume", () =>
                        client!.player.changeDunaPlusMembership.mutate({
                          action: "resume",
                          idempotencyKey: Crypto.randomUUID(),
                        }),
                      )
                    }
                    style={styles.subscriptionPrimaryAction}
                  >
                    <Text style={styles.subscriptionPrimaryText}>Resume</Text>
                  </Pressable>
                ) : (
                  <>
                    <Pressable
                      disabled={Boolean(busy)}
                      onPress={() =>
                        void run("duna-pause", () =>
                          client!.player.changeDunaPlusMembership.mutate({
                            action: "pause",
                            idempotencyKey: Crypto.randomUUID(),
                          }),
                        )
                      }
                      style={styles.subscriptionSecondaryAction}
                    >
                      <Text style={styles.subscriptionSecondaryText}>
                        Pause 1 month
                      </Text>
                    </Pressable>
                    <Pressable
                      disabled={Boolean(busy)}
                      onPress={() =>
                        confirmCancellation(
                          dunaMembership.tierName,
                          "Your access remains active through the current paid period. You can resume before then.",
                          "Cancel at period end",
                          () =>
                            run("duna-cancel", () =>
                              client!.player.changeDunaPlusMembership.mutate({
                                action: "cancel",
                                idempotencyKey: Crypto.randomUUID(),
                              }),
                            ),
                        )
                      }
                      style={styles.subscriptionDangerAction}
                    >
                      <Text style={styles.subscriptionDangerText}>Cancel</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          ) : settings?.dunaPlus.kind === "complimentary" ? (
            <View style={styles.subscriptionCard}>
              <Text style={styles.subscriptionOwner}>DUNA</Text>
              <Text style={styles.subscriptionTitle}>
                {settings.dunaPlus.label}
              </Text>
              <Text style={styles.subscriptionMeta}>
                Complimentary access · no recurring charge
              </Text>
            </View>
          ) : null}

          {organizationMemberships.map((organization) => {
            const membershipId = organization.membershipId!;
            const ending = organization.membershipCancelAtPeriodEnd === true;
            return (
              <View key={membershipId} style={styles.subscriptionCard}>
                <View style={styles.subscriptionTopRow}>
                  <View style={styles.flex}>
                    <Text style={styles.subscriptionOwner}>
                      {organization.organizationName.toUpperCase()}
                    </Text>
                    <Text style={styles.subscriptionTitle}>
                      {organization.membershipName ?? "Membership"}
                    </Text>
                  </View>
                  <View style={styles.subscriptionStatusPill}>
                    <Text style={styles.subscriptionStatusText}>
                      {ending
                        ? "Ending"
                        : (organization.membershipStatus ?? "Active")}
                    </Text>
                  </View>
                </View>
                <Text style={styles.subscriptionMeta}>
                  {subscriptionPrice(
                    organization.membershipPriceMinor,
                    organization.membershipCurrency,
                    organization.membershipInterval,
                  )}
                </Text>
                <Text style={styles.subscriptionPeriod}>
                  {periodLabel(
                    organization.membershipCurrentPeriodEndsAt,
                    ending,
                  )}
                </Text>
                {organization.membershipManageable ? (
                  <View style={styles.subscriptionActions}>
                    <Pressable
                      disabled={Boolean(busy)}
                      onPress={() => {
                        const action = ending ? "resume" : "cancel";
                        const change = () =>
                          run(`${membershipId}-${action}`, () =>
                            client!.player.changeOrganizationMembership.mutate({
                              action,
                              membershipId,
                              idempotencyKey: Crypto.randomUUID(),
                            }),
                          );
                        if (action === "cancel") {
                          const policy = organization.membershipPolicy;
                          const immediate =
                            policy?.cancellationTiming === "immediate";
                          const refundDetail =
                            policy?.refundBehavior === "prorated"
                              ? " Stripe calculates and returns the unused portion to your original payment method."
                              : policy?.refundBehavior === "full-within-window"
                                ? ` Your latest payment is refunded only when it is within the ${policy.refundWindowDays ?? 7}-day refund window.`
                                : " Payments already made are not refunded, except where required by law.";
                          confirmCancellation(
                            organization.membershipName ??
                              organization.organizationName,
                            immediate
                              ? `Cancellation takes effect immediately.${refundDetail}`
                              : `Access remains active through ${organization.membershipInitialTermEndsAt ? "the accepted initial term" : "the current paid period"}.${refundDetail}`,
                            immediate ? "Cancel now" : "Schedule cancellation",
                            change,
                          );
                        } else {
                          void change();
                        }
                      }}
                      style={
                        ending
                          ? styles.subscriptionPrimaryAction
                          : styles.subscriptionDangerAction
                      }
                    >
                      <Text
                        style={
                          ending
                            ? styles.subscriptionPrimaryText
                            : styles.subscriptionDangerText
                        }
                      >
                        {ending
                          ? "Resume"
                          : organization.membershipPolicy
                                ?.cancellationTiming === "immediate"
                            ? "Cancel membership"
                            : "Cancel at period end"}
                      </Text>
                    </Pressable>
                  </View>
                ) : (
                  <Text style={styles.subscriptionManagedExternally}>
                    Contact {organization.organizationName} to change this
                    membership.
                  </Text>
                )}
              </View>
            );
          })}

          {!dunaMembership &&
          settings?.dunaPlus.kind !== "complimentary" &&
          organizationMemberships.length === 0 ? (
            <View style={styles.subscriptionEmpty}>
              <Text style={styles.subscriptionTitle}>
                No active subscriptions.
              </Text>
              <Text style={styles.subscriptionMeta}>
                Club, coach, and Duna memberships will appear here after you
                join.
              </Text>
            </View>
          ) : null}

          <Pressable
            accessibilityHint="Opens Stripe’s secure billing management"
            accessibilityRole="button"
            disabled={Boolean(busy) || mode === "preview"}
            onPress={() => void openBilling()}
            style={styles.billingButton}
          >
            {busy === "billing" ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <>
                <Text style={styles.billingButtonText}>
                  Payment methods + invoices
                </Text>
                <Text style={styles.billingButtonArrow}>↗</Text>
              </>
            )}
          </Pressable>
          <Text style={styles.billingFootnote}>
            Stripe opens a secure, account-specific billing page. Duna never
            receives or stores your full card number or security code.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export function ProfileHubScreen({
  onArtwork,
  onDestination,
  onEditProfile,
  onOrganization,
}: {
  readonly onArtwork: () => void;
  readonly onDestination: (
    destination: Exclude<HubDestination, "profile">,
  ) => void;
  readonly onEditProfile: () => void;
  readonly onOrganization: (organizationSlug: string) => void;
}) {
  const {
    dashboard,
    mode,
    organizationWallets,
    predictionWallet,
    settings,
    signOut,
    wallet,
  } = usePlayerRuntime();
  const player = dashboard?.player ?? demoPlayer;
  const [profileOpen, setProfileOpen] = useState(false);
  const [subscriptionsOpen, setSubscriptionsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [videoDataOpen, setVideoDataOpen] = useState(false);
  const actions: readonly {
    readonly key: HubDestination;
    readonly icon: string;
    readonly title: string;
    readonly body: string;
    readonly featured?: boolean;
  }[] = [
    {
      key: "profile",
      icon: "◎",
      title: "Profile",
      body:
        settings?.profile.onboardingStatus === "complete"
          ? "Details + artwork"
          : "Finish your details",
    },
    {
      key: "wallet",
      icon: "◇",
      title: "Wallet",
      body: money(wallet?.availableMinor ?? 0) + " available",
    },
    {
      key: "predictions",
      icon: "✦",
      title: "Predictions",
      body:
        Math.floor(predictionWallet?.availableCredits ?? 0).toLocaleString(
          "en-US",
        ) + " credits",
    },
    {
      key: "health",
      icon: "♥",
      title: "Health",
      body: "Private recovery",
    },
    {
      key: "performance",
      icon: "↗",
      title: "Performance",
      body: player.rating.display.toFixed(2) + " Sand Rating",
      featured: true,
    },
  ];

  const open = (destination: HubDestination) => {
    if (destination === "profile") {
      setProfileOpen(true);
      return;
    }
    onDestination(destination);
  };

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.screen}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.topEyebrow}>YOU + YOUR DUNA</Text>
        <Text style={styles.topTitle}>Everything about your game.</Text>
        <View style={styles.identity}>
          {player.avatarUrl ? (
            <Image
              source={{ uri: player.avatarUrl }}
              style={styles.identityPhoto}
            />
          ) : (
            <View style={styles.identityPhotoFallback}>
              <Text style={styles.identityPhotoText}>{player.initials}</Text>
            </View>
          )}
          <View style={styles.flex}>
            <Text style={styles.identityName}>{player.displayName}</Text>
            <Text style={styles.identityMeta}>
              @{player.handle} · {player.homeMarket}
            </Text>
          </View>
          <Text style={styles.identityRating}>
            {player.rating.display.toFixed(2)}
          </Text>
        </View>

        <View style={styles.quickGrid}>
          {actions.map((action) => (
            <Pressable
              accessibilityLabel={"Open " + action.title}
              key={action.key}
              onPress={() => open(action.key)}
              style={({ pressed }) => [
                styles.quickCard,
                action.featured && styles.quickCardFeatured,
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[
                  styles.quickIcon,
                  action.featured && styles.quickIconFeatured,
                ]}
              >
                <Text
                  style={[
                    styles.quickIconText,
                    action.featured && styles.quickTextFeatured,
                  ]}
                >
                  {action.icon}
                </Text>
              </View>
              <Text
                style={[
                  styles.quickTitle,
                  action.featured && styles.quickTextFeatured,
                ]}
              >
                {action.title}
              </Text>
              <Text
                style={[
                  styles.quickBody,
                  action.featured && styles.quickBodyFeatured,
                ]}
              >
                {action.body}
              </Text>
              <Text
                style={[
                  styles.quickArrow,
                  action.featured && styles.quickTextFeatured,
                ]}
              >
                →
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.eyebrow}>CLUBS + COACHES</Text>
            <Text style={styles.sectionTitle}>Your organizations.</Text>
          </View>
          <Text style={styles.sectionCount}>
            {organizationWallets?.length ?? 0}
          </Text>
        </View>
        <View style={styles.organizations}>
          {(organizationWallets ?? []).map((organization) => (
            <Pressable
              key={organization.organizationId}
              onPress={() => onOrganization(organization.organizationSlug)}
              style={styles.organization}
            >
              <View style={styles.organizationMark}>
                <Text style={styles.organizationMarkText}>
                  {organization.organizationName.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.organizationName}>
                  {organization.organizationName}
                </Text>
                <Text style={styles.organizationMeta}>
                  {organization.membershipName ??
                    organization.membershipStatus ??
                    "Player relationship"}
                  {" · "}
                  {organization.credits.toLocaleString("en-US")} credits
                </Text>
              </View>
              <Text style={styles.organizationArrow}>›</Text>
            </Pressable>
          ))}
          {!organizationWallets?.length && (
            <View style={styles.organizationEmpty}>
              <Text style={styles.organizationName}>Find your next club.</Text>
              <Text style={styles.organizationMeta}>
                Search organizations, coaches, courts, and events in Discover.
              </Text>
            </View>
          )}
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.eyebrow}>SETTINGS</Text>
            <Text style={styles.sectionTitle}>The simple stuff.</Text>
          </View>
        </View>
        <View style={styles.settings}>
          <Pressable
            disabled={mode === "preview"}
            onPress={() => setSubscriptionsOpen(true)}
            style={styles.setting}
          >
            <View style={styles.flex}>
              <Text style={styles.settingText}>Subscriptions + billing</Text>
              <Text style={styles.settingMeta}>
                Duna, clubs, organizations, and coaches
              </Text>
            </View>
            <Text style={styles.settingArrow}>›</Text>
          </Pressable>
          <Pressable
            disabled={mode === "preview"}
            onPress={() => setNotificationsOpen(true)}
            style={styles.setting}
          >
            <Text style={styles.settingText}>Notifications</Text>
            <Text style={styles.settingArrow}>›</Text>
          </Pressable>
          <Pressable
            onPress={() => setVideoDataOpen(true)}
            style={styles.setting}
          >
            <View style={styles.flex}>
              <Text style={styles.settingText}>Video + data</Text>
              <Text style={styles.settingMeta}>
                Offline recording and Wi‑Fi controls
              </Text>
            </View>
            <Text style={styles.settingArrow}>›</Text>
          </Pressable>
          {[
            ["Privacy + safety", "#privacy"],
            ["Language + units", "#profile"],
            ["Account + security", "#account"],
          ].map(([title, anchor]) => (
            <Pressable
              disabled={mode === "preview"}
              key={title}
              onPress={() =>
                void WebBrowser.openBrowserAsync(
                  dunaWebUrl + "/app/settings" + anchor,
                )
              }
              style={styles.setting}
            >
              <Text style={styles.settingText}>{title}</Text>
              <Text style={styles.settingArrow}>›</Text>
            </Pressable>
          ))}
          {signOut && (
            <Pressable onPress={() => void signOut()} style={styles.setting}>
              <Text style={styles.signOut}>Sign out</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
      <ProfileDetailsModal
        onArtwork={() => {
          setProfileOpen(false);
          onArtwork();
        }}
        onClose={() => setProfileOpen(false)}
        onEditProfile={() => {
          setProfileOpen(false);
          onEditProfile();
        }}
        visible={profileOpen}
      />
      <SubscriptionManagementModal
        onClose={() => setSubscriptionsOpen(false)}
        visible={subscriptionsOpen}
      />
      <NotificationPreferencesModal
        onClose={() => setNotificationsOpen(false)}
        visible={notificationsOpen}
      />
      <VideoDataPreferencesModal
        onClose={() => setVideoDataOpen(false)}
        visible={videoDataOpen}
      />
    </>
  );
}

const styles = StyleSheet.create({
  artworkActions: { flexDirection: "row", gap: 9, marginTop: 18 },
  artworkBody: { color: "#706a60", fontSize: 15, lineHeight: 22, marginTop: 8 },
  artworkCard: {
    backgroundColor: "#ffffff",
    borderColor: "#dfdfdc",
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 22,
    padding: 18,
  },
  artworkTitle: {
    color: "#111719",
    fontSize: 23,
    fontWeight: "800",
    lineHeight: 27,
    marginTop: 5,
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
  billingButton: {
    alignItems: "center",
    backgroundColor: "#203740",
    borderRadius: 18,
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 8,
    minHeight: 58,
    paddingHorizontal: 18,
  },
  billingButtonArrow: {
    color: "#ffffff",
    fontSize: 18,
    marginLeft: 10,
  },
  billingButtonText: { color: "#ffffff", fontSize: 15, fontWeight: "800" },
  billingFootnote: {
    color: "#777166",
    fontSize: 12,
    lineHeight: 17,
    paddingHorizontal: 8,
    textAlign: "center",
  },
  detailFact: { alignItems: "center", flex: 1 },
  detailFactLabel: {
    color: "#777166",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginTop: 3,
  },
  detailFactValue: { color: "#111719", fontSize: 22, fontWeight: "800" },
  detailFacts: {
    backgroundColor: "#ffffff",
    borderColor: "#dfdfdc",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 18,
    paddingVertical: 18,
  },
  eyebrow: {
    color: "#203740",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  flex: { flex: 1, minWidth: 0 },
  identity: {
    alignItems: "center",
    borderBottomColor: "#dfddd7",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
    paddingBottom: 18,
  },
  identityMeta: { color: "#777166", fontSize: 14, marginTop: 3 },
  identityName: { color: "#111719", fontSize: 20, fontWeight: "800" },
  identityPhoto: { borderRadius: 28, height: 56, width: 56 },
  identityPhotoFallback: {
    alignItems: "center",
    backgroundColor: "#e7e8e5",
    borderRadius: 28,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  identityPhotoText: { color: "#203740", fontSize: 16, fontWeight: "800" },
  identityRating: {
    color: "#203740",
    fontSize: 24,
    fontWeight: "800",
  },
  modalContent: { padding: 20, paddingBottom: 48 },
  modalHeader: {
    alignItems: "center",
    borderBottomColor: "#e1dfda",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  modalSafe: { backgroundColor: "#f7f5ef", flex: 1 },
  modalTitle: {
    color: "#111719",
    fontSize: 25,
    fontWeight: "800",
    marginTop: 3,
  },
  subscriptionActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 17,
  },
  subscriptionCard: {
    backgroundColor: "#ffffff",
    borderColor: "#dfdfdc",
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  subscriptionContent: { gap: 13, padding: 18, paddingBottom: 48 },
  subscriptionDangerAction: {
    alignItems: "center",
    borderColor: "#d8b0aa",
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 45,
    paddingHorizontal: 15,
  },
  subscriptionDangerText: {
    color: "#a54032",
    fontSize: 12,
    fontWeight: "800",
  },
  subscriptionEmpty: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dfdfdc",
    borderRadius: 22,
    borderWidth: 1,
    padding: 26,
  },
  subscriptionError: {
    backgroundColor: "#f9e9e6",
    borderRadius: 14,
    color: "#a54032",
    fontSize: 12,
    lineHeight: 18,
    padding: 13,
  },
  subscriptionIntro: { color: "#706a60", fontSize: 14, lineHeight: 21 },
  subscriptionManagedExternally: {
    color: "#777166",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 15,
  },
  subscriptionMeta: {
    color: "#706a60",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 7,
  },
  subscriptionNotice: {
    backgroundColor: "#e6f2ea",
    borderRadius: 14,
    color: "#2f6b3a",
    fontSize: 12,
    fontWeight: "700",
    padding: 13,
  },
  subscriptionOwner: {
    color: "#3d6672",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  subscriptionPeriod: { color: "#777166", fontSize: 12, marginTop: 4 },
  subscriptionPrimaryAction: {
    alignItems: "center",
    backgroundColor: "#203740",
    borderRadius: 14,
    justifyContent: "center",
    minHeight: 45,
    paddingHorizontal: 16,
  },
  subscriptionPrimaryText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  subscriptionSecondaryAction: {
    alignItems: "center",
    borderColor: "#b7c4c8",
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 45,
    paddingHorizontal: 15,
  },
  subscriptionSecondaryText: {
    color: "#203740",
    fontSize: 12,
    fontWeight: "800",
  },
  subscriptionStatusPill: {
    backgroundColor: "#e9efef",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  subscriptionStatusText: {
    color: "#203740",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "capitalize",
  },
  subscriptionTitle: {
    color: "#111719",
    fontSize: 20,
    fontWeight: "900",
    letterSpacing: -0.4,
    marginTop: 4,
  },
  subscriptionTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  notificationBody: {
    color: "#706a60",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  notificationRow: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#dfdfdc",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    padding: 16,
  },
  notificationTitle: { color: "#111719", fontSize: 16, fontWeight: "800" },
  organization: {
    alignItems: "center",
    borderBottomColor: "#ebe9e4",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 11,
    minHeight: 76,
    paddingHorizontal: 14,
  },
  organizationArrow: { color: "#777166", fontSize: 25 },
  organizationEmpty: { padding: 18 },
  organizationMark: {
    alignItems: "center",
    backgroundColor: "#e8e9e6",
    borderRadius: 19,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  organizationMarkText: { color: "#203740", fontSize: 14, fontWeight: "900" },
  organizationMeta: { color: "#777166", fontSize: 13, marginTop: 3 },
  organizationName: { color: "#111719", fontSize: 16, fontWeight: "800" },
  organizations: {
    backgroundColor: "#ffffff",
    borderColor: "#e1e2df",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 12,
    overflow: "hidden",
  },
  pressed: { opacity: 0.78, transform: [{ scale: 0.99 }] },
  primary: {
    alignItems: "center",
    backgroundColor: "#203740",
    borderRadius: 14,
    flex: 1.3,
    justifyContent: "center",
    minHeight: 50,
  },
  primaryText: { color: "#ffffff", fontSize: 14, fontWeight: "800" },
  profileDetailsHandle: { color: "#203740", fontSize: 16, marginTop: 3 },
  profileDetailsMeta: { color: "#777166", fontSize: 15, marginTop: 6 },
  profileDetailsName: {
    color: "#111719",
    fontSize: 28,
    fontWeight: "800",
    marginTop: 12,
  },
  profileIdentity: { alignItems: "center" },
  profilePhoto: { borderRadius: 54, height: 108, width: 108 },
  profilePhotoFallback: {
    alignItems: "center",
    backgroundColor: "#e7e8e5",
    borderRadius: 54,
    height: 108,
    justifyContent: "center",
    width: 108,
  },
  profilePhotoText: { color: "#203740", fontSize: 28, fontWeight: "900" },
  quickArrow: { color: "#203740", fontSize: 21, marginTop: 16 },
  quickBody: { color: "#777166", fontSize: 13, marginTop: 4 },
  quickBodyFeatured: { color: "rgba(255,255,255,0.7)" },
  quickCard: {
    backgroundColor: "#ffffff",
    borderColor: "#e1e2df",
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 166,
    padding: 15,
    width: "48.5%",
  },
  quickCardFeatured: { backgroundColor: "#203740", borderColor: "#203740" },
  quickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
  },
  quickIcon: {
    alignItems: "center",
    backgroundColor: "#eceeea",
    borderRadius: 18,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  quickIconFeatured: { backgroundColor: "rgba(255,255,255,0.14)" },
  quickIconText: { color: "#203740", fontSize: 17 },
  quickTextFeatured: { color: "#ffffff" },
  quickTitle: {
    color: "#111719",
    fontSize: 19,
    fontWeight: "800",
    marginTop: 14,
  },
  screen: {
    backgroundColor: "#f7f5ef",
    padding: 20,
    paddingBottom: 150,
  },
  secondary: {
    alignItems: "center",
    borderColor: "#203740",
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 50,
  },
  secondaryText: { color: "#203740", fontSize: 14, fontWeight: "800" },
  sectionCount: { color: "#777166", fontSize: 15, fontWeight: "800" },
  sectionHeading: {
    alignItems: "flex-end",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 34,
  },
  sectionTitle: {
    color: "#111719",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
    marginTop: 4,
  },
  setting: {
    alignItems: "center",
    borderBottomColor: "#ebe9e4",
    borderBottomWidth: 1,
    flexDirection: "row",
    minHeight: 58,
    paddingHorizontal: 15,
  },
  settingArrow: { color: "#777166", fontSize: 23 },
  settingMeta: { color: "#777166", fontSize: 12, marginTop: 3 },
  settingText: { color: "#111719", flex: 1, fontSize: 15, fontWeight: "700" },
  settings: {
    backgroundColor: "#ffffff",
    borderColor: "#e1e2df",
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 12,
    overflow: "hidden",
  },
  signOut: { color: "#a54032", fontSize: 15, fontWeight: "800" },
  topEyebrow: {
    color: "#203740",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  topTitle: {
    color: "#111719",
    fontSize: 34,
    fontWeight: "800",
    letterSpacing: -1.2,
    lineHeight: 38,
    marginTop: 7,
  },
  videoOfflineNote: {
    backgroundColor: "#edf2ef",
    borderColor: "#c9dbd1",
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
  },
  videoOfflineNoteBody: {
    color: "#577066",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 5,
  },
  videoOfflineNoteTitle: { color: "#203740", fontSize: 14, fontWeight: "800" },
});
