import type { PersonSummary } from "@duna/core";
import * as Crypto from "expo-crypto";
import { useEffect, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { startDunaLiveActivity } from "../../../live-activities";
import { usePlayerRuntime } from "../../../runtime";
import { usePlayerProfileNavigation } from "../../../player-social";
import { SatoshiText as Text } from "../../../satoshi-text";
import { displayError } from "../../shared/display-error";
import { selectionHaptic, successHaptic } from "../../shared/haptics";
import { rememberLiveActivityToken } from "../../shared/live-activity-token";
import { styles } from "../../legacy/styles";

export function FollowPlayerCard({
  player,
}: {
  readonly player: PersonSummary;
}) {
  const { client, mode } = usePlayerRuntime();
  const { openPlayerProfile } = usePlayerProfileNavigation();
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!client || mode !== "live") return;
    let active = true;
    void client.player.playerFollowState
      .query({ playerPersonId: player.id })
      .then((state) => {
        if (active) setFollowing(state.following);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [client, mode, player.id]);

  const toggleFollow = async () => {
    if (busy) return;
    selectionHaptic();
    setBusy(true);
    setError(undefined);
    try {
      if (client && mode === "live") {
        await client.player.setPlayerFollow.mutate({
          playerPersonId: player.id,
          following: !following,
          notifyRegistrations: !following,
          notifyWatch: !following,
          notifyResults: !following,
          idempotencyKey: Crypto.randomUUID(),
        });
      }
      if (!following) {
        await startDunaLiveActivity(
          {
            subjectId: player.id,
            kind: "player",
            title: player.displayName,
            subtitle: `${player.homeMarket} · ${player.rating.display.toFixed(2)}`,
            status: "Following",
            teamA: player.displayName,
            teamB: "Next opponent",
            scoreA: 0,
            scoreB: 0,
            setLabel: "Live match alerts ready",
          },
          {
            onPushToken: (token) => {
              void rememberLiveActivityToken(token, client).catch(
                () => undefined,
              );
            },
          },
        );
      }
      setFollowing((current) => !current);
      successHaptic();
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.playerFollowCard}>
      <Pressable
        accessibilityLabel={`Open ${player.displayName}'s profile`}
        onPress={() => openPlayerProfile(player)}
      >
        {player.avatarUrl ? (
          <Image
            accessibilityIgnoresInvertColors
            source={{ uri: player.avatarUrl }}
            style={styles.playerFollowAvatar}
          />
        ) : (
          <View style={styles.playerFollowAvatarFallback}>
            <Text style={styles.playerFollowAvatarText}>{player.initials}</Text>
          </View>
        )}
        <Text numberOfLines={1} style={styles.playerFollowName}>
          {player.displayName}
        </Text>
        <Text numberOfLines={1} style={styles.playerFollowMeta}>
          {player.isProfessional ? "PRO · " : ""}
          {player.homeMarket} · {player.rating.display.toFixed(2)}
        </Text>
        <Text style={styles.playerFollowProfileLink}>View profile</Text>
      </Pressable>
      <Pressable
        accessibilityLabel={
          following
            ? `Following ${player.displayName}`
            : `Follow ${player.displayName}`
        }
        disabled={busy}
        onPress={() => void toggleFollow()}
        style={[
          styles.playerFollowButton,
          following && styles.playerFollowButtonActive,
        ]}
      >
        <Text
          style={[
            styles.playerFollowButtonText,
            following && styles.playerFollowButtonTextActive,
          ]}
        >
          {busy ? "Updating…" : following ? "Following" : "+ Follow"}
        </Text>
      </Pressable>
      {error && (
        <Text numberOfLines={2} style={styles.playerFollowError}>
          {error}
        </Text>
      )}
    </View>
  );
}
