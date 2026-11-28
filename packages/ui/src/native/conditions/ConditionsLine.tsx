import {
  CONDITION_REASON_WORDS,
  CONDITIONS_FRESH_MINUTES,
  LIGHT_MARK_GLYPH,
  PLAY_CALL_WORDS,
  celsiusToFahrenheit,
  conditionsFreshness,
  conditionsLine,
  fitConditionsLine,
  formatSpan,
  formatTime,
  lightMarkFor,
  playCall,
  type ConditionThresholds,
  type ConditionsPart,
  type HourlyConditions,
  type PlayCall,
  type SunTimes,
  type UnitSystem,
} from "@duna/tideline-core";
import { Fragment, useCallback, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { Icon, type GlyphName } from "../icons/Icon";
import { Skeleton } from "../loaders/loaders";
import { useTheme } from "../theme/ThemeProvider";
import { Text } from "../type/Text";

/** What the line knows about its data (the web component's statuses). */
export type ConditionsStatus =
  "ready" | "loading" | "no-data" | "not-configured";

export interface ConditionsLineProps {
  readonly conditions?: HourlyConditions | null;
  readonly status?: ConditionsStatus;
  /** When the reading was taken (epoch ms); with `now`, says when it is stale. */
  readonly readAt?: number;
  readonly now?: number;
  readonly freshMinutes?: number;
  readonly units?: UnitSystem;
  readonly thresholds?: Partial<ConditionThresholds>;
  /** The service's call wins over the numbers (lightning). */
  readonly call?: PlayCall;
  /** Words for that call ("Lightning 8 mi away"). */
  readonly reason?: string;
  /** Sun times for the venue's date: adds the light now and the sunset. */
  readonly sun?: SunTimes | null;
  readonly courtIsLit?: boolean;
  readonly timeZone: string;
  readonly locale?: string;
  /** Opens the full conditions (a sheet on phones). Without it the line is static. */
  readonly onPress?: () => void;
  /** The line's accessible name when it opens the full conditions. */
  readonly label?: string;
  readonly testID?: string;
}

export interface ConditionsLineItem {
  readonly key: string;
  readonly icon?: GlyphName;
  readonly text: string;
  /** Strong (the call words, the temperature). */
  readonly strong?: boolean;
  readonly tone?: "danger" | "warning" | "text-2";
}

export interface ConditionsLineView {
  readonly call: PlayCall;
  readonly items: readonly ConditionsLineItem[];
  /** Everything the line says, in words, for VoiceOver. */
  readonly spoken: string;
}

/**
 * The words and icons for one conditions line, in the core's priority order,
 * keeping at most `maxParts` of the droppable parts (sunset first; the call
 * never). Pure; the component and its tests share it.
 */
export function conditionsLineView(
  hour: HourlyConditions,
  options: {
    readonly units?: UnitSystem;
    readonly thresholds?: Partial<ConditionThresholds>;
    readonly call?: PlayCall;
    readonly reason?: string;
    readonly sun?: SunTimes | null;
    readonly courtIsLit?: boolean;
    readonly readAt?: number;
    readonly now?: number;
    readonly freshMinutes?: number;
    readonly timeZone: string;
    readonly locale?: string;
    readonly maxParts?: number;
  },
): ConditionsLineView {
  const units = options.units ?? "us";
  const locale = options.locale ?? "en-US";
  const computed = playCall(hour, options.thresholds);
  const call = options.call ?? computed.call;
  const reason =
    options.reason ??
    (computed.reason !== null && call !== "good"
      ? CONDITION_REASON_WORDS[computed.reason]
      : null);
  const line = conditionsLine(hour, {
    units,
    sunsetAt: options.sun?.sunset ?? null,
    thresholds: options.thresholds,
  });
  const shown: readonly ConditionsPart[] =
    options.maxParts === undefined
      ? line.parts
      : fitConditionsLine({ ...line, call }, options.maxParts);
  const kinds = new Set(shown.map((part) => part.kind));
  const time = (ms: number) =>
    formatTime(ms, { locale, timeZone: options.timeZone });

  const items: ConditionsLineItem[] = [];
  const spoken: string[] = [];
  const windPart = shown.find((part) => part.kind === "wind");
  const windSaysIt = Boolean(windPart?.gusty) && computed.reason === "gusts";
  if (call !== "good") {
    const words = PLAY_CALL_WORDS[call];
    items.push({
      key: "call",
      icon: call === "stop" ? "lightning" : "alert",
      text: reason && !windSaysIt ? `${words} · ${reason}` : words,
      strong: true,
      tone: call === "stop" ? "danger" : "warning",
    });
    spoken.push(reason ? `${words}: ${reason}` : words);
  }
  if (options.readAt !== undefined && options.now !== undefined) {
    const fresh = conditionsFreshness(
      options.readAt,
      options.now,
      options.freshMinutes ?? CONDITIONS_FRESH_MINUTES,
    );
    if (fresh.stale) {
      const ago =
        fresh.ageMinutes < 1
          ? "just now"
          : `${formatSpan(fresh.ageMinutes)} ago`;
      items.push({ key: "stale", icon: "clock", text: ago, tone: "text-2" });
      spoken.push(`read ${ago}`);
    }
  }
  if (kinds.has("temp") && hour.temperatureC !== undefined) {
    const degrees = Math.round(
      units === "us"
        ? celsiusToFahrenheit(hour.temperatureC)
        : hour.temperatureC,
    );
    const text = `${degrees}°${units === "us" ? "F" : "C"}`;
    items.push({ key: "temp", text, strong: true });
    spoken.push(text);
  }
  if (windPart?.text) {
    items.push({
      key: "wind",
      icon: windPart.gusty ? "gust" : "wind",
      text: windPart.text,
    });
    spoken.push(windPart.text);
  }
  for (const part of shown) {
    if ((part.kind === "rain" || part.kind === "uv") && part.text) {
      items.push({ key: part.kind, icon: part.kind, text: part.text });
      spoken.push(part.text);
    }
  }
  if (kinds.has("sunset") && options.sun?.sunset != null) {
    const mark = lightMarkFor(hour.at, {
      sun: options.sun,
      courtIsLit: options.courtIsLit ?? false,
    });
    const text = `Sunset ${time(options.sun.sunset)}`;
    items.push({
      key: "sunset",
      icon: LIGHT_MARK_GLYPH[mark] as GlyphName,
      text,
    });
    spoken.push(text);
  }
  return { call, items, spoken: spoken.join(", ") };
}

/** How many droppable parts the core produced (the fitting starts there). */
function partCount(hour: HourlyConditions, sun?: SunTimes | null): number {
  return conditionsLine(hour, { sunsetAt: sun?.sunset ?? null }).parts.length;
}

/**
 * One line of conditions for Home, a list row or a schedule header (the
 * native twin of the web `ConditionsLine`, same props except `onPress` for
 * the web's panel): the play call only when it is caution or stop (icon and
 * words, never colour alone), temperature, wind with its direction, rain and
 * UV when they matter, and the sunset with the light mark. It never wraps:
 * when the row is short it drops parts in the core's order (sunset first;
 * the call never). Honest states fit the same row: loading, no data, stale
 * (says how old) and not set up yet.
 */
export function ConditionsLine({
  conditions,
  status = "ready",
  readAt,
  now,
  freshMinutes,
  units = "us",
  thresholds,
  call,
  reason,
  sun,
  courtIsLit = false,
  timeZone,
  locale = "en-US",
  onPress,
  label = "Light and weather. Open full conditions",
  testID,
}: ConditionsLineProps) {
  const { colors, tokens } = useTheme();
  const ready = status === "ready" && Boolean(conditions);
  const hour: HourlyConditions = conditions ?? { at: now ?? 0 };
  const total = partCount(hour, sun);
  const [keep, setKeep] = useState(total);
  const [available, setAvailable] = useState(0);

  const onContainer = useCallback((event: LayoutChangeEvent) => {
    const width = Math.round(event.nativeEvent.layout.width);
    setAvailable((previous) => {
      if (width > previous) setKeep(Number.POSITIVE_INFINITY);
      return width;
    });
  }, []);
  const onContent = useCallback(
    (event: LayoutChangeEvent) => {
      const width = event.nativeEvent.layout.width;
      if (available > 0 && width > available + 1) {
        setKeep((current) => Math.max(1, Math.min(current, total) - 1));
      }
    },
    [available, total],
  );

  if (status === "loading") {
    return (
      <View
        accessibilityLabel="Loading weather"
        accessibilityRole="progressbar"
        style={styles.row}
        testID={testID}
      >
        <Skeleton count={1} kind="lines" label="Loading weather" />
      </View>
    );
  }
  if (status === "not-configured" || !ready) {
    const text =
      status === "not-configured"
        ? "Weather isn't set up yet"
        : "No weather for this location yet";
    return (
      <View accessibilityRole="text" style={styles.row} testID={testID}>
        <Icon name="info" size="chip" tone="text-2" />
        <Text numberOfLines={1} tone="text-2" variant="phone-meta">
          {text}
        </Text>
      </View>
    );
  }

  const view = conditionsLineView(hour, {
    units,
    thresholds,
    call,
    reason,
    sun,
    courtIsLit,
    readAt,
    now,
    freshMinutes,
    timeZone,
    locale,
    maxParts: Number.isFinite(keep) ? keep : undefined,
  });
  const content: ReactNode = (
    <View onLayout={onContainer} style={styles.clip}>
      <View onLayout={onContent} style={styles.parts}>
        {view.items.map((item, index) => (
          <Fragment key={item.key}>
            {index > 0 ? (
              <Text tone="text-3" variant="phone-meta">
                ·
              </Text>
            ) : null}
            <View style={styles.part}>
              {item.icon ? (
                <Icon
                  name={item.icon}
                  size="chip"
                  tone={item.tone ?? "text-2"}
                />
              ) : null}
              <Text
                numberOfLines={1}
                tone={item.tone ?? (item.strong ? "text" : "text-2")}
                variant="phone-meta"
                weight={item.strong ? 600 : undefined}
              >
                {item.text}
              </Text>
            </View>
          </Fragment>
        ))}
      </View>
    </View>
  );

  if (!onPress) {
    return (
      <View
        accessibilityLabel={view.spoken}
        accessibilityLiveRegion={view.call === "stop" ? "assertive" : "none"}
        accessible
        style={styles.row}
        testID={testID}
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityHint="Shows the full conditions"
      accessibilityLabel={`${label}. ${view.spoken}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: tokens.size.target,
          opacity: pressed ? 0.7 : 1,
          borderColor: colors.line,
        },
      ]}
      testID={testID}
    >
      {content}
      <Icon name="chevron-right" size="chip" tone="text-3" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 24,
  },
  clip: { flex: 1, overflow: "hidden" },
  parts: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
  },
  part: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 },
});
