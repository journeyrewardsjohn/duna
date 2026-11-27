import { Image, Pressable, View } from "react-native";
import { SatoshiText as Text } from "../../../satoshi-text";
import { type MobileCoach, coachInitials } from "./coach-format";
import { selectionHaptic } from "../../shared/haptics";
import { Pill } from "../../shared/Pill";
import { styles } from "../../legacy/styles";

export function CoachCard({
  coach,
  preferred = false,
  onPress,
}: {
  readonly coach: MobileCoach;
  readonly preferred?: boolean;
  readonly onPress: (coach: MobileCoach) => void;
}) {
  return (
    <Pressable
      accessibilityHint={`Open ${coach.displayName}'s schedule and services`}
      accessibilityLabel={coach.displayName}
      accessibilityRole="button"
      onPress={() => {
        selectionHaptic();
        onPress(coach);
      }}
      style={({ pressed }) => [
        styles.coachCard,
        preferred && styles.coachCardPreferred,
        pressed && styles.coachCardPressed,
      ]}
    >
      {coach.avatarUrl ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{ uri: coach.avatarUrl }}
          style={styles.coachAvatar}
        />
      ) : (
        <View style={styles.coachAvatarFallback}>
          <Text style={styles.coachAvatarFallbackText}>
            {coachInitials(coach.displayName)}
          </Text>
        </View>
      )}
      <View style={styles.flex}>
        <View style={styles.coachCardTop}>
          <Text numberOfLines={1} style={styles.coachCardName}>
            {coach.displayName}
          </Text>
          {preferred && <Pill tone="positive">Your club</Pill>}
        </View>
        <Text numberOfLines={1} style={styles.coachCardOrganization}>
          {coach.organizationName}
        </Text>
        <Text numberOfLines={2} style={styles.coachCardMeta}>
          {coach.services.length > 0
            ? `${coach.services.length} way${coach.services.length === 1 ? "" : "s"} to train`
            : "New sessions coming soon"}
          {coach.upcomingSessions.length > 0
            ? ` · ${coach.upcomingSessions.length} upcoming`
            : ""}
        </Text>
      </View>
      <Text style={styles.coachCardArrow}>›</Text>
    </Pressable>
  );
}
