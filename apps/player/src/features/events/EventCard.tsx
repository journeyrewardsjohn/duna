import { defaultEventMedia, formatMoney, formatVenueTime } from "@duna/core";
import { demoEvents } from "@duna/core/demo";
import { ImageBackground, Pressable, View } from "react-native";
import { dunaWebUrl } from "../../../mobile-api";
import { usePlayerRuntime } from "../../../runtime";
import { SatoshiText as Text } from "../../../satoshi-text";
import { selectionHaptic } from "../../shared/haptics";
import {
  weatherSymbol,
  fahrenheit,
  closestWeather,
} from "../../shared/weather";
import { Pill } from "../../shared/Pill";
import { styles } from "../../legacy/styles";

export function EventCard({
  eventIndex,
  onPress,
}: {
  readonly eventIndex: number;
  readonly onPress: (eventIndex: number) => void;
}) {
  const { dashboard } = usePlayerRuntime();
  const event = (dashboard?.events ?? demoEvents)[eventIndex];
  if (!event) return null;
  const weather = closestWeather(event.weather?.hourly, event.startsAt);
  const imageUrl =
    event.imageUrl ??
    `${dunaWebUrl}${defaultEventMedia(event.kind, event.id).path}`;
  return (
    <Pressable
      onPress={() => {
        selectionHaptic();
        onPress(eventIndex);
      }}
      style={styles.eventCard}
    >
      <ImageBackground
        imageStyle={styles.eventArtImage}
        source={{ uri: imageUrl }}
        style={styles.eventArt}
      >
        <View style={styles.eventArtWash} />
        <View style={styles.eventBadges}>
          <Pill tone={event.live ? "live" : "neutral"}>
            {event.live ? "Live" : event.kind}
          </Pill>
        </View>
        <Text style={styles.eventArrow}>↗</Text>
      </ImageBackground>
      <View style={styles.eventBody}>
        <Text style={styles.eventTime}>
          {formatVenueTime(event.startsAt, event.timezone, "en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </Text>
        <Text numberOfLines={2} style={styles.eventTitle}>
          {event.title}
        </Text>
        <Text numberOfLines={1} style={styles.eventMeta}>
          {event.venueName}
        </Text>
        {weather && (
          <Text style={styles.eventWeather}>
            {weatherSymbol(weather.icon)} {fahrenheit(weather.temperatureC)}
            {weather.precipitationProbability !== undefined
              ? ` · ${Math.round(weather.precipitationProbability)}% rain`
              : ""}
          </Text>
        )}
        <View style={styles.eventFooter}>
          <Text style={styles.eventPrice}>
            {event.price.amountMinor
              ? formatMoney(event.price.amountMinor, "USD")
              : "FREE"}
          </Text>
          <Text style={styles.eventSpots}>{event.spotsRemaining} spots</Text>
        </View>
      </View>
    </Pressable>
  );
}
