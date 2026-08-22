import { annualPrepaySavingsPercent, nativeMapUrl } from "@duna/core";
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
  Share,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useMapboxToken } from "./discovery-map";
import { DunaNumericText, SatoshiText as Text } from "./satoshi-text";
import type { DunaApiClient } from "./mobile-api";
import { dunaWebUrl } from "./mobile-api";
import { NativeMarkdownContent } from "./markdown-content";
import { presentNativePayment } from "./native-payments";
import { usePlayerRuntime } from "./runtime";

type Storefront = Awaited<
  ReturnType<DunaApiClient["public"]["organizationStorefront"]["query"]>
>;
type CatalogItem = Storefront["catalog"][number];
type CatalogVariant = CatalogItem["variants"][number];
type CatalogPrice = CatalogVariant["prices"][number];
type CatalogTestimonial = {
  readonly quote: string;
  readonly author?: string;
  readonly context?: string;
  readonly rating?: number;
};
type CatalogFaq = {
  readonly question: string;
  readonly answer: string;
};
type Coach = Awaited<
  ReturnType<DunaApiClient["public"]["coaches"]["query"]>
>[number];
type Eligibility = Awaited<
  ReturnType<DunaApiClient["player"]["catalogOfferEligibility"]["query"]>
>;
type WaiverRequirement = Awaited<
  ReturnType<DunaApiClient["player"]["waiverRequirements"]["query"]>
>[number];

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

function configurationTestimonials(item: CatalogItem): CatalogTestimonial[] {
  const value = item.configuration.testimonials;
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const quote = typeof record.quote === "string" ? record.quote.trim() : "";
    if (!quote) return [];
    return [
      {
        quote,
        author:
          typeof record.author === "string" && record.author.trim()
            ? record.author.trim()
            : undefined,
        context:
          typeof record.context === "string" && record.context.trim()
            ? record.context.trim()
            : undefined,
        rating:
          typeof record.rating === "number" && Number.isFinite(record.rating)
            ? record.rating
            : undefined,
      },
    ];
  });
}

function configurationFaqs(item: CatalogItem): CatalogFaq[] {
  const value = item.configuration.faqs;
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    const question =
      typeof record.question === "string" ? record.question.trim() : "";
    const answer =
      typeof record.answer === "string" ? record.answer.trim() : "";
    return question && answer ? [{ question, answer }] : [];
  });
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

