import { nativeMapUrl } from "@duna/core";
import {
  environmentalColors,
  resolveDunaTokens,
  type DunaTheme,
  type ResolvedDunaTokens,
} from "@duna/ui/tokens";
import Mapbox from "@rnmapbox/maps";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { VideoView, useVideoPlayer } from "expo-video";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle, Line, Path } from "react-native-svg";
import { useMapboxToken } from "./discovery-map";
import { DunaNumericText, FellixText as Text } from "./fellix-text";
import type { DunaApiClient } from "./mobile-api";
import { dunaWebUrl } from "./mobile-api";
import { presentNativePayment } from "./native-payments";
import { usePlayerRuntime } from "./runtime";

type Storefront = Awaited<
  ReturnType<DunaApiClient["public"]["organizationStorefront"]["query"]>
>;
type CatalogItem = Storefront["catalog"][number];
type CatalogVariant = CatalogItem["variants"][number];
type CatalogPrice = CatalogVariant["prices"][number];
type Coach = Awaited<
  ReturnType<DunaApiClient["public"]["coaches"]["query"]>
>[number];
type Eligibility = Awaited<
  ReturnType<DunaApiClient["player"]["catalogOfferEligibility"]["query"]>
>;

function readableText(background: string) {
  const value = background.replace("#", "");
  if (value.length !== 6) return environmentalColors.white;
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 160
    ? environmentalColors.ink
    : environmentalColors.white;
}

function money(amountMinor: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
  }).format(amountMinor / 100);
}

function priceLabel(price?: CatalogPrice) {
  if (!price) return "Ask for details";
  if (price.paymentKind === "credit" && price.creditAmount) {
    return `${price.creditAmount} credits`;
  }
  if (price.amountMinor !== undefined && price.currency) {
    const base = money(price.amountMinor, price.currency);
    if (!price.recurringInterval) return base;
    const count = price.recurringIntervalCount ?? 1;
    return `${base} / ${count > 1 ? `${count} ` : ""}${price.recurringInterval}`;
  }
  return "Included";
}

function preferredPrice(
  variant: CatalogVariant | undefined,
  paymentKind: "card" | "credit" | "cash",
  isMember: boolean,
) {
  const prices = variant?.prices.filter(
    (price) => price.paymentKind === paymentKind,
  );
  return (
    prices?.find(
      (price) => price.audience === (isMember ? "member" : "non-member"),
    ) ??
    prices?.find((price) => price.audience === "everyone") ??
    prices?.[0]
  );
}

function catalogPrice(item: CatalogItem) {
  const variant = item.variants[0];
  return priceLabel(
    preferredPrice(variant, "card", false) ??
      preferredPrice(variant, "credit", false) ??
      preferredPrice(variant, "cash", false),
  );
}

