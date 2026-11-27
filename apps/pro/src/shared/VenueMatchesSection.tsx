import { useProRuntime } from "../../runtime";
import { View, Pressable } from "react-native";
import { SatoshiText as Text } from "../../satoshi-text";
import { previewOperatorMatches } from "./preview-operator-matches";
import { calendarDateKey, formatCalendarTime } from "./calendar-time";
import { styles } from "../legacy/styles";
import { Pill } from "./Pill";

export function VenueMatchesSection({
  dateKey,
  onScore,
  timezone,
}: {
  readonly dateKey?: string;
  readonly onScore: (matchId?: string) => void;
  readonly timezone: string;
}) {
  const { matches, mode } = useProRuntime();
  const availableMatches =
    mode === "preview" ? previewOperatorMatches() : (matches ?? []);
  const visibleMatches = availableMatches
    .filter(
      (match) =>
        !dateKey ||
        !match.scheduledAt ||
        calendarDateKey(new Date(match.scheduledAt), timezone) === dateKey,
    )
    .slice()
    .sort((left, right) => {
      if (left.status !== right.status) return left.status === "live" ? -1 : 1;
      return (
        Date.parse(left.scheduledAt ?? "") - Date.parse(right.scheduledAt ?? "")
      );
    });
  return (
    <View style={styles.venueMatchesSection}>
      <View style={styles.venueMatchesHeading}>
        <View>
          <Text style={styles.eyebrow}>VENUE MATCHES</Text>
          <Text style={styles.venueMatchesTitle}>On your courts.</Text>
        </View>
        <Pill
          tone={
            visibleMatches.some((match) => match.status === "live")
              ? "live"
              : "neutral"
          }
        >
          {`${visibleMatches.length} ${visibleMatches.length === 1 ? "match" : "matches"}`}
        </Pill>
      </View>
      <View style={styles.venueMatchesList}>
        {visibleMatches.map((match) => (
          <View key={match.id} style={styles.venueMatchCard}>
            <View style={styles.venueMatchTopline}>
              <View style={styles.venueMatchCourtLane}>
                <View
                  style={[
                    styles.venueMatchCourtDot,
                    match.status === "live" && styles.venueMatchCourtDotLive,
                  ]}
                />
                <Text style={styles.venueMatchCourtName}>
                  {match.courtName ?? "Court pending"}
                </Text>
              </View>
              <Text style={styles.venueMatchTime}>
                {match.status === "live"
                  ? "LIVE NOW"
                  : match.scheduledAt
                    ? formatCalendarTime(match.scheduledAt, timezone)
                    : "TIME PENDING"}
              </Text>
            </View>
            <Text style={styles.venueMatchContext}>
              {[match.venueName, match.sessionTitle, match.divisionName]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <View style={styles.venueMatchTeams}>
              {[match.teamA, match.teamB].map((team, index) => (
                <View key={team.id} style={styles.venueMatchTeam}>
                  <View style={styles.venueMatchAvatars}>
                    {team.people.slice(0, 2).map((player, playerIndex) => (
                      <View
                        key={player.id}
                        style={[
                          styles.venueMatchAvatar,
                          playerIndex > 0 && styles.venueMatchAvatarOverlap,
                        ]}
                      >
                        <Text style={styles.venueMatchAvatarText}>
                          {player.initials}
                        </Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.flex}>
                    <Text numberOfLines={1} style={styles.venueMatchTeamName}>
                      {team.name}
                    </Text>
                    <Text style={styles.venueMatchTeamMeta}>
                      {team.people
                        .map((player) => player.ratingDisplay.toFixed(2))
                        .join(" · ") || "Ratings pending"}
                    </Text>
                  </View>
                  {index === 0 && (
                    <Text style={styles.venueMatchVersus}>VS</Text>
                  )}
                </View>
              ))}
            </View>
            <Pressable
              accessibilityLabel={`${match.status === "live" ? "Resume" : "Begin"} scoring ${match.teamA.name} versus ${match.teamB.name}`}
              onPress={() => onScore(match.id)}
              style={[
                styles.venueMatchAction,
                match.status === "live" && styles.venueMatchActionLive,
              ]}
            >
              <Text style={styles.venueMatchActionText}>
                {match.status === "live"
                  ? "Resume courtside scoring"
                  : "Open match + score"}
              </Text>
              <Text style={styles.venueMatchActionText}>→</Text>
            </Pressable>
          </View>
        ))}
        {visibleMatches.length === 0 && (
          <View style={styles.venueMatchesEmpty}>
            <Text style={styles.venueMatchesEmptyTitle}>
              No matches on this day.
            </Text>
            <Text style={styles.venueMatchesEmptyBody}>
              Hosted and event matches appear automatically when their venue,
              program, or event belongs to this organization.
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
