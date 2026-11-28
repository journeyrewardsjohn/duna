/**
 * The profile's settings sheets on the Duna Design System: notifications,
 * data use, and subscriptions and billing. Each is a page sheet (swipe down
 * to close) with Close at the top right, one Jost title, and its state parts
 * (saving, saved, error with a reference). Behaviour is unchanged from the
 * screens they replace; the copy no longer names infrastructure vendors.
 */
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState, type ReactNode } from "react";
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import {
  ErrorState,
  Icon,
  Spinner,
  Text,
  Title,
  TitleRegion,
  useHaptics,
  useTheme,
} from "@duna/ui/native";
import { report } from "@duna/observability";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dunaWebUrl } from "../../../mobile-api";
import { usePlayerRuntime } from "../../../runtime";
import {
  defaultVideoNetworkPreferences,
  loadVideoNetworkPreferences,
  saveVideoNetworkPreferences,
  type VideoNetworkPreferences,
} from "../../../video-offline";
import { Card, StatusChip } from "../../app/ui";

/** A page sheet with Close at the top right and one title. */
export function ProfileSheet({
  title,
  lead,
  visible,
  onClose,
  children,
  testID,
}: {
  readonly title: string;
  readonly lead?: string;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly testID?: string;
}) {
  const { colors, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <TitleRegion name={`profile-sheet-${title}`}>
        <View
          style={[styles.fill, { backgroundColor: colors.ground }]}
          testID={testID}
        >
          <View
            style={[
              styles.head,
              {
                paddingHorizontal: tokens.space["4"],
                paddingTop: tokens.space["4"],
                borderBottomColor: colors.line,
              },
            ]}
          >
            <View style={styles.flex}>
              <Title size={24}>{title}</Title>
            </View>
            <Pressable
              accessibilityLabel={`Close ${title.toLowerCase()}`}
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={[
                styles.close,
                { backgroundColor: colors["surface-sunken"] },
              ]}
            >
              <Icon name="close" size="control" />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={{
              padding: tokens.space["4"],
              paddingBottom: insets.bottom + tokens.space["8"],
              gap: tokens.space["4"],
            }}
          >
            {lead ? (
              <Text tone="text-2" variant="phone-body">
                {lead}
              </Text>
            ) : null}
            {children}
          </ScrollView>
        </View>
      </TitleRegion>
    </Modal>
  );
}