function CloseIcon({
  color = environmentalColors.ink,
}: {
  readonly color?: string;
}) {
  return (
    <Svg height={22} viewBox="0 0 24 24" width={22}>
      <Path
        d="m6 6 12 12M18 6 6 18"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={2.4}
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
  const [selectedPriceId, setSelectedPriceId] = useState<string>();
  const [promoCode, setPromoCode] = useState("");
  const [membershipTermsAccepted, setMembershipTermsAccepted] = useState(false);
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string>();
  const [recordingConsentAccepted, setRecordingConsentAccepted] =
    useState(false);
  const [paymentKind, setPaymentKind] = useState<"card" | "credit" | "cash">(
    "card",
  );
  const [paymentOption, setPaymentOption] = useState<
    "upfront" | "installments"
  >("upfront");
  const [eligibility, setEligibility] = useState<Eligibility>();
  const [addMembership, setAddMembership] = useState(true);
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [waiverRequirements, setWaiverRequirements] = useState<
    readonly WaiverRequirement[]
  >([]);
  const [waiverVisible, setWaiverVisible] = useState(false);
  const [waiverScrolled, setWaiverScrolled] = useState(false);
  const [waiverVerified, setWaiverVerified] = useState(false);
  const [waiverName, setWaiverName] = useState("");
  const [remainingWaiverSignerRoles, setRemainingWaiverSignerRoles] = useState<
    readonly (
      "adult-player" | "parent-or-guardian" | "player-acknowledgement"
    )[]
  >([]);

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
    setSelectedPriceId(undefined);
    setPromoCode("");
    setMembershipTermsAccepted(false);
    setPaymentKind(
      item?.allowCard ? "card" : item?.allowCredits ? "credit" : "cash",
    );
    setPaymentOption("upfront");
    setAddMembership(true);
    setSelectedOccurrenceId(item?.upcomingOccurrences[0]?.key);
    setRecordingConsentAccepted(false);
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
      if (status.complete) return status;
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
    const purchasingSelectedItem = item.id === selectedItem?.id;
    const price =
      purchasingSelectedItem && requestedKind === "card" && selectedPriceId
        ? variant.prices.find(
            (candidate) =>
              candidate.id === selectedPriceId &&
              candidate.paymentKind === "card",
          )
        : preferredPrice(
            variant,
            requestedKind,
            itemEligibility?.isMember ?? false,
          );
    if (!price) throw new Error("That payment option is not available.");
    const schedule =
      item.configuration.sessionSchedule &&
      typeof item.configuration.sessionSchedule === "object" &&
      !Array.isArray(item.configuration.sessionSchedule)
        ? (item.configuration.sessionSchedule as Readonly<
            Record<string, unknown>
          >)
        : undefined;
    const fixedSession =
      item.type === "service" &&
      (schedule?.mode === "one-off" || schedule?.mode === "recurring");
    if (fixedSession && (!purchasingSelectedItem || !selectedOccurrenceId)) {
      throw new Error("Choose an upcoming coach-supported session.");
    }
    const path = `/clubs/${storefront.slug}/products/${item.slug}`;
    const result = await client.player.startCatalogCheckout.mutate({
      catalogItemId: item.id,
      catalogVariantId: variant.id,
      catalogPriceId: price.id,
      paymentMethod: requestedKind,
      paymentOption:
        purchasingSelectedItem && requestedKind === "card"
          ? paymentOption
          : "upfront",
      paymentSurface: Platform.OS === "web" ? "hosted" : "native",
      promoCode:
        purchasingSelectedItem && requestedKind === "card"
          ? promoCode.trim() || undefined
          : undefined,
      quantity: 1,
      catalogSessionOccurrenceId:
        fixedSession && purchasingSelectedItem
          ? selectedOccurrenceId
          : undefined,
      recordingConsentAccepted:
        purchasingSelectedItem && recordingConsentAccepted,
      successUrl: `${dunaWebUrl}${path}?checkout=success`,
      cancelUrl: `${dunaWebUrl}${path}?checkout=cancelled`,
      idempotencyKey: Crypto.randomUUID(),
      membershipPolicyAccepted:
        item.type === "plan" && item.subtype === "membership"
          ? membershipTermsAccepted
          : undefined,
    });
    let completedSchedule:
      | Awaited<
          ReturnType<DunaApiClient["player"]["catalogCheckoutStatus"]["query"]>
        >["paymentSchedule"]
      | undefined;
    if (result.paymentSheet) {
      const outcome = await presentNativePayment({
        paymentSheet: result.paymentSheet,
      });
      if (outcome === "cancelled") return false;
      const status = await pollOrder(result.orderId);
      completedSchedule = status?.paymentSchedule;
    } else if (result.checkoutUrl) {
      await WebBrowser.openBrowserAsync(result.checkoutUrl);
      if (Platform.OS === "web") return false;
      const status = await pollOrder(result.orderId);
      completedSchedule = status?.paymentSchedule;
    }
    if (result.mode === "cash-reservation") {
      Alert.alert(
        "Reserved",
        `The club will collect ${priceLabel(price)} in person.`,
      );
    }
    await refresh();
    return completedSchedule ?? true;
  }

  async function completePurchase() {
    const item = selectedItem;
    if (!item) return;
    setCheckoutBusy(true);
    try {
      let purchasedMembership: CatalogItem | undefined;
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
        purchasedMembership = membership;
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
        await promptForPostPurchaseWaiver(
          purchasedMembership ? [purchasedMembership, item] : [item],
        );
        Alert.alert(
          item.subtype === "credit-pack" ? "Credits added" : "You’re all set",
          item.subtype === "credit-pack"
            ? "Your club credit balance is ready to use."
            : typeof completed === "object"
              ? `${item.title} is confirmed. ${money(completed.paidMinor, completed.currency)} of ${money(completed.totalMinor, completed.currency)} is paid. Your full automatic schedule is in Wallet.`
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

  const currentWaiver = waiverRequirements.find(
    (requirement) => !requirement.complete,
  );
  const requiredWaiverSections =
    currentWaiver?.keySections.filter(
      (section) => section.acknowledgementRequired,
    ) ?? [];
  const canSignWaiver =
    Boolean(currentWaiver) &&
    waiverScrolled &&
    waiverVerified &&
    (!currentWaiver?.requiresSignature || waiverName.trim().length >= 3);

  async function signWaiver() {
    if (!client || !storefront || !currentWaiver || !canSignWaiver) return;
    setCheckoutBusy(true);
    try {
      const result = await client.player.executeWaiver.mutate({
        organizationId: storefront.organizationId,
        waiverDocumentId: currentWaiver.documentId,
        subjectPersonId: currentWaiver.subjectPersonId,
        typedLegalName: currentWaiver.requiresSignature
          ? waiverName
          : undefined,
        acknowledgedSectionIds: requiredWaiverSections.map(
          (section) => section.id,
        ),
        displayedInline: true,
        scrolledToEnd: true,
        confirmed: true,
        idempotencyKey: Crypto.randomUUID(),
      });
      const refreshed = await client.player.waiverRequirements.query({
        organizationId: storefront.organizationId,
        catalogItemId: selectedItem?.id,
      });
      setWaiverRequirements(refreshed);
      setRemainingWaiverSignerRoles(
        result.remainingSignerRoles.filter(
          (
            role,
          ): role is
            "adult-player" | "parent-or-guardian" | "player-acknowledgement" =>
            role === "adult-player" ||
            role === "parent-or-guardian" ||
            role === "player-acknowledgement",
        ),
      );
      if (refreshed.every((requirement) => requirement.complete)) {
        setWaiverVisible(false);
        Alert.alert(
          "Waiver recorded",
          "Your acknowledgement has been saved to the club record.",
        );
      } else {
        Alert.alert(
          "Another signer is needed",
          "Duna recorded this acknowledgement. A linked parent, guardian, or player still needs to complete the remaining required signature.",
        );
      }
    } catch (reason) {
      Alert.alert(
        "Waiver could not be signed",
        reason instanceof Error ? reason.message : "Try again in a moment.",
      );
    } finally {
      setCheckoutBusy(false);
    }
  }

  async function promptForPostPurchaseWaiver(items: readonly CatalogItem[]) {
    if (!client || !storefront) return;
    const requirementSets = await Promise.all(
      items.map((item) =>
        client.player.waiverRequirements
          .query({
            organizationId: storefront.organizationId,
            catalogItemId: item.id,
          })
          .catch(() => []),
      ),
    );
    const requirements = Array.from(
      new Map(
        requirementSets
          .flat()
          .map((requirement) => [requirement.documentId, requirement]),
      ).values(),
    );
    if (requirements.every((requirement) => requirement.complete)) return;
    setWaiverRequirements(requirements);
    setWaiverScrolled(false);
    setWaiverVerified(false);
    setWaiverName("");
    setRemainingWaiverSignerRoles([]);
    setWaiverVisible(true);
  }

  async function shareWaiverCompletion(role: string) {
    if (!storefront || !currentWaiver) return;
    const url = new URL("/waivers/complete", dunaWebUrl);
    url.searchParams.set("organizationId", storefront.organizationId);
    url.searchParams.set("waiverDocumentId", currentWaiver.documentId);
    url.searchParams.set("subjectPersonId", currentWaiver.subjectPersonId);
    await Share.share({
      message: `Please complete the ${currentWaiver.title} for the ${role === "parent-or-guardian" ? "parent or guardian" : "player"}. ${url.toString()}`,
      url: url.toString(),
    });
  }

  const closeOrBack = () => {
    if (selectedItem) setSelectedItem(undefined);
    else onClose();
  };

  const selectedVariant =
    selectedItem?.variants.find(
      (variant) => variant.id === selectedVariantId,
    ) ?? selectedItem?.variants[0];
  const selectedPrice = preferredPrice(
    selectedVariant,
    paymentKind,
    eligibility?.isMember ?? false,
  );
  const selectedCardPrices =
    selectedVariant?.prices.filter(
      (candidate) =>
        candidate.paymentKind === "card" &&
        (candidate.audience === "everyone" ||
          candidate.audience ===
            (eligibility?.isMember ? "member" : "non-member")),
    ) ?? [];
  const activeSelectedPrice =
    paymentKind === "card"
      ? (selectedCardPrices.find(
          (candidate) => candidate.id === selectedPriceId,
        ) ?? selectedPrice)
      : selectedPrice;
  const paymentPlan =
    selectedItem?.configuration.paymentPlan &&
    typeof selectedItem.configuration.paymentPlan === "object" &&
    !Array.isArray(selectedItem.configuration.paymentPlan)
      ? (selectedItem.configuration.paymentPlan as Readonly<
          Record<string, unknown>
        >)
      : undefined;
  const installmentCount =
    typeof paymentPlan?.installmentCount === "number"
      ? Math.trunc(paymentPlan.installmentCount)
      : 0;
  const installmentIncreasePercent =
    typeof paymentPlan?.priceIncreasePercent === "number"
      ? Math.min(100, Math.max(0, paymentPlan.priceIncreasePercent))
      : 0;
  const installmentAmountMinor =
    activeSelectedPrice?.amountMinor !== undefined && installmentCount >= 2
      ? Math.ceil(
          Math.round(
            activeSelectedPrice.amountMinor *
              (1 + installmentIncreasePercent / 100),
          ) / installmentCount,
        )
      : 0;
  const installmentsAvailable = Boolean(
    paymentPlan?.enabled === true &&
    paymentKind === "card" &&
    installmentCount >= 2 &&
    !activeSelectedPrice?.recurringInterval &&
    selectedItem?.type !== "good",
  );
  const monthlySelectedPrice = selectedCardPrices.find(
    (candidate) => candidate.recurringInterval === "month",
  );
  const annualSelectedPrice = selectedCardPrices.find(
    (candidate) => candidate.recurringInterval === "year",
  );
  const annualSavings =
    monthlySelectedPrice?.amountMinor !== undefined &&
    annualSelectedPrice?.amountMinor !== undefined
      ? annualPrepaySavingsPercent(
          monthlySelectedPrice.amountMinor,
          annualSelectedPrice.amountMinor,
        )
      : 0;
  const isMembershipOffer = Boolean(
    selectedItem?.type === "plan" && selectedItem.subtype === "membership",
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
  const outcomeHeadline = selectedItem
    ? configurationString(selectedItem, "outcomeHeadline")
    : undefined;
  const outcomeBody = selectedItem
    ? configurationString(selectedItem, "outcomeBody")
    : undefined;
  const howItWorks = selectedItem
    ? configurationList(selectedItem, "howItWorks")
    : [];
  const testimonials = selectedItem
    ? configurationTestimonials(selectedItem)
    : [];
  const faqs = selectedItem ? configurationFaqs(selectedItem) : [];
  const validityDays = selectedItem
    ? Number(selectedItem.configuration.validityDays)
    : 0;
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
  const selectedSchedule =
    selectedItem?.configuration.sessionSchedule &&
    typeof selectedItem.configuration.sessionSchedule === "object" &&
    !Array.isArray(selectedItem.configuration.sessionSchedule)
      ? (selectedItem.configuration.sessionSchedule as Readonly<
          Record<string, unknown>
        >)
      : undefined;
  const fixedSession = Boolean(
    selectedItem?.type === "service" &&
    (selectedSchedule?.mode === "one-off" ||
      selectedSchedule?.mode === "recurring"),
  );
  const selectedVirtualDelivery =
    selectedItem?.configuration.virtualDelivery &&
    typeof selectedItem.configuration.virtualDelivery === "object" &&
    !Array.isArray(selectedItem.configuration.virtualDelivery)
      ? (selectedItem.configuration.virtualDelivery as Readonly<
          Record<string, unknown>
        >)
      : undefined;
  const requiresRecordingConsent = Boolean(
    selectedItem?.configuration.deliveryMode === "online" &&
    (selectedVirtualDelivery?.autoRecord === true ||
      selectedVirtualDelivery?.autoTranscribe === true),
  );

  return (
    <Modal
      animationType="slide"
      onRequestClose={closeOrBack}
      presentationStyle="pageSheet"
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
            accessibilityLabel="Close club"
            hitSlop={10}
            onPress={onClose}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
          >
            <CloseIcon color={themeTokens.text1} />
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
                    {priceLabel(activeSelectedPrice)}
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

              {paymentKind === "card" && selectedCardPrices.length > 1 ? (
                <View style={styles.billingChoice}>
                  <Text style={styles.purchaseLabel}>Choose billing</Text>
                  <View style={styles.billingChoiceRow}>
                    {selectedCardPrices.map((candidate) => {
                      const active = candidate.id === activeSelectedPrice?.id;
                      const annual = candidate.recurringInterval === "year";
                      return (
                        <Pressable
                          accessibilityRole="radio"
                          accessibilityState={{ checked: active }}
                          key={candidate.id}
                          onPress={() => setSelectedPriceId(candidate.id)}
                          style={[
                            styles.billingChoiceCard,
                            active && { borderColor: primary },
                          ]}
                        >
                          <View style={styles.billingChoiceHeading}>
                            <Text style={styles.billingChoiceTitle}>
                              {annual ? "Annual prepay" : "Monthly"}
                            </Text>
                            {annual && annualSavings > 0 ? (
                              <View
                                style={[
                                  styles.savingsBadge,
                                  { backgroundColor: sand },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.savingsBadgeText,
                                    { color: primary },
                                  ]}
                                >
                                  SAVE {annualSavings}%
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Text style={styles.billingChoicePrice}>
                            {priceLabel(candidate)}
                          </Text>
                          {annual ? (
                            <Text style={styles.billingChoiceNote}>
                              Full-year credits and included bookings issued now
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {installmentsAvailable ? (
                <View style={styles.billingChoice}>
                  <Text style={styles.purchaseLabel}>Choose how to pay</Text>
                  <View style={styles.billingChoiceRow}>
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{
                        checked: paymentOption === "upfront",
                      }}
                      onPress={() => setPaymentOption("upfront")}
                      style={[
                        styles.billingChoiceCard,
                        paymentOption === "upfront" && { borderColor: primary },
                      ]}
                    >
                      <Text style={styles.billingChoiceTitle}>Pay upfront</Text>
                      <Text style={styles.billingChoicePrice}>
                        {priceLabel(activeSelectedPrice)}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="radio"
                      accessibilityState={{
                        checked: paymentOption === "installments",
                      }}
                      onPress={() => setPaymentOption("installments")}
                      style={[
                        styles.billingChoiceCard,
                        paymentOption === "installments" && {
                          borderColor: primary,
                        },
                      ]}
                    >
                      <Text style={styles.billingChoiceTitle}>
                        {installmentCount} monthly payments
                      </Text>
                      <Text style={styles.billingChoicePrice}>
                        {money(
                          installmentAmountMinor,
                          activeSelectedPrice?.currency ?? "USD",
                        )}{" "}
                        each
                      </Text>
                      <Text style={styles.billingChoiceNote}>
                        Automatic, fixed, and ends after payment{" "}
                        {installmentCount}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {fixedSession ? (
                <View style={styles.paymentRow}>
                  <Text style={styles.purchaseLabel}>Choose your session</Text>
                  {selectedItem.upcomingOccurrences.map((occurrence) => (
                    <Pressable
                      key={occurrence.key}
                      onPress={() => setSelectedOccurrenceId(occurrence.key)}
                      style={[
                        styles.paymentChoice,
                        selectedOccurrenceId === occurrence.key && {
                          borderColor: primary,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.radio,
                          selectedOccurrenceId === occurrence.key && {
                            backgroundColor: primary,
                            borderColor: primary,
                          },
                        ]}
                      >
                        {selectedOccurrenceId === occurrence.key ? (
                          <CheckIcon color={onPrimary} />
                        ) : null}
                      </View>
                      <Text style={styles.paymentChoiceText}>
                        {new Date(occurrence.startsAt).toLocaleString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          timeZone: occurrence.timezone,
                        })}
                      </Text>
                    </Pressable>
                  ))}
                  {selectedItem.upcomingOccurrences.length === 0 ? (
                    <Text style={styles.paymentNote}>
                      No coach-supported sessions are available right now.
                    </Text>
                  ) : null}
                </View>
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
                    <View style={styles.membershipAddHeading}>
                      <Text style={styles.membershipAddTitle}>
                        Add {membershipOffers[0]?.title ?? "club membership"}
                      </Text>
                      {membershipOffers[0] ? (
                        <Text style={styles.membershipAddPrice}>
                          {catalogPrice(membershipOffers[0])}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.membershipAddBody}>
                      Required for this purchase
                      {membershipOffers[0]
                        ? " · billed before this order"
                        : " · not configured"}
                    </Text>
                  </View>
                </Pressable>
              ) : null}

              {requiresRecordingConsent ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: recordingConsentAccepted }}
                  onPress={() =>
                    setRecordingConsentAccepted((accepted) => !accepted)
                  }
                  style={[styles.membershipAdd, { backgroundColor: sand }]}
                >
                  <View
                    style={[
                      styles.checkbox,
                      recordingConsentAccepted && {
                        backgroundColor: primary,
                        borderColor: primary,
                      },
                    ]}
                  >
                    {recordingConsentAccepted ? (
                      <CheckIcon color={onPrimary} />
                    ) : null}
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.membershipAddTitle}>
                      Recording and transcript notice
                    </Text>
                    <Text style={styles.membershipAddBody}>
                      This Meet is configured to record and transcribe. Duna
                      stores the recording, transcript, AI summary, and action
                      items with your session record.
                    </Text>
                  </View>
                </Pressable>
              ) : null}

              {paymentKind === "card" ? (
                <View style={styles.promoField}>
                  <Text style={styles.purchaseLabel}>Promo code</Text>
                  <TextInput
                    autoCapitalize="characters"
                    maxLength={48}
                    onChangeText={(value) => setPromoCode(value.toUpperCase())}
                    placeholder="Enter code"
                    placeholderTextColor={themeTokens.text3}
                    style={styles.promoInput}
                    value={promoCode}
                  />
                </View>
              ) : null}

              {isMembershipOffer || requiresMembership ? (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: membershipTermsAccepted }}
                  onPress={() => setMembershipTermsAccepted((value) => !value)}
                  style={[styles.membershipAdd, { backgroundColor: sand }]}
                >
                  <View
                    style={[
                      styles.checkbox,
                      membershipTermsAccepted && {
                        backgroundColor: primary,
                        borderColor: primary,
                      },
                    ]}
                  >
                    {membershipTermsAccepted ? (
                      <CheckIcon color={onPrimary} />
                    ) : null}
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.membershipAddTitle}>
                      I agree to the membership terms
                    </Text>
                    <Text style={styles.membershipAddBody}>
                      This membership renews on the billing schedule shown. You
                      can manage renewal and cancellation from Duna.
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
                  ((isMembershipOffer || requiresMembership) &&
                    !membershipTermsAccepted) ||
                  (fixedSession && !selectedOccurrenceId) ||
                  (requiresRecordingConsent && !recordingConsentAccepted) ||
                  (requiresMembership && !addMembership)
                }
                onPress={() => void completePurchase()}
                style={({ pressed }) => [
                  styles.buyButton,
                  { backgroundColor: primary },
                  (checkoutBusy ||
                    checkingMembership ||
                    !selectedPrice ||
                    ((isMembershipOffer || requiresMembership) &&
                      !membershipTermsAccepted) ||
                    (fixedSession && !selectedOccurrenceId) ||
                    (requiresRecordingConsent && !recordingConsentAccepted) ||
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
            {outcomeHeadline || outcomeBody ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailEyebrow}>THE OUTCOME</Text>
                {outcomeHeadline ? (
                  <Text style={styles.detailLead}>{outcomeHeadline}</Text>
                ) : null}
                {outcomeBody ? (
                  <Text
                    style={[
                      styles.detailBody,
                      outcomeHeadline && styles.detailBodySpaced,
                    ]}
                  >
                    {outcomeBody}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {howItWorks.length ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailEyebrow}>HOW IT WORKS</Text>
                {howItWorks.map((item, index) => (
                  <View key={`${index}-${item}`} style={styles.storyStep}>
                    <View
                      style={[
                        styles.storyStepNumber,
                        { backgroundColor: primary },
                      ]}
                    >
                      <DunaNumericText
                        style={[
                          styles.storyStepNumberText,
                          { color: onPrimary },
                        ]}
                      >
                        {String(index + 1)}
                      </DunaNumericText>
                    </View>
                    <Text style={styles.storyStepCopy}>{item}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {configurationString(selectedItem, "redemptionNotes") ||
            (Number.isFinite(validityDays) && validityDays > 0) ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailEyebrow}>HOW TO USE IT</Text>
                {configurationString(selectedItem, "redemptionNotes") ? (
                  <Text style={styles.detailBody}>
                    {configurationString(selectedItem, "redemptionNotes")}
                  </Text>
                ) : null}
                {Number.isFinite(validityDays) && validityDays > 0 ? (
                  <Text style={styles.validityText}>
                    Valid for {validityDays} day{validityDays === 1 ? "" : "s"}
                    after purchase.
                  </Text>
                ) : null}
              </View>
            ) : null}
            {testimonials.length ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailEyebrow}>CUSTOMER STORIES</Text>
                {testimonials.map((testimonial, index) => (
                  <View
                    key={`${index}-${testimonial.quote}`}
                    style={styles.proofCard}
                  >
                    {testimonial.rating ? (
                      <Text style={[styles.proofRating, { color: primary }]}>
                        {"★".repeat(
                          Math.max(1, Math.min(5, testimonial.rating)),
                        )}
                      </Text>
                    ) : null}
                    <Text style={styles.proofQuote}>“{testimonial.quote}”</Text>
                    {testimonial.author || testimonial.context ? (
                      <Text style={styles.proofAttribution}>
                        {[testimonial.author, testimonial.context]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
            {faqs.length ? (
              <View style={styles.detailSection}>
                <Text style={styles.detailEyebrow}>COMMON QUESTIONS</Text>
                {faqs.map((faq, index) => (
                  <View key={`${index}-${faq.question}`} style={styles.faqCard}>
                    <Text style={styles.faqQuestion}>{faq.question}</Text>
                    <Text style={styles.faqAnswer}>{faq.answer}</Text>
                  </View>
                ))}
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
        <Modal
          animationType="slide"
          onRequestClose={() => setWaiverVisible(false)}
          presentationStyle="pageSheet"
          visible={waiverVisible}
        >
          <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
            <View style={styles.header}>
              <View style={styles.flex}>
                <Text style={styles.headerEyebrow}>REQUIRED WAIVER</Text>
                <Text style={styles.headerTitle}>
                  {currentWaiver?.title ?? "Waiver"}
                </Text>
              </View>
              <Pressable
                accessibilityLabel="Close waiver"
                onPress={() => setWaiverVisible(false)}
                style={styles.iconButton}
              >
                <CloseIcon color={themeTokens.text1} />
              </Pressable>
            </View>
            <ScrollView
              contentContainerStyle={styles.waiverPage}
              onScroll={(event) => {
                const { contentOffset, contentSize, layoutMeasurement } =
                  event.nativeEvent;
                if (
                  contentSize.height -
                    contentOffset.y -
                    layoutMeasurement.height <
                  10
                ) {
                  setWaiverScrolled(true);
                }
              }}
              scrollEventThrottle={16}
            >
              <Text style={styles.waiverIntro}>
                Your purchase is complete. Finish this waiver before the player
                participates. Read the complete document, then verify the key
                sections below.
              </Text>
              <NativeMarkdownContent
                color={themeTokens.text1}
                linkColor={primary}
                markdown={currentWaiver?.markdown ?? ""}
              />
              <Text style={styles.waiverStatus}>
                {waiverScrolled
                  ? "Full document reviewed. Verify the key sections to continue."
                  : "Scroll to the bottom to continue."}
              </Text>
              {!waiverVerified ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !waiverScrolled }}
                  disabled={!waiverScrolled}
                  onPress={() => setWaiverVerified(true)}
                  style={[
                    styles.waiverAcknowledgement,
                    !waiverScrolled && styles.disabled,
                  ]}
                >
                  <View style={styles.checkbox}>
                    <CheckIcon color={primary} />
                  </View>
                  <Text style={styles.waiverAcknowledgementText}>
                    {requiredWaiverSections.length
                      ? `I verify I read ${requiredWaiverSections.map((section) => section.title).join(", ")}.`
                      : "I verify I read the full waiver."}
                  </Text>
                </Pressable>
              ) : (
                <Text style={styles.waiverStatus}>
                  ✓ Key sections verified. Add the legal name to sign.
                </Text>
              )}
              {waiverVerified && currentWaiver?.requiresSignature ? (
                <View style={styles.waiverNameGroup}>
                  <Text style={styles.waiverNameLabel}>
                    Type your full legal name to sign
                  </Text>
                  <TextInput
                    editable={waiverVerified}
                    onChangeText={setWaiverName}
                    placeholder="Full legal name"
                    placeholderTextColor={themeTokens.text3}
                    style={styles.waiverNameInput}
                    value={waiverName}
                  />
                </View>
              ) : null}
              {waiverVerified ? (
                <Pressable
                  disabled={!canSignWaiver || checkoutBusy}
                  onPress={() => void signWaiver()}
                  style={[
                    styles.buyButton,
                    { backgroundColor: primary },
                    (!canSignWaiver || checkoutBusy) && styles.disabled,
                  ]}
                >
                  {checkoutBusy ? (
                    <ActivityIndicator color={onPrimary} />
                  ) : (
                    <Text style={[styles.buyButtonText, { color: onPrimary }]}>
                      Sign and agree
                    </Text>
                  )}
                </Pressable>
              ) : null}
              {remainingWaiverSignerRoles.map((role) => (
                <Pressable
                  key={role}
                  onPress={() => void shareWaiverCompletion(role)}
                  style={styles.contactAction}
                >
                  <Text style={styles.contactActionText}>
                    Send completion link to{" "}
                    {role === "parent-or-guardian"
                      ? "parent or guardian"
                      : "player"}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </SafeAreaView>
        </Modal>
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
    detailBodySpaced: { marginTop: 12 },
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
    faqAnswer: {
      color: token.text2,
      fontSize: 15,
      lineHeight: 23,
      marginTop: 7,
    },
    faqCard: {
      backgroundColor: token.surface1,
      borderColor: token.hairline,
      borderRadius: 18,
      borderWidth: 1,
      marginTop: 14,
      padding: 16,
    },
    faqQuestion: { color: token.text1, fontSize: 17, fontWeight: "800" },
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
    eventKicker: { fontSize: 12, fontWeight: "800", letterSpacing: 1.1 },
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
      fontSize: 12,
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
    proofAttribution: {
      color: token.text2,
      fontSize: 13,
      fontWeight: "700",
      marginTop: 12,
    },
    proofCard: {
      backgroundColor: token.surface1,
      borderColor: token.hairline,
      borderRadius: 20,
      borderWidth: 1,
      marginTop: 14,
      padding: 18,
    },
    proofQuote: {
      color: token.text1,
      fontSize: 18,
      lineHeight: 27,
      marginTop: 7,
    },
    proofRating: { fontSize: 15, letterSpacing: 2 },
    storyStep: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 13,
      marginTop: 18,
    },
    storyStepCopy: {
      color: token.text1,
      flex: 1,
      fontSize: 17,
      lineHeight: 25,
    },
    storyStepNumber: {
      alignItems: "center",
      borderRadius: 17,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    storyStepNumberText: { fontSize: 14, fontWeight: "900" },
    validityText: {
      color: token.text1,
      fontSize: 14,
      fontWeight: "800",
      marginTop: 12,
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
      alignItems: "flex-start",
      borderRadius: 18,
      flexDirection: "row",
      gap: 14,
      marginTop: 18,
      paddingHorizontal: 18,
      paddingVertical: 17,
    },
    membershipAddHeading: {
      alignItems: "baseline",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    membershipAddBody: {
      color: token.text2,
      fontSize: 13,
      lineHeight: 18,
      marginTop: 5,
    },
    membershipAddPrice: {
      color: token.text1,
      fontSize: 14,
      fontWeight: "900",
    },
    membershipAddTitle: {
      color: token.text1,
      fontSize: 16,
      fontWeight: "800",
    },
    billingChoice: { gap: 9, marginTop: 18 },
    billingChoiceRow: { flexDirection: "row", gap: 9 },
    billingChoiceCard: {
      backgroundColor: token.surface1,
      borderColor: token.hairline,
      borderRadius: 17,
      borderWidth: 1.5,
      flex: 1,
      minHeight: 112,
      padding: 14,
    },
    billingChoiceHeading: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 7,
    },
    billingChoiceTitle: {
      color: token.text1,
      fontSize: 14,
      fontWeight: "800",
    },
    billingChoicePrice: {
      color: token.text1,
      fontSize: 17,
      fontWeight: "900",
      marginTop: 9,
    },
    billingChoiceNote: {
      color: token.text2,
      fontSize: 12,
      lineHeight: 15,
      marginTop: 6,
    },
    savingsBadge: {
      borderRadius: 999,
      paddingHorizontal: 7,
      paddingVertical: 4,
    },
    savingsBadgeText: { fontSize: 12, fontWeight: "900" },
    promoField: { gap: 8, marginTop: 18 },
    promoInput: {
      backgroundColor: token.surface1,
      borderColor: token.hairline,
      borderRadius: 15,
      borderWidth: 1,
      color: token.text1,
      fontSize: 15,
      fontWeight: "700",
      letterSpacing: 1,
      minHeight: 52,
      paddingHorizontal: 15,
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
    productCardType: { fontSize: 12, fontWeight: "800", letterSpacing: 1 },
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
    productKicker: { fontSize: 12, fontWeight: "800", letterSpacing: 1.1 },
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
    waiverAcknowledgement: {
      alignItems: "flex-start",
      flexDirection: "row",
      gap: 10,
      marginTop: 14,
    },
    waiverAcknowledgementText: {
      color: token.text1,
      flex: 1,
      fontSize: 15,
      lineHeight: 21,
    },
    waiverIntro: {
      color: token.text2,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 18,
    },
    waiverNameGroup: { marginTop: 18 },
    waiverNameInput: {
      backgroundColor: token.surface1,
      borderColor: token.hairlineStrong,
      borderRadius: 10,
      borderWidth: 1,
      color: token.text1,
      fontSize: 16,
      marginTop: 7,
      minHeight: 46,
      paddingHorizontal: 12,
    },
    waiverNameLabel: { color: token.text1, fontSize: 14, fontWeight: "700" },
    waiverPage: { padding: 20, paddingBottom: 42 },
    waiverStatus: {
      color: token.text2,
      fontSize: 13,
      fontWeight: "700",
      lineHeight: 19,
      marginTop: 18,
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
