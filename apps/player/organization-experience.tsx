import { nativeMapUrl } from "@duna/core";
import Mapbox from "@rnmapbox/maps";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import {
  Image,
  ImageBackground,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import type { DunaApiClient } from "./mobile-api";
import { dunaWebUrl } from "./mobile-api";
import { FellixText as Text } from "./fellix-text";
import { useMapboxToken } from "./discovery-map";
import { usePlayerRuntime } from "./runtime";

type Storefront = Awaited<
  ReturnType<DunaApiClient["public"]["organizationStorefront"]["query"]>
>;
type Coach = Awaited<
  ReturnType<DunaApiClient["public"]["coaches"]["query"]>
>[number];

function readableText(background: string) {
  const value = background.replace("#", "");
  if (value.length !== 6) return "#ffffff";
  const red = Number.parseInt(value.slice(0, 2), 16);
  const green = Number.parseInt(value.slice(2, 4), 16);
  const blue = Number.parseInt(value.slice(4, 6), 16);
  return red * 0.299 + green * 0.587 + blue * 0.114 > 160
    ? "#111719"
    : "#ffffff";
}

function catalogPrice(item: Storefront["catalog"][number]) {
  const price = item.variants.flatMap((variant) => variant.prices)[0];
  if (!price) return "Ask for details";
  if (price.creditAmount) return String(price.creditAmount) + " credits";
  if (price.amountMinor !== undefined && price.currency) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: price.currency,
    }).format(price.amountMinor / 100);
  }
  return "Included";
}

