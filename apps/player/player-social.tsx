import type { PersonSummary } from "@duna/core";
import { demoPeople } from "@duna/core/demo";
import * as Crypto from "expo-crypto";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  SatoshiText as Text,
  SatoshiTextInput as TextInput,
} from "./satoshi-text";
import type { DunaApiClient } from "./mobile-api";
import { usePlayerRuntime } from "./runtime";
import { VideoPlayerModal, type VideoSummary } from "./video-studio";

export interface MobileSocialPalette {
  readonly canvas: string;
  readonly ink: string;
  readonly depth: string;
  readonly navy: string;
  readonly navyLift: string;
  readonly bone: string;
  readonly muted: string;
  readonly aqua: string;
  readonly aquaDeep: string;
  readonly sand: string;
  readonly flare: string;
  readonly positive: string;
  readonly warning: string;
  readonly danger: string;
  readonly onAccent: string;
  readonly white: string;
  readonly overlayRgb: string;
  readonly accentRgb: string;
  readonly warningRgb: string;
  readonly positiveRgb: string;
  readonly dangerRgb: string;
  readonly flareRgb: string;
  readonly inkRgb: string;
  readonly depthRgb: string;
  readonly navyRgb: string;
  readonly boneRgb: string;
  readonly whiteRgb: string;
}

type PublicPlayerIntelligence = Awaited<
  ReturnType<DunaApiClient["public"]["playerIntelligence"]["query"]>
>;
type PublicPlayerPerformance = Awaited<
  ReturnType<DunaApiClient["public"]["playerPerformance"]["query"]>
>;
type TeammateSearchResult = Awaited<
  ReturnType<DunaApiClient["player"]["teammateSearch"]["query"]>
>[number];

function rgba(rgb: string, alpha: number) {
  return `rgba(${rgb},${alpha})`;
}

function displayError(reason: unknown) {
  return reason instanceof Error
    ? reason.message
    : "Duna could not complete that request.";
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] ?? name;
}

function pickerRelationshipLabel(result: TeammateSearchResult) {
  if (result.relationship === "recent-partner") return "Recent partner";
  if (result.following && result.followsYou) return "Mutual follow";
  if (result.following) return "You follow";
  if (result.followsYou) return "Follows you";
  if (result.relationship === "nearby") return "Nearby";
  return "On Duna";
}

function pickerActivityLabel(lastActivityAt: string | undefined) {
  if (!lastActivityAt) return "New to your circle";
  const activity = new Date(lastActivityAt);
  if (!Number.isFinite(activity.getTime())) return "Activity unavailable";
  const days = Math.max(
    0,
    Math.floor((Date.now() - activity.getTime()) / 86_400_000),
  );
  if (days === 0) return "Active today";
  if (days === 1) return "Active yesterday";
  if (days < 7) return `Active ${days}d ago`;
  return `Active ${activity.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })}`;
}

function Avatar({
  person,
  palette,
  size = 64,
}: {
  readonly person: PersonSummary;
  readonly palette: MobileSocialPalette;
  readonly size?: number;
}) {
  const shape = { borderRadius: size / 2, height: size, width: size };
  return person.avatarUrl ? (
    <Image
      accessibilityIgnoresInvertColors
      source={{ uri: person.avatarUrl }}
      style={shape}
    />
  ) : (
    <View
      style={[
        shape,
        socialStyles.avatarFallback,
        { backgroundColor: palette.navy },
      ]}
    >
      <Text
        style={{
          color: palette.aqua,
          fontSize: Math.max(13, size * 0.28),
          fontWeight: "800",
        }}
      >
        {person.initials}
      </Text>
    </View>
  );
}

const PlayerProfileNavigationContext = createContext<{
  readonly openPlayerProfile: (person: PersonSummary) => void;
}>({ openPlayerProfile: () => undefined });

export function usePlayerProfileNavigation() {
  return useContext(PlayerProfileNavigationContext);
}

export function PlayerProfileProvider({
  children,
  palette,
}: {
  readonly children: ReactNode;
  readonly palette: MobileSocialPalette;
}) {
  const [person, setPerson] = useState<PersonSummary>();
  return (
    <PlayerProfileNavigationContext.Provider
      value={{ openPlayerProfile: setPerson }}
    >
      {children}
      <PlayerProfileModal
        onClose={() => setPerson(undefined)}
        palette={palette}
        person={person}
      />
    </PlayerProfileNavigationContext.Provider>
  );
}

function Stat({
  label,
  palette,
  value,
}: {
  readonly label: string;
  readonly palette: MobileSocialPalette;
  readonly value: string | number;
}) {
  return (
    <View style={socialStyles.stat}>
      <Text style={[socialStyles.statValue, { color: palette.bone }]}>
        {value}
      </Text>
      <Text style={[socialStyles.statLabel, { color: palette.muted }]}>
        {label}
      </Text>
    </View>
  );
}

