import { defaultEventMedia, type EventSummary } from "@duna/core";
import type { DiscoveryMapItem } from "@duna/api";
import { demoEvents, demoPeople } from "@duna/core/demo";
import * as Location from "expo-location";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { dunaWebUrl } from "../../../mobile-api";
import { usePlayerRuntime } from "../../../runtime";
import { DiscoveryMapModal, DiscoveryMapPreview } from "../../../discovery-map";
import type { DiscoveryMapFilter } from "../../../discovery-filters";
import { DiscoverySearchFlow } from "../../../discovery-search-flow";
import {
  discoveryResultSummary,
  discoveryWhatLabel,
  discoveryWhenLabel,
  type DiscoveryCoordinates,
  type DiscoverySearchResult,
} from "../../../discovery-search";
import { SatoshiText as Text } from "../../../satoshi-text";
import type { MobileCoach } from "../coaches/coach-format";
import { discoveryDistance } from "./discovery-distance";
import type { ThemeName } from "../../shared/palette";
import { VenueBookingModal } from "../courts/VenueBookingModal";
import { selectionHaptic } from "../../shared/haptics";
import { AppHeader } from "../../app/AppHeader";
import { CoachCard } from "../coaches/CoachCard";
import { CoachProfileModal } from "../coaches/CoachProfileModal";
import { MemberOrganizationCard } from "../clubs/MemberOrganizationCard";
import type { DiscoverIntentKind } from "./discover-intent";
import { SectionHeader } from "../../shared/SectionHeader";
import { EventCard } from "../events/EventCard";
import { ProTourBrandMark } from "../pro-tour/ProTourBrandMark";
import { ProTourModal } from "../pro-tour/ProTourModal";
import { FollowPlayerCard } from "./FollowPlayerCard";
import { styles } from "../../legacy/styles";