function ToggleRow({
  title,
  body,
  value,
  disabled,
  busy,
  onChange,
}: {
  readonly title: string;
  readonly body: string;
  readonly value: boolean;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly onChange: (next: boolean) => void;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  return (
    <View style={[styles.toggle, { gap: tokens.space["3"] }]}>
      <View style={styles.flex}>
        <Text variant="phone-body" weight={600}>
          {title}
        </Text>
        <Text tone="text-2" variant="phone-meta">
          {body}
        </Text>
      </View>
      {busy ? <Spinner label={`Saving ${title.toLowerCase()}`} /> : null}
      <Switch
        accessibilityLabel={title}
        disabled={disabled}
        onValueChange={(next) => {
          haptics.selection();
          onChange(next);
        }}
        trackColor={{ false: colors["line-strong"], true: colors.positive }}
        value={value}
      />
    </View>
  );
}

const notificationOptions = [
  {
    scope: "marketing-email" as const,
    title: "Email updates",
    body: "Nearby play, programs and product news.",
    disclosure:
      "Duna may send optional email updates about nearby play, programs, product news, and offers. You can turn these emails off at any time.",
  },
  {
    scope: "marketing-sms" as const,
    title: "Text updates",
    body: "Optional discovery and offers by text message.",
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

type NotificationScope = (typeof notificationOptions)[number]["scope"];

export function NotificationsSheet({
  visible,
  onClose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  const { client, mode, refresh, settings } = usePlayerRuntime();
  const haptics = useHaptics();
  const [saving, setSaving] = useState<NotificationScope>();
  const [notice, setNotice] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const granted = (scope: NotificationScope) =>
    settings?.consents.find((consent) => consent.scope === scope)?.granted ??
    false;
  const setPreference = async (
    option: (typeof notificationOptions)[number],
    next: boolean,
  ) => {
    if (!client || mode === "preview") return;
    setSaving(option.scope);
    setFailure(undefined);
    setNotice(undefined);
    try {
      await client.player.recordConsent.mutate({
        scope: option.scope,
        granted: next,
        disclosureText: option.disclosure,
        idempotencyKey: Crypto.randomUUID(),
      });
      await refresh();
      haptics.confirmed(0);
      setNotice(`${option.title} ${next ? "on" : "off"}.`);
    } catch (error) {
      haptics.refused();
      setFailure(report(error, { event: "player.profile.consent_failed" }));
    } finally {
      setSaving(undefined);
    }
  };
  return (
    <ProfileSheet
      lead="Booking, payment, safety, wallet and guardian notices always stay on so your account works. Choose the optional updates."
      onClose={onClose}
      testID="notifications-sheet"
      title="Notifications"
      visible={visible}
    >
      {notice ? (
        <StatusChip
          icon="check"
          label={notice}
          tone="positive"
          wash="positive-wash"
        />
      ) : null}
      {failure ? (
        <ErrorState compact reference={failure} title="That didn't save" />
      ) : null}
      <Card>
        {notificationOptions.map((option) => (
          <ToggleRow
            body={option.body}
            busy={saving === option.scope}
            disabled={Boolean(saving) || mode === "preview" || !client}
            key={option.scope}
            onChange={(next) => void setPreference(option, next)}
            title={option.title}
            value={granted(option.scope)}
          />
        ))}
      </Card>
      {mode === "preview" ? (
        <Text tone="text-3" variant="phone-meta">
          Preview: changes are off in this build.
        </Text>
      ) : null}
    </ProfileSheet>
  );
}

export function DataUseSheet({
  visible,
  onClose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
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
    <ProfileSheet
      lead="Recording works without service. Duna keeps a protected copy on this device and uploads it when a connection you allow is available."
      onClose={onClose}
      testID="data-use-sheet"
      title="Data use"
      visible={visible}
    >
      <Card>
        <ToggleRow
          body="When off, recordings and library videos wait for Wi-Fi."
          disabled={!ready}
          onChange={(allowCellularUploads) =>
            update({ ...preferences, allowCellularUploads })
          }
          title="Use cellular for uploads"
          value={preferences.allowCellularUploads}
        />
        <ToggleRow
          body="When off, Duna only starts a live stream on Wi-Fi."
          disabled={!ready}
          onChange={(allowCellularLive) =>
            update({ ...preferences, allowCellularLive })
          }
          title="Use cellular for live video"
          value={preferences.allowCellularLive}
        />
      </Card>
      <Card>
        <Text variant="phone-body" weight={600}>
          What works offline
        </Text>
        <Text tone="text-2" variant="phone-meta">
          Capture, score, favourite moments and prepare an existing video. Live
          streaming needs an allowed connection; queued videos never upload over
          cellular unless you turn it on here.
        </Text>
      </Card>
    </ProfileSheet>
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

function SheetButton({
  label,
  kind,
  busy,
  disabled,
  onPress,
}: {
  readonly label: string;
  readonly kind: "primary" | "quiet" | "danger";
  readonly busy?: boolean;
  readonly disabled?: boolean;
  readonly onPress: () => void;
}) {
  const { colors, tokens } = useTheme();
  const fill =
    kind === "primary"
      ? colors.action
      : kind === "danger"
        ? colors["danger-wash"]
        : colors["surface-sunken"];
  const ink =
    kind === "primary"
      ? colors["on-action"]
      : kind === "danger"
        ? colors.danger
        : colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: Boolean(busy), disabled: Boolean(disabled) }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: fill,
          borderRadius: tokens.radius.pill,
          opacity: disabled ? 0.5 : pressed ? 0.86 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      {busy ? (
        <Spinner label={label} />
      ) : (
        <Text style={{ color: ink }} variant="phone-body" weight={600}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function MembershipCard({
  owner,
  title,
  status,
  price,
  period,
  children,
}: {
  readonly owner: string;
  readonly title: string;
  readonly status?: string;
  readonly price?: string;
  readonly period?: string;
  readonly children?: ReactNode;
}) {
  return (
    <Card>
      <View style={styles.membershipTop}>
        <View style={styles.flex}>
          <Text tone="text-3" variant="phone-meta" weight={600}>
            {owner}
          </Text>
          <Text variant="phone-heading">{title}</Text>
        </View>
        {status ? <StatusChip label={status} /> : null}
      </View>
      {price ? (
        <Text family="ui" tabular variant="phone-body" weight={600}>
          {price}
        </Text>
      ) : null}
      {period ? (
        <Text tone="text-2" variant="phone-meta">
          {period}
        </Text>
      ) : null}
      {children}
    </Card>
  );
}

function statusLabel(status: string | undefined): string | undefined {
  if (!status) return undefined;
  const text = status.replace(/[_-]+/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function SubscriptionsSheet({
  visible,
  onClose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  const { client, mode, organizationWallets, refresh, settings } =
    usePlayerRuntime();
  const haptics = useHaptics();
  const [busy, setBusy] = useState<string>();
  const [failure, setFailure] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const dunaMembership = settings?.membership;
  const organizationMemberships = (organizationWallets ?? []).filter(
    (organization) =>
      organization.membershipId &&
      !["canceled", "cancelled", "incomplete_expired"].includes(
        organization.membershipStatus ?? "",
      ),
  );
  const offline = !client || mode === "preview";

  const run = async (key: string, action: () => Promise<unknown>) => {
    if (offline) return;
    setBusy(key);
    setFailure(undefined);
    setNotice(undefined);
    try {
      await action();
      await refresh?.();
      haptics.confirmed(2);
      setNotice("Your membership was updated.");
    } catch (error) {
      haptics.refused();
      setFailure(report(error, { event: "player.profile.membership_failed" }));
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
    if (offline) return;
    setBusy("billing");
    setFailure(undefined);
    try {
      const result = await client!.player.openPlayerBillingPortal.mutate({
        returnUrl: `${dunaWebUrl}/app/settings#membership`,
      });
      await WebBrowser.openBrowserAsync(result.url);
    } catch (error) {
      haptics.refused();
      setFailure(report(error, { event: "player.profile.billing_failed" }));
    } finally {
      setBusy(undefined);
    }
  };

  const dunaChange = (action: "resume" | "pause" | "cancel") => () =>
    run(`duna-${action}`, () =>
      client!.player.changeDunaPlusMembership.mutate({
        action,
        idempotencyKey: Crypto.randomUUID(),
      }),
    );

  return (
    <ProfileSheet
      lead="Duna and club memberships in one place. Card details are kept by Duna Pay, never on this device."
      onClose={onClose}
      testID="subscriptions-sheet"
      title="Memberships and billing"
      visible={visible}
    >
      {notice ? (
        <StatusChip
          icon="check"
          label={notice}
          tone="positive"
          wash="positive-wash"
        />
      ) : null}
      {failure ? (
        <ErrorState compact reference={failure} title="That didn't work" />
      ) : null}

      {dunaMembership ? (
        <MembershipCard
          owner="Duna"
          period={periodLabel(
            dunaMembership.currentPeriodEndsAt,
            dunaMembership.cancelAtPeriodEnd,
          )}
          price={subscriptionPrice(
            dunaMembership.priceMinor,
            dunaMembership.currency,
            dunaMembership.interval,
          )}
          status={
            dunaMembership.pausedUntil
              ? "Paused"
              : dunaMembership.cancelAtPeriodEnd
                ? "Ending"
                : statusLabel(dunaMembership.status)
          }
          title={dunaMembership.tierName}
        >
          <View style={styles.actions}>
            {dunaMembership.cancelAtPeriodEnd || dunaMembership.pausedUntil ? (
              <SheetButton
                busy={busy === "duna-resume"}
                disabled={Boolean(busy) || offline}
                kind="primary"
                label="Resume"
                onPress={() => void dunaChange("resume")()}
              />
            ) : (
              <>
                <SheetButton
                  busy={busy === "duna-pause"}
                  disabled={Boolean(busy) || offline}
                  kind="quiet"
                  label="Pause one month"
                  onPress={() => void dunaChange("pause")()}
                />
                <SheetButton
                  busy={busy === "duna-cancel"}
                  disabled={Boolean(busy) || offline}
                  kind="danger"
                  label="Cancel"
                  onPress={() =>
                    confirmCancellation(
                      dunaMembership.tierName,
                      "Your access stays on through the current paid period. You can resume before then.",
                      "Cancel at period end",
                      dunaChange("cancel"),
                    )
                  }
                />
              </>
            )}
          </View>
        </MembershipCard>
      ) : settings?.dunaPlus.kind === "complimentary" ? (
        <MembershipCard
          owner="Duna"
          period="Complimentary access, no recurring charge"
          title={settings.dunaPlus.label}
        />
      ) : null}

      {organizationMemberships.map((organization) => {
        const membershipId = organization.membershipId!;
        const ending = organization.membershipCancelAtPeriodEnd === true;
        const immediate =
          organization.membershipPolicy?.cancellationTiming === "immediate";
        const change = (action: "resume" | "cancel") =>
          run(`${membershipId}-${action}`, () =>
            client!.player.changeOrganizationMembership.mutate({
              action,
              membershipId,
              idempotencyKey: Crypto.randomUUID(),
            }),
          );
        const cancel = () => {
          const policy = organization.membershipPolicy;
          const refundDetail =
            policy?.refundBehavior === "prorated"
              ? " The unused portion goes back to your original payment method."
              : policy?.refundBehavior === "full-within-window"
                ? ` Your latest payment is refunded only within the ${policy.refundWindowDays ?? 7}-day refund window.`
                : " Payments already made are not refunded, except where required by law.";
          confirmCancellation(
            organization.membershipName ?? organization.organizationName,
            immediate
              ? `Cancellation takes effect immediately.${refundDetail}`
              : `Access stays on through ${organization.membershipInitialTermEndsAt ? "the accepted initial term" : "the current paid period"}.${refundDetail}`,
            immediate ? "Cancel now" : "Schedule cancellation",
            () => change("cancel"),
          );
        };
        return (
          <MembershipCard
            key={membershipId}
            owner={organization.organizationName}
            period={periodLabel(
              organization.membershipCurrentPeriodEndsAt,
              ending,
            )}
            price={subscriptionPrice(
              organization.membershipPriceMinor,
              organization.membershipCurrency,
              organization.membershipInterval,
            )}
            status={
              ending
                ? "Ending"
                : (statusLabel(organization.membershipStatus) ?? "Active")
            }
            title={organization.membershipName ?? "Membership"}
          >
            {organization.membershipManageable ? (
              <View style={styles.actions}>
                <SheetButton
                  busy={
                    busy === `${membershipId}-resume` ||
                    busy === `${membershipId}-cancel`
                  }
                  disabled={Boolean(busy) || offline}
                  kind={ending ? "primary" : "danger"}
                  label={
                    ending
                      ? "Resume"
                      : immediate
                        ? "Cancel membership"
                        : "Cancel at period end"
                  }
                  onPress={() => (ending ? void change("resume") : cancel())}
                />
              </View>
            ) : (
              <Text tone="text-2" variant="phone-meta">
                {`Contact ${organization.organizationName} to change this membership.`}
              </Text>
            )}
          </MembershipCard>
        );
      })}

      {!dunaMembership &&
      settings?.dunaPlus.kind !== "complimentary" &&
      organizationMemberships.length === 0 ? (
        <Card>
          <Text variant="phone-heading">No memberships yet</Text>
          <Text tone="text-2" variant="phone-meta">
            Club, coach and Duna memberships appear here after you join.
          </Text>
        </Card>
      ) : null}

      <SheetButton
        busy={busy === "billing"}
        disabled={Boolean(busy) || offline}
        kind="primary"
        label="Payment methods and invoices"
        onPress={() => void openBilling()}
      />
      <Text tone="text-3" variant="phone-meta">
        Opens a secure billing page for your account. Duna never stores your
        full card number or security code.
      </Text>
    </ProfileSheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1, minWidth: 0 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  toggle: { flexDirection: "row", alignItems: "center", minHeight: 56 },
  membershipTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: {
    minHeight: 48,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 1,
  },
});
