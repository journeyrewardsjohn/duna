import { Pressable, View } from "react-native";
import { SatoshiText as Text } from "../../../satoshi-text";
import type { ProCoverageEvent } from "./pro-tour-types";
import { formatProEventDates } from "./pro-tour-format";
import { ProTourBrandMark } from "./ProTourBrandMark";
import { styles } from "../../legacy/styles";

export function ProTourEventCard({
  event,
  onPress,
}: {
  readonly event: ProCoverageEvent;
  readonly onPress: () => void;
}) {
  const live = event.live;
  return (
    <Pressable
      accessibilityLabel={`Open ${event.name}${live ? ", live now" : ""}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.proMobileEventCard,
        live && styles.proMobileEventCardLive,
        pressed && styles.proMobilePressed,
      ]}
    >
      <ProTourBrandMark compact source={event.source} />
      <View style={styles.proMobileEventCardBody}>
        <View style={styles.proMobileEventKickerRow}>
          <Text
            style={[
              styles.proMobileEventStatus,
              live && styles.proMobileEventStatusLive,
            ]}
          >
            {live ? "● LIVE NOW" : event.status.toUpperCase()}
          </Text>
          <Text
            numberOfLines={1}
            style={[
              styles.proMobileEventDivision,
              live && styles.proMobileEventDivisionLive,
            ]}
          >
            {event.genderCategory}
          </Text>
        </View>
        <Text
          numberOfLines={2}
          style={[
            styles.proMobileEventName,
            live && styles.proMobileEventNameLive,
          ]}
        >
          {event.name}
        </Text>
        <Text
          numberOfLines={1}
          style={[
            styles.proMobileEventMeta,
            live && styles.proMobileEventMetaLive,
          ]}
        >
          {formatProEventDates(event.startsOn, event.endsOn)} ·{" "}
          {event.location ?? "Location pending"}
        </Text>
      </View>
      <Text
        aria-hidden
        style={[
          styles.proMobileEventArrow,
          live && styles.proMobileEventArrowLive,
        ]}
      >
        ›
      </Text>
    </Pressable>
  );
}
