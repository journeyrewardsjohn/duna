/**
 * The full conditions for a day (board P04c-ScheduleConditions), opened by
 * tapping the one-line conditions on Today or Schedule: the light through the
 * day (first light, golden hour, sunset, last light, and whether courts are
 * lit), the play call with its reason, and the next hours. A bottom sheet on
 * iPhone and the closed Duo; centred on the open Duo and iPad.
 */
import { ScrollView, StyleSheet, View } from "react-native";
import {
  AdaptiveSheet,
  Icon,
  NotConfiguredState,
  Text,
  useTheme,
} from "@duna/ui/native";
import {
  CONDITION_REASON_WORDS,
  PLAY_CALL_WORDS,
  celsiusToFahrenheit,
  compassWords,
  formatTime,
  kphToMph,
  playCall,
  type HourlyConditions,
} from "@duna/tideline-core";
import { IconButton } from "../../app/ui";
import type { DayConditions } from "./day-model";

function hourLine(hour: HourlyConditions): string {
  const parts: string[] = [];
  if (hour.temperatureC !== undefined)
    parts.push(`${Math.round(celsiusToFahrenheit(hour.temperatureC))}°F`);
  if (hour.windSpeedKph !== undefined) {
    const gust =
      hour.windGustKph !== undefined
        ? `, gusts ${Math.round(kphToMph(hour.windGustKph))}`
        : "";
    parts.push(`${Math.round(kphToMph(hour.windSpeedKph))} mph${gust}`);
  }
  if ((hour.precipChancePct ?? 0) > 0)
    parts.push(`${Math.round(hour.precipChancePct ?? 0)}% rain`);
  return parts.join(" · ");
}

export function ConditionsSheet({
  conditions,
  visible,
  onClose,
}: {
  readonly conditions: DayConditions | null;
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  const { colors, tokens } = useTheme();
  const zone = conditions?.timeZone ?? "UTC";
  const time = (ms: number | null | undefined) =>
    ms == null ? "—" : formatTime(ms, { locale: "en-US", timeZone: zone });
  const call = conditions?.hour ? playCall(conditions.hour) : null;
  const sun = conditions?.sun;
  const lightRows: readonly {
    readonly icon: "first-light" | "golden-hour" | "too-dark" | "under-lights";
    readonly label: string;
    readonly value: string;
  }[] = sun
    ? [
        { icon: "first-light", label: "Sunrise", value: time(sun.sunrise) },
        {
          icon: "golden-hour",
          label: "Golden hour",
          value: time(sun.goldenHourStart),
        },
        { icon: "golden-hour", label: "Sunset", value: time(sun.sunset) },
        conditions?.courtIsLit
          ? {
              icon: "under-lights",
              label: "Lights on",
              value: time(sun.sunset),
            }
          : {
              icon: "too-dark",
              label: "Last light",
              value: time(sun.civilDusk),
            },
      ]
    : [];
  const windFrom = conditions?.hour?.windFromDeg;
  return (
    <AdaptiveSheet
      accessibilityLabel={conditions?.label ?? "Conditions"}
      kind="dialog"
      onClose={onClose}
      testID="conditions-sheet"
      visible={visible}
    >
      <View style={[styles.head, { paddingHorizontal: tokens.space["4"] }]}>
        <View style={styles.flex}>
          <Text accessibilityRole="header" variant="phone-heading">
            {conditions?.label ?? "Conditions"}
          </Text>
          {conditions ? (
            <Text tone="text-2" variant="phone-meta">
              {conditions.venueName}
            </Text>
          ) : null}
        </View>
        <IconButton icon="close" label="Close conditions" onPress={onClose} />
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: tokens.space["4"],
          paddingBottom: tokens.space["8"],
          gap: tokens.space["5"],
        }}
      >
        {call && call.call !== "good" ? (
          <View
            accessibilityLiveRegion={
              call.call === "stop" ? "assertive" : "polite"
            }
            style={[
              styles.call,
              {
                backgroundColor:
                  colors[call.call === "stop" ? "danger-wash" : "warning-wash"],
                borderRadius: tokens.radius.lg,
              },
            ]}
          >
            <Icon
              name={call.call === "stop" ? "lightning" : "alert"}
              tone={call.call === "stop" ? "danger" : "warning"}
            />
            <Text
              tone={call.call === "stop" ? "danger" : "warning"}
              variant="phone-body"
              weight={600}
            >
              {PLAY_CALL_WORDS[call.call]}
              {call.reason ? ` · ${CONDITION_REASON_WORDS[call.reason]}` : ""}
            </Text>
          </View>
        ) : null}

        {lightRows.length ? (
          <View style={styles.block}>
            <Text variant="phone-body" weight={600}>
              Light
            </Text>
            {lightRows.map((row) => (
              <View
                accessibilityLabel={`${row.label} ${row.value}`}
                accessible
                key={row.label}
                style={[styles.line, { borderBottomColor: colors.line }]}
              >
                <Icon name={row.icon} size="inline" tone="text-2" />
                <Text style={styles.flex} variant="phone-body">
                  {row.label}
                </Text>
                <Text tabular variant="phone-body" weight={600}>
                  {row.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {conditions?.configured && conditions.hours.length ? (
          <View style={styles.block}>
            <Text variant="phone-body" weight={600}>
              Next hours
            </Text>
            {windFrom !== undefined ? (
              <Text tone="text-2" variant="phone-meta">
                {`Wind from the ${compassWords(windFrom)}`}
              </Text>
            ) : null}
            {conditions.hours.map((hour) => (
              <View
                accessibilityLabel={`${time(hour.at)}: ${hourLine(hour)}`}
                accessible
                key={hour.at}
                style={[styles.line, { borderBottomColor: colors.line }]}
              >
                <Text style={styles.hourTime} tabular variant="phone-meta">
                  {time(hour.at)}
                </Text>
                <Text style={styles.flex} variant="phone-body">
                  {hourLine(hour)}
                </Text>
              </View>
            ))}
            <Text tone="text-3" variant="phone-meta">
              Weather data: Tomorrow.io
            </Text>
          </View>
        ) : (
          <NotConfiguredState
            compact
            feature="Weather for this venue"
            text="Add the venue's location in Duna HQ to see the forecast here. Sun times still show when the location is known."
          />
        )}
      </ScrollView>
    </AdaptiveSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    paddingVertical: 8,
  },
  call: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
  },
  block: { gap: 4 },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  hourTime: { minWidth: 64 },
});