function OrganizationMap({
  latitude,
  longitude,
  name,
  onPrimary,
  primary,
}: {
  readonly latitude?: number;
  readonly longitude?: number;
  readonly name: string;
  readonly onPrimary: string;
  readonly primary: string;
}) {
  const token = useMapboxToken(
    latitude !== undefined && longitude !== undefined,
  );
  return (
    <View style={[styles.map, { backgroundColor: primary }]}>
      {token && latitude !== undefined && longitude !== undefined ? (
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
          token && styles.mapLabelOnMap,
          { backgroundColor: token ? "rgba(255,255,255,0.92)" : "transparent" },
        ]}
      >
        <Text style={[styles.mapMark, { color: token ? primary : onPrimary }]}>
          ⌖
        </Text>
        <Text
          style={[styles.mapText, { color: token ? "#111719" : onPrimary }]}
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
}: {
  readonly onClose: () => void;
  readonly onOpenCoach: (coach: Coach) => void;
  readonly onOpenEvent: (eventId: string) => void;
  readonly onOpenVenue: (venueId: string) => void;
  readonly slug?: string;
}) {
  const { dashboard, publicClient } = usePlayerRuntime();
  const [storefront, setStorefront] = useState<Storefront>();
  const [coaches, setCoaches] = useState<readonly Coach[]>([]);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!slug || !publicClient) return;
    let active = true;
    setLoading(true);
    setError(undefined);
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

  const events = useMemo(
    () =>
      (dashboard?.events ?? [])
        .filter(
          (event) =>
            event.organizationId === storefront?.organizationId ||
            event.organizationSlug === slug,
        )
        .sort((left, right) => left.startsAt.localeCompare(right.startsAt)),
    [dashboard?.events, slug, storefront?.organizationId],
  );
  const primary = storefront?.theme.palette.primary ?? "#203740";
  const onPrimary = readableText(primary);
  const hero =
    storefront?.theme.heroMediaType === "image"
      ? storefront.theme.heroMediaUrl
      : storefront?.theme.heroPosterUrl;
  const displayName =
    storefront?.theme.brandDisplayName ?? storefront?.name ?? "Organization";

  const shortcuts = storefront
    ? [
        storefront.venues.some((venue) => venue.courtCount > 0)
          ? {
              label: "Book a Court",
              action: () => {
                const venue = storefront.venues.find(
                  (candidate) => candidate.courtCount > 0,
                );
                if (venue) onOpenVenue(venue.id);
              },
            }
          : undefined,
        storefront.catalog.some(
          (item) =>
            item.subtype.includes("lesson") ||
            item.subtype.includes("coach") ||
            item.subtype.includes("training"),
        )
          ? {
              label: "Book a Lesson",
              action: () => {
                const coach = coaches[0];
                if (coach) onOpenCoach(coach);
              },
            }
          : undefined,
        events.some((event) => event.kind === "league")
          ? {
              label: "Join a League",
              action: () => {
                const event = events.find(
                  (candidate) => candidate.kind === "league",
                );
                if (event) onOpenEvent(event.id);
              },
            }
          : undefined,
        events.length
          ? {
              label: "Play an Event",
              action: () => {
                if (events[0]) onOpenEvent(events[0].id);
              },
            }
          : undefined,
        storefront.catalog.some((item) => item.type === "plan")
          ? {
              label: "Memberships",
              action: () =>
                void WebBrowser.openBrowserAsync(
                  dunaWebUrl + "/clubs/" + storefront.slug + "#memberships",
                ),
            }
          : undefined,
      ].filter(
        (
          shortcut,
        ): shortcut is {
          readonly label: string;
          readonly action: () => void;
        } => Boolean(shortcut),
      )
    : [];

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={Boolean(slug)}
    >
      <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>DUNA ORGANIZATION</Text>
            <Text numberOfLines={1} style={styles.headerTitle}>
              {displayName}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close organization"
            onPress={onClose}
            style={styles.close}
          >
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        {loading ? (
          <View style={styles.center}>
            <Text style={styles.centerTitle}>Opening their Duna…</Text>
          </View>
        ) : error || !storefront ? (
          <View style={styles.center}>
            <Text style={styles.centerTitle}>This page is not ready.</Text>
            <Text style={styles.centerBody}>{error}</Text>
          </View>
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
                  ? String(storefront.venues.length) +
                    " venue" +
                    (storefront.venues.length === 1 ? "" : "s")
                  : "COACHING + PLAY"}
              </Text>
              <Text style={[styles.heroTitle, { color: onPrimary }]}>
                {displayName}
              </Text>
              <Text style={[styles.heroBody, { color: onPrimary }]}>
                {storefront.theme.tagline ??
                  storefront.theme.profileSummary ??
                  "Train, play, and stay connected with this Duna organization."}
              </Text>
            </ImageBackground>

            {shortcuts.length > 0 && (
              <ScrollView
                contentContainerStyle={styles.shortcuts}
                horizontal
                showsHorizontalScrollIndicator={false}
              >
                {shortcuts.map((shortcut) => (
                  <Pressable
                    key={shortcut.label}
                    onPress={shortcut.action}
                    style={[styles.shortcut, { borderColor: primary }]}
                  >
                    <Text style={[styles.shortcutText, { color: primary }]}>
                      {shortcut.label}
                    </Text>
                    <Text style={[styles.shortcutArrow, { color: primary }]}>
                      →
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            )}

            {coaches.length > 0 && (
              <>
                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionEyebrow}>THE TEAM</Text>
                  <Text style={styles.sectionTitle}>Meet the coaches.</Text>
                </View>
                <ScrollView
                  contentContainerStyle={styles.rail}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  {coaches.map((coach) => (
                    <Pressable
                      key={coach.personId}
                      onPress={() => onOpenCoach(coach)}
                      style={styles.coach}
                    >
                      {coach.avatarUrl ? (
                        <Image
                          source={{ uri: coach.avatarUrl }}
                          style={styles.coachPhoto}
                        />
                      ) : (
                        <View
                          style={[
                            styles.coachPhotoFallback,
                            { backgroundColor: primary },
                          ]}
                        >
                          <Text
                            style={[styles.coachInitials, { color: onPrimary }]}
                          >
                            {coach.displayName
                              .split(/\s+/)
                              .slice(0, 2)
                              .map((part) => part[0])
                              .join("")}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.coachName}>{coach.displayName}</Text>
                      <Text numberOfLines={2} style={styles.coachMeta}>
                        {coach.homeMarket ?? "Coach"} · {coach.services.length}{" "}
                        services
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            {storefront.venues.length > 0 && (
              <>
                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionEyebrow}>VENUES</Text>
                  <Text style={styles.sectionTitle}>Where you play.</Text>
                </View>
                <View style={styles.stack}>
                  {storefront.venues.map((venue) => (
                    <Pressable
                      key={venue.id}
                      onPress={() => onOpenVenue(venue.id)}
                      style={styles.venue}
                    >
                      {venue.imageUrl ? (
                        <Image
                          source={{ uri: venue.imageUrl }}
                          style={styles.venuePhoto}
                        />
                      ) : (
                        <View
                          style={[
                            styles.venuePhotoFallback,
                            { backgroundColor: storefront.theme.palette.sand },
                          ]}
                        >
                          <Text style={styles.venuePhotoText}>▦</Text>
                        </View>
                      )}
                      <View style={styles.flex}>
                        <Text style={styles.venueName}>{venue.name}</Text>
                        <Text style={styles.venueMeta}>
                          {[venue.locality, venue.administrativeArea]
                            .filter(Boolean)
                            .join(", ")}
                          {venue.courtCount
                            ? " · " + venue.courtCount + " courts"
                            : ""}
                        </Text>
                        {venue.amenities.length ? (
                          <Text numberOfLines={1} style={styles.venueAmenities}>
                            {venue.amenities.slice(0, 4).join(" · ")}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.arrow}>›</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {events.length > 0 && (
              <>
                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionEyebrow}>UPCOMING</Text>
                  <Text style={styles.sectionTitle}>Play with them.</Text>
                </View>
                <View style={styles.stack}>
                  {events.slice(0, 6).map((event) => (
                    <Pressable
                      key={event.id}
                      onPress={() => onOpenEvent(event.id)}
                      style={styles.event}
                    >
                      <View style={styles.eventDate}>
                        <Text style={styles.eventMonth}>
                          {new Date(event.startsAt)
                            .toLocaleDateString("en-US", { month: "short" })
                            .toUpperCase()}
                        </Text>
                        <Text style={styles.eventDay}>
                          {new Date(event.startsAt).getDate()}
                        </Text>
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.eventName}>{event.title}</Text>
                        <Text style={styles.eventMeta}>
                          {event.kind.replaceAll("-", " ")} · {event.venueName}
                        </Text>
                      </View>
                      <Text style={styles.arrow}>›</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}

            {storefront.catalog.length > 0 && (
              <>
                <View style={styles.sectionHeading}>
                  <Text style={styles.sectionEyebrow}>
                    MEMBERSHIPS + SERVICES
                  </Text>
                  <Text style={styles.sectionTitle}>Ways to join in.</Text>
                </View>
                <ScrollView
                  contentContainerStyle={styles.rail}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                >
                  {storefront.catalog.slice(0, 10).map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() =>
                        void WebBrowser.openBrowserAsync(
                          dunaWebUrl +
                            "/clubs/" +
                            storefront.slug +
                            "/products/" +
                            item.slug,
                        )
                      }
                      style={styles.product}
                    >
                      <Text style={styles.productType}>
                        {item.subtype.replaceAll("-", " ").toUpperCase()}
                      </Text>
                      <Text numberOfLines={2} style={styles.productTitle}>
                        {item.title}
                      </Text>
                      <Text numberOfLines={3} style={styles.productBody}>
                        {item.shortSummary ??
                          item.description ??
                          "View details and availability."}
                      </Text>
                      <Text style={[styles.productPrice, { color: primary }]}>
                        {catalogPrice(item)} →
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </>
            )}

            <View style={styles.sectionHeading}>
              <Text style={styles.sectionEyebrow}>CONTACT + LOCATION</Text>
              <Text style={styles.sectionTitle}>Get there. Get in touch.</Text>
            </View>
            <View style={styles.contact}>
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
                      void Linking.openURL("mailto:" + storefront.contact.email)
                    }
                    style={styles.contactAction}
                  >
                    <Text style={styles.contactActionText}>Email</Text>
                  </Pressable>
                ) : null}
                {storefront.contact.phone ? (
                  <Pressable
                    onPress={() =>
                      void Linking.openURL("tel:" + storefront.contact.phone)
                    }
                    style={styles.contactAction}
                  >
                    <Text style={styles.contactActionText}>Call</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  arrow: { color: "#777166", fontSize: 25 },
  center: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 30,
  },
  centerBody: {
    color: "#777166",
    fontSize: 15,
    marginTop: 8,
    textAlign: "center",
  },
  centerTitle: { color: "#111719", fontSize: 23, fontWeight: "800" },
  close: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  closeText: { color: "#111719", fontSize: 30, lineHeight: 34 },
  coach: {
    backgroundColor: "#ffffff",
    borderColor: "#e0e1de",
    borderRadius: 20,
    borderWidth: 1,
    padding: 12,
    width: 180,
  },
  coachInitials: { fontSize: 24, fontWeight: "900" },
  coachMeta: { color: "#777166", fontSize: 13, lineHeight: 18, marginTop: 3 },
  coachName: {
    color: "#111719",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 10,
  },
  coachPhoto: { borderRadius: 16, height: 150, width: "100%" },
  coachPhotoFallback: {
    alignItems: "center",
    borderRadius: 16,
    height: 150,
    justifyContent: "center",
    width: "100%",
  },
  contact: {
    backgroundColor: "#ffffff",
    borderColor: "#e0e1de",
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 12,
    overflow: "hidden",
  },
  contactAction: {
    alignItems: "center",
    borderColor: "#203740",
    borderRadius: 13,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  contactActionText: { color: "#203740", fontSize: 13, fontWeight: "800" },
  contactActions: { flexDirection: "row", gap: 8, padding: 14 },
  contactAddress: {
    color: "#625d53",
    fontSize: 15,
    lineHeight: 22,
    padding: 14,
  },
  content: { paddingBottom: 54 },
  event: {
    alignItems: "center",
    borderBottomColor: "#ebe9e4",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 11,
    minHeight: 78,
    padding: 12,
  },
  eventDate: {
    alignItems: "center",
    backgroundColor: "#eee8d9",
    borderRadius: 13,
    paddingVertical: 8,
    width: 52,
  },
  eventDay: { color: "#111719", fontSize: 20, fontWeight: "900" },
  eventMeta: {
    color: "#777166",
    fontSize: 13,
    marginTop: 3,
    textTransform: "capitalize",
  },
  eventMonth: { color: "#203740", fontSize: 10, fontWeight: "900" },
  eventName: { color: "#111719", fontSize: 16, fontWeight: "800" },
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
    fontSize: 23,
    fontWeight: "800",
    marginTop: 3,
  },
  hero: {
    justifyContent: "flex-end",
    minHeight: 360,
    overflow: "hidden",
    padding: 22,
  },
  heroBody: { fontSize: 17, lineHeight: 24, marginTop: 9, maxWidth: 340 },
  heroEyebrow: { fontSize: 11, fontWeight: "900", letterSpacing: 1.3 },
  heroImage: { resizeMode: "cover" },
  heroShade: {
    backgroundColor: "rgba(0,0,0,0.28)",
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  heroTitle: {
    fontSize: 40,
    fontWeight: "900",
    letterSpacing: -1.4,
    lineHeight: 43,
    marginTop: 7,
  },
  logo: { height: 54, marginBottom: 24, width: 180 },
  map: { height: 190, justifyContent: "flex-end", overflow: "hidden" },
  mapLabel: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 16,
    flexDirection: "row",
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  mapLabelOnMap: {
    shadowColor: "#111719",
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 9,
  },
  mapMark: { fontSize: 36 },
  mapPin: {
    backgroundColor: "#ffffff",
    borderRadius: 11,
    borderWidth: 4,
    height: 22,
    width: 22,
  },
  mapText: { fontSize: 16, fontWeight: "800", marginTop: 6 },
  product: {
    backgroundColor: "#ffffff",
    borderColor: "#e0e1de",
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 190,
    padding: 15,
    width: 220,
  },
  productBody: { color: "#777166", fontSize: 14, lineHeight: 20, marginTop: 8 },
  productPrice: { fontSize: 14, fontWeight: "900", marginTop: "auto" },
  productTitle: {
    color: "#111719",
    fontSize: 19,
    fontWeight: "800",
    marginTop: 8,
  },
  productType: {
    color: "#777166",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  rail: { gap: 10, paddingHorizontal: 20 },
  safe: { backgroundColor: "#f7f5ef", flex: 1 },
  sectionEyebrow: {
    color: "#203740",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  sectionHeading: { marginTop: 34, paddingHorizontal: 20 },
  sectionTitle: {
    color: "#111719",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.7,
    marginTop: 4,
  },
  shortcut: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 15,
  },
  shortcutArrow: { fontSize: 18 },
  shortcutText: { fontSize: 14, fontWeight: "800" },
  shortcuts: { gap: 8, padding: 18 },
  stack: {
    backgroundColor: "#ffffff",
    borderColor: "#e0e1de",
    borderRadius: 20,
    borderWidth: 1,
    marginHorizontal: 20,
    marginTop: 12,
    overflow: "hidden",
  },
  venue: {
    alignItems: "center",
    borderBottomColor: "#ebe9e4",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 11,
    minHeight: 100,
    padding: 12,
  },
  venueAmenities: { color: "#8a857d", fontSize: 12, marginTop: 4 },
  venueMeta: { color: "#777166", fontSize: 13, marginTop: 3 },
  venueName: { color: "#111719", fontSize: 17, fontWeight: "800" },
  venuePhoto: { borderRadius: 13, height: 72, width: 78 },
  venuePhotoFallback: {
    alignItems: "center",
    borderRadius: 13,
    height: 72,
    justifyContent: "center",
    width: 78,
  },
  venuePhotoText: { color: "#203740", fontSize: 24 },
});
