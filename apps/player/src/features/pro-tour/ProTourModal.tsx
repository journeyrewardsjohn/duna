import { googleMapsSearchUrl, nativeMapUrl } from "@duna/core";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useMemo, useState } from "react";
import {
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { startDunaLiveActivity } from "../../../live-activities";
import { dunaWebUrl } from "../../../mobile-api";
import { usePlayerRuntime } from "../../../runtime";
import {
  proEventFeaturedMedia,
  proEventMediaUrl,
  proEventSections,
  searchProEvents,
  sortProEvents,
  type ProTourSection,
} from "../../../pro-tour";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "../../../satoshi-text";
import type {
  MobilePredictionMarket,
  MobilePredictionTarget,
} from "../predictions/prediction-types";
import { colors } from "../../shared/palette";
import type { ProEventDetail, ProMatch } from "./pro-tour-types";
import { displayError } from "../../shared/display-error";
import { selectionHaptic, successHaptic } from "../../shared/haptics";
import { rememberLiveActivityToken } from "../../shared/live-activity-token";
import {
  proTourSectionLabels,
  formatProEventDates,
  countryFlag,
} from "./pro-tour-format";
import { ProTourBrandMark } from "./ProTourBrandMark";
import { ProTourEventCard } from "./ProTourEventCard";
import { MobilePredictionMarketSheet } from "../predictions/MobilePredictionMarketSheet";
import { MobileTournamentMarkets } from "../predictions/MobileTournamentMarkets";
import { ProTourMatchCard } from "./ProTourMatchCard";
import { styles } from "../../legacy/styles";

function ProTourSectionTitle({
  eyebrow,
  title,
  trailing,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly trailing?: string;
}) {
  return (
    <View style={styles.proMobileSectionTitleRow}>
      <View style={styles.proMobileSectionTitleCopy}>
        <Text style={styles.proMobileSectionEyebrow}>{eyebrow}</Text>
        <Text style={styles.proMobileSectionTitle}>{title}</Text>
      </View>
      {trailing && <Text style={styles.proMobileSectionCount}>{trailing}</Text>}
    </View>
  );
}

export function ProTourModal({
  visible,
  onClose,
  initialSlug,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly initialSlug?: string;
}) {
  const { width } = useWindowDimensions();
  const { client, predictionWallet, publicClient, proCoverage, refresh } =
    usePlayerRuntime();
  const coverageClient = publicClient ?? client;
  const [selectedSlug, setSelectedSlug] = useState<string>();
  const [event, setEvent] = useState<ProEventDetail>();
  const [tournamentMarkets, setTournamentMarkets] = useState<
    readonly MobilePredictionMarket[]
  >([]);
  const [selectedMarket, setSelectedMarket] = useState<{
    readonly market: MobilePredictionMarket;
    readonly target: MobilePredictionTarget;
  }>();
  const [marketLoadingId, setMarketLoadingId] = useState<string>();
  const [activeSection, setActiveSection] =
    useState<ProTourSection>("overview");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [reloadKey, setReloadKey] = useState(0);
  const [posterFailed, setPosterFailed] = useState(false);
  const [followedMatchId, setFollowedMatchId] = useState<string>();
  const [followedEventIds, setFollowedEventIds] = useState<readonly string[]>(
    [],
  );
  const [followNotice, setFollowNotice] = useState<string>();
  const [copiedAddress, setCopiedAddress] = useState(false);
  const events = proCoverage?.events ?? [];
  const orderedEvents = useMemo(() => sortProEvents(events), [events]);
  const filteredEvents = useMemo(
    () => searchProEvents(orderedEvents, search),
    [orderedEvents, search],
  );
  const liveEvents = orderedEvents.filter((candidate) => candidate.live);
  const otherEvents = orderedEvents.filter((candidate) => !candidate.live);

  useEffect(() => {
    if (!visible) {
      setSelectedSlug(undefined);
      setEvent(undefined);
      setTournamentMarkets([]);
      setSelectedMarket(undefined);
      setMarketLoadingId(undefined);
      setActiveSection("overview");
      setSearch("");
      setError(undefined);
      setFollowNotice(undefined);
      setCopiedAddress(false);
    }
  }, [visible]);

  useEffect(() => {
    if (visible && initialSlug) setSelectedSlug(initialSlug);
  }, [initialSlug, visible]);

  useEffect(() => {
    if (!copiedAddress) return;
    const resetCopyState = setTimeout(() => setCopiedAddress(false), 2400);
    return () => clearTimeout(resetCopyState);
  }, [copiedAddress]);

  useEffect(() => {
    if (!visible || !selectedSlug) return;
    if (!coverageClient) {
      setLoading(false);
      setError("Live event data is unavailable. Please try again in a moment.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    setPosterFailed(false);
    void Promise.all([
      coverageClient.public.proEvent.query({ slug: selectedSlug }),
      coverageClient.public.proEventPredictionMarkets
        .query({ eventSlug: selectedSlug })
        .catch(() => []),
    ])
      .then(([nextEvent, nextMarkets]) => {
        if (cancelled) return;
        if (!nextEvent) {
          setError("This event is not available yet.");
          return;
        }
        setEvent(nextEvent);
        setTournamentMarkets(nextMarkets);
        setActiveSection("overview");
      })
      .catch((reason) => {
        if (!cancelled) setError(displayError(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [coverageClient, reloadKey, selectedSlug, visible]);

  useEffect(() => {
    if (!visible) return;
    void Promise.all([
      AsyncStorage.getItem("duna.followed-pro-match"),
      AsyncStorage.getItem("duna.followed-pro-events"),
    ]).then(([matchId, eventIds]) => {
      setFollowedMatchId(matchId ?? undefined);
      try {
        const parsed = eventIds ? (JSON.parse(eventIds) as unknown) : [];
        setFollowedEventIds(
          Array.isArray(parsed)
            ? parsed.filter(
                (value): value is string => typeof value === "string",
              )
            : [],
        );
      } catch {
        setFollowedEventIds([]);
      }
    });
  }, [visible]);

  useEffect(() => {
    if (!client || !event?.id) return;
    let active = true;
    void client.player.professionalEventFollowState
      .query({ eventId: event.id })
      .then((state) => {
        if (!active || !state.available) return;
        setFollowedEventIds((current) =>
          state.following
            ? [...new Set([...current, event.id])]
            : current.filter((eventId) => eventId !== event.id),
        );
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, event?.id]);

  const openEvent = (slug: string) => {
    selectionHaptic();
    setEvent(undefined);
    setTournamentMarkets([]);
    setSelectedMarket(undefined);
    setError(undefined);
    setFollowNotice(undefined);
    setCopiedAddress(false);
    setSelectedSlug(slug);
  };

  const backToEvents = () => {
    selectionHaptic();
    setSelectedSlug(undefined);
    setEvent(undefined);
    setTournamentMarkets([]);
    setSelectedMarket(undefined);
    setError(undefined);
    setActiveSection("overview");
    setCopiedAddress(false);
  };

  const handleClose = () => {
    setSelectedSlug(undefined);
    setEvent(undefined);
    setTournamentMarkets([]);
    setSelectedMarket(undefined);
    setSearch("");
    onClose();
  };

  const openMatchMarket = async (match: ProMatch) => {
    if (!coverageClient || !event || marketLoadingId) return;
    selectionHaptic();
    setMarketLoadingId(match.id);
    setFollowNotice("Opening the crowd market…");
    try {
      const market = await coverageClient.public.proMatchPredictionMarket.query(
        {
          eventSlug: event.slug,
          matchId: match.id,
        },
      );
      setSelectedMarket({
        market,
        target: {
          kind: "pro-match",
          eventSlug: event.slug,
          matchId: match.id,
        },
      });
      setFollowNotice(undefined);
    } catch (reason) {
      setFollowNotice(displayError(reason));
    } finally {
      setMarketLoadingId(undefined);
    }
  };

  const openTournamentMarket = (
    market: MobilePredictionMarket,
    externalTeamId: string,
  ) => {
    if (!event) return;
    selectionHaptic();
    setSelectedMarket({
      market,
      target: {
        kind: "pro-event-team",
        eventSlug: event.slug,
        externalTeamId,
      },
    });
  };

  const followMatch = async (match: ProMatch) => {
    const latestSet = match.sets.at(-1);
    await startDunaLiveActivity(
      {
        subjectId: match.id,
        kind: "match",
        title: event?.name ?? "Beach Pro Tour",
        subtitle: event?.location ?? "Live on Duna",
        status:
          match.status === "live"
            ? "Live"
            : match.status === "completed"
              ? "Final"
              : "Upcoming",
        teamA: match.teamA.label,
        teamB: match.teamB.label,
        scoreA: latestSet?.a ?? 0,
        scoreB: latestSet?.b ?? 0,
        setLabel: `Set ${Math.max(match.sets.length, 1)}`,
      },
      {
        onPushToken: (token) => {
          void rememberLiveActivityToken(token, client).catch(() => undefined);
        },
      },
    );
    await AsyncStorage.setItem("duna.followed-pro-match", match.id);
    setFollowedMatchId(match.id);
    setFollowNotice(
      match.status === "live"
        ? "Live updates are on your Lock Screen."
        : "You’ll have this match ready on your Lock Screen.",
    );
    successHaptic();
  };

  const followEvent = async () => {
    if (!event) return;
    if (client) {
      await client.player.setProfessionalEventFollow.mutate({
        eventId: event.id,
        following: true,
      });
    }
    const featured =
      event.matches.find((match) => match.status === "live") ??
      event.matches.find((match) => match.status === "scheduled") ??
      event.matches.at(-1);
    const latestSet = featured?.sets.at(-1);
    await startDunaLiveActivity(
      {
        subjectId: event.id,
        kind: "event",
        title: event.name,
        subtitle: event.location ?? "Beach Pro Tour",
        status: event.live ? "Live" : "Following",
        teamA: featured?.teamA.label,
        teamB: featured?.teamB.label,
        scoreA: latestSet?.a ?? 0,
        scoreB: latestSet?.b ?? 0,
        setLabel: featured
          ? `Set ${Math.max(featured.sets.length, 1)}`
          : `${event.matches.length} matches`,
        liveMatchCount: event.matches.filter((match) => match.status === "live")
          .length,
      },
      {
        onPushToken: (token) => {
          void rememberLiveActivityToken(token, client).catch(() => undefined);
        },
      },
    );
    const next = [...new Set([...followedEventIds, event.id])];
    await AsyncStorage.setItem(
      "duna.followed-pro-events",
      JSON.stringify(next),
    );
    setFollowedEventIds(next);
    setFollowNotice(
      Platform.OS === "ios"
        ? "Event scores are now live on your Lock Screen."
        : "You’re following this event. Live scores will stay ready in Discover.",
    );
    successHaptic();
  };

  const followAction = (match: ProMatch) =>
    Platform.OS === "ios" && match.status !== "completed"
      ? () => {
          selectionHaptic();
          void followMatch(match).catch((reason) =>
            setFollowNotice(displayError(reason)),
          );
        }
      : undefined;

  if (!visible) return null;

  const selectedSummary = selectedSlug
    ? events.find((candidate) => candidate.slug === selectedSlug)
    : undefined;
  const sections = event ? proEventSections(event) : (["overview"] as const);
  const featuredMedia = event ? proEventFeaturedMedia(event) : undefined;
  const posterUrl = event ? proEventMediaUrl(event) : undefined;
  const posterIsPortrait = featuredMedia?.kind === "poster";
  const heroHeight = posterIsPortrait
    ? Math.min(390, Math.max(300, width * 0.96))
    : Math.min(310, Math.max(250, width * 0.72));
  const liveMatches =
    event?.matches.filter((match) => match.status === "live") ?? [];
  const completedMatches =
    event?.matches.filter((match) => match.status === "completed").length ?? 0;
  const venueAddress = event
    ? (event.editorial.venue?.formattedAddress ??
      event.editorial.venueAddress ??
      [
        event.editorial.venue?.addressLine1,
        event.editorial.venue?.addressLine2,
        event.editorial.venue?.locality,
        event.editorial.venue?.administrativeArea,
        event.editorial.venue?.postalCode,
        event.editorial.venue?.countryCode,
      ]
        .filter(Boolean)
        .join(", "))
    : undefined;
  const venueName = event
    ? (event.editorial.venueName ?? event.location ?? venueAddress)
    : undefined;
  const venueMapHref =
    event && venueAddress
      ? googleMapsSearchUrl({
          address: venueAddress,
          googlePlaceId: event.editorial.venue?.googlePlaceId,
        })
      : undefined;
  const venueMapImageUrl =
    event && venueAddress
      ? `${dunaWebUrl}/api/places/map?${
          event.editorial.venue?.latitude !== undefined &&
          event.editorial.venue.longitude !== undefined
            ? `latitude=${encodeURIComponent(String(event.editorial.venue.latitude))}&longitude=${encodeURIComponent(String(event.editorial.venue.longitude))}`
            : `address=${encodeURIComponent(venueAddress)}`
        }`
      : undefined;
  const watchOptions = event
    ? [
        ...event.watchOptions,
        ...event.matches.flatMap((match) => match.watchOptions),
      ].filter(
        (option, index, options) =>
          options.findIndex((candidate) => candidate.id === option.id) ===
          index,
      )
    : [];

  const renderEmpty = (title: string, body: string) => (
    <View style={styles.proMobileEmptyCard}>
      <Text style={styles.proMobileEmptyIcon}>◌</Text>
      <Text style={styles.proMobileEmptyTitle}>{title}</Text>
      <Text style={styles.proMobileEmptyBody}>{body}</Text>
    </View>
  );

  const openVenueMap = async () => {
    if (!event || !venueAddress || !venueMapHref) return;
    const platform =
      Platform.OS === "ios"
        ? "ios"
        : Platform.OS === "android"
          ? "android"
          : "web";
    const destination = nativeMapUrl({
      address: venueAddress,
      label: venueName,
      latitude: event.editorial.venue?.latitude,
      longitude: event.editorial.venue?.longitude,
      platform,
    });
    try {
      if (platform === "web") {
        await WebBrowser.openBrowserAsync(venueMapHref);
      } else {
        await Linking.openURL(destination);
      }
    } catch {
      await WebBrowser.openBrowserAsync(venueMapHref);
    }
  };

  const copyVenueAddress = async () => {
    if (!venueAddress) return;
    await Clipboard.setStringAsync(venueAddress);
    setCopiedAddress(true);
    successHaptic();
  };

  const renderOverview = () => {
    if (!event) return null;
    return (
      <>
        {liveMatches.length > 0 && (
          <>
            <ProTourSectionTitle
              eyebrow="UPDATING LIVE"
              title="On court now"
              trailing={`${liveMatches.length}`}
            />
            <View style={styles.proMobileCardStack}>
              {liveMatches.slice(0, 3).map((match) => (
                <ProTourMatchCard
                  followed={followedMatchId === match.id}
                  key={match.id}
                  match={match}
                  onFollow={followAction(match)}
                  onOpen={() => void openMatchMarket(match)}
                />
              ))}
            </View>
          </>
        )}

        <View style={styles.proMobileStatGrid}>
          <View style={styles.proMobileStatCard}>
            <Text style={styles.proMobileStatValue}>{event.teamCount}</Text>
            <Text style={styles.proMobileStatLabel}>Teams</Text>
          </View>
          <View style={styles.proMobileStatCard}>
            <Text style={styles.proMobileStatValue}>
              {completedMatches}/{event.matchCount}
            </Text>
            <Text style={styles.proMobileStatLabel}>Matches</Text>
          </View>
          <View style={styles.proMobileStatCard}>
            <Text style={styles.proMobileStatValue}>
              {event.bracket.length || event.pools.length || "—"}
            </Text>
            <Text style={styles.proMobileStatLabel}>
              {event.bracket.length ? "Rounds" : "Pools"}
            </Text>
          </View>
        </View>

        {event.editorial.summary && (
          <View style={styles.proMobileInfoCard}>
            <Text style={styles.proMobileInfoEyebrow}>EVENT OVERVIEW</Text>
            <Text style={styles.proMobileSummary}>
              {event.editorial.summary}
            </Text>
          </View>
        )}

        <MobileTournamentMarkets
          event={event}
          markets={tournamentMarkets}
          onOpen={openTournamentMarket}
        />

        {venueName && venueAddress && venueMapHref && (
          <View style={styles.proMobileLocationCard}>
            <Pressable
              accessibilityHint="Opens this location in your maps app"
              accessibilityLabel={`Open map for ${venueName}`}
              accessibilityRole="button"
              onPress={() => void openVenueMap()}
              style={({ pressed }) => [
                styles.proMobileLocationMap,
                pressed && styles.proMobileLocationMapPressed,
              ]}
            >
              {venueMapImageUrl && (
                <Image
                  accessibilityIgnoresInvertColors
                  source={{ uri: venueMapImageUrl }}
                  style={styles.proMobileLocationMapImage}
                />
              )}
              <View style={styles.proMobileLocationMapLabel}>
                <Text style={styles.proMobileLocationMapLabelText}>
                  OPEN MAP ↗
                </Text>
              </View>
            </Pressable>
            <View style={styles.proMobileLocationDetails}>
              <Text style={styles.proMobileInfoEyebrow}>EVENT LOCATION</Text>
              <Text style={styles.proMobileInfoTitle}>{venueName}</Text>
              <Pressable
                accessibilityHint="Opens this address in your maps app"
                accessibilityLabel={`Open ${venueAddress} in maps`}
                accessibilityRole="link"
                onPress={() => void openVenueMap()}
              >
                <Text style={styles.proMobileLocationAddress}>
                  {venueAddress} ↗
                </Text>
              </Pressable>
              {event.editorial.timezone && (
                <Text style={styles.proMobileInfoFootnote}>
                  Schedule shown in {event.editorial.timezone}
                </Text>
              )}
              <View style={styles.proMobileLocationActions}>
                <Pressable
                  accessibilityLabel={`Copy address: ${venueAddress}`}
                  accessibilityRole="button"
                  onPress={() => void copyVenueAddress()}
                  style={styles.proMobileLocationCopy}
                >
                  <Text style={styles.proMobileLocationCopyText}>
                    {copiedAddress ? "✓ Copied" : "Copy address"}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityLabel={`Open ${venueAddress} in maps`}
                  accessibilityRole="link"
                  onPress={() => void openVenueMap()}
                  style={styles.proMobileLocationOpen}
                >
                  <Text style={styles.proMobileLocationOpenText}>Maps ↗</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}

        <View style={styles.proMobileActionRow}>
          {event.editorial.ticketUrl && (
            <Pressable
              onPress={() =>
                void WebBrowser.openBrowserAsync(event.editorial.ticketUrl!)
              }
              style={styles.proMobilePrimaryAction}
            >
              <Text style={styles.proMobilePrimaryActionText}>Tickets ↗</Text>
            </Pressable>
          )}
          <Pressable
            onPress={() => void WebBrowser.openBrowserAsync(event.sourceUrl)}
            style={styles.proMobileSecondaryAction}
          >
            <Text style={styles.proMobileSecondaryActionText}>
              Official source ↗
            </Text>
          </Pressable>
        </View>

        {event.sibling && (
          <Pressable
            onPress={() => openEvent(event.sibling!.slug)}
            style={styles.proMobileSiblingCard}
          >
            <View>
              <Text style={styles.proMobileInfoEyebrow}>OTHER DIVISION</Text>
              <Text style={styles.proMobileSiblingTitle}>
                {event.sibling.name}
              </Text>
            </View>
            <Text style={styles.proMobileSiblingArrow}>›</Text>
          </Pressable>
        )}
      </>
    );
  };

  const renderLive = () => {
    if (!event) return null;
    return (
      <>
        <ProTourSectionTitle
          eyebrow="LIVE TOURNAMENT DESK"
          title="On court now"
          trailing={`${liveMatches.length} live`}
        />
        {liveMatches.length > 0 ? (
          <View style={styles.proMobileCardStack}>
            {liveMatches.map((match) => (
              <ProTourMatchCard
                followed={followedMatchId === match.id}
                key={match.id}
                match={match}
                onFollow={followAction(match)}
                onOpen={() => void openMatchMarket(match)}
              />
            ))}
          </View>
        ) : (
          renderEmpty(
            "No match is live right now",
            "The tournament desk will surface live scores here as soon as play begins.",
          )
        )}
      </>
    );
  };

  const renderSchedule = () => {
    if (!event) return null;
    return (
      <>
        <ProTourSectionTitle
          eyebrow="SCORES + SCHEDULE"
          title="Every match"
          trailing={`${event.matches.length}`}
        />
        {event.matches.length > 0 ? (
          <View style={styles.proMobileCardStack}>
            {event.matches.slice(0, 60).map((match) => (
              <ProTourMatchCard
                followed={followedMatchId === match.id}
                key={match.id}
                match={match}
                onFollow={followAction(match)}
                onOpen={() => void openMatchMarket(match)}
              />
            ))}
            {event.matches.length > 60 && (
              <Text style={styles.proMobileListNote}>
                Showing the latest 60 of {event.matches.length} matches.
              </Text>
            )}
          </View>
        ) : (
          renderEmpty(
            "Schedule coming soon",
            "Matches will appear here when the official event feed publishes them.",
          )
        )}
      </>
    );
  };

  const renderDraw = () => {
    if (!event) return null;
    return (
      <>
        {event.bracket.length > 0 && (
          <>
            <ProTourSectionTitle
              eyebrow="CHAMPIONSHIP DRAW"
              title="Bracket"
              trailing={`${event.bracket.length} rounds`}
            />
            <View style={styles.proMobileDrawStack}>
              {event.bracket.map((round) => (
                <View key={round.key} style={styles.proMobileDrawRound}>
                  <Text style={styles.proMobileDrawRoundTitle}>
                    {round.label}
                  </Text>
                  <View style={styles.proMobileCardStack}>
                    {round.matches.map((match) => (
                      <ProTourMatchCard
                        followed={followedMatchId === match.id}
                        key={match.id}
                        match={match}
                        onFollow={followAction(match)}
                        onOpen={() => void openMatchMarket(match)}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
        {event.pools.length > 0 && (
          <>
            <ProTourSectionTitle
              eyebrow="POOL PLAY"
              title="Standings"
              trailing={`${event.pools.length} pools`}
            />
            <View style={styles.proMobileCardStack}>
              {event.pools.map((pool) => (
                <View key={pool.name} style={styles.proMobilePoolCard}>
                  <View style={styles.proMobilePoolHeader}>
                    <Text style={styles.proMobilePoolTitle}>{pool.name}</Text>
                    <Text style={styles.proMobilePoolProgress}>
                      {pool.completedMatches}/{pool.matchCount} played
                    </Text>
                  </View>
                  {pool.standings.map((standing, index) => (
                    <View
                      key={standing.team.key}
                      style={styles.proMobileStandingRow}
                    >
                      <Text style={styles.proMobileStandingRank}>
                        {index + 1}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={styles.proMobileStandingTeam}
                      >
                        {standing.team.label}
                      </Text>
                      <Text style={styles.proMobileStandingRecord}>
                        {standing.wins}–{standing.losses}
                      </Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </>
        )}
        {event.bracket.length === 0 &&
          event.pools.length === 0 &&
          renderEmpty(
            "Draw coming soon",
            "Pool standings and bracket rounds will appear as the official feed reports them.",
          )}
      </>
    );
  };

  const renderTeams = () => {
    if (!event) return null;
    return (
      <>
        <ProTourSectionTitle
          eyebrow="FIELD + STANDINGS"
          title="Teams"
          trailing={`${event.teamCount || event.teamEntries.length}`}
        />
        {event.liveStandings.length > 0 && (
          <View style={styles.proMobileStandingsCard}>
            {event.liveStandings.slice(0, 24).map((standing, index) => (
              <View key={standing.team.key} style={styles.proMobileStandingRow}>
                <Text style={styles.proMobileStandingRank}>{index + 1}</Text>
                <Text numberOfLines={1} style={styles.proMobileStandingTeam}>
                  {standing.team.label}
                </Text>
                <Text style={styles.proMobileStandingRecord}>
                  {standing.wins}–{standing.losses}
                </Text>
              </View>
            ))}
          </View>
        )}
        {event.teamEntries.length > 0 && (
          <View style={styles.proMobileTeamGrid}>
            {event.teamEntries.slice(0, 64).map((team) => (
              <View key={team.externalTeamId} style={styles.proMobileTeamCard}>
                <View style={styles.proMobileTeamCardTop}>
                  <Text style={styles.proMobileTeamSeed}>
                    {team.seed ? `#${team.seed}` : "TEAM"}
                  </Text>
                  <Text style={styles.proMobileTeamCountry}>
                    {countryFlag(team.countryCode)}
                  </Text>
                </View>
                <Text numberOfLines={2} style={styles.proMobileTeamName}>
                  {team.label}
                </Text>
                <Text numberOfLines={2} style={styles.proMobileTeamPlayers}>
                  {team.players.map((player) => player.name).join(" / ")}
                </Text>
              </View>
            ))}
          </View>
        )}
        {event.liveStandings.length === 0 &&
          event.teamEntries.length === 0 &&
          renderEmpty(
            "Teams coming soon",
            "The entry list will appear here when it is confirmed by the tour.",
          )}
      </>
    );
  };

  const renderWatch = () => {
    if (!event) return null;
    return (
      <>
        <ProTourSectionTitle
          eyebrow="BROADCAST GUIDE"
          title="Where to watch"
          trailing={`${watchOptions.length}`}
        />
        {watchOptions.length > 0 ? (
          <View style={styles.proMobileCardStack}>
            {watchOptions.map((option) => (
              <Pressable
                disabled={!option.url}
                key={option.id}
                onPress={() =>
                  option.url
                    ? void WebBrowser.openBrowserAsync(option.url)
                    : undefined
                }
                style={({ pressed }) => [
                  styles.proMobileWatchCard,
                  pressed && styles.proMobilePressed,
                ]}
              >
                <View style={styles.proMobileWatchIcon}>
                  <Text style={styles.proMobileWatchIconText}>
                    {option.kind === "youtube" ? "▶" : "◉"}
                  </Text>
                </View>
                <View style={styles.proMobileWatchCopy}>
                  <Text style={styles.proMobileWatchTitle}>{option.label}</Text>
                  <Text style={styles.proMobileWatchMeta}>
                    {option.channelName ??
                      (option.url ? "Open stream" : "Broadcast confirmed")}
                  </Text>
                </View>
                {option.url && (
                  <Text style={styles.proMobileWatchArrow}>↗</Text>
                )}
              </Pressable>
            ))}
          </View>
        ) : (
          renderEmpty(
            "Broadcast details pending",
            "Verified streaming and television options will appear here when announced.",
          )
        )}
      </>
    );
  };

  const renderActiveSection = () => {
    switch (activeSection) {
      case "live":
        return renderLive();
      case "schedule":
        return renderSchedule();
      case "draw":
        return renderDraw();
      case "teams":
        return renderTeams();
      case "watch":
        return renderWatch();
      default:
        return renderOverview();
    }
  };

  return (
    <>
      <Modal
        animationType="slide"
        onRequestClose={handleClose}
        presentationStyle="pageSheet"
        visible={visible}
      >
        <SafeAreaView edges={["top", "bottom"]} style={styles.modalSafe}>
          {selectedSlug ? (
            <>
              <View style={styles.proMobileDetailHeader}>
                <Pressable
                  accessibilityLabel="Back to Pro Tour events"
                  onPress={backToEvents}
                  style={styles.proMobileHeaderButton}
                >
                  <Text style={styles.proMobileHeaderButtonText}>‹</Text>
                </Pressable>
                <View style={styles.proMobileDetailHeaderCopy}>
                  <Text style={styles.proMobileDetailHeaderEyebrow}>
                    {event?.live || selectedSummary?.live
                      ? "● LIVE EVENT"
                      : "PRO EVENT"}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={styles.proMobileDetailHeaderTitle}
                  >
                    {event?.name ?? selectedSummary?.name ?? "Event"}
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Close Pro Tour"
                  onPress={handleClose}
                  style={styles.proMobileHeaderButton}
                >
                  <Text style={styles.proMobileHeaderCloseText}>×</Text>
                </Pressable>
              </View>

              {event && (
                <ScrollView
                  contentContainerStyle={styles.proMobileSectionNavContent}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.proMobileSectionNav}
                >
                  {sections.map((section) => (
                    <Pressable
                      accessibilityRole="tab"
                      accessibilityState={{
                        selected: activeSection === section,
                      }}
                      key={section}
                      onPress={() => {
                        selectionHaptic();
                        setActiveSection(section);
                      }}
                      style={[
                        styles.proMobileSectionTab,
                        activeSection === section &&
                          styles.proMobileSectionTabActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.proMobileSectionTabText,
                          activeSection === section &&
                            styles.proMobileSectionTabTextActive,
                        ]}
                      >
                        {proTourSectionLabels[section]}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}

              {loading && !event ? (
                <View style={styles.proMobileLoadingState}>
                  <View style={styles.proMobileLoadingMark}>
                    <Text style={styles.proMobileLoadingMarkText}>D</Text>
                  </View>
                  <Text style={styles.proMobileLoadingTitle}>
                    Opening the tournament desk
                  </Text>
                  <Text style={styles.proMobileLoadingBody}>
                    Bringing in live scores, teams, and event media…
                  </Text>
                </View>
              ) : error && !event ? (
                <View style={styles.proMobileLoadingState}>
                  <Text style={styles.proMobileEmptyIcon}>!</Text>
                  <Text style={styles.proMobileLoadingTitle}>
                    Event could not load
                  </Text>
                  <Text style={styles.proMobileLoadingBody}>{error}</Text>
                  <Pressable
                    onPress={() => setReloadKey((value) => value + 1)}
                    style={styles.proMobileRetryButton}
                  >
                    <Text style={styles.proMobileRetryButtonText}>
                      Try again
                    </Text>
                  </Pressable>
                </View>
              ) : event ? (
                <ScrollView
                  contentContainerStyle={styles.proMobileDetailContent}
                  key={activeSection}
                  showsVerticalScrollIndicator={false}
                >
                  {activeSection === "overview" && (
                    <View
                      style={[styles.proMobileHero, { height: heroHeight }]}
                    >
                      {posterUrl && !posterFailed ? (
                        <Image
                          accessibilityLabel={featuredMedia?.alt ?? event.name}
                          onError={() => setPosterFailed(true)}
                          resizeMode={posterIsPortrait ? "contain" : "cover"}
                          source={{ uri: posterUrl }}
                          style={styles.proMobileHeroImage}
                        />
                      ) : (
                        <View style={styles.proMobileHeroFallback}>
                          <View style={styles.proMobileCourtOutline} />
                          <View style={styles.proMobileCourtNet} />
                        </View>
                      )}
                      <View style={styles.proMobileHeroScrim} />
                      <View style={styles.proMobileHeroTop}>
                        <View style={styles.proMobileHeroBadges}>
                          <View
                            style={[
                              styles.proMobileHeroBadge,
                              event.live && styles.proMobileHeroBadgeLive,
                            ]}
                          >
                            <Text style={styles.proMobileHeroBadgeText}>
                              {event.live
                                ? "● LIVE NOW"
                                : event.status.toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.proMobileHeroBadge}>
                            <Text style={styles.proMobileHeroBadgeText}>
                              {event.genderCategory.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <ProTourBrandMark compact source={event.source} />
                      </View>
                      <View style={styles.proMobileHeroCopy}>
                        <Text style={styles.proMobileHeroCategory}>
                          {event.category ?? "Professional beach volleyball"}
                        </Text>
                        <Text style={styles.proMobileHeroTitle}>
                          {event.name}
                        </Text>
                        <Text style={styles.proMobileHeroMeta}>
                          {countryFlag(event.countryCode)}{" "}
                          {formatProEventDates(event.startsOn, event.endsOn)} ·{" "}
                          {event.editorial.venueName ??
                            event.location ??
                            "Location pending"}
                        </Text>
                      </View>
                    </View>
                  )}
                  <Pressable
                    accessibilityLabel={
                      followedEventIds.includes(event.id)
                        ? `Following ${event.name}`
                        : `Follow ${event.name}`
                    }
                    disabled={followedEventIds.includes(event.id)}
                    onPress={() => {
                      selectionHaptic();
                      void followEvent().catch((reason) =>
                        setFollowNotice(displayError(reason)),
                      );
                    }}
                    style={[
                      styles.proMobileFollowEvent,
                      followedEventIds.includes(event.id) &&
                        styles.proMobileFollowEventActive,
                    ]}
                  >
                    <View style={styles.proMobileFollowEventIcon}>
                      <Text style={styles.proMobileFollowEventIconText}>
                        {followedEventIds.includes(event.id) ? "✓" : "◉"}
                      </Text>
                    </View>
                    <View style={styles.flex}>
                      <Text style={styles.proMobileFollowEventTitle}>
                        {followedEventIds.includes(event.id)
                          ? "Following event"
                          : "Follow this event"}
                      </Text>
                      <Text style={styles.proMobileFollowEventBody}>
                        {Platform.OS === "ios"
                          ? "Live scores, round changes, and finals on your Lock Screen"
                          : "Keep live scores, round changes, and finals ready in Discover"}
                      </Text>
                    </View>
                    <Text style={styles.proMobileFollowEventArrow}>›</Text>
                  </Pressable>
                  {followNotice && (
                    <View style={styles.proMobileNotice}>
                      <Text style={styles.proMobileNoticeText}>
                        {followNotice}
                      </Text>
                    </View>
                  )}
                  {error && event && (
                    <Text style={styles.formError}>{error}</Text>
                  )}
                  {renderActiveSection()}
                </ScrollView>
              ) : null}
            </>
          ) : (
            <>
              <View style={styles.proMobileHubHeader}>
                <View>
                  <Text style={styles.proMobileHubEyebrow}>
                    PROFESSIONAL BEACH VOLLEYBALL
                  </Text>
                  <Text style={styles.proMobileHubTitle}>Pro Tour</Text>
                </View>
                <Pressable
                  accessibilityLabel="Close Pro Tour"
                  onPress={handleClose}
                  style={styles.proMobileHeaderButton}
                >
                  <Text style={styles.proMobileHeaderCloseText}>×</Text>
                </Pressable>
              </View>
              <ScrollView
                contentContainerStyle={styles.proMobileHubContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.proMobileIntro}>
                  <View style={styles.proMobileIntroCopy}>
                    <Text style={styles.proMobileIntroKicker}>
                      {liveEvents.length > 0
                        ? `● ${liveEvents.length} LIVE NOW`
                        : "WORLD TOUR COVERAGE"}
                    </Text>
                    <Text style={styles.proMobileIntroTitle}>
                      The world’s game, live in Duna.
                    </Text>
                    <Text style={styles.proMobileIntroBody}>
                      Scores, draws, teams, schedules, and broadcasts in one
                      mobile tournament desk.
                    </Text>
                  </View>
                  <View style={styles.proMobileIntroBrands}>
                    <ProTourBrandMark source="fivb" />
                    <ProTourBrandMark source="avp" />
                  </View>
                </View>

                <View style={styles.proMobileSearchBar}>
                  <Text aria-hidden style={styles.proMobileSearchIcon}>
                    ⌕
                  </Text>
                  <TextInput
                    accessibilityLabel="Search Pro Tour events"
                    autoCapitalize="none"
                    onChangeText={setSearch}
                    placeholder="Search events, cities, or tours"
                    placeholderTextColor={colors.muted}
                    returnKeyType="search"
                    style={styles.proMobileSearchInput}
                    value={search}
                  />
                  {search.length > 0 && (
                    <Pressable
                      accessibilityLabel="Clear event search"
                      onPress={() => setSearch("")}
                      style={styles.proMobileSearchClear}
                    >
                      <Text style={styles.proMobileSearchClearText}>×</Text>
                    </Pressable>
                  )}
                </View>

                {search.trim() ? (
                  <>
                    <ProTourSectionTitle
                      eyebrow="SEARCH RESULTS"
                      title="Events"
                      trailing={`${filteredEvents.length}`}
                    />
                    {filteredEvents.length > 0 ? (
                      <View style={styles.proMobileCardStack}>
                        {filteredEvents.map((candidate) => (
                          <ProTourEventCard
                            event={candidate}
                            key={candidate.id}
                            onPress={() => openEvent(candidate.slug)}
                          />
                        ))}
                      </View>
                    ) : (
                      renderEmpty(
                        "No matching events",
                        "Try a city, event name, category, or tour.",
                      )
                    )}
                  </>
                ) : (
                  <>
                    {liveEvents.length > 0 && (
                      <>
                        <ProTourSectionTitle
                          eyebrow="UPDATING FREQUENTLY"
                          title="Live now"
                          trailing={`${liveEvents.length}`}
                        />
                        <View style={styles.proMobileCardStack}>
                          {liveEvents.slice(0, 6).map((candidate) => (
                            <ProTourEventCard
                              event={candidate}
                              key={candidate.id}
                              onPress={() => openEvent(candidate.slug)}
                            />
                          ))}
                        </View>
                      </>
                    )}

                    <ProTourSectionTitle
                      eyebrow={
                        liveEvents.length > 0 ? "EXPLORE MORE" : "NEXT UP"
                      }
                      title={
                        liveEvents.length > 0 ? "Other events" : "Tour calendar"
                      }
                      trailing={`${otherEvents.length}`}
                    />
                    {otherEvents.length > 0 ? (
                      <View style={styles.proMobileCardStack}>
                        {otherEvents.slice(0, 20).map((candidate) => (
                          <ProTourEventCard
                            event={candidate}
                            key={candidate.id}
                            onPress={() => openEvent(candidate.slug)}
                          />
                        ))}
                      </View>
                    ) : events.length === 0 ? (
                      renderEmpty(
                        "Tour calendar is syncing",
                        "Live and upcoming professional events will appear here shortly.",
                      )
                    ) : null}
                  </>
                )}
              </ScrollView>
            </>
          )}
        </SafeAreaView>
      </Modal>
      {selectedMarket && (
        <MobilePredictionMarketSheet
          client={client}
          market={selectedMarket.market}
          onClose={() => setSelectedMarket(undefined)}
          onPlaced={async () => {
            await refresh();
            const target = selectedMarket.target;
            if (
              target.kind === "pro-match" &&
              Platform.OS === "ios" &&
              followedMatchId !== target.matchId
            ) {
              const match = event?.matches.find(
                (candidate) => candidate.id === target.matchId,
              );
              if (match && match.status !== "completed") {
                await followMatch(match);
              }
            }
          }}
          target={selectedMarket.target}
          wallet={predictionWallet}
        />
      )}
    </>
  );
}
