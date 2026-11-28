/**
 * The pieces Today and Schedule share (M-R0): an agenda row (time with its
 * light mark, title, court and roster, state and what needs the coach), a
 * match on the coach's courts (live ones in the Live zone: Solar only
 * there), the one-line conditions, and a block's honest state.
 */
import { Pressable, StyleSheet, View } from "react-native";
import {
  ErrorState,
  Icon,
  LiveZone,
  OfflineState,
  Text,
  useHaptics,
  useTheme,
  type GlyphName,
} from "@duna/ui/native";
import { ConditionsLine } from "@duna/ui/native/conditions";
import { LIGHT_GLYPH_LABELS, LIGHT_MARK_GLYPH } from "@duna/tideline-core";
import { StatusChip } from "../../app/ui";
import type { AgendaItem, CourtMatch, DayConditions } from "./day-model";
import type { BlockStatus } from "./use-day";

const PRESSED = { transform: [{ scale: 0.98 }], opacity: 0.86 } as const;

/** The light at a time: a mark with its words (never a mark alone). */
export function LightGlyph({ item }: { readonly item: AgendaItem }) {
  if (!item.light) return null;
  const glyph = LIGHT_MARK_GLYPH[item.light];
  return (
    <Icon
      label={LIGHT_GLYPH_LABELS[glyph]}
      name={glyph as GlyphName}
      size="chip"
      tone="text-2"
    />
  );
}

function stateChip(item: AgendaItem) {
  const minimum = item.needs.find((need) => need.kind === "minimum");
  const attendance = item.needs.find((need) => need.kind === "attendance");
  if (item.state === "live")
    return {
      label: "Live",
      tone: "live-ink",
      wash: "live-wash",
      icon: undefined,
    } as const;
  if (minimum)
    return {
      label: minimum.label,
      tone: "warning",
      wash: "warning-wash",
      icon: "alert",
    } as const;
  if (attendance)
    return {
      label: attendance.label,
      tone: "attention",
      wash: "attention-wash",
      icon: "check",
    } as const;
  if (item.state === "next")
    return {
      label: "Next",
      tone: "text",
      wash: "surface-sunken",
      icon: undefined,
    } as const;
  if (item.state === "done")
    return {
      label: "Done",
      tone: "text-2",
      wash: "surface-sunken",
      icon: "check",
    } as const;
  if (item.state === "cancelled")
    return {
      label: "Cancelled",
      tone: "text-2",
      wash: "surface-sunken",
      icon: undefined,
    } as const;
  return null;
}