function configurationString(
  item: CatalogItem,
  key: string,
): string | undefined {
  const value = item.configuration[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function configurationList(item: CatalogItem, key: string): string[] {
  const value = item.configuration[key];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function productHighlights(item: CatalogItem): string[] {
  const direct = configurationList(item, "highlights");
  if (direct.length) return direct;
  const membership = item.configuration.membership;
  if (
    membership &&
    typeof membership === "object" &&
    !Array.isArray(membership)
  ) {
    const benefits = (membership as Record<string, unknown>).benefits;
    if (Array.isArray(benefits)) {
      return benefits.filter(
        (entry): entry is string => typeof entry === "string",
      );
    }
  }
  const credits = Number(item.configuration.creditsGranted ?? 0);
  if (Number.isSafeInteger(credits) && credits > 0) {
    return [
      `${credits} organization credits`,
      "Use them on eligible bookings and services",
      "Your balance updates as soon as checkout completes",
    ];
  }
  return [];
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function BackIcon({
  color = environmentalColors.ink,
}: {
  readonly color?: string;
}) {
  return (
    <Svg height={22} viewBox="0 0 24 24" width={22}>
      <Path
        d="M15.5 4.5 8 12l7.5 7.5"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.4}
      />
    </Svg>
  );
}

function ShareIcon({
  color = environmentalColors.ink,
}: {
  readonly color?: string;
}) {
  return (
    <Svg height={22} viewBox="0 0 24 24" width={22}>
      <Circle
        cx="18"
        cy="5"
        fill="none"
        r="2.5"
        stroke={color}
        strokeWidth={2}
      />
      <Circle
        cx="6"
        cy="12"
        fill="none"
        r="2.5"
        stroke={color}
        strokeWidth={2}
      />
      <Circle
        cx="18"
        cy="19"
        fill="none"
        r="2.5"
        stroke={color}
        strokeWidth={2}
      />
      <Line
        stroke={color}
        strokeWidth={2}
        x1="8.2"
        x2="15.8"
        y1="10.8"
        y2="6.2"
      />
      <Line
        stroke={color}
        strokeWidth={2}
        x1="8.2"
        x2="15.8"
        y1="13.2"
        y2="17.8"
      />
    </Svg>
  );
}

function CheckIcon({
  color = environmentalColors.white,
}: {
  readonly color?: string;
}) {
  return (
    <Svg height={18} viewBox="0 0 24 24" width={18}>
      <Path
        d="m5 12.5 4.2 4.2L19 7"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.6}
      />
    </Svg>
  );
}

function ProductVideo({ url }: { readonly url: string }) {
  const player = useVideoPlayer(url, (next) => {
    next.loop = true;
    next.muted = true;
  });
  return (
    <VideoView
      contentFit="cover"
      nativeControls
      player={player}
      style={mediaStyles.fill}
    />
  );
}

function OrganizationMap({
  latitude,
  longitude,
  name,
  onPrimary,
  primary,
  styles,
  themeTokens,
}: {
  readonly latitude?: number;
  readonly longitude?: number;
  readonly name: string;
  readonly onPrimary: string;
  readonly primary: string;
  readonly styles: ReturnType<typeof createStyles>;
  readonly themeTokens: ResolvedDunaTokens;
}) {
  const mapboxToken = useMapboxToken(
    latitude !== undefined && longitude !== undefined,
  );
  return (
    <View style={[styles.map, { backgroundColor: primary }]}>
      {mapboxToken && latitude !== undefined && longitude !== undefined ? (
        <Mapbox.MapView
          attributionEnabled={false}
          compassEnabled={false}
          logoEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          scaleBarEnabled={false}
          scrollEnabled={false}
          style={StyleSheet.absoluteFill}
          styleURL="mapbox://styles/mapbox/standard"
          zoomEnabled={false}
        >
          <Mapbox.Camera
            defaultSettings={{
              centerCoordinate: [longitude, latitude],
              zoomLevel: 13,
            }}
          />
          <Mapbox.PointAnnotation
            coordinate={[longitude, latitude]}
            id="organization-location"
          >
            <View style={[styles.mapPin, { borderColor: primary }]} />
          </Mapbox.PointAnnotation>
        </Mapbox.MapView>
      ) : null}
      <View
        pointerEvents="none"
        style={[
          styles.mapLabel,
          mapboxToken && styles.mapLabelOnMap,
          {
            backgroundColor: mapboxToken ? themeTokens.surface1 : "transparent",
          },
        ]}
      >
        <Text
          style={[styles.mapMark, { color: mapboxToken ? primary : onPrimary }]}
        >
          ⌖
        </Text>
        <Text
          style={[
            styles.mapText,
            { color: mapboxToken ? themeTokens.text1 : onPrimary },
          ]}
        >
          {name}
        </Text>
      </View>
    </View>
  );
}

export function OrganizationExperienceModal({
  onClose,
  onOpenCoach,
  onOpenEvent,
  onOpenVenue,
  slug,
  theme,
}: {
  readonly onClose: () => void;
  readonly onOpenCoach: (coach: Coach) => void;
  readonly onOpenEvent: (eventId: string) => void;
  readonly onOpenVenue: (venueId: string) => void;
  readonly slug?: string;
  readonly theme: DunaTheme;
}) {
  const { client, dashboard, publicClient, refresh } = usePlayerRuntime();
  const themeTokens = useMemo(
    () => resolveDunaTokens(theme, "editorial"),
    [theme],
  );
  const styles = useMemo(() => createStyles(themeTokens), [themeTokens]);
  const [storefront, setStorefront] = useState<Storefront>();
  const [coaches, setCoaches] = useState<readonly Coach[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CatalogItem>();
  const [selectedVariantId, setSelectedVariantId] = useState<string>();
  const [paymentKind, setPaymentKind] = useState<"card" | "credit" | "cash">(
    "card",
  );
  const [eligibility, setEligibility] = useState<Eligibility>();
  const [addMembership, setAddMembership] = useState(true);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  useEffect(() => {
    if (!slug || !publicClient) return;
    let active = true;
    setLoading(true);
    setError(undefined);
    setSelectedItem(undefined);
    void Promise.all([
      publicClient.public.organizationStorefront.query({ slug }),
      publicClient.public.coaches.query({ organizationSlug: slug }),
    ])
      .then(([nextStorefront, nextCoaches]) => {
        if (!active) return;
        setStorefront(nextStorefront);
        setCoaches(nextCoaches);
      })
      .catch((reason) => {
        if (!active) return;
        setError(
          reason instanceof Error
            ? reason.message
            : "Duna could not open this organization.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [publicClient, slug]);

  useEffect(() => {
    const item = selectedItem;
    setSelectedVariantId(item?.variants[0]?.id);
    setPaymentKind(
      item?.allowCard ? "card" : item?.allowCredits ? "credit" : "cash",
    );
    setAddMembership(true);
    setEligibility(undefined);
    if (!item || !client) return;
    let active = true;
    void client.player.catalogOfferEligibility
      .query({ catalogItemId: item.id })
      .then((result) => {
        if (active) setEligibility(result);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, selectedItem]);

  const events = useMemo(
    () =>
      (dashboard?.events ?? [])
        .filter(
          (event) =>
            event.organizationId === storefront?.organizationId ||
            event.organizationSlug === slug,
        )
        .filter((event) => new Date(event.endsAt).getTime() >= Date.now())
        .sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
    [dashboard?.events, slug, storefront?.organizationId],
  );

  const primary =
    storefront?.theme.palette.primary ?? environmentalColors.marine900;
  const accent =
    storefront?.theme.palette.accent ?? environmentalColors.marine200;
  const sand = storefront?.theme.palette.sand ?? environmentalColors.sand100;
  const onPrimary = readableText(primary);
  const hero =
    storefront?.theme.heroMediaType === "image"
      ? storefront.theme.heroMediaUrl
      : storefront?.theme.heroPosterUrl;
  const displayName =
    storefront?.theme.brandDisplayName ?? storefront?.name ?? "Organization";
  const membershipOffers =
    storefront?.catalog.filter(
      (item) => item.type === "plan" && item.subtype === "membership",
    ) ?? [];

  async function pollOrder(orderId: string) {
    if (!client) return;
    for (let attempt = 0; attempt < 16; attempt += 1) {
      const status = await client.player.catalogCheckoutStatus.query({
        orderId,
      });
      if (status.complete) return;
      if (["failed", "cancelled", "refunded"].includes(status.orderStatus)) {
        throw new Error(
          "The purchase did not complete. No new charge was made.",
        );
      }
      await wait(attempt < 4 ? 650 : 1_100);
    }
    throw new Error(
      "Payment is still processing. Your purchase will appear automatically.",
    );
  }

  async function pollMembership(catalogItemId: string) {
    if (!client) return false;
    for (let attempt = 0; attempt < 18; attempt += 1) {
      const result = await client.player.catalogOfferEligibility.query({
        catalogItemId,
      });
      if (result.isMember) {
        setEligibility(result);
        return true;
      }
      await wait(attempt < 5 ? 650 : 1_100);
    }
    return false;
  }

  async function purchase(
    item: CatalogItem,
    requestedKind: "card" | "credit" | "cash",
  ) {
    if (!client || !storefront) {
      throw new Error("Sign in to purchase from this club.");
    }
    const variant =
      item.variants.find((candidate) => candidate.id === selectedVariantId) ??
      item.variants[0];
    if (!variant)
      throw new Error("This product does not have an available option.");
    const itemEligibility =
      item.id === selectedItem?.id
        ? eligibility
        : await client.player.catalogOfferEligibility.query({
            catalogItemId: item.id,
          });
    const price = preferredPrice(
      variant,
      requestedKind,
      itemEligibility?.isMember ?? false,
    );
    if (!price) throw new Error("That payment option is not available.");
    const path = `/clubs/${storefront.slug}/products/${item.slug}`;
    const result = await client.player.startCatalogCheckout.mutate({
      catalogItemId: item.id,
      catalogVariantId: variant.id,
      catalogPriceId: price.id,
      paymentMethod: requestedKind,
      paymentSurface: Platform.OS === "web" ? "hosted" : "native",
      quantity: 1,
      successUrl: `${dunaWebUrl}${path}?checkout=success`,
      cancelUrl: `${dunaWebUrl}${path}?checkout=cancelled`,
      idempotencyKey: Crypto.randomUUID(),
    });
    if (result.paymentSheet) {
      const outcome = await presentNativePayment({
        paymentSheet: result.paymentSheet,
      });
      if (outcome === "cancelled") return false;
      await pollOrder(result.orderId);
    } else if (result.checkoutUrl) {
      if (Platform.OS !== "web") {
        throw new Error(
          "Duna could not prepare the in-app payment. You were not charged; please try again.",
        );
      }
      await WebBrowser.openBrowserAsync(result.checkoutUrl);
      return false;
    }
    if (result.mode === "cash-reservation") {
      Alert.alert(
        "Reserved",
        `The club will collect ${priceLabel(price)} in person.`,
      );
    }
    await refresh();
    return true;
  }

  async function completePurchase() {
    const item = selectedItem;
    if (!item) return;
    setCheckoutBusy(true);
    try {
      const requiresMembership =
        (item.membershipRequired || item.visibility === "members") &&
        eligibility?.isMember === false;
      if (requiresMembership) {
        const membership = membershipOffers[0];
        if (!addMembership || !membership) {
          throw new Error(
            membership
              ? "Keep Add membership selected to buy this product."
              : "This club needs to publish a membership before this product can be purchased.",
          );
        }
        const membershipCompleted = await purchase(membership, "card");
        if (!membershipCompleted) return;
        const active = await pollMembership(item.id);
        if (!active) {
          Alert.alert(
            "Membership is activating",
            "It is paid and will appear here automatically. Reopen this product in a moment to continue.",
          );
          return;
        }
      }
      const completed = await purchase(item, paymentKind);
      if (completed) {
        Alert.alert(
          item.subtype === "credit-pack" ? "Credits added" : "You’re all set",
          item.subtype === "credit-pack"
            ? "Your club credit balance is ready to use."
            : `${item.title} is now connected to your Duna account.`,
        );
      }
    } catch (reason) {
      Alert.alert(
        "Purchase could not finish",
        reason instanceof Error ? reason.message : "Please try again.",
      );
    } finally {
      setCheckoutBusy(false);
    }
  }

  const closeOrBack = () => {
    if (selectedItem) setSelectedItem(undefined);
    else onClose();
  };

  const sharePath = selectedItem
    ? `${dunaWebUrl}/clubs/${slug}/products/${selectedItem.slug}`
    : `${dunaWebUrl}/clubs/${slug}`;

  const selectedVariant =
    selectedItem?.variants.find(
      (variant) => variant.id === selectedVariantId,
    ) ?? selectedItem?.variants[0];
  const selectedPrice = preferredPrice(
    selectedVariant,
    paymentKind,
    eligibility?.isMember ?? false,
  );
  const paymentKinds = selectedItem
    ? ([
        selectedItem.allowCard ? "card" : undefined,
        selectedItem.allowCredits ? "credit" : undefined,
        selectedItem.allowCash ? "cash" : undefined,
      ].filter(Boolean) as ("card" | "credit" | "cash")[])
    : [];
  const selectedMedia = selectedItem?.media[0];
  const highlights = selectedItem ? productHighlights(selectedItem) : [];
  const requiresMembership = Boolean(
    selectedItem &&
    (selectedItem.membershipRequired ||
      selectedItem.visibility === "members") &&
    eligibility?.isMember === false,
  );
  const checkingMembership = Boolean(
    selectedItem &&
    (selectedItem.membershipRequired ||
      selectedItem.visibility === "members") &&
    eligibility === undefined,
  );

  return (
    <Modal
      animationType="slide"
      onRequestClose={closeOrBack}
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      visible={Boolean(slug)}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel={selectedItem ? "Back to club" : "Close club"}
            hitSlop={10}
            onPress={closeOrBack}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
          >
            <BackIcon color={themeTokens.text1} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text numberOfLines={1} style={styles.headerEyebrow}>
              {selectedItem
                ? selectedItem.subtype.replaceAll("-", " ")
                : "DUNA CLUB"}
            </Text>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {selectedItem?.title ?? displayName}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Share"
            hitSlop={10}
            onPress={() =>
              void Share.share({ message: sharePath, url: sharePath })
            }
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
          >
            <ShareIcon color={themeTokens.text1} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={primary} size="large" />
            <Text style={styles.centerBody}>Opening the club…</Text>
          </View>
        ) : error || !storefront ? (
          <View style={styles.center}>
            <Text style={styles.centerTitle}>This club page is not ready.</Text>
            <Text style={styles.centerBody}>{error}</Text>
          </View>
        ) : selectedItem ? (
          <ScrollView
            contentContainerStyle={styles.productPage}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.productHero, { backgroundColor: accent }]}>
              {selectedMedia?.kind === "video" ? (
                <ProductVideo url={selectedMedia.url} />
              ) : selectedMedia ? (
                <Image
                  source={{ uri: selectedMedia.url }}
                  style={styles.productHeroMedia}
                />
              ) : (
                <View style={styles.productFallback}>
                  <Text
                    style={[styles.productFallbackType, { color: primary }]}
                  >
                    {selectedItem.subtype.replaceAll("-", " ")}
                  </Text>
                  {selectedItem.subtype === "credit-pack" ? (
                    <DunaNumericText
                      style={[styles.productFallbackNumber, { color: primary }]}
                      tier="score"
                    >
                      {String(selectedItem.configuration.creditsGranted ?? "+")}
                    </DunaNumericText>
                  ) : null}
                </View>
              )}
            </View>

            <View style={styles.productEditorial}>
              <Text style={[styles.productKicker, { color: primary }]}>
                {storefront.name.toUpperCase()} ·{" "}
                {selectedItem.subtype.replaceAll("-", " ").toUpperCase()}
              </Text>
              <Text style={styles.productDetailTitle}>
                {selectedItem.title}
              </Text>
              <Text style={styles.productDetailSummary}>
                {selectedItem.shortSummary ??
                  selectedItem.description ??
                  "A simple way to get more from this club."}
              </Text>
            </View>

            <View style={styles.purchaseCard}>
              <View style={styles.purchaseTopline}>
                <View style={styles.flex}>
                  <Text style={styles.purchaseLabel}>Your option</Text>
                  <DunaNumericText style={styles.purchasePrice} tier="block">
                    {priceLabel(selectedPrice)}
                  </DunaNumericText>
                </View>
                {eligibility?.included ? (
                  <View
                    style={[styles.includedBadge, { backgroundColor: sand }]}
                  >
                    <Text
                      style={[styles.includedBadgeText, { color: primary }]}
                    >
                      Included
                    </Text>
                  </View>
                ) : null}
              </View>

              {selectedItem.variants.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.optionRow}>
                    {selectedItem.variants.map((variant) => (
                      <Pressable
                        key={variant.id}
                        onPress={() => setSelectedVariantId(variant.id)}
                        style={[
                          styles.optionChip,
                          selectedVariant?.id === variant.id && {
                            backgroundColor: primary,
                            borderColor: primary,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.optionChipText,
                            selectedVariant?.id === variant.id && {
                              color: onPrimary,
                            },
                          ]}
                        >
                          {variant.title === "Default"
                            ? "Standard"
                            : variant.title}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              ) : null}

              {paymentKinds.length > 1 ? (
                <View style={styles.paymentRow}>
                  {paymentKinds.map((kind) => (
                    <Pressable
                      key={kind}
                      onPress={() => setPaymentKind(kind)}
                      style={[
                        styles.paymentChoice,
                        paymentKind === kind && { borderColor: primary },
                      ]}
                    >
                      <View
                        style={[
                          styles.radio,
                          paymentKind === kind && {
                            backgroundColor: primary,
                            borderColor: primary,
                          },
                        ]}
                      >
                        {paymentKind === kind ? (
                          <CheckIcon color={onPrimary} />
                        ) : null}
                      </View>
                      <Text style={styles.paymentChoiceText}>
                        {kind === "card"
                          ? "Card, Apple Pay or Link"
                          : kind === "credit"
                            ? "Club credits"
                            : "Pay in person"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {requiresMembership ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: addMembership }}
                  onPress={() => setAddMembership((value) => !value)}
                  style={[styles.membershipAdd, { backgroundColor: sand }]}
                >
                  <View
                    style={[
                      styles.checkbox,
                      addMembership && {
                        backgroundColor: primary,
                        borderColor: primary,
                      },
                    ]}
                  >
                    {addMembership ? <CheckIcon color={onPrimary} /> : null}
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.membershipAddTitle}>
                      Add {membershipOffers[0]?.title ?? "club membership"}
                    </Text>
                    <Text style={styles.membershipAddBody}>
                      Required for this purchase ·{" "}
                      {membershipOffers[0]
                        ? catalogPrice(membershipOffers[0])
                        : "not configured"}
                    </Text>
                  </View>
                </Pressable>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={
                  checkoutBusy ||
                  checkingMembership ||
                  !selectedPrice ||
                  (requiresMembership && !addMembership)
                }
                onPress={() => void completePurchase()}
                style={({ pressed }) => [
                  styles.buyButton,
                  { backgroundColor: primary },
                  (checkoutBusy ||
                    checkingMembership ||
                    !selectedPrice ||
                    (requiresMembership && !addMembership)) &&
                    styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {checkoutBusy ? (
                  <ActivityIndicator color={onPrimary} />
                ) : (
                  <Text style={[styles.buyButtonText, { color: onPrimary }]}>
                    {checkingMembership
                      ? "Checking membership…"
                      : eligibility?.included
                        ? "Use membership benefit"
                        : requiresMembership
                          ? "Add membership + buy"
                          : paymentKind === "cash"
                            ? "Reserve now"
                            : "Buy in Duna"}
                  </Text>
                )}
              </Pressable>
              <Text style={styles.paymentNote}>
                {paymentKind === "card"
                  ? "Pay without leaving Duna using Apple Pay, Link, or a saved card."
                  : paymentKind === "credit"
                    ? "Your club balance updates immediately."
                    : "The club confirms and collects payment in person."}
              </Text>
            </View>

            {configurationString(selectedItem, "bestFor") ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailEyebrow}>BEST FOR</Text>
                <Text style={styles.detailLead}>
                  {configurationString(selectedItem, "bestFor")}
                </Text>
              </View>
            ) : null}
            {highlights.length ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailEyebrow}>WHAT YOU GET</Text>
                {highlights.map((highlight) => (
                  <View key={highlight} style={styles.highlightRow}>
                    <View
                      style={[
                        styles.highlightDot,
                        { backgroundColor: primary },
                      ]}
                    />
                    <Text style={styles.highlightText}>{highlight}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {selectedItem.description &&
            selectedItem.description !== selectedItem.shortSummary ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailEyebrow}>THE DETAILS</Text>
                <Text style={styles.detailBody}>
                  {selectedItem.description}
                </Text>
              </View>
            ) : null}
            {configurationString(selectedItem, "redemptionNotes") ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailEyebrow}>HOW TO USE IT</Text>
                <Text style={styles.detailBody}>
                  {configurationString(selectedItem, "redemptionNotes")}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <ImageBackground
              imageStyle={styles.heroImage}
              source={hero ? { uri: hero } : undefined}
              style={[styles.hero, { backgroundColor: primary }]}
            >
              <View style={styles.heroShade} />
              {storefront.theme.logoLightUrl ||
              storefront.theme.logoUrl ||
              storefront.theme.markUrl ? (
                <Image
                  resizeMode="contain"
                  source={{
                    uri:
                      storefront.theme.logoLightUrl ??
                      storefront.theme.logoUrl ??
                      storefront.theme.markUrl,
                  }}
                  style={styles.logo}
                />
              ) : null}
              <Text style={[styles.heroEyebrow, { color: onPrimary }]}>
                {storefront.venues.length
                  ? `${storefront.venues.length} venue${storefront.venues.length === 1 ? "" : "s"}`
                  : "COACHING + PLAY"}
              </Text>
              <Text style={[styles.heroTitle, { color: onPrimary }]}>
                {displayName}
              </Text>
              <Text style={[styles.heroBody, { color: onPrimary }]}>
                {storefront.theme.tagline ??
                  storefront.theme.profileSummary ??
                  "Train, play, and stay connected with this Duna club."}
              </Text>
            </ImageBackground>

            <ScrollView
              contentContainerStyle={styles.shortcuts}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {storefront.venues.some((venue) => venue.courtCount > 0) ? (
                <Pressable
                  onPress={() => {
                    const venue = storefront.venues.find(
                      (candidate) => candidate.courtCount > 0,
                    );
                    if (venue) onOpenVenue(venue.id);
                  }}
                  style={[styles.shortcut, { backgroundColor: primary }]}
                >
                  <Text style={[styles.shortcutText, { color: onPrimary }]}>
                    Book a court
                  </Text>
                  <Text style={[styles.shortcutArrow, { color: onPrimary }]}>
                    →
                  </Text>
                </Pressable>
              ) : null}
              {events[0] ? (
                <Pressable
                  onPress={() => onOpenEvent(events[0]!.id)}
                  style={[styles.shortcut, { borderColor: primary }]}
                >
                  <Text style={[styles.shortcutText, { color: primary }]}>
                    Play an event
                  </Text>
                  <Text style={[styles.shortcutArrow, { color: primary }]}>
                    →
                  </Text>
                </Pressable>
              ) : null}
              {membershipOffers[0] ? (
                <Pressable
                  onPress={() => setSelectedItem(membershipOffers[0])}
                  style={[styles.shortcut, { borderColor: primary }]}
                >
                  <Text style={[styles.shortcutText, { color: primary }]}>
                    Join the club
                  </Text>
                  <Text style={[styles.shortcutArrow, { color: primary }]}>
                    →
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>

            {events.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionEyebrow}>COMING UP</Text>
                <Text style={styles.sectionTitle}>Make a day of it.</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.eventRail}>
                    {events.slice(0, 8).map((event) => {
                      const cover = event.media?.[0];
                      const imageUrl =
                        cover?.kind === "video" ? cover.posterUrl : cover?.url;
                      return (
                        <Pressable
                          key={event.id}
                          onPress={() => onOpenEvent(event.id)}
                          style={styles.eventCard}
                        >
                          {(imageUrl ?? event.imageUrl) ? (
                            <Image
                              source={{ uri: imageUrl ?? event.imageUrl }}
                              style={styles.eventImage}
                            />
                          ) : (
                            <View
                              style={[
                                styles.eventImage,
                                styles.eventFallback,
                                { backgroundColor: primary },
                              ]}
                            >
                              <DunaNumericText
                                style={[
                                  styles.eventFallbackDay,
                                  { color: onPrimary },
                                ]}
                                tier="block"
                              >
                                {String(new Date(event.startsAt).getDate())}
                              </DunaNumericText>
                              <Text
                                style={[
                                  styles.eventFallbackMonth,
                                  { color: onPrimary },
                                ]}
                              >
                                {new Date(event.startsAt).toLocaleDateString(
                                  "en-US",
                                  { month: "long" },
                                )}
                              </Text>
                            </View>
                          )}
                          <View style={styles.eventCardBody}>
                            <Text
                              style={[styles.eventKicker, { color: primary }]}
                            >
                              {new Date(event.startsAt)
                                .toLocaleDateString("en-US", {
                                  weekday: "short",
                                  month: "short",
                                  day: "numeric",
                                })
                                .toUpperCase()}
                            </Text>
                            <Text numberOfLines={2} style={styles.eventName}>
                              {event.title}
                            </Text>
                            <Text numberOfLines={1} style={styles.eventMeta}>
                              {event.venueName} · {event.spotsRemaining} spots
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            ) : null}

            {storefront.catalog.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionEyebrow}>MEMBERSHIPS + MORE</Text>
                <Text style={styles.sectionTitle}>Your club, your way.</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.productRail}>
                    {storefront.catalog.slice(0, 12).map((item) => {
                      const media = item.media[0];
                      const imageUrl =
                        media?.kind === "video" ? media.posterUrl : media?.url;
                      return (
                        <Pressable
                          key={item.id}
                          onPress={() => setSelectedItem(item)}
                          style={styles.productCard}
                        >
                          {imageUrl ? (
                            <Image
                              source={{ uri: imageUrl }}
                              style={styles.productCardImage}
                            />
                          ) : (
                            <View
                              style={[
                                styles.productCardImage,
                                styles.productCardFallback,
                                { backgroundColor: accent },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.productCardFallbackText,
                                  { color: primary },
                                ]}
                              >
                                {item.subtype.replaceAll("-", " ")}
                              </Text>
                            </View>
                          )}
                          <View style={styles.productCardBody}>
                            <Text
                              style={[
                                styles.productCardType,
                                { color: primary },
                              ]}
                            >
                              {item.subtype.replaceAll("-", " ").toUpperCase()}
                            </Text>
                            <Text
                              numberOfLines={2}
                              style={styles.productCardTitle}
                            >
                              {item.title}
                            </Text>
                            <DunaNumericText
                              style={styles.productCardPrice}
                              tier="table"
                            >
                              {catalogPrice(item)}
                            </DunaNumericText>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </ScrollView>
              </View>
            ) : null}

            {coaches.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionEyebrow}>THE TEAM</Text>
                <Text style={styles.sectionTitle}>
                  People worth learning from.
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.coachRail}>
                    {coaches.map((coach) => (
                      <Pressable
                        key={coach.personId}
                        onPress={() => onOpenCoach(coach)}
                        style={styles.coachCard}
                      >
                        {coach.avatarUrl ? (
                          <Image
                            source={{ uri: coach.avatarUrl }}
                            style={styles.coachPhoto}
                          />
                        ) : (
                          <View
                            style={[
                              styles.coachPhoto,
                              styles.coachFallback,
                              { backgroundColor: primary },
                            ]}
                          >
                            <Text
                              style={[
                                styles.coachInitials,
                                { color: onPrimary },
                              ]}
                            >
                              {coach.displayName
                                .split(/\s+/)
                                .slice(0, 2)
                                .map((part) => part[0])
                                .join("")}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.coachName}>
                          {coach.displayName}
                        </Text>
                        <Text style={styles.coachMeta}>
                          {coach.homeMarket ?? "Coach"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>
            ) : null}

            {storefront.venues.length ? (
              <View style={styles.section}>
                <Text style={styles.sectionEyebrow}>VENUES</Text>
                <Text style={styles.sectionTitle}>Where you play.</Text>
                <View style={styles.stack}>
                  {storefront.venues.map((venue) => (
                    <Pressable
                      key={venue.id}
                      onPress={() => onOpenVenue(venue.id)}
                      style={styles.venueCard}
                    >
                      {venue.imageUrl ? (
                        <Image
                          source={{ uri: venue.imageUrl }}
                          style={styles.venuePhoto}
                        />
                      ) : (
                        <View
                          style={[
                            styles.venuePhoto,
                            styles.venueFallback,
                            { backgroundColor: sand },
                          ]}
                        >
                          <Text
                            style={[
                              styles.venueFallbackText,
                              { color: primary },
                            ]}
                          >
                            ▦
                          </Text>
                        </View>
                      )}
                      <View style={styles.flex}>
                        <Text style={styles.venueName}>{venue.name}</Text>
                        <Text style={styles.venueMeta}>
                          {[venue.locality, venue.administrativeArea]
                            .filter(Boolean)
                            .join(", ")}
                          {venue.courtCount
                            ? ` · ${venue.courtCount} courts`
                            : ""}
                        </Text>
                      </View>
                      <Text style={styles.chevron}>›</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <View style={styles.section}>
              <Text style={styles.sectionEyebrow}>CONTACT + LOCATION</Text>
              <Text style={styles.sectionTitle}>Find your way there.</Text>
              <View style={styles.contactCard}>
                <OrganizationMap
                  latitude={storefront.contact.latitude}
                  longitude={storefront.contact.longitude}
                  name={
                    [
                      storefront.contact.locality,
                      storefront.contact.administrativeArea,
                    ]
                      .filter(Boolean)
                      .join(", ") || displayName
                  }
                  onPrimary={onPrimary}
                  primary={primary}
                  styles={styles}
                  themeTokens={themeTokens}
                />
                <Text style={styles.contactAddress}>
                  {[
                    storefront.contact.addressLine1,
                    storefront.contact.addressLine2,
                    storefront.contact.locality,
                    storefront.contact.administrativeArea,
                    storefront.contact.postalCode,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
                <View style={styles.contactActions}>
                  {storefront.contact.latitude !== undefined &&
                  storefront.contact.longitude !== undefined ? (
                    <Pressable
                      onPress={() =>
                        void Linking.openURL(
                          nativeMapUrl({
                            address:
                              [
                                storefront.contact.addressLine1,
                                storefront.contact.locality,
                                storefront.contact.administrativeArea,
                              ]
                                .filter(Boolean)
                                .join(", ") || displayName,
                            label: displayName,
                            latitude: storefront.contact.latitude,
                            longitude: storefront.contact.longitude,
                            platform:
                              Platform.OS === "ios"
                                ? "ios"
                                : Platform.OS === "android"
                                  ? "android"
                                  : "web",
                          }),
                        )
                      }
                      style={styles.contactAction}
                    >
                      <Text style={styles.contactActionText}>Directions</Text>
                    </Pressable>
                  ) : null}
                  {storefront.contact.email ? (
                    <Pressable
                      onPress={() =>
                        void Linking.openURL(
                          `mailto:${storefront.contact.email}`,
                        )
                      }
                      style={styles.contactAction}
                    >
                      <Text style={styles.contactActionText}>Email</Text>
                    </Pressable>
                  ) : null}
                  {storefront.contact.phone ? (
                    <Pressable
                      onPress={() =>
                        void Linking.openURL(`tel:${storefront.contact.phone}`)
                      }
                      style={styles.contactAction}
                    >
                      <Text style={styles.contactActionText}>Call</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const mediaStyles = StyleSheet.create({
  fill: { height: "100%", width: "100%" },
});

function createStyles(token: ResolvedDunaTokens) {
  return StyleSheet.create({
    buyButton: {
      alignItems: "center",
      borderRadius: 18,
      justifyContent: "center",
      minHeight: 58,
      paddingHorizontal: 22,
    },
    buyButtonText: { fontSize: 17, fontWeight: "800" },
    center: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      padding: 32,
    },
    centerBody: {
      color: token.text2,
      fontSize: 16,
      lineHeight: 23,
      marginTop: 12,
      textAlign: "center",
    },
    centerTitle: {
      color: token.text1,
      fontSize: 24,
      fontWeight: "800",
      textAlign: "center",
    },
    checkbox: {
      alignItems: "center",
      borderColor: token.hairlineStrong,
      borderRadius: 7,
      borderWidth: 1.5,
      height: 26,
      justifyContent: "center",
      width: 26,
    },
    chevron: { color: token.text2, fontSize: 28 },
    coachCard: { width: 164 },
    coachFallback: { alignItems: "center", justifyContent: "center" },
    coachInitials: { fontSize: 25, fontWeight: "800" },
    coachMeta: { color: token.text2, fontSize: 15, marginTop: 3 },
    coachName: {
      color: token.text1,
      fontSize: 17,
      fontWeight: "800",
      marginTop: 10,
    },
    coachPhoto: { borderRadius: 20, height: 180, width: 164 },
    coachRail: { flexDirection: "row", gap: 14, paddingRight: 20 },
    contactAction: {
      alignItems: "center",
      borderColor: token.buttonGhostBorder,
      borderRadius: 15,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 50,
    },
    contactActionText: { color: token.text1, fontSize: 15, fontWeight: "700" },
    contactActions: { flexDirection: "row", gap: 8, padding: 14 },
    contactAddress: {
      color: token.text2,
      fontSize: 15,
      lineHeight: 22,
      padding: 14,
    },
    contactCard: {
      backgroundColor: token.surface1,
      borderColor: token.hairline,
      borderRadius: 24,
      borderWidth: 1,
      marginTop: 16,
      overflow: "hidden",
    },
    content: { paddingBottom: 64 },
    detailBody: { color: token.text2, fontSize: 17, lineHeight: 27 },
    detailEyebrow: {
      color: token.text2,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1.25,
    },
    detailLead: {
      color: token.text1,
      fontSize: 23,
      fontWeight: "700",
      lineHeight: 31,
      marginTop: 12,
    },
    detailSection: {
      borderTopColor: token.hairline,
      borderTopWidth: 1,
      marginHorizontal: 20,
      paddingVertical: 28,
    },
    disabled: { opacity: 0.42 },
    eventCard: {
      backgroundColor: token.surface1,
      borderColor: token.hairline,
      borderRadius: 23,
      borderWidth: 1,
      overflow: "hidden",
      width: 286,
    },
    eventCardBody: { padding: 16 },
    eventFallback: { alignItems: "center", justifyContent: "center" },
    eventFallbackDay: { fontSize: 52 },
    eventFallbackMonth: { fontSize: 16, marginTop: 4 },
    eventImage: { height: 190, width: "100%" },
    eventKicker: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1 },
    eventMeta: { color: token.text2, fontSize: 15, marginTop: 8 },
    eventName: {
      color: token.text1,
      fontSize: 21,
      fontWeight: "800",
      lineHeight: 25,
      marginTop: 7,
    },
    eventRail: { flexDirection: "row", gap: 14, paddingRight: 20 },
    flex: { flex: 1, minWidth: 0 },
    header: {
      alignItems: "center",
      backgroundColor: token.ground,
      borderBottomColor: token.hairline,
      borderBottomWidth: 1,
      flexDirection: "row",
      gap: 10,
      minHeight: 72,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    headerCopy: { alignItems: "center", flex: 1, minWidth: 0 },
    headerEyebrow: {
      color: token.text2,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.1,
      textTransform: "uppercase",
    },
    headerTitle: {
      color: token.text1,
      fontSize: 17,
      fontWeight: "800",
      marginTop: 2,
    },
    hero: {
      justifyContent: "flex-end",
      minHeight: 390,
      overflow: "hidden",
      padding: 22,
    },
    heroBody: { fontSize: 18, lineHeight: 26, marginTop: 10, maxWidth: 350 },
    heroEyebrow: {
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1.25,
      textTransform: "uppercase",
    },
    heroImage: { resizeMode: "cover" },
    heroShade: {
      backgroundColor: token.scrim,
      bottom: 0,
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
    },
    heroTitle: {
      fontSize: 46,
      fontWeight: "800",
      letterSpacing: -1.5,
      lineHeight: 49,
      marginTop: 10,
      maxWidth: 360,
    },
    highlightDot: { borderRadius: 4, height: 8, marginTop: 8, width: 8 },
    highlightRow: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 13,
      marginTop: 17,
    },
    highlightText: {
      color: token.text1,
      flex: 1,
      fontSize: 17,
      lineHeight: 24,
    },
    iconButton: {
      alignItems: "center",
      backgroundColor: token.surface1,
      borderColor: token.hairline,
      borderRadius: 26,
      borderWidth: 1,
      height: 52,
      justifyContent: "center",
      width: 52,
    },
    includedBadge: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    includedBadgeText: { fontSize: 12, fontWeight: "800" },
    logo: { height: 48, marginBottom: 30, width: 150 },
    map: { height: 198 },
    mapLabel: {
      alignItems: "center",
      flexDirection: "row",
      gap: 8,
      left: 16,
      padding: 12,
      position: "absolute",
      top: 16,
    },
    mapLabelOnMap: { borderRadius: 14 },
    mapMark: { fontSize: 23 },
    mapPin: {
      backgroundColor: token.surface1,
      borderRadius: 12,
      borderWidth: 5,
      height: 24,
      width: 24,
    },
    mapText: { fontSize: 15, fontWeight: "700" },
    membershipAdd: {
      alignItems: "center",
      borderRadius: 18,
      flexDirection: "row",
      gap: 12,
      marginTop: 18,
      padding: 15,
    },
    membershipAddBody: {
      color: token.text2,
      fontSize: 14,
      lineHeight: 19,
      marginTop: 3,
    },
    membershipAddTitle: {
      color: token.text1,
      fontSize: 16,
      fontWeight: "800",
    },
    optionChip: {
      borderColor: token.hairline,
      borderRadius: 999,
      borderWidth: 1,
      minHeight: 46,
      paddingHorizontal: 17,
      paddingVertical: 12,
    },
    optionChipText: { color: token.text1, fontSize: 15, fontWeight: "700" },
    optionRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 18,
      paddingRight: 10,
    },
    paymentChoice: {
      alignItems: "center",
      borderColor: token.hairline,
      borderRadius: 16,
      borderWidth: 1.5,
      flexDirection: "row",
      gap: 10,
      minHeight: 54,
      paddingHorizontal: 13,
    },
    paymentChoiceText: {
      color: token.text1,
      flex: 1,
      fontSize: 15,
      fontWeight: "600",
    },
    paymentNote: {
      color: token.text2,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 12,
      textAlign: "center",
    },
    paymentRow: { gap: 8, marginTop: 18 },
    pressed: { opacity: 0.7 },
    productCard: {
      backgroundColor: token.surface1,
      borderColor: token.hairline,
      borderRadius: 22,
      borderWidth: 1,
      overflow: "hidden",
      width: 236,
    },
    productCardBody: { padding: 15 },
    productCardFallback: {
      alignItems: "center",
      justifyContent: "center",
      padding: 22,
    },
    productCardFallbackText: {
      fontSize: 19,
      fontWeight: "800",
      textAlign: "center",
      textTransform: "capitalize",
    },
    productCardImage: { height: 168, width: "100%" },
    productCardPrice: {
      color: token.text1,
      fontSize: 17,
      fontWeight: "800",
      marginTop: 13,
    },
    productCardTitle: {
      color: token.text1,
      fontSize: 20,
      fontWeight: "800",
      lineHeight: 24,
      marginTop: 7,
    },
    productCardType: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },
    productDetailSummary: {
      color: token.text2,
      fontSize: 18,
      lineHeight: 27,
      marginTop: 13,
    },
    productDetailTitle: {
      color: token.text1,
      fontSize: 38,
      fontWeight: "800",
      letterSpacing: -1.2,
      lineHeight: 43,
      marginTop: 9,
    },
    productEditorial: { paddingHorizontal: 20, paddingTop: 26 },
    productFallback: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
    },
    productFallbackNumber: { fontSize: 76, marginTop: 12 },
    productFallbackType: {
      fontSize: 16,
      fontWeight: "800",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    productHero: { height: 350, overflow: "hidden" },
    productHeroMedia: { height: "100%", width: "100%" },
    productKicker: { fontSize: 11, fontWeight: "800", letterSpacing: 1.1 },
    productPage: { backgroundColor: token.ground, paddingBottom: 55 },
    productRail: { flexDirection: "row", gap: 14, paddingRight: 20 },
    purchaseCard: {
      backgroundColor: token.surface1,
      borderColor: token.hairline,
      borderRadius: 24,
      borderWidth: 1,
      margin: 20,
      padding: 18,
    },
    purchaseLabel: {
      color: token.text2,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1,
      textTransform: "uppercase",
    },
    purchasePrice: { color: token.text1, fontSize: 30, marginTop: 7 },
    purchaseTopline: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 10,
    },
    radio: {
      alignItems: "center",
      borderColor: token.hairlineStrong,
      borderRadius: 11,
      borderWidth: 1.5,
      height: 22,
      justifyContent: "center",
      width: 22,
    },
    safe: { backgroundColor: token.ground, flex: 1 },
    section: { marginTop: 43, paddingLeft: 20 },
    sectionEyebrow: {
      color: token.text2,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 1.4,
    },
    sectionTitle: {
      color: token.text1,
      fontSize: 34,
      fontWeight: "800",
      letterSpacing: -0.8,
      lineHeight: 38,
      marginBottom: 18,
      marginTop: 7,
      paddingRight: 20,
    },
    shortcut: {
      alignItems: "center",
      borderRadius: 18,
      borderWidth: 1.5,
      flexDirection: "row",
      gap: 20,
      justifyContent: "space-between",
      minHeight: 58,
      paddingHorizontal: 18,
    },
    shortcutArrow: { fontSize: 21 },
    shortcutText: { fontSize: 16, fontWeight: "800" },
    shortcuts: { gap: 10, paddingHorizontal: 20, paddingTop: 18 },
    stack: { gap: 10, paddingRight: 20 },
    venueCard: {
      alignItems: "center",
      backgroundColor: token.surface1,
      borderColor: token.hairline,
      borderRadius: 20,
      borderWidth: 1,
      flexDirection: "row",
      gap: 13,
      minHeight: 100,
      padding: 12,
    },
    venueFallback: { alignItems: "center", justifyContent: "center" },
    venueFallbackText: { fontSize: 30 },
    venueMeta: {
      color: token.text2,
      fontSize: 15,
      lineHeight: 21,
      marginTop: 4,
    },
    venueName: { color: token.text1, fontSize: 19, fontWeight: "800" },
    venuePhoto: { borderRadius: 15, height: 76, width: 76 },
  });
}
