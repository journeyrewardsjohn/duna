import { demoPlayer } from "@duna/core/demo";
import { useContext } from "react";
import { Pressable, View } from "react-native";
import { usePlayerRuntime } from "../../runtime";
import { DunaIcon } from "../../duna-icon";
import { SatoshiText as Text } from "../../satoshi-text";
import { DunaWordmark } from "./brand";
import { colors } from "../shared/palette";
import { MessagingNavigationContext } from "./navigation";
import { styles } from "../legacy/styles";

export function AppHeader({ eyebrow }: { readonly eyebrow?: string }) {
  const { dashboard } = usePlayerRuntime();
  const messaging = useContext(MessagingNavigationContext);
  const initials = dashboard?.player.initials ?? demoPlayer.initials;
  return (
    <View style={styles.appHeader}>
      <View>
        <DunaWordmark />
        {eyebrow && <Text style={styles.headerEyebrow}>{eyebrow}</Text>}
      </View>
      <View style={styles.headerActions}>
        <Pressable
          accessibilityLabel="Notifications and messages"
          onPress={() => messaging.open(false)}
          style={styles.headerNotification}
        >
          <DunaIcon color={colors.bone} name="bell" size={22} />
          {messaging.unreadCount > 0 && (
            <View style={styles.headerNotificationDot} />
          )}
        </Pressable>
        <Pressable
          accessibilityLabel="Your profile"
          onPress={messaging.openProfile}
          style={styles.avatarButton}
        >
          <Text style={styles.avatarText}>{initials}</Text>
        </Pressable>
      </View>
    </View>
  );
}