/** One agenda row: 56 pt or taller, time rail on the left. */
export function AgendaRow({
  item,
  onPress,
  showCoach = false,
}: {
  readonly item: AgendaItem;
  readonly onPress?: () => void;
  readonly showCoach?: boolean;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  const chip = stateChip(item);
  const meta = [item.meta, showCoach ? item.coach : null]
    .filter(Boolean)
    .join(" · ");
  const spoken = [
    item.time,
    item.light ? LIGHT_GLYPH_LABELS[LIGHT_MARK_GLYPH[item.light]] : null,
    item.title,
    item.place,
    item.coming,
    chip?.label,
  ]
    .filter(Boolean)
    .join(". ");
  const body = (
    <>
      <View style={styles.rail}>
        <Text tabular variant="phone-meta" weight={600}>
          {item.time}
        </Text>
        <LightGlyph item={item} />
      </View>
      <View
        style={[
          styles.railLine,
          {
            backgroundColor:
              item.state === "live" ? colors.live : colors["line-strong"],
          },
        ]}
      />
      <View style={styles.rowText}>
        <Text
          tone={item.busy || item.state === "done" ? "text-2" : "text"}
          variant="phone-body"
          weight={600}
        >
          {item.title}
        </Text>
        {meta ? (
          <Text tone="text-2" variant="phone-meta">
            {meta}
          </Text>
        ) : null}
        {chip ? (
          <StatusChip
            icon={chip.icon}
            label={chip.label}
            tone={chip.tone}
            wash={chip.wash}
          />
        ) : null}
      </View>
      {onPress ? (
        <Icon name="chevron-right" size="inline" tone="text-3" />
      ) : null}
    </>
  );
  const frame = {
    minHeight: 56,
    paddingVertical: tokens.space["3"],
    paddingHorizontal: tokens.space["2"],
    borderRadius: tokens.radius.lg,
  };
  if (!onPress || item.busy) {
    return (
      <View
        accessibilityLabel={spoken}
        accessible
        style={[styles.row, frame]}
        testID={`agenda-${item.id}`}
      >
        {body}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityHint="Opens the session"
      accessibilityLabel={spoken}
      accessibilityRole="button"
      onPress={() => {
        haptics.confirmed(0);
        onPress();
      }}
      style={({ pressed }) => [styles.row, frame, pressed ? PRESSED : null]}
      testID={`agenda-${item.id}`}
    >
      {body}
    </Pressable>
  );
}

/** A match on the coach's courts; a live one is drawn in the Live zone. */
export function CourtMatchRow({
  match,
  onPress,
}: {
  readonly match: CourtMatch;
  readonly onPress: () => void;
}) {
  const row = <MatchRowBody match={match} onPress={onPress} />;
  return match.live ? <LiveZone>{row}</LiveZone> : row;
}

function MatchRowBody({
  match,
  onPress,
}: {
  readonly match: CourtMatch;
  readonly onPress: () => void;
}) {
  const { colors, tokens } = useTheme();
  const haptics = useHaptics();
  return (
    <Pressable
      accessibilityHint={
        match.live ? "Opens courtside scoring" : "Opens the match to score it"
      }
      accessibilityLabel={`${match.live ? "Live now" : match.when}. ${match.court}. ${match.title}${match.context ? `. ${match.context}` : ""}`}
      accessibilityRole="button"
      onPress={() => {
        haptics.confirmed(1);
        onPress();
      }}
      style={({ pressed }) => [
        styles.match,
        {
          backgroundColor: colors.surface,
          borderColor: match.live ? colors.live : colors.line,
          borderRadius: tokens.radius.xl,
          padding: tokens.space["4"],
        },
        pressed ? PRESSED : null,
      ]}
      testID={`court-match-${match.id}`}
    >
      <View style={styles.matchTop}>
        <View style={styles.matchWhen}>
          {match.live ? (
            <View style={[styles.liveDot, { backgroundColor: colors.live }]} />
          ) : null}
          <Text
            tabular
            tone={match.live ? "live-ink" : "text-2"}
            variant="phone-meta"
            weight={600}
          >
            {match.live ? "Live" : match.when}
          </Text>
        </View>
        <Text tone="text-2" variant="phone-meta">
          {match.court}
        </Text>
      </View>
      <Text variant="phone-body" weight={600}>
        {match.title}
      </Text>
      {match.context ? (
        <Text tone="text-2" variant="phone-meta">
          {match.context}
        </Text>
      ) : null}
      <View style={styles.matchAction}>
        <Icon name="score" size="inline" />
        <Text variant="phone-meta" weight={600}>
          {match.live ? "Resume scoring" : "Score this match"}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * The day's conditions in ONE line (temperature, wind with direction, light,
 * and the play call only when caution or stop). Tapping opens the full
 * conditions sheet. Never a card.
 */
export function DayConditionsLine({
  conditions,
  onPress,
  now,
}: {
  readonly conditions: DayConditions | null;
  readonly onPress: () => void;
  readonly now: number;
}) {
  if (!conditions) {
    return (
      <ConditionsLine
        status="not-configured"
        testID="day-conditions"
        timeZone="UTC"
      />
    );
  }
  return (
    <ConditionsLine
      conditions={conditions.hour}
      courtIsLit={conditions.courtIsLit}
      label={conditions.label}
      now={now}
      onPress={onPress}
      readAt={conditions.readAt}
      status={
        !conditions.configured
          ? "not-configured"
          : conditions.hour
            ? "ready"
            : "no-data"
      }
      sun={conditions.sun}
      testID="day-conditions"
      timeZone={conditions.timeZone}
    />
  );
}

/** A block's honest error or offline state (loading is the skeleton). */
export function BlockState({
  status,
  reference,
  lastFreshAt,
  onRetry,
  what,
}: {
  readonly status: BlockStatus;
  readonly reference?: string | null;
  readonly lastFreshAt?: Date | null;
  readonly onRetry: () => void;
  /** "Today", "Your schedule". */
  readonly what: string;
}) {
  if (status === "offline")
    return <OfflineState compact lastFreshAt={lastFreshAt} onRetry={onRetry} />;
  if (status === "error")
    return (
      <ErrorState
        compact
        onRetry={onRetry}
        reference={reference ?? undefined}
        text={`${what} could not refresh. What you see may be out of date.`}
        title="Couldn't refresh"
      />
    );
  return null;
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  rail: { width: 72, gap: 4, alignItems: "flex-start", paddingTop: 1 },
  railLine: { width: 2, alignSelf: "stretch", borderRadius: 1 },
  rowText: { flex: 1, gap: 4 },
  match: { borderWidth: 1, gap: 6 },
  matchTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  matchWhen: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  matchAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 32,
  },
});