function PlayerProfileModal({
  embedded = false,
  onClose,
  palette,
  person,
}: {
  readonly embedded?: boolean;
  readonly onClose: () => void;
  readonly palette: MobileSocialPalette;
  readonly person?: PersonSummary;
}) {
  const { client, dashboard, mode } = usePlayerRuntime();
  const [intelligence, setIntelligence] = useState<PublicPlayerIntelligence>();
  const [performance, setPerformance] = useState<PublicPlayerPerformance>();
  const [videos, setVideos] = useState<readonly VideoSummary[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoSummary>();
  const [following, setFollowing] = useState(false);
  const [followerDelta, setFollowerDelta] = useState(0);
  const [followBusy, setFollowBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [section, setSection] = useState<"activity" | "videos">("activity");

  useEffect(() => {
    setIntelligence(undefined);
    setPerformance(undefined);
    setVideos([]);
    setSelectedVideo(undefined);
    setFollowing(false);
    setFollowerDelta(0);
    setError(undefined);
    setSection("activity");
    if (!person || !client || mode !== "live") return;
    let active = true;
    void Promise.all([
      client.public.playerIntelligence.query({ handle: person.handle }),
      client.public.playerPerformance.query({ handle: person.handle }),
      client.public.videos.query({ ownerHandle: person.handle }),
      person.id === dashboard?.player.id
        ? Promise.resolve({ following: false })
        : client.player.playerFollowState.query({ playerPersonId: person.id }),
    ])
      .then(([nextIntelligence, nextPerformance, nextVideos, followState]) => {
        if (!active) return;
        setIntelligence(nextIntelligence);
        setPerformance(nextPerformance);
        setVideos(nextVideos);
        setFollowing(followState.following);
      })
      .catch((reason) => {
        if (active) setError(displayError(reason));
      });
    return () => {
      active = false;
    };
  }, [client, dashboard?.player.id, mode, person]);

  if (!person) return null;
  const isSelf = person.id === dashboard?.player.id;
  const profile = intelligence?.profile;
  const matchCount = performance?.history.length ?? 0;
  const followerCount = Math.max(
    0,
    (intelligence?.followerCount ?? 0) + followerDelta,
  );
  const liveVideo = videos.find((video) => video.status === "live");
  const recentVideos = videos
    .filter((video) => video.status !== "uploading")
    .slice(0, 8);

  async function toggleFollow() {
    if (!person || !client || mode !== "live" || isSelf || followBusy) return;
    setFollowBusy(true);
    setError(undefined);
    try {
      const nextFollowing = !following;
      await client.player.setPlayerFollow.mutate({
        playerPersonId: person.id,
        following: nextFollowing,
        notifyRegistrations: nextFollowing,
        notifyWatch: nextFollowing,
        notifyResults: nextFollowing,
        idempotencyKey: Crypto.randomUUID(),
      });
      setFollowing(nextFollowing);
      setFollowerDelta((current) => current + (nextFollowing ? 1 : -1));
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setFollowBusy(false);
    }
  }

  const content = (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[socialStyles.safe, { backgroundColor: palette.canvas }]}
    >
      <View
        style={[
          socialStyles.profileHeader,
          { borderBottomColor: rgba(palette.overlayRgb, 0.1) },
        ]}
      >
        <Pressable
          accessibilityLabel="Close player profile"
          onPress={onClose}
          style={socialStyles.iconButton}
        >
          <Text style={[socialStyles.back, { color: palette.bone }]}>‹</Text>
        </Pressable>
        <Text
          style={[socialStyles.profileHeaderTitle, { color: palette.bone }]}
        >
          Player profile
        </Text>
        <View style={socialStyles.iconButton} />
      </View>
      <ScrollView
        contentContainerStyle={socialStyles.profileContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={socialStyles.identityRow}>
          <Avatar palette={palette} person={person} size={86} />
          <View style={socialStyles.flex}>
            <View style={socialStyles.nameLine}>
              <Text style={[socialStyles.profileName, { color: palette.bone }]}>
                {person.displayName}
              </Text>
              {person.isProfessional && (
                <View
                  style={[
                    socialStyles.proBadge,
                    { backgroundColor: rgba(palette.warningRgb, 0.18) },
                  ]}
                >
                  <Text
                    style={[
                      socialStyles.proBadgeText,
                      { color: palette.warning },
                    ]}
                  >
                    PRO
                  </Text>
                </View>
              )}
            </View>
            <Text
              style={[socialStyles.profileMarket, { color: palette.muted }]}
            >
              Plays in {person.homeMarket}
            </Text>
            <Text style={[socialStyles.profileHandle, { color: palette.aqua }]}>
              @{person.handle}
            </Text>
          </View>
        </View>

        {!!profile?.shortBio && (
          <Text style={[socialStyles.bio, { color: palette.bone }]}>
            {profile.shortBio}
          </Text>
        )}

        <View
          style={[
            socialStyles.stats,
            { borderColor: rgba(palette.overlayRgb, 0.1) },
          ]}
        >
          <Stat label="Matches" palette={palette} value={matchCount} />
          <Stat label="Followers" palette={palette} value={followerCount} />
          <Stat
            label="Following"
            palette={palette}
            value={intelligence?.followingCount ?? "—"}
          />
        </View>

        {!isSelf && (
          <Pressable
            accessibilityLabel={`${following ? "Unfollow" : "Follow"} ${person.displayName}`}
            disabled={followBusy || mode !== "live"}
            onPress={() => void toggleFollow()}
            style={[
              socialStyles.followButton,
              {
                backgroundColor: following ? palette.depth : palette.aqua,
                borderColor: palette.aqua,
              },
            ]}
          >
            <Text
              style={[
                socialStyles.followButtonText,
                { color: following ? palette.aqua : palette.onAccent },
              ]}
            >
              {followBusy
                ? "Updating…"
                : following
                  ? "Following · Unfollow"
                  : "Follow"}
            </Text>
          </Pressable>
        )}

        {liveVideo && (
          <Pressable
            onPress={() => setSelectedVideo(liveVideo)}
            style={[
              socialStyles.liveButton,
              { backgroundColor: rgba(palette.flareRgb, 0.12) },
            ]}
          >
            <View
              style={[socialStyles.liveDot, { backgroundColor: palette.flare }]}
            />
            <View style={socialStyles.flex}>
              <Text style={[socialStyles.liveTitle, { color: palette.bone }]}>
                Live on Duna now
              </Text>
              <Text
                style={[socialStyles.liveMeta, { color: palette.muted }]}
                numberOfLines={1}
              >
                {liveVideo.title}
              </Text>
            </View>
            <Text style={[socialStyles.liveAction, { color: palette.flare }]}>
              WATCH
            </Text>
          </Pressable>
        )}

        {person.isProfessional &&
          (performance?.worldRanking ||
            performance?.professionalStatistics) && (
            <View
              style={[socialStyles.proCard, { backgroundColor: palette.navy }]}
            >
              <Text style={[socialStyles.eyebrow, { color: palette.warning }]}>
                PRO DETAILS
              </Text>
              <Text style={[socialStyles.proTitle, { color: palette.bone }]}>
                Verified tour performance
              </Text>
              <View style={socialStyles.proStats}>
                <Stat
                  label="World rank"
                  palette={palette}
                  value={
                    performance.worldRanking
                      ? `#${performance.worldRanking.rank}`
                      : "—"
                  }
                />
                <Stat
                  label="Pro matches"
                  palette={palette}
                  value={performance.professionalStatistics?.matches ?? "—"}
                />
                <Stat
                  label="Aces / set"
                  palette={palette}
                  value={
                    performance.professionalStatistics?.acesPerSet?.toFixed(
                      2,
                    ) ?? "—"
                  }
                />
              </View>
            </View>
          )}

        <View style={socialStyles.sectionTabs}>
          {(["activity", "videos"] as const).map((option) => (
            <Pressable
              key={option}
              onPress={() => setSection(option)}
              style={[
                socialStyles.sectionTab,
                {
                  borderBottomColor:
                    section === option
                      ? palette.aqua
                      : rgba(palette.overlayRgb, 0.08),
                },
              ]}
            >
              <Text
                style={[
                  socialStyles.sectionTabText,
                  {
                    color: section === option ? palette.bone : palette.muted,
                  },
                ]}
              >
                {option === "activity" ? "Activity" : "Videos"}
              </Text>
            </Pressable>
          ))}
        </View>

        {section === "activity" ? (
          <>
            <Text style={[socialStyles.sectionTitle, { color: palette.bone }]}>
              Registered events
            </Text>
            {intelligence?.upcomingEvents.length ? (
              intelligence.upcomingEvents.slice(0, 6).map((event) => (
                <View
                  key={event.id}
                  style={[
                    socialStyles.eventRow,
                    {
                      backgroundColor: palette.depth,
                      borderColor: rgba(palette.overlayRgb, 0.08),
                    },
                  ]}
                >
                  <View
                    style={[
                      socialStyles.eventDate,
                      { backgroundColor: palette.navy },
                    ]}
                  >
                    <Text
                      style={[
                        socialStyles.eventMonth,
                        { color: palette.muted },
                      ]}
                    >
                      {event.startsOn
                        ? new Date(`${event.startsOn}T12:00:00`)
                            .toLocaleDateString("en-US", { month: "short" })
                            .toUpperCase()
                        : "NEXT"}
                    </Text>
                    <Text
                      style={[socialStyles.eventDay, { color: palette.bone }]}
                    >
                      {event.startsOn
                        ? new Date(`${event.startsOn}T12:00:00`).getDate()
                        : "·"}
                    </Text>
                  </View>
                  <View style={socialStyles.flex}>
                    <Text
                      style={[socialStyles.eventTitle, { color: palette.bone }]}
                    >
                      {event.name}
                    </Text>
                    <Text
                      style={[socialStyles.eventMeta, { color: palette.muted }]}
                    >
                      {[event.tour, event.location, event.teamLabel]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                </View>
              ))
            ) : (
              <Text style={[socialStyles.emptyText, { color: palette.muted }]}>
                No public registrations are listed yet.
              </Text>
            )}

            <Text style={[socialStyles.sectionTitle, { color: palette.bone }]}>
              Latest results
            </Text>
            {performance?.history.length ? (
              performance.history.slice(0, 5).map((match) => (
                <View
                  key={match.id}
                  style={[
                    socialStyles.resultRow,
                    { borderColor: rgba(palette.overlayRgb, 0.09) },
                  ]}
                >
                  <View
                    style={[
                      socialStyles.resultMark,
                      {
                        backgroundColor:
                          match.actualResult >= 0.5
                            ? rgba(palette.positiveRgb, 0.16)
                            : rgba(palette.dangerRgb, 0.14),
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color:
                          match.actualResult >= 0.5
                            ? palette.positive
                            : palette.danger,
                        fontWeight: "900",
                      }}
                    >
                      {match.actualResult >= 0.5 ? "W" : "L"}
                    </Text>
                  </View>
                  <View style={socialStyles.flex}>
                    <Text
                      style={[
                        socialStyles.resultTitle,
                        { color: palette.bone },
                      ]}
                    >
                      {match.matchTitle}
                    </Text>
                    <Text
                      style={[
                        socialStyles.resultMeta,
                        { color: palette.muted },
                      ]}
                    >
                      {new Date(match.occurredAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                  <Text
                    style={[
                      socialStyles.resultDelta,
                      {
                        color:
                          match.delta >= 0 ? palette.positive : palette.danger,
                      },
                    ]}
                  >
                    {match.delta >= 0 ? "+" : ""}
                    {match.delta.toFixed(2)}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[socialStyles.emptyText, { color: palette.muted }]}>
                Verified match results will appear here.
              </Text>
            )}
          </>
        ) : (
          <>
            <Text style={[socialStyles.sectionTitle, { color: palette.bone }]}>
              Latest videos
            </Text>
            {recentVideos.length ? (
              <View style={socialStyles.videoGrid}>
                {recentVideos.map((video) => (
                  <Pressable
                    accessibilityLabel={`Play ${video.title}`}
                    key={video.id}
                    onPress={() => setSelectedVideo(video)}
                    style={[
                      socialStyles.videoCard,
                      { backgroundColor: palette.navy },
                    ]}
                  >
                    <View
                      style={[
                        socialStyles.playMark,
                        { backgroundColor: rgba(palette.depthRgb, 0.88) },
                      ]}
                    >
                      <Text
                        style={[
                          socialStyles.playMarkText,
                          { color: palette.bone },
                        ]}
                      >
                        ▶
                      </Text>
                    </View>
                    <View style={socialStyles.videoCardFooter}>
                      <Text
                        numberOfLines={2}
                        style={[
                          socialStyles.videoTitle,
                          { color: palette.bone },
                        ]}
                      >
                        {video.title}
                      </Text>
                      <Text
                        style={[
                          socialStyles.videoMeta,
                          { color: palette.muted },
                        ]}
                      >
                        {video.status === "live"
                          ? "LIVE"
                          : video.category.replace("-", " ").toUpperCase()}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={[socialStyles.emptyText, { color: palette.muted }]}>
                No public videos yet.
              </Text>
            )}
          </>
        )}

        {!!profile?.biography && (
          <View style={socialStyles.biography}>
            <Text style={[socialStyles.sectionTitle, { color: palette.bone }]}>
              About {firstName(person.displayName)}
            </Text>
            <Text
              style={[socialStyles.biographyText, { color: palette.muted }]}
            >
              {profile.biography}
            </Text>
            <Text style={[socialStyles.evidence, { color: palette.muted }]}>
              {profile.sourceLabel} · {profile.evidenceCount} sources
            </Text>
          </View>
        )}
        {error && (
          <Text style={[socialStyles.error, { color: palette.danger }]}>
            {error}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
  const player = selectedVideo && client && (
    <VideoPlayerModal
      client={client}
      onClose={() => setSelectedVideo(undefined)}
      video={selectedVideo}
    />
  );
  if (embedded) {
    return (
      <>
        {content}
        {player}
      </>
    );
  }
  return (
    <>
      <Modal
        animationType="slide"
        onRequestClose={onClose}
        presentationStyle="fullScreen"
        visible
      >
        {content}
      </Modal>
      {player}
    </>
  );
}

export function PlayerPickerModal({
  embedded = false,
  excludedPersonIds = [],
  maxSelected,
  onAddProvisional,
  onChange,
  onClose,
  palette,
  presentationStyle = "fullScreen",
  selected,
  title,
  visible,
}: {
  readonly embedded?: boolean;
  readonly excludedPersonIds?: readonly string[];
  readonly maxSelected: number;
  readonly onAddProvisional?: () => void;
  readonly onChange: (players: readonly PersonSummary[]) => void;
  readonly onClose: () => void;
  readonly palette: MobileSocialPalette;
  readonly presentationStyle?: "fullScreen" | "pageSheet";
  readonly selected: readonly PersonSummary[];
  readonly title: string;
  readonly visible: boolean;
}) {
  const { client, mode, people } = usePlayerRuntime();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<readonly TeammateSearchResult[]>([]);
  const [profilePerson, setProfilePerson] = useState<PersonSummary>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const excluded = useMemo(
    () => new Set(excludedPersonIds),
    [excludedPersonIds],
  );
  const selectedIds = useMemo(
    () => new Set(selected.map((player) => player.id)),
    [selected],
  );

  useEffect(() => {
    if (!visible) {
      setQuery("");
      setResults([]);
      setError(undefined);
      setBusy(false);
      setProfilePerson(undefined);
      if (timer.current) clearTimeout(timer.current);
      return;
    }
    if (!client || mode !== "live") return;
    setBusy(true);
    void client.player.teammateSearch
      .query({ limit: 20 })
      .then(setResults)
      .catch((reason) => setError(displayError(reason)))
      .finally(() => setBusy(false));
  }, [client, mode, visible]);

  function search(value: string) {
    setQuery(value);
    if (timer.current) clearTimeout(timer.current);
    if (!client || mode !== "live") return;
    timer.current = setTimeout(() => {
      setBusy(true);
      void client.player.teammateSearch
        .query({ query: value.trim() || undefined, limit: 20 })
        .then(setResults)
        .catch((reason) => setError(displayError(reason)))
        .finally(() => setBusy(false));
    }, 180);
  }

  const candidates: readonly TeammateSearchResult[] = results.length
    ? results
    : (people ?? demoPeople)
        .filter((person) => !excluded.has(person.id))
        .filter((person) => {
          const normalized = query.trim().toLowerCase();
          return (
            !normalized ||
            `${person.displayName} ${person.handle} ${person.homeMarket}`
              .toLowerCase()
              .includes(normalized)
          );
        })
        .map((person) => ({
          person,
          relationship: "search" as const,
          sharedTeams: 0,
          following: false,
          followsYou: false,
          reliability: {
            label: "new" as const,
            tracked: 0,
            attended: 0,
            noShows: 0,
          },
          gender: "Not listed",
          eligible: true,
          eligibilityReasons: [],
        }));
  const availableCandidates = candidates.filter(
    (result) => !excluded.has(result.person.id),
  );
  const frequentCandidates = query.trim()
    ? []
    : availableCandidates
        .filter(
          (result) =>
            result.relationship === "recent-partner" ||
            result.relationship === "connection" ||
            result.following ||
            result.followsYou,
        )
        .slice(0, 8);
  const frequentIds = new Set(
    frequentCandidates.map((result) => result.person.id),
  );
  const visibleCandidates = query.trim()
    ? availableCandidates
    : availableCandidates.filter(
        (result) => !frequentIds.has(result.person.id),
      );

  function toggleCandidate(result: TeammateSearchResult) {
    const isSelected = selectedIds.has(result.person.id);
    if (isSelected) {
      onChange(selected.filter((person) => person.id !== result.person.id));
      return;
    }
    if (!result.eligible || selected.length >= maxSelected) return;
    onChange([...selected, result.person]);
  }

  if (!visible) return null;
  if (profilePerson) {
    return (
      <PlayerProfileModal
        embedded
        onClose={() => setProfilePerson(undefined)}
        palette={palette}
        person={profilePerson}
      />
    );
  }

  const content = (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[socialStyles.safe, { backgroundColor: palette.canvas }]}
    >
      <View
        style={[
          socialStyles.pickerHeader,
          { borderBottomColor: rgba(palette.overlayRgb, 0.1) },
        ]}
      >
        <View style={socialStyles.flex}>
          <Text style={[socialStyles.eyebrow, { color: palette.aqua }]}>
            ADD PLAYERS
          </Text>
          <Text style={[socialStyles.pickerTitle, { color: palette.bone }]}>
            {title}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Close player search"
          onPress={onClose}
          style={socialStyles.iconButton}
        >
          <Text style={[socialStyles.close, { color: palette.bone }]}>×</Text>
        </Pressable>
      </View>
      <View
        style={[
          socialStyles.search,
          {
            backgroundColor: palette.depth,
            borderColor: rgba(palette.overlayRgb, 0.09),
          },
        ]}
      >
        <Text style={[socialStyles.searchMark, { color: palette.aqua }]}>
          ⌕
        </Text>
        <TextInput
          autoCapitalize="none"
          autoFocus
          onChangeText={search}
          placeholder="Search player, place, or rating"
          placeholderTextColor={palette.muted}
          style={[socialStyles.searchInput, { color: palette.bone }]}
          value={query}
        />
      </View>
      <View style={socialStyles.selectedSummary}>
        <Text style={[socialStyles.selectedCount, { color: palette.bone }]}>
          {selected.length} of {maxSelected} selected
        </Text>
        {busy && (
          <Text style={[socialStyles.searching, { color: palette.muted }]}>
            Searching…
          </Text>
        )}
      </View>
      <ScrollView
        contentContainerStyle={socialStyles.pickerContent}
        showsVerticalScrollIndicator={false}
      >
        {frequentCandidates.length > 0 && (
          <>
            <View style={socialStyles.pickerSectionHeader}>
              <Text
                style={[
                  socialStyles.pickerSectionLabel,
                  { color: palette.muted },
                ]}
              >
                YOUR PEOPLE
              </Text>
              <Text
                style={[
                  socialStyles.pickerSectionHint,
                  { color: palette.muted },
                ]}
              >
                Recent partners + follows
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={socialStyles.pickerPeopleRail}
            >
              <View style={socialStyles.pickerPeopleRow}>
                {frequentCandidates.map((result) => {
                  const isSelected = selectedIds.has(result.person.id);
                  return (
                    <Pressable
                      accessibilityLabel={`${isSelected ? "Remove" : "Add"} ${result.person.displayName}`}
                      key={result.person.id}
                      onPress={() => toggleCandidate(result)}
                      style={socialStyles.pickerPerson}
                    >
                      <View
                        style={[
                          socialStyles.pickerPersonAvatar,
                          isSelected && {
                            borderColor: palette.aqua,
                            borderWidth: 3,
                          },
                        ]}
                      >
                        <Avatar
                          palette={palette}
                          person={result.person}
                          size={58}
                        />
                        <View
                          style={[
                            socialStyles.pickerPersonAddMark,
                            {
                              backgroundColor: isSelected
                                ? palette.positive
                                : palette.aqua,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              socialStyles.pickerPersonAddMarkText,
                              { color: palette.onAccent },
                            ]}
                          >
                            {isSelected ? "✓" : "+"}
                          </Text>
                        </View>
                      </View>
                      <Text
                        numberOfLines={1}
                        style={[
                          socialStyles.pickerPersonName,
                          { color: palette.bone },
                        ]}
                      >
                        {firstName(result.person.displayName)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </>
        )}
        <Text
          style={[socialStyles.pickerSectionLabel, { color: palette.muted }]}
        >
          {query.trim() ? "SEARCH RESULTS" : "EVERYONE ON DUNA"}
        </Text>
        {visibleCandidates.map((result) => {
          const isSelected = selectedIds.has(result.person.id);
          const disabled =
            !result.eligible || (!isSelected && selected.length >= maxSelected);
          return (
            <View
              key={result.person.id}
              style={[
                socialStyles.playerRow,
                {
                  backgroundColor: palette.depth,
                  borderColor: rgba(palette.overlayRgb, 0.08),
                },
              ]}
            >
              <Pressable
                accessibilityLabel={`View ${result.person.displayName}'s profile`}
                accessibilityRole="button"
                onPress={() => setProfilePerson(result.person)}
              >
                <Avatar palette={palette} person={result.person} size={54} />
              </Pressable>
              <Pressable
                accessibilityLabel={`View ${result.person.displayName}'s profile`}
                accessibilityRole="button"
                onPress={() => setProfilePerson(result.person)}
                style={socialStyles.flex}
              >
                <View style={socialStyles.playerNameLine}>
                  <Text
                    numberOfLines={1}
                    style={[socialStyles.playerName, { color: palette.bone }]}
                  >
                    {result.person.displayName}
                  </Text>
                  {result.person.isProfessional && (
                    <Text
                      style={[socialStyles.rowPro, { color: palette.warning }]}
                    >
                      PRO
                    </Text>
                  )}
                </View>
                <Text
                  numberOfLines={1}
                  style={[socialStyles.playerMeta, { color: palette.muted }]}
                >
                  {result.person.homeMarket} ·{" "}
                  {result.person.rating.display.toFixed(2)} Sand
                </Text>
                <View style={socialStyles.playerSignals}>
                  <Text
                    numberOfLines={1}
                    style={[socialStyles.playerSignal, { color: palette.aqua }]}
                  >
                    {pickerRelationshipLabel(result)}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      socialStyles.playerSignal,
                      { color: palette.muted },
                    ]}
                  >
                    {result.reliability.score !== undefined
                      ? `${result.reliability.score}% reliable`
                      : result.reliability.label.replaceAll("-", " ")}
                  </Text>
                </View>
                <Text
                  numberOfLines={1}
                  style={[
                    socialStyles.playerActivity,
                    { color: palette.muted },
                  ]}
                >
                  {pickerActivityLabel(result.lastActivityAt)}
                  {result.reliability.noShows > 0
                    ? ` · ${result.reliability.noShows} no-show${result.reliability.noShows === 1 ? "" : "s"}`
                    : ""}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel={`${isSelected ? "Remove" : "Add"} ${result.person.displayName}`}
                accessibilityRole="button"
                disabled={disabled}
                onPress={() => toggleCandidate(result)}
                style={[
                  socialStyles.addButton,
                  {
                    backgroundColor: isSelected ? palette.depth : palette.aqua,
                    borderColor: palette.aqua,
                    opacity: disabled ? 0.42 : 1,
                  },
                ]}
              >
                <Text
                  style={[
                    socialStyles.addButtonText,
                    { color: isSelected ? palette.aqua : palette.onAccent },
                  ]}
                >
                  {isSelected ? "Added" : "Add"}
                </Text>
              </Pressable>
              {!result.eligible && (
                <Text
                  style={[socialStyles.ineligible, { color: palette.danger }]}
                >
                  {result.eligibilityReasons[0] ?? "Not eligible"}
                </Text>
              )}
            </View>
          );
        })}
        {!busy && visibleCandidates.length === 0 && (
          <Text style={[socialStyles.emptyText, { color: palette.muted }]}>
            No matching players found.
          </Text>
        )}
        {error && (
          <Text style={[socialStyles.error, { color: palette.danger }]}>
            {error}
          </Text>
        )}
      </ScrollView>
      <View
        style={[
          socialStyles.pickerFooter,
          {
            backgroundColor: palette.canvas,
            borderTopColor: rgba(palette.overlayRgb, 0.1),
          },
        ]}
      >
        {onAddProvisional && (
          <Pressable
            accessibilityRole="button"
            onPress={onAddProvisional}
            style={[
              socialStyles.provisionalButton,
              {
                backgroundColor: palette.depth,
                borderColor: palette.aqua,
              },
            ]}
          >
            <Text
              style={[
                socialStyles.provisionalButtonText,
                { color: palette.aqua },
              ]}
            >
              Player not on Duna? Add provisional player
            </Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          onPress={onClose}
          style={[socialStyles.doneButton, { backgroundColor: palette.aqua }]}
        >
          <Text
            style={[socialStyles.doneButtonText, { color: palette.onAccent }]}
          >
            Done
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
  if (embedded) return content;
  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle={presentationStyle}
      visible
    >
      {content}
    </Modal>
  );
}

export function LivePlayerRail({
  palette,
}: {
  readonly palette: MobileSocialPalette;
}) {
  const { client, mode } = usePlayerRuntime();
  const { openPlayerProfile } = usePlayerProfileNavigation();
  const [videos, setVideos] = useState<readonly VideoSummary[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoSummary>();

  useEffect(() => {
    if (!client || mode !== "live") return;
    let active = true;
    const load = () => {
      void client.public.videos
        .query({ liveOnly: true })
        .then((next) => {
          if (active) setVideos(next);
        })
        .catch(() => undefined);
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [client, mode]);

  const liveByOwner: readonly {
    readonly id: string;
    readonly owner: PersonSummary;
    readonly video?: VideoSummary;
  }[] =
    mode === "preview"
      ? demoPeople.slice(1, 4).map((owner) => ({
          id: `preview-live-${owner.id}`,
          owner,
        }))
      : [
          ...new Map(videos.map((video) => [video.owner.id, video])).values(),
        ].map((video) => ({ id: video.id, owner: video.owner, video }));
  if (!liveByOwner.length) return null;
  return (
    <>
      <View style={socialStyles.liveRailHeader}>
        <Text style={[socialStyles.eyebrow, { color: palette.flare }]}>
          LIVE NOW
        </Text>
        <Text style={[socialStyles.liveRailHint, { color: palette.muted }]}>
          Tap to watch
        </Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={socialStyles.liveRail}
      >
        {liveByOwner.map((item) => (
          <View key={item.id} style={socialStyles.livePerson}>
            <Pressable
              accessibilityLabel={`Watch ${item.owner.displayName} live`}
              onPress={() => {
                if (item.video) setSelectedVideo(item.video);
                else openPlayerProfile(item.owner);
              }}
              style={[
                socialStyles.liveRingOuter,
                { borderColor: palette.flare },
              ]}
            >
              <View
                style={[
                  socialStyles.liveRingInner,
                  { borderColor: palette.sand },
                ]}
              >
                <Avatar palette={palette} person={item.owner} size={62} />
              </View>
              <View
                style={[
                  socialStyles.liveBadge,
                  { backgroundColor: palette.flare },
                ]}
              >
                <Text
                  style={[socialStyles.liveBadgeText, { color: palette.white }]}
                >
                  LIVE
                </Text>
              </View>
            </Pressable>
            <Pressable onPress={() => openPlayerProfile(item.owner)}>
              <Text
                numberOfLines={1}
                style={[socialStyles.liveName, { color: palette.bone }]}
              >
                {firstName(item.owner.displayName)}
              </Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
      {selectedVideo && client && (
        <VideoPlayerModal
          client={client}
          onClose={() => setSelectedVideo(undefined)}
          video={selectedVideo}
        />
      )}
    </>
  );
}

const socialStyles = StyleSheet.create({
  addButton: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 48,
    minWidth: 68,
    paddingHorizontal: 12,
  },
  addButtonText: { fontSize: 13, fontWeight: "800" },
  avatarFallback: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  back: { fontSize: 38, lineHeight: 40 },
  bio: { fontSize: 16, lineHeight: 23, marginTop: 18 },
  biography: { marginTop: 28 },
  biographyText: { fontSize: 15, lineHeight: 23, marginTop: 9 },
  close: { fontSize: 30, lineHeight: 34 },
  doneButton: {
    alignItems: "center",
    borderRadius: 18,
    justifyContent: "center",
    minHeight: 56,
  },
  doneButtonText: { fontSize: 16, fontWeight: "800" },
  emptyText: { fontSize: 15, lineHeight: 22, paddingVertical: 24 },
  error: { fontSize: 14, lineHeight: 20, marginTop: 16 },
  eventDate: {
    alignItems: "center",
    borderRadius: 14,
    height: 58,
    justifyContent: "center",
    width: 58,
  },
  eventDay: { fontSize: 20, fontWeight: "900" },
  eventMeta: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  eventMonth: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  eventRow: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 10,
    padding: 12,
  },
  eventTitle: { fontSize: 16, fontWeight: "800" },
  evidence: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginTop: 12,
  },
  eyebrow: { fontSize: 12, fontWeight: "900", letterSpacing: 1.4 },
  flex: { flex: 1, minWidth: 0 },
  followButton: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 54,
  },
  followButtonText: { fontSize: 16, fontWeight: "800" },
  iconButton: {
    alignItems: "center",
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  identityRow: { alignItems: "center", flexDirection: "row", gap: 16 },
  ineligible: { bottom: 3, fontSize: 12, left: 78, position: "absolute" },
  liveAction: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  liveBadge: {
    borderRadius: 5,
    bottom: -5,
    paddingHorizontal: 7,
    paddingVertical: 3,
    position: "absolute",
  },
  liveBadgeText: { fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  liveButton: {
    alignItems: "center",
    borderRadius: 18,
    flexDirection: "row",
    gap: 11,
    marginTop: 14,
    minHeight: 68,
    padding: 14,
  },
  liveDot: { borderRadius: 6, height: 12, width: 12 },
  liveMeta: { fontSize: 13, marginTop: 3 },
  liveName: { fontSize: 12, marginTop: 10, maxWidth: 84, textAlign: "center" },
  livePerson: { alignItems: "center", marginRight: 14, width: 86 },
  liveRail: { marginHorizontal: -4, marginTop: 7 },
  liveRailHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 20,
  },
  liveRailHint: { fontSize: 12 },
  liveRingInner: {
    alignItems: "center",
    borderRadius: 37,
    borderWidth: 2,
    height: 74,
    justifyContent: "center",
    width: 74,
  },
  liveRingOuter: {
    alignItems: "center",
    borderRadius: 42,
    borderWidth: 3,
    height: 84,
    justifyContent: "center",
    width: 84,
  },
  liveTitle: { fontSize: 15, fontWeight: "800" },
  nameLine: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pickerContent: { gap: 10, paddingHorizontal: 18, paddingBottom: 188 },
  pickerFooter: {
    borderTopWidth: 1,
    bottom: 0,
    gap: 10,
    left: 0,
    padding: 18,
    position: "absolute",
    right: 0,
  },
  provisionalButton: {
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 52,
    paddingHorizontal: 16,
  },
  provisionalButtonText: {
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  pickerHeader: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  pickerSectionLabel: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginBottom: 2,
    marginTop: 4,
  },
  pickerSectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  pickerSectionHint: { fontSize: 12, fontWeight: "700" },
  pickerPeopleRail: { marginHorizontal: -2 },
  pickerPeopleRow: { flexDirection: "row", gap: 12, paddingRight: 8 },
  pickerPerson: { alignItems: "center", width: 64 },
  pickerPersonAvatar: { position: "relative" },
  pickerPersonAddMark: {
    alignItems: "center",
    borderColor: "#ffffff",
    borderRadius: 11,
    borderWidth: 2,
    bottom: -1,
    height: 22,
    justifyContent: "center",
    position: "absolute",
    right: -3,
    width: 22,
  },
  pickerPersonAddMarkText: { fontSize: 15, fontWeight: "900", lineHeight: 17 },
  pickerPersonName: { fontSize: 12, fontWeight: "800", marginTop: 7 },
  pickerTitle: { fontSize: 25, fontWeight: "800", marginTop: 3 },
  playMark: {
    alignItems: "center",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  playMarkText: { fontSize: 17, marginLeft: 3 },
  playerActivity: { fontSize: 12, marginTop: 3 },
  playerMeta: { fontSize: 13, marginTop: 3 },
  playerSignal: { fontSize: 12, fontWeight: "800" },
  playerSignals: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 5,
  },
  playerName: { flexShrink: 1, fontSize: 16, fontWeight: "800" },
  playerNameLine: { alignItems: "center", flexDirection: "row", gap: 7 },
  playerRow: {
    alignItems: "center",
    borderRadius: 19,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 108,
    padding: 12,
    position: "relative",
  },
  proBadge: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 4 },
  proBadgeText: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  proCard: { borderRadius: 22, marginTop: 20, padding: 18 },
  profileContent: { padding: 20, paddingBottom: 72 },
  profileHandle: { fontSize: 13, fontWeight: "800", marginTop: 5 },
  profileHeader: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  profileHeaderTitle: { fontSize: 15, fontWeight: "800" },
  profileMarket: { fontSize: 14, marginTop: 5 },
  profileName: {
    flexShrink: 1,
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: -0.7,
  },
  proStats: { flexDirection: "row", marginTop: 14 },
  proTitle: { fontSize: 20, fontWeight: "900", marginTop: 5 },
  resultDelta: { fontSize: 15, fontWeight: "900" },
  resultMark: {
    alignItems: "center",
    borderRadius: 15,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  resultMeta: { fontSize: 12, marginTop: 3 },
  resultRow: {
    alignItems: "center",
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 11,
    minHeight: 68,
  },
  resultTitle: { fontSize: 15, fontWeight: "800" },
  rowPro: { fontSize: 12, fontWeight: "900", letterSpacing: 0.8 },
  safe: { flex: 1 },
  search: {
    alignItems: "center",
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: "row",
    margin: 18,
    minHeight: 56,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 16, minHeight: 54, paddingHorizontal: 10 },
  searching: { fontSize: 12 },
  searchMark: { fontSize: 24 },
  sectionTab: {
    alignItems: "center",
    borderBottomWidth: 2,
    flex: 1,
    minHeight: 50,
    paddingTop: 14,
  },
  sectionTabs: { flexDirection: "row", marginTop: 26 },
  sectionTabText: {
    fontSize: 15,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  sectionTitle: {
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: -0.3,
    marginTop: 26,
  },
  selectedCount: { fontSize: 13, fontWeight: "800" },
  selectedSummary: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  stat: { alignItems: "center", flex: 1 },
  statLabel: { fontSize: 12, marginTop: 4 },
  stats: {
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: "row",
    marginTop: 20,
    paddingVertical: 15,
  },
  statValue: { fontSize: 22, fontWeight: "900" },
  videoCard: {
    alignItems: "center",
    aspectRatio: 0.9,
    borderRadius: 18,
    justifyContent: "center",
    overflow: "hidden",
    width: "48.5%",
  },
  videoCardFooter: {
    bottom: 0,
    left: 0,
    padding: 12,
    position: "absolute",
    right: 0,
  },
  videoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 12 },
  videoMeta: {
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
    marginTop: 4,
  },
  videoTitle: { fontSize: 14, fontWeight: "800", lineHeight: 18 },
  viewProfile: { fontSize: 12, fontWeight: "800", marginTop: 5 },
});
