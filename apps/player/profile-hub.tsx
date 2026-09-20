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
import { mobileControl, mobileGrid } from "@duna/ui/mobile";
import { DunaIcon, type DunaIconName } from "./duna-icon";
import { SatoshiText as Text } from "./satoshi-text";
import { dunaWebUrl } from "./mobile-api";
import { usePlayerRuntime } from "./runtime";
import { ProfileVideoSection } from "./video-studio";
import {
  defaultVideoNetworkPreferences,
  loadVideoNetworkPreferences,
  saveVideoNetworkPreferences,
  type VideoNetworkPreferences,
} from "./video-offline";

import {
  usePlayerDesign,
  usePlayerStyles,
  type PlayerDesignTokens,
} from "./design-theme";

type HubDestination =
  "profile" | "wallet" | "predictions" | "health" | "performance" | "video";

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

function AppearanceModal({
  visible,
  onClose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  const { tokens, preference, setPreference } = usePlayerDesign();
  const styles = usePlayerStyles(createStyles);
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
        <View style={styles.modalHeader}>
          <Text style={[styles.modalTitle, styles.flex]}>Appearance</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close appearance"
            onPress={onClose}
            style={styles.close}
          >
            <DunaIcon color={tokens.text1} name="close" size={22} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.subscriptionContent}>
          <Text style={styles.subscriptionIntro}>
            Choose how Duna looks on this device.
          </Text>
          {(
            [
              {
                value: "light",
                title: "Light",
                detail: "Warm sand and charcoal",
              },
              {
                value: "dark",
                title: "Dark",
                detail: "Soft light on warm dark surfaces",
              },
              {
                value: "system",
                title: "Match device",
                detail: "Follow your device appearance",
              },
            ] as const
          ).map(({ value, title, detail }) => (
            <Pressable
              key={value}
              accessibilityRole="radio"
              accessibilityLabel={title}
              accessibilityState={{ checked: preference === value }}
              aria-checked={preference === value}
              onPress={() => setPreference(value)}
              style={styles.notificationRow}
            >
              <View style={styles.flex}>
                <Text style={styles.notificationTitle}>{title}</Text>
                <Text style={styles.notificationBody}>{detail}</Text>
              </View>
              {preference === value ? (
                <DunaIcon name="check" size={22} color={tokens.text1} />
              ) : (
                <View style={{ width: 22 }} />
              )}
            </Pressable>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function NotificationPreferencesModal({
  onClose,
  visible,
}: {
  readonly onClose: () => void;
  readonly visible: boolean;
}) {
  const { tokens } = usePlayerDesign();
  const styles = usePlayerStyles(createStyles);

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
            <Text style={styles.modalTitle}>Notifications</Text>
          </View>
          <Pressable
            accessibilityLabel="Close notification preferences"
            onPress={onClose}
            style={styles.close}
          >
            <DunaIcon color={tokens.text1} name="close" size={22} />
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
                  trackColor={{ false: tokens.hairline, true: tokens.text1 }}
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
  const { tokens } = usePlayerDesign();
  const styles = usePlayerStyles(createStyles);

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
            <Text style={styles.eyebrow}>DATA USE</Text>
            <Text style={styles.modalTitle}>Data use</Text>
          </View>
          <Pressable
            accessibilityLabel="Close video data preferences"
            onPress={onClose}
            style={styles.close}
          >
            <DunaIcon color={tokens.text1} name="close" size={22} />
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
              trackColor={{ false: tokens.hairline, true: tokens.text1 }}
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
              trackColor={{ false: tokens.hairline, true: tokens.text1 }}
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
  const { tokens } = usePlayerDesign();
  const styles = usePlayerStyles(createStyles);

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
            <Text style={styles.modalTitle}>Profile details</Text>
          </View>
          <Pressable
            accessibilityLabel="Close profile details"
            onPress={onClose}
            style={styles.close}
          >
            <DunaIcon color={tokens.text1} name="close" size={22} />
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
  const { tokens } = usePlayerDesign();
  const styles = usePlayerStyles(createStyles);

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
            <Text style={styles.modalTitle}>Subscriptions</Text>
          </View>
          <Pressable
            accessibilityLabel="Close subscription management"
            onPress={onClose}
            style={styles.close}
          >
            <DunaIcon color={tokens.text1} name="close" size={22} />
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
              <ActivityIndicator color={tokens.buttonPrimaryForeground} />
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
  const { tokens, preference } = usePlayerDesign();
  const styles = usePlayerStyles(createStyles);

  const runtime = usePlayerRuntime();
  const {
    dashboard,
    mode,
    organizationWallets,
    predictionWallet,
    settings,
    signOut,
    wallet,
  } = runtime;
  const player = dashboard?.player ?? demoPlayer;
  const [profileOpen, setProfileOpen] = useState(false);
  const [subscriptionsOpen, setSubscriptionsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [videoDataOpen, setVideoDataOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const actions: readonly {
    readonly key: HubDestination;
    readonly icon: DunaIconName;
    readonly title: string;
    readonly body: string;
    readonly tone?: "blue" | "sand";
  }[] = [
    {
      key: "profile",
      icon: "user",
      title: "Profile",
      body:
        settings?.profile.onboardingStatus === "complete"
          ? "Details + artwork"
          : "Finish your details",
    },
    {
      key: "wallet",
      icon: "wallet",
      title: "Wallet",
      body: money(wallet?.availableMinor ?? 0) + " available",
    },
    {
      key: "predictions",
      icon: "sparkles",
      title: "Predictions",
      body:
        Math.floor(predictionWallet?.availableCredits ?? 0).toLocaleString(
          "en-US",
        ) + " credits",
    },
    {
      key: "health",
      icon: "heart",
      title: "Health",
      body: "Private recovery",
    },
    {
      key: "performance",
      icon: "trend-up",
      title: "Performance",
      body: player.rating.display.toFixed(2) + " Sand Rating",
      tone: "sand",
    },
    {
      key: "video",
      icon: "video",
      title: "Videos",
      body: "Library + recordings",
      tone: "blue",
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
        <View style={styles.topHeader}>
          <View style={styles.flex}>
            <Text style={styles.topEyebrow}>YOUR DUNA</Text>
            <Text style={styles.topTitle}>Profile</Text>
            <Text style={styles.topBody}>
              Your game, identity, and connections in one place.
            </Text>
          </View>
        </View>

        <Pressable
          accessibilityHint="Opens your profile details and artwork"
          accessibilityLabel={`Open ${player.displayName}'s profile`}
          accessibilityRole="button"
          onPress={() => setProfileOpen(true)}
          style={({ pressed }) => [styles.identity, pressed && styles.pressed]}
        >
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
            <Text numberOfLines={1} style={styles.identityMeta}>
              @{player.handle} · {player.homeMarket}
            </Text>
          </View>
          <View style={styles.identityRatingBlock}>
            <Text style={styles.identityRating}>
              {player.rating.display.toFixed(2)}
            </Text>
            <Text style={styles.identityRatingLabel}>SAND RATING</Text>
          </View>
          <DunaIcon color={tokens.text2} name="chevron-right" size={18} />
        </Pressable>

        <View style={styles.quickGrid}>
          {actions.map((action) => (
            <Pressable
              accessibilityLabel={"Open " + action.title}
              key={action.key}
              onPress={() => open(action.key)}
              style={({ pressed }) => [
                styles.quickCard,
                action.tone === "blue" && styles.quickCardBlue,
                action.tone === "sand" && styles.quickCardSand,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.quickCardTop}>
                <View
                  style={[
                    styles.quickIcon,
                    action.tone === "blue" && styles.quickIconBlue,
                    action.tone === "sand" && styles.quickIconSand,
                  ]}
                >
                  <DunaIcon color={tokens.text1} name={action.icon} size={21} />
                </View>
                <DunaIcon color={tokens.text2} name="chevron-right" size={17} />
              </View>
              <View>
                <Text style={styles.quickTitle}>{action.title}</Text>
                <Text numberOfLines={2} style={styles.quickBody}>
                  {action.body}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>

        <ProfileVideoSection
          onOpenLibrary={() => onDestination("video")}
          runtime={runtime}
        />

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>Organizations</Text>
          <View style={styles.sectionCountPill}>
            <Text style={styles.sectionCount}>
              {organizationWallets?.length ?? 0}
            </Text>
          </View>
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
              <DunaIcon color={tokens.text2} name="chevron-right" size={18} />
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
          <Text style={styles.sectionTitle}>Settings</Text>
        </View>
        <View style={styles.settings}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Appearance"
            onPress={() => setAppearanceOpen(true)}
            style={({ pressed }) => [styles.setting, pressed && styles.pressed]}
          >
            <View style={styles.settingIcon}>
              <DunaIcon color={tokens.text1} name="settings" size={20} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.settingText}>Appearance</Text>
              <Text style={styles.settingMeta}>
                {preference === "system"
                  ? "Match device"
                  : preference === "dark"
                    ? "Dark"
                    : "Light"}
              </Text>
            </View>
            <DunaIcon color={tokens.text2} name="chevron-right" size={18} />
          </Pressable>
          <Pressable
            disabled={mode === "preview"}
            onPress={() => setSubscriptionsOpen(true)}
            style={({ pressed }) => [styles.setting, pressed && styles.pressed]}
          >
            <View style={styles.settingIcon}>
              <DunaIcon color={tokens.text1} name="wallet" size={20} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.settingText}>Subscriptions + billing</Text>
              <Text style={styles.settingMeta}>
                Duna, clubs, organizations, and coaches
              </Text>
            </View>
            <DunaIcon color={tokens.text2} name="chevron-right" size={18} />
          </Pressable>
          <Pressable
            disabled={mode === "preview"}
            onPress={() => setNotificationsOpen(true)}
            style={({ pressed }) => [styles.setting, pressed && styles.pressed]}
          >
            <View style={styles.settingIcon}>
              <DunaIcon color={tokens.text1} name="bell" size={20} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.settingText}>Notifications</Text>
              <Text style={styles.settingMeta}>
                Account and optional updates
              </Text>
            </View>
            <DunaIcon color={tokens.text2} name="chevron-right" size={18} />
          </Pressable>
          <Pressable
            onPress={() => setVideoDataOpen(true)}
            style={({ pressed }) => [styles.setting, pressed && styles.pressed]}
          >
            <View style={styles.settingIcon}>
              <DunaIcon color={tokens.text1} name="waves" size={20} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.settingText}>Data use</Text>
              <Text style={styles.settingMeta}>
                Wi‑Fi, cellular uploads, and live video
              </Text>
            </View>
            <DunaIcon color={tokens.text2} name="chevron-right" size={18} />
          </Pressable>
          {(
            [
              {
                anchor: "#privacy",
                body: "Permissions and visibility",
                icon: "lock" as const,
                title: "Privacy + safety",
              },
              {
                anchor: "#profile",
                body: "Language and measurement system",
                icon: "settings" as const,
                title: "Language + units",
              },
              {
                anchor: "#account",
                body: "Sign-in and account access",
                icon: "user" as const,
                title: "Account + security",
              },
            ] as const
          ).map(({ anchor, body, icon, title }) => (
            <Pressable
              disabled={mode === "preview"}
              key={title}
              onPress={() =>
                void WebBrowser.openBrowserAsync(
                  dunaWebUrl + "/app/settings" + anchor,
                )
              }
              style={({ pressed }) => [
                styles.setting,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.settingIcon}>
                <DunaIcon color={tokens.text1} name={icon} size={20} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.settingText}>{title}</Text>
                <Text style={styles.settingMeta}>{body}</Text>
              </View>
              <DunaIcon color={tokens.text2} name="chevron-right" size={18} />
            </Pressable>
          ))}
          {signOut && (
            <Pressable
              onPress={() => void signOut()}
              style={({ pressed }) => [
                styles.signOutRow,
                pressed && styles.pressed,
              ]}
            >
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
      <AppearanceModal
        visible={appearanceOpen}
        onClose={() => setAppearanceOpen(false)}
      />
    </>
  );
}

const createStyles = (tokens: PlayerDesignTokens) =>
  StyleSheet.create({
    artworkActions: { flexDirection: "row", gap: 9, marginTop: 18 },
    artworkBody: {
      color: tokens.text2,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 8,
    },
    artworkCard: {
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairline,
      borderRadius: 22,
      borderWidth: 1,
      marginTop: 22,
      padding: 18,
    },
    artworkTitle: {
      color: tokens.text1,
      fontSize: 23,
      fontWeight: "400",
      lineHeight: 27,
      marginTop: 5,
    },
    close: {
      alignItems: "center",
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairline,
      borderRadius: 24,
      borderWidth: 1,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    billingButton: {
      alignItems: "center",
      backgroundColor: tokens.buttonPrimaryBackground,
      borderRadius: 18,
      flexDirection: "row",
      justifyContent: "center",
      marginTop: 8,
      minHeight: 58,
      paddingHorizontal: 18,
    },
    billingButtonArrow: {
      color: tokens.buttonPrimaryForeground,
      fontSize: 18,
      marginLeft: 10,
    },
    billingButtonText: {
      color: tokens.buttonPrimaryForeground,
      fontSize: 15,
      fontWeight: "700",
    },
    billingFootnote: {
      color: tokens.text2,
      fontSize: 15,
      lineHeight: 22,
      paddingHorizontal: 8,
      textAlign: "center",
    },
    detailFact: { alignItems: "center", flex: 1 },
    detailFactLabel: {
      color: tokens.text2,
      fontSize: 12,
      fontWeight: "500",
      letterSpacing: 0.8,
      marginTop: 3,
    },
    detailFactValue: { color: tokens.text1, fontSize: 22, fontWeight: "500" },
    detailFacts: {
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairline,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      marginTop: 18,
      paddingVertical: 18,
    },
    eyebrow: {
      color: tokens.text1,
      fontSize: 12,
      fontWeight: "500",
      letterSpacing: 1.2,
    },
    flex: { flex: 1, minWidth: 0 },
    identity: {
      alignItems: "center",
      backgroundColor: tokens.surface1,
      borderRadius: mobileControl.cardRadius,
      flexDirection: "row",
      gap: mobileGrid[2],
      marginTop: mobileGrid[5],
      minHeight: 90,
      padding: mobileGrid[3],
    },
    identityMeta: {
      color: tokens.text2,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 2,
    },
    identityName: {
      color: tokens.text1,
      fontSize: 17,
      fontWeight: "700",
      lineHeight: 24,
    },
    identityPhoto: { borderRadius: 30, height: 60, width: 60 },
    identityPhotoFallback: {
      alignItems: "center",
      backgroundColor: tokens.surface2,
      borderRadius: 30,
      height: 60,
      justifyContent: "center",
      width: 60,
    },
    identityPhotoText: { color: tokens.text1, fontSize: 17, fontWeight: "700" },
    identityRating: {
      color: tokens.text1,
      fontSize: 21,
      fontWeight: "700",
      lineHeight: 24,
      textAlign: "right",
    },
    identityRatingBlock: { alignItems: "flex-end" },
    identityRatingLabel: {
      color: tokens.text2,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0,
      lineHeight: 15,
    },
    modalContent: { padding: 20, paddingBottom: 48 },
    modalHeader: {
      alignItems: "center",
      borderBottomColor: tokens.hairline,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 12,
      paddingHorizontal: 20,
      paddingVertical: 14,
    },
    modalSafe: { backgroundColor: tokens.ground, flex: 1 },
    modalTitle: {
      color: tokens.text1,
      fontSize: 28,
      fontWeight: "400",
      marginTop: 3,
    },
    subscriptionActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 17,
    },
    subscriptionCard: {
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairline,
      borderRadius: 22,
      borderWidth: 1,
      padding: 18,
    },
    subscriptionContent: { gap: 13, padding: 18, paddingBottom: 48 },
    subscriptionDangerAction: {
      alignItems: "center",
      borderColor: tokens.hairline,
      borderRadius: 14,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 15,
    },
    subscriptionDangerText: {
      color: tokens.loss,
      fontSize: 14,
      fontWeight: "500",
    },
    subscriptionEmpty: {
      alignItems: "center",
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairline,
      borderRadius: 22,
      borderWidth: 1,
      padding: 26,
    },
    subscriptionError: {
      backgroundColor: tokens.surface2,
      borderRadius: 14,
      color: tokens.loss,
      fontSize: 15,
      lineHeight: 22,
      padding: 13,
    },
    subscriptionIntro: { color: tokens.text2, fontSize: 15, lineHeight: 22 },
    subscriptionManagedExternally: {
      color: tokens.text2,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 15,
    },
    subscriptionMeta: {
      color: tokens.text2,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 7,
    },
    subscriptionNotice: {
      backgroundColor: tokens.surface2,
      borderRadius: 14,
      color: tokens.gain,
      fontSize: 15,
      fontWeight: "700",
      padding: 13,
      lineHeight: 22,
    },
    subscriptionOwner: {
      color: tokens.text1,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1,
    },
    subscriptionPeriod: { color: tokens.text2, fontSize: 12, marginTop: 4 },
    subscriptionPrimaryAction: {
      alignItems: "center",
      backgroundColor: tokens.buttonPrimaryBackground,
      borderRadius: 14,
      justifyContent: "center",
      minHeight: 56,
      paddingHorizontal: 16,
    },
    subscriptionPrimaryText: {
      color: tokens.buttonPrimaryForeground,
      fontSize: 14,
      fontWeight: "700",
    },
    subscriptionSecondaryAction: {
      alignItems: "center",
      borderColor: tokens.hairline,
      borderRadius: 14,
      borderWidth: 1,
      justifyContent: "center",
      minHeight: 48,
      paddingHorizontal: 15,
    },
    subscriptionSecondaryText: {
      color: tokens.text1,
      fontSize: 14,
      fontWeight: "500",
    },
    subscriptionStatusPill: {
      backgroundColor: tokens.surface2,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    subscriptionStatusText: {
      color: tokens.text1,
      fontSize: 12,
      fontWeight: "700",
      textTransform: "capitalize",
    },
    subscriptionTitle: {
      color: tokens.text1,
      fontSize: 20,
      fontWeight: "500",
      letterSpacing: -0.4,
      marginTop: 4,
    },
    subscriptionTopRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 10,
    },
    notificationBody: {
      color: tokens.text2,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 3,
    },
    notificationRow: {
      alignItems: "center",
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairline,
      borderRadius: 18,
      borderWidth: 1,
      flexDirection: "row",
      gap: 14,
      padding: 16,
    },
    notificationTitle: { color: tokens.text1, fontSize: 16, fontWeight: "500" },
    organization: {
      alignItems: "center",
      borderBottomColor: tokens.hairline,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 11,
      minHeight: 74,
      paddingHorizontal: 15,
    },
    organizationEmpty: { padding: 18 },
    organizationMark: {
      alignItems: "center",
      backgroundColor: tokens.surface2,
      borderRadius: 19,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    organizationMarkText: {
      color: tokens.text1,
      fontSize: 14,
      fontWeight: "700",
    },
    organizationMeta: { color: tokens.text2, fontSize: 13, marginTop: 3 },
    organizationName: { color: tokens.text1, fontSize: 16, fontWeight: "700" },
    organizations: {
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairline,
      borderRadius: mobileControl.cardRadius,
      borderWidth: 1,
      marginTop: 12,
      overflow: "hidden",
    },
    pressed: { opacity: 0.78 },
    primary: {
      alignItems: "center",
      backgroundColor: tokens.buttonPrimaryBackground,
      borderRadius: 14,
      flex: 1.3,
      justifyContent: "center",
      minHeight: 56,
    },
    primaryText: {
      color: tokens.buttonPrimaryForeground,
      fontSize: 14,
      fontWeight: "700",
    },
    profileDetailsHandle: { color: tokens.text1, fontSize: 16, marginTop: 3 },
    profileDetailsMeta: { color: tokens.text2, fontSize: 15, marginTop: 6 },
    profileDetailsName: {
      color: tokens.text1,
      fontSize: 28,
      fontWeight: "400",
      marginTop: 12,
    },
    profileIdentity: { alignItems: "center" },
    profilePhoto: { borderRadius: 54, height: 108, width: 108 },
    profilePhotoFallback: {
      alignItems: "center",
      backgroundColor: tokens.surface2,
      borderRadius: 54,
      height: 108,
      justifyContent: "center",
      width: 108,
    },
    profilePhotoText: { color: tokens.text1, fontSize: 28, fontWeight: "700" },
    quickBody: {
      color: tokens.text2,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 3,
    },
    quickCard: {
      backgroundColor: tokens.surface1,
      borderRadius: mobileControl.cardRadius,
      flexBasis: "47%",
      flexGrow: 1,
      justifyContent: "space-between",
      maxWidth: "48.5%",
      minHeight: 112,
      padding: mobileGrid[3],
      gap: 14,
    },
    quickCardBlue: { backgroundColor: tokens.surface1 },
    quickCardSand: { backgroundColor: tokens.surface1 },
    quickCardTop: {
      alignItems: "flex-start",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    quickGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: mobileGrid[2],
      marginTop: mobileGrid[3],
    },
    quickIcon: {
      alignItems: "center",
      backgroundColor: tokens.surface2,
      borderRadius: 20,
      height: mobileGrid[8],
      justifyContent: "center",
      width: mobileGrid[8],
    },
    quickIconBlue: { backgroundColor: tokens.surface2 },
    quickIconSand: { backgroundColor: tokens.surface2 },
    quickTitle: {
      color: tokens.text1,
      fontSize: 16,
      fontWeight: "500",
      lineHeight: 22,
    },
    screen: {
      backgroundColor: tokens.ground,
      flexGrow: 1,
      paddingHorizontal: mobileControl.pageInset,
      paddingTop: mobileGrid[4],
      paddingBottom: 155,
    },
    secondary: {
      alignItems: "center",
      borderColor: tokens.text1,
      borderRadius: 14,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 56,
    },
    secondaryText: { color: tokens.text1, fontSize: 14, fontWeight: "500" },
    sectionCount: { color: tokens.text1, fontSize: 12, fontWeight: "700" },
    sectionCountPill: {
      alignItems: "center",
      backgroundColor: tokens.surface1,
      borderRadius: mobileControl.pillRadius,
      height: mobileGrid[6],
      justifyContent: "center",
      minWidth: mobileGrid[6],
      paddingHorizontal: mobileGrid[2],
    },
    sectionHeading: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: mobileGrid[7],
    },
    sectionTitle: {
      color: tokens.text1,
      fontSize: 21,
      fontWeight: "700",
      letterSpacing: -0.25,
      lineHeight: 26,
    },
    setting: {
      alignItems: "center",
      borderBottomColor: tokens.hairline,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: mobileGrid[2],
      minHeight: 72,
      paddingHorizontal: mobileGrid[3],
    },
    settingIcon: {
      alignItems: "center",
      backgroundColor: tokens.surface1,
      borderRadius: mobileGrid[2],
      height: mobileGrid[8],
      justifyContent: "center",
      width: mobileGrid[8],
    },
    settingMeta: {
      color: tokens.text2,
      fontSize: 14,
      lineHeight: 20,
      marginTop: 2,
    },
    settingText: { color: tokens.text1, fontSize: 15, fontWeight: "500" },
    settings: {
      backgroundColor: tokens.surface1,
      borderColor: tokens.hairline,
      borderRadius: mobileControl.cardRadius,
      borderWidth: 1,
      marginTop: 12,
      overflow: "hidden",
    },
    signOut: { color: tokens.loss, fontSize: 15, fontWeight: "700" },
    signOutRow: {
      justifyContent: "center",
      minHeight: 62,
      paddingHorizontal: mobileGrid[3],
    },
    topBody: {
      color: tokens.text2,
      fontSize: 15,
      lineHeight: 21,
      marginTop: mobileGrid[1],
    },
    topEyebrow: {
      color: tokens.text1,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 1.2,
    },
    topHeader: { flexDirection: "row" },
    topTitle: {
      color: tokens.text1,
      fontSize: 34,
      fontWeight: "400",
      letterSpacing: -0.7,
      lineHeight: 40,
      marginTop: mobileGrid[1],
    },
    videoOfflineNote: {
      backgroundColor: tokens.surface2,
      borderColor: tokens.hairline,
      borderRadius: 16,
      borderWidth: 1,
      marginTop: 18,
      padding: 16,
    },
    videoOfflineNoteBody: {
      color: tokens.text2,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 5,
    },
    videoOfflineNoteTitle: {
      color: tokens.text1,
      fontSize: 14,
      fontWeight: "500",
    },
  });