export function DiscoverScreen({
  intent,
  onBook,
  onCreateMatch,
  onOpenExternalEvent,
  onOpenEvent,
  onOrganization,
}: {
  readonly intent?: {
    readonly key: number;
    readonly kind: DiscoverIntentKind;
  };
  readonly onBook: (eventIndex: number) => void;
  readonly onCreateMatch: () => void;
  readonly onOpenExternalEvent: (event: EventSummary) => void;
  readonly onOpenEvent: (eventIndex: number) => void;
  readonly onOrganization: (slug: string) => void;
}) {
  const theme: ThemeName = "light";
  const [filter, setFilter] = useState("For you");
  const [bookingVenueId, setBookingVenueId] = useState<string>();
  const [selectedCoach, setSelectedCoach] = useState<MobileCoach>();
  const [showProTour, setShowProTour] = useState(false);
  const [showDiscoveryMap, setShowDiscoveryMap] = useState(false);
  const [discoveryMapInitialFilter, setDiscoveryMapInitialFilter] =
    useState<DiscoveryMapFilter>("all");
  const [showDiscoverySearch, setShowDiscoverySearch] = useState(false);
  const [showSearchedMap, setShowSearchedMap] = useState(false);
  const [discoverySearchResult, setDiscoverySearchResult] =
    useState<DiscoverySearchResult>();
  const [discoverLocation, setDiscoverLocation] =
    useState<DiscoveryCoordinates>();
  const [selectedProTourSlug, setSelectedProTourSlug] = useState<string>();
  const {
    coaches,
    dashboard,
    discoveryMap,
    organizationWallets,
    people,
    proCoverage,
    publicClient,
    settings,
    venues,
  } = usePlayerRuntime();
  const events = dashboard?.events ?? demoEvents;
  useEffect(() => {
    if (!intent) return;
    setShowDiscoverySearch(false);
    if (intent.kind === "search") {
      setShowDiscoverySearch(true);
      return;
    }
    if (intent.kind === "watch-pros") {
      setShowProTour(true);
      return;
    }
    if (intent.kind === "find-match") {
      setFilter("Open play");
      setDiscoveryMapInitialFilter("match");
      setShowSearchedMap(false);
      setShowDiscoveryMap(true);
      return;
    }
    if (intent.kind === "join-event") {
      setFilter("Events");
      setDiscoveryMapInitialFilter("event");
      setShowSearchedMap(false);
      setShowDiscoveryMap(true);
      return;
    }
    setFilter("For you");
    setDiscoveryMapInitialFilter("venue");
    setShowSearchedMap(false);
    setShowDiscoveryMap(true);
  }, [intent]);
  useEffect(() => {
    let mounted = true;
    const loadLocation = async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return;
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (mounted) {
        setDiscoverLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      }
    };
    void loadLocation().catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);
  const discoverPlayers = (people ?? demoPeople)
    .filter((player) => player.id !== dashboard?.player.id)
    .sort(
      (left, right) =>
        Number(Boolean(right.isProfessional)) -
        Number(Boolean(left.isProfessional)),
    )
    .slice(0, 8);
  const homeOrganization =
    organizationWallets?.find(
      (organization) =>
        organization.membershipStatus === "active" &&
        organization.status === "active",
    ) ??
    organizationWallets?.find(
      (organization) => organization.status === "active",
    ) ??
    organizationWallets?.[0];
  const isHomeOrganizationEvent = (event: (typeof events)[number]) =>
    Boolean(
      homeOrganization &&
      (event.organizationId === homeOrganization.organizationId ||
        event.organizationSlug === homeOrganization.organizationSlug),
    );
  const discoverableEvents = useMemo(
    () =>
      events.filter((event) => {
        const timestamp = Date.parse(event.endsAt);
        return Number.isNaN(timestamp) || timestamp >= Date.now();
      }),
    [events],
  );
  const filteredEvents = discoverableEvents
    .filter((event) => {
      if (filter === "Today") {
        return (
          new Date(event.startsAt).toDateString() === new Date().toDateString()
        );
      }
      if (filter === "Events") return true;
      if (filter === "Tournaments") return event.kind === "tournament";
      if (filter === "Training") {
        return ["clinic", "private-lesson"].includes(event.kind);
      }
      if (filter === "Open play") {
        return ["open-play", "pickup"].includes(event.kind);
      }
      if (filter === "Free") return event.price.amountMinor === 0;
      return true;
    })
    .sort(
      (left, right) =>
        Number(isHomeOrganizationEvent(right)) -
        Number(isHomeOrganizationEvent(left)),
    );
  const homeEvents = filteredEvents.filter(isHomeOrganizationEvent);
  const matchingCoaches = [...(coaches ?? [])].sort(
    (left, right) =>
      Number(right.organizationId === homeOrganization?.organizationId) -
      Number(left.organizationId === homeOrganization?.organizationId),
  );
  const homeCoaches = matchingCoaches.filter(
    (coach) => coach.organizationId === homeOrganization?.organizationId,
  );
  const networkCoaches = homeOrganization
    ? matchingCoaches.filter(
        (coach) => coach.organizationId !== homeOrganization.organizationId,
      )
    : matchingCoaches;
  const resultCount = filteredEvents.length;
  const discoveryItems = useMemo<readonly DiscoveryMapItem[]>(() => {
    if (discoveryMap?.items.length) return discoveryMap.items;
    const venueItems: DiscoveryMapItem[] = (venues ?? []).map((venue) => ({
      id: `venue:${venue.id}`,
      entityType: "venue",
      kind: "court-booking",
      title: venue.name,
      subtitle: `${venue.city}, ${venue.region}`,
      href: `/app/venues/${venue.id}`,
      latitude: venue.latitude,
      longitude: venue.longitude,
      organizationId: venue.organizationId,
      imageUrl: venue.imageUrl,
      openNow: venue.openNow,
      courtCount: venue.courtCount,
      tags: ["venue", "courts", venue.city, venue.region, ...venue.tags],
    }));
    const eventItems: DiscoveryMapItem[] = discoverableEvents.map((event) => {
      const venue = (venues ?? []).find(
        (candidate) =>
          candidate.organizationId === event.organizationId ||
          candidate.name === event.venueName,
      );
      const cover = event.media?.[0];
      const fallbackImageUrl = `${dunaWebUrl}${
        defaultEventMedia(event.kind, event.id).path
      }`;
      return {
        id: `event:${event.id}`,
        entityType: "event",
        kind: event.kind,
        title: event.title,
        subtitle: event.venueName,
        href: `/events/${event.slug}`,
        latitude: event.location?.latitude ?? venue?.latitude,
        longitude: event.location?.longitude ?? venue?.longitude,
        organizationId: event.organizationId,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        imageUrl:
          cover?.kind === "video"
            ? (cover.posterUrl ?? event.imageUrl ?? fallbackImageUrl)
            : (cover?.url ?? event.imageUrl ?? fallbackImageUrl),
        videoUrl: cover?.kind === "video" ? cover.url : undefined,
        live: event.live,
        spotsRemaining: event.spotsRemaining,
        level: event.ratingRange
          ? `${event.ratingRange[0]}–${event.ratingRange[1]}`
          : undefined,
        price: event.price,
        tags: [
          event.kind,
          event.organizationName,
          event.venueName,
          ...event.tags,
        ],
      };
    });
    const coachItems: DiscoveryMapItem[] = (coaches ?? []).map((coach) => {
      const venue = (venues ?? []).find(
        (candidate) => candidate.organizationId === coach.organizationId,
      );
      return {
        id: `coach:${coach.organizationId}:${coach.personId}`,
        entityType: "coach",
        kind: "coach",
        title: coach.displayName,
        subtitle: coach.homeMarket ?? coach.organizationName,
        href: `/coaches/${coach.handle}?organization=${coach.organizationSlug}`,
        latitude: venue?.latitude,
        longitude: venue?.longitude,
        organizationId: coach.organizationId,
        imageUrl: coach.avatarUrl,
        tags: ["coach", coach.handle, coach.organizationName],
      };
    });
    const organizationItems = [
      ...new Map(
        (coaches ?? []).map((coach) => {
          const venue = (venues ?? []).find(
            (candidate) => candidate.organizationId === coach.organizationId,
          );
          return [
            coach.organizationId,
            {
              id: `organization:${coach.organizationId}:${coach.organizationSlug}`,
              entityType: "organization" as const,
              kind: "club",
              title: coach.organizationName,
              subtitle: coach.homeMarket ?? "Club, coaching, and events",
              href: `/clubs/${coach.organizationSlug}`,
              latitude: venue?.latitude,
              longitude: venue?.longitude,
              organizationId: coach.organizationId,
              imageUrl: coach.avatarUrl,
              tags: [
                "organization",
                "club",
                coach.organizationName,
                coach.organizationSlug,
                coach.homeMarket ?? "",
              ],
            } satisfies DiscoveryMapItem,
          ] as const;
        }),
      ).values(),
    ];
    const proItems = (proCoverage?.events ?? [])
      .map<DiscoveryMapItem>((event) => ({
        id: `pro-tour:${event.id}`,
        entityType: "pro-tour",
        kind: event.tour,
        title: event.name,
        subtitle: event.venueName ?? event.location ?? event.tour,
        href: `/events/${event.slug}`,
        latitude: event.venue?.latitude,
        longitude: event.venue?.longitude,
        startsAt: event.startsOn
          ? `${event.startsOn}T12:00:00.000Z`
          : undefined,
        endsAt: event.endsOn ? `${event.endsOn}T23:59:59.999Z` : undefined,
        imageUrl: event.poster?.url,
        imageFit: event.poster?.kind === "poster" ? "contain" : undefined,
        live: event.live,
        tags: ["pro tour", event.tour, event.source, event.location ?? ""],
      }))
      .filter((event) => {
        if (!event.endsAt) return true;
        const timestamp = Date.parse(event.endsAt);
        return Number.isNaN(timestamp) || timestamp >= Date.now();
      });
    const matchItems = (proCoverage?.matches ?? [])
      .filter(
        (match) => match.status === "live" || match.status === "scheduled",
      )
      .slice(0, 100)
      .map<DiscoveryMapItem>((match) => {
        const event = proCoverage?.events.find(
          (candidate) => candidate.externalEventId === match.externalEventId,
        );
        return {
          id: `match:${match.id}`,
          entityType: "match",
          kind: "match",
          title: `${match.teamA.label} vs ${match.teamB.label}`,
          subtitle: `${match.roundLabel ?? "Match"} · ${event?.name ?? match.tour ?? "Pro tour"}`,
          href:
            match.canonicalPath ??
            (event ? `/events/${event.slug}` : "/discover"),
          latitude: event?.venue?.latitude,
          longitude: event?.venue?.longitude,
          startsAt: match.scheduledAt ?? match.playedAt,
          imageUrl: event?.poster?.url,
          live: match.status === "live",
          tags: [
            "match",
            match.teamA.label,
            match.teamB.label,
            event?.name ?? "",
          ],
        };
      });
    return [
      ...organizationItems,
      ...venueItems,
      ...eventItems,
      ...coachItems,
      ...matchItems,
      ...proItems,
    ];
  }, [
    coaches,
    discoveryMap?.items,
    discoverableEvents,
    proCoverage?.events,
    proCoverage?.matches,
    venues,
  ]);
  const locationSortedDiscoveryItems = useMemo(
    () =>
      [...discoveryItems].sort(
        (left, right) =>
          discoveryDistance(discoverLocation, left) -
          discoveryDistance(discoverLocation, right),
      ),
    [discoverLocation, discoveryItems],
  );
  const visibleDiscoveryItems = locationSortedDiscoveryItems.filter((item) => {
    if (filter === "Today") {
      return Boolean(
        item.startsAt &&
        new Date(item.startsAt).toDateString() === new Date().toDateString(),
      );
    }
    if (filter === "Events") return item.entityType === "event";
    if (filter === "Tournaments") {
      return item.kind === "tournament" || item.entityType === "pro-tour";
    }
    if (filter === "Training") {
      return (
        item.entityType === "coach" ||
        ["clinic", "private-lesson"].includes(item.kind)
      );
    }
    if (filter === "Open play") {
      return ["open-play", "pickup"].includes(item.kind);
    }
    if (filter === "Free") return item.price?.amountMinor === 0;
    return true;
  });
  const tournamentEvents = filteredEvents
    .filter(
      (event) =>
        event.kind === "tournament" &&
        new Date(event.endsAt).getTime() >= new Date().setHours(0, 0, 0, 0),
    )
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
  const nearbyVenues = [...(venues ?? [])].sort(
    (left, right) =>
      discoveryDistance(discoverLocation, left) -
      discoveryDistance(discoverLocation, right),
  );
  const nearbyEvents = [...filteredEvents].sort((left, right) => {
    const leftItem = discoveryItems.find(
      (item) => item.id === `event:${left.id}`,
    );
    const rightItem = discoveryItems.find(
      (item) => item.id === `event:${right.id}`,
    );
    return (
      discoveryDistance(discoverLocation, leftItem ?? {}) -
      discoveryDistance(discoverLocation, rightItem ?? {})
    );
  });

  const openDiscoveryItem = (item: DiscoveryMapItem) => {
    selectionHaptic();
    setShowDiscoverySearch(false);
    if (item.entityType === "venue") {
      setBookingVenueId(item.id.replace(/^venue:/, ""));
      return;
    }
    if (item.entityType === "coach") {
      const coach = (coaches ?? []).find(
        (candidate) =>
          item.id === `coach:${candidate.organizationId}:${candidate.personId}`,
      );
      if (coach) {
        setSelectedCoach(coach);
        return;
      }
    }
    if (item.entityType === "organization") {
      const slug =
        item.href.match(/^\/clubs\/([^/?#]+)/)?.[1] ??
        item.id.split(":").at(-1);
      if (slug) {
        onOrganization(decodeURIComponent(slug));
        return;
      }
    }
    if (item.entityType === "match") {
      const slug = item.href.match(/^\/events\/([^/?#]+)/)?.[1];
      if (slug) {
        setSelectedProTourSlug(decodeURIComponent(slug));
        setShowProTour(true);
        return;
      }
    }
    if (item.entityType === "pro-tour") {
      const slug = item.href.match(/^\/events\/([^/?#]+)/)?.[1];
      if (slug) setSelectedProTourSlug(decodeURIComponent(slug));
      setShowProTour(true);
      return;
    }
    if (item.entityType === "event") {
      const eventId = item.id.replace(/^event:/, "");
      const eventIndex = events.findIndex((event) => event.id === eventId);
      if (eventIndex >= 0) {
        onOpenEvent(eventIndex);
        return;
      }
      const slug = item.href.match(/^\/events\/([^/?#]+)/)?.[1];
      if (slug && publicClient) {
        const decodedSlug = decodeURIComponent(slug);
        void publicClient.public.eventBySlug
          .query({ slug: decodedSlug })
          .then(onOpenExternalEvent)
          .catch(() =>
            WebBrowser.openBrowserAsync(
              `${dunaWebUrl}/events/${encodeURIComponent(decodedSlug)}`,
            ),
          );
        return;
      }
    }
    void WebBrowser.openBrowserAsync(`${dunaWebUrl}${item.href}`);
  };
  return (
    <>
      <ScrollView
        contentContainerStyle={styles.screenContent}
        showsVerticalScrollIndicator={false}
      >
        <AppHeader
          eyebrow={
            venues?.[0]
              ? `${venues[0].city.toUpperCase()} · ${venues[0].region.toUpperCase()}`
              : "SOUTH BAY · LOS ANGELES"
          }
        />
        <Text style={styles.displayTitle}>Find your game.</Text>
        <Pressable
          accessibilityLabel="Search by place, date, and type of play"
          accessibilityRole="button"
          onPress={() => {
            selectionHaptic();
            setShowDiscoverySearch(true);
          }}
          style={({ pressed }) => [
            styles.discoverSearchPrimary,
            pressed && styles.proMobilePressed,
          ]}
        >
          <View style={styles.discoverSearchIconWrap}>
            <Text style={styles.discoverSearchIcon}>⌕</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.discoverSearchEyebrow}>SEARCH</Text>
            <Text style={styles.discoverSearchTitle}>Where, when, what?</Text>
            <Text numberOfLines={1} style={styles.discoverSearchMeta}>
              {discoverySearchResult
                ? `${discoverySearchResult.criteria.location.label} · ${discoveryWhenLabel(
                    discoverySearchResult.criteria.when,
                  )} · ${discoveryWhatLabel(
                    discoverySearchResult.criteria.what,
                  )}`
                : `${discoverLocation ? "Near you" : "Anywhere"} · Flexible · For You`}
            </Text>
          </View>
          <Text style={styles.discoverSearchArrow}>→</Text>
        </Pressable>
        <MemberOrganizationCard />
        <Pressable
          onPress={() => {
            selectionHaptic();
            setShowProTour(true);
          }}
          style={styles.proTourEntry}
        >
          <View style={styles.flex}>
            <Text style={styles.proTourEntryEyebrow}>WATCH + FOLLOW</Text>
            <Text style={styles.proTourEntryTitle}>Pro Tour</Text>
            <Text style={styles.proTourEntryMeta}>
              Pools, real brackets, and predictions.
            </Text>
            <View style={styles.proTourEntryBrands}>
              <ProTourBrandMark compact source="fivb" />
              <ProTourBrandMark compact source="avp" />
              {proCoverage?.events.some((event) => event.live) ? (
                <Text style={styles.proTourEntryLive}>● LIVE</Text>
              ) : null}
            </View>
          </View>
          <Text style={styles.proTourEntryArrow}>›</Text>
        </Pressable>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.horizontalBleed}
        >
          <View style={styles.filterRow}>
            {[
              "For you",
              "Events",
              "Today",
              "Tournaments",
              "Training",
              "Open play",
              "Free",
            ].map((item) => (
              <Pressable
                key={item}
                onPress={() => setFilter(item)}
                style={[
                  styles.filterChip,
                  filter === item && styles.filterChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    filter === item && styles.filterTextActive,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        {discoverPlayers.length > 0 && (
          <>
            <SectionHeader
              eyebrow="PLAYERS TO FOLLOW"
              title="Their next point, on your Lock Screen."
              action={`${discoverPlayers.length} players`}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalBleed}
            >
              <View style={styles.playerFollowRow}>
                {discoverPlayers.map((player) => (
                  <FollowPlayerCard key={player.id} player={player} />
                ))}
              </View>
            </ScrollView>
          </>
        )}
        {homeCoaches.length > 0 && (
          <>
            <SectionHeader
              eyebrow="YOUR CLUB · COACHES"
              title="Start with people you know."
              action={`${homeCoaches.length} coaches`}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalBleed}
            >
              <View style={styles.coachCardRow}>
                {homeCoaches.map((coach) => (
                  <CoachCard
                    coach={coach}
                    key={coach.personId}
                    onPress={setSelectedCoach}
                    preferred
                  />
                ))}
              </View>
            </ScrollView>
          </>
        )}
        {homeEvents.length > 0 && (
          <>
            <SectionHeader
              eyebrow="YOUR CLUB · INCLUDED + PREFERRED"
              title="Your membership, first."
              action={`${homeEvents.length} events`}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalBleed}
            >
              {homeEvents.map((event) => (
                <EventCard
                  eventIndex={events.findIndex(
                    (candidate) => candidate.id === event.id,
                  )}
                  key={event.id}
                  onPress={onOpenEvent}
                />
              ))}
            </ScrollView>
          </>
        )}
        {venues && venues.length > 0 && (
          <>
            <SectionHeader
              eyebrow="LIVE COURT INVENTORY · NEARBY"
              title="Book a court."
              action={`${venues.length} venues`}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalBleed}
            >
              <View style={styles.bookingVenueRow}>
                {nearbyVenues.map((venue) => (
                  <Pressable
                    key={venue.id}
                    onPress={() => setBookingVenueId(venue.id)}
                    style={styles.bookingVenueCard}
                  >
                    <Text style={styles.bookingVenueEyebrow}>
                      {venue.city.toUpperCase()} · {venue.region.toUpperCase()}
                    </Text>
                    <Text
                      numberOfLines={2}
                      style={styles.bookingVenueCardTitle}
                    >
                      {venue.name}
                    </Text>
                    <Text style={styles.bookingVenueAction}>
                      See times <Text>→</Text>
                    </Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </>
        )}
        {tournamentEvents.length > 0 && (
          <>
            <SectionHeader
              action="View all"
              eyebrow="NEXT ON THE SAND"
              onAction={() => setShowDiscoverySearch(true)}
              title="Tournaments coming up."
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalBleed}
            >
              {tournamentEvents.map((event) => (
                <EventCard
                  eventIndex={events.findIndex(
                    (candidate) => candidate.id === event.id,
                  )}
                  key={event.id}
                  onPress={onOpenEvent}
                />
              ))}
            </ScrollView>
          </>
        )}
        <DiscoveryMapPreview
          items={visibleDiscoveryItems}
          onOpen={() => {
            setDiscoveryMapInitialFilter("all");
            setShowSearchedMap(false);
            setShowDiscoveryMap(true);
          }}
          theme={theme}
        />
        <SectionHeader
          action="View all"
          eyebrow={
            discoverLocation
              ? `${filter.toUpperCase()} · NEAREST TO YOU`
              : `${filter.toUpperCase()} · ${resultCount} RESULTS`
          }
          onAction={() => setShowDiscoverySearch(true)}
          title="Around you."
        />
        {nearbyEvents.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.horizontalBleed}
          >
            {nearbyEvents.map((event) => {
              const eventIndex = events.findIndex(
                (candidate) => candidate.id === event.id,
              );
              return (
                <EventCard
                  eventIndex={eventIndex}
                  key={event.id}
                  onPress={onOpenEvent}
                />
              );
            })}
          </ScrollView>
        ) : (
          <View style={styles.coachEmptyCard}>
            <Text style={styles.coachServiceTitle}>
              Nothing nearby matches yet.
            </Text>
            <Text style={styles.coachServiceBody}>
              Try a broader search or move the globe to explore a different
              market.
            </Text>
          </View>
        )}
        {networkCoaches.length > 0 && (
          <>
            <SectionHeader
              eyebrow="COACHES ACROSS DUNA"
              title="Find a different perspective."
              action={`${networkCoaches.length} coaches`}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.horizontalBleed}
            >
              <View style={styles.coachCardRow}>
                {networkCoaches.map((coach) => (
                  <CoachCard
                    coach={coach}
                    key={coach.personId}
                    onPress={setSelectedCoach}
                  />
                ))}
              </View>
            </ScrollView>
          </>
        )}
      </ScrollView>
      <DiscoveryMapModal
        initialFilter={discoveryMapInitialFilter}
        items={
          showSearchedMap && discoverySearchResult
            ? discoverySearchResult.items
            : locationSortedDiscoveryItems
        }
        onClose={() => setShowDiscoveryMap(false)}
        onCreateMatch={() => {
          setShowDiscoveryMap(false);
          onCreateMatch();
        }}
        onSearch={() => {
          setShowDiscoveryMap(false);
          setShowDiscoverySearch(true);
        }}
        onSelect={openDiscoveryItem}
        origin={
          showSearchedMap ? discoverySearchResult?.origin : discoverLocation
        }
        radiusMiles={
          showSearchedMap ? discoverySearchResult?.radiusMiles : undefined
        }
        resultSummary={
          showSearchedMap && discoverySearchResult
            ? discoveryResultSummary(discoverySearchResult)
            : undefined
        }
        searchLabel={
          showSearchedMap && discoverySearchResult
            ? `${discoverySearchResult.criteria.location.label} · ${discoveryWhenLabel(
                discoverySearchResult.criteria.when,
              )}`
            : "Search Duna"
        }
        measurementSystem={settings?.profile.measurementSystem ?? "imperial"}
        theme={theme}
        visible={showDiscoveryMap}
      />
      <DiscoverySearchFlow
        currentLocation={discoverLocation}
        initialCriteria={discoverySearchResult?.criteria}
        items={locationSortedDiscoveryItems}
        onClose={() => setShowDiscoverySearch(false)}
        onSubmit={(result) => {
          setDiscoverySearchResult(result);
          setShowDiscoverySearch(false);
          setShowSearchedMap(true);
          setDiscoveryMapInitialFilter("all");
          setShowDiscoveryMap(true);
        }}
        theme={theme}
        visible={showDiscoverySearch}
      />
      <VenueBookingModal
        onClose={() => setBookingVenueId(undefined)}
        onOpenMatch={(matchId, matchSlug) => {
          const eventIndex = events.findIndex((event) => event.id === matchId);
          setBookingVenueId(undefined);
          setTimeout(() => {
            if (eventIndex >= 0) {
              onBook(eventIndex);
              return;
            }
            void WebBrowser.openBrowserAsync(
              `${dunaWebUrl}/events/${encodeURIComponent(matchSlug)}`,
            );
          }, 280);
        }}
        venueId={bookingVenueId}
        visible={Boolean(bookingVenueId)}
      />
      <ProTourModal
        initialSlug={selectedProTourSlug}
        onClose={() => {
          setShowProTour(false);
          setSelectedProTourSlug(undefined);
        }}
        visible={showProTour}
      />
      <CoachProfileModal
        coach={selectedCoach}
        onClose={() => setSelectedCoach(undefined)}
        onOpenSession={(session) => {
          const index = events.findIndex((event) => event.id === session.id);
          if (index >= 0) {
            onOpenEvent(index);
            return;
          }
          void WebBrowser.openBrowserAsync(
            `${dunaWebUrl}/events/${encodeURIComponent(session.slug)}`,
          );
        }}
      />
    </>
  );
}
