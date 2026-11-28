import {
  BEACH_VOLLEYBALL_RULES,
  netScoreState,
  type SetInput,
} from "@duna/tideline-core/score";
import { useMemo, useState, type ReactNode } from "react";
import {
  Modal,
  PixelRatio,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { glyphNames } from "../../icons/glyph-index";
import { DunaMark, DunaWordmark } from "../brand/marks";
import { Icon } from "../icons/Icon";
import {
  ButtonLoader,
  CrossingLoader,
  LiveCrest,
  PullToRefreshIndicator,
  RallyLoader,
  ServeLoader,
  SetBySetLoader,
  Skeleton,
  Spinner,
  TideSweep,
} from "../loaders/loaders";
import { LaunchSequence } from "../loaders/LaunchSequence";
import { useHaptics, type ConfirmationTier } from "../motion/haptics";
import { MotionPreference, useReducedMotion } from "../motion/reduced-motion";
import { Cross, Rally, Rise } from "../motion/Rise";
import {
  describeScoreParts,
  ScoreNumerals,
  useScoreChange,
} from "../motion/score";
import {
  EmptyState,
  ErrorState,
  NotConfiguredState,
  OfflineState,
  PermissionDeniedState,
} from "../states/states";
import { StateAction } from "../states/StateAction";
import { ThemeOverride, useTheme } from "../theme/ThemeProvider";
import {
  nativeTokens,
  type NativeColorRole,
  type NativeTypeStyle,
} from "../tokens";
import { Numerals } from "../type/Numerals";
import { Text } from "../type/Text";
import { Title } from "../type/Title";
import { TitleRegion } from "../type/title-region";

export const FOUNDATION_SECTIONS = [
  "palette",
  "type",
  "icons",
  "motion",
  "loaders",
  "states",
] as const;
export type FoundationSection = (typeof FOUNDATION_SECTIONS)[number];
export type FoundationTheme = "light" | "dark" | "live";

export interface FoundationsOptions {
  readonly section?: FoundationSection | "all";
  readonly theme?: FoundationTheme;
  /** Force reduced motion on (`true`) or follow the device (`undefined`). */
  readonly reduceMotion?: boolean;
}

/**
 * Reads `duna://dev/foundations?section=icons&theme=dark&motion=reduced`
 * (any scheme). Pure; unit-tested.
 */
export function parseFoundationsUrl(
  url: string | null | undefined,
): FoundationsOptions | null {
  const match = url?.match(/^[a-z-]+:\/\/dev\/foundations(?:\?(.*))?$/);
  if (!match) return null;
  const params = new Map(
    (match[1] ?? "")
      .split("&")
      .filter(Boolean)
      .map((pair) => pair.split("=") as [string, string]),
  );
  const section = params.get("section");
  const theme = params.get("theme");
  return {
    section:
      section && (FOUNDATION_SECTIONS as readonly string[]).includes(section)
        ? (section as FoundationSection)
        : "all",
    theme:
      theme === "dark" || theme === "live"
        ? theme
        : theme === "light"
          ? "light"
          : undefined,
    reduceMotion: params.get("motion") === "reduced" ? true : undefined,
  };
}

function Chip({
  label,
  selected,
  onPress,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
}) {
  const { colors, tokens } = useTheme();
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 36,
        justifyContent: "center",
        paddingHorizontal: tokens.space["3"],
        borderRadius: tokens.radius.pill,
        borderWidth: 1,
        borderColor: selected ? colors.action : colors["line-strong"],
        backgroundColor: selected ? colors.action : colors.surface,
      }}
    >
      <Text tone={selected ? "on-action" : "text"} variant="label">
        {label}
      </Text>
    </Pressable>
  );
}

function Section({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  const { colors, tokens } = useTheme();
  return (
    <View style={{ gap: tokens.space["3"], paddingTop: tokens.space["6"] }}>
      <Text
        family="mono"
        style={{ textTransform: "uppercase" }}
        tone="text-3"
        variant="micro"
      >
        {title}
      </Text>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: tokens.radius.lg,
          borderWidth: 1,
          borderColor: colors.line,
          padding: tokens.space["4"],
          gap: tokens.space["4"],
        }}
      >
        {children}
      </View>
    </View>
  );
}

const ROLE_GROUPS: ReadonlyArray<
  readonly [string, readonly NativeColorRole[]]
> = [
  [
    "Grounds",
    [
      "ground",
      "surface",
      "surface-subtle",
      "surface-sunken",
      "surface-raised",
      "surface-warm",
    ],
  ],
  [
    "Lines",
    [
      "line",
      "line-strong",
      "border-control",
      "focus",
      "selected",
      "selected-ring",
    ],
  ],
  [
    "Text",
    ["text", "text-2", "text-3", "text-disabled", "text-inverse", "link"],
  ],
  [
    "Action",
    [
      "action",
      "action-hover",
      "on-action",
      "action-soft",
      "on-action-soft",
      "action-disabled",
    ],
  ],
  [
    "Warm signal",
    ["sun", "sun-ink", "sun-wash", "energy", "energy-ink", "energy-wash"],
  ],
  ["Live (Solar)", ["live", "live-ink", "live-wash"]],
  [
    "Status",
    [
      "positive",
      "positive-wash",
      "warning",
      "warning-wash",
      "danger",
      "danger-wash",
      "info",
      "info-wash",
      "attention",
      "attention-wash",
    ],
  ],
];

function Palette() {
  const { colors, theme, tokens } = useTheme();
  return (
    <>
      <View style={styles.wrap}>
        {Object.entries(tokens.brand).map(([name, value]) => (
          <View key={name} style={styles.brandSwatch}>
            <View
              style={[
                styles.swatch,
                { backgroundColor: value, borderColor: colors.line },
              ]}
            />
            <Text variant="micro">{name}</Text>
            <Text family="mono" tone="text-3" variant="micro">
              {value}
            </Text>
          </View>
        ))}
      </View>
      <Text tone="text-2" variant="phone-meta">
        {`Roles in the ${theme} theme`}
      </Text>
      {ROLE_GROUPS.map(([group, roles]) => (
        <View key={group} style={{ gap: tokens.space["2"] }}>
          <Text variant="label" weight={600}>
            {group}
          </Text>
          <View style={styles.wrap}>
            {roles.map((role) => (
              <View key={role} style={styles.roleSwatch}>
                <View
                  style={[
                    styles.swatchSmall,
                    {
                      backgroundColor: colors[role],
                      borderColor: colors["line-strong"],
                    },
                  ]}
                />
                <View style={{ flexShrink: 1 }}>
                  <Text numberOfLines={1} variant="micro">
                    {role}
                  </Text>
                  <Text family="mono" tone="text-3" variant="micro">
                    {colors[role]}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}
    </>
  );
}

const TYPE_SAMPLES: ReadonlyArray<readonly [NativeTypeStyle, string]> = [
  ["phone-title-sm", "Golden hour doubles"],
  ["nav-title", "Book a court"],
  ["phone-heading", "Open matches near you"],
  ["phone-body", "Court 3, 90 min, under lights"],
  ["label", "Save result"],
  ["body", "Players see this when they book."],
  ["phone-meta", "8 km · Manhattan Beach"],
  ["micro", "10:30 PM"],
  ["code", "DUNA-7Q4K-2M"],
];

function TypeRoles() {
  const fontScale = PixelRatio.getFontScale();
  return (
    <>
      <Text tone="text-2" variant="phone-meta">
        {`System text size: ${fontScale.toFixed(2)}x`}
      </Text>
      <View>
        <Text tone="text-3" variant="micro">
          Title: Jost Medium 500, one per screen
        </Text>
        <TitleRegion name="type-sample">
          <Title>Meet you at the net</Title>
        </TitleRegion>
      </View>
      {TYPE_SAMPLES.map(([style, sample]) => (
        <View key={style}>
          <Text tone="text-3" variant="micro">
            {`${style} · ${nativeTokens.type[style].fontSize}/${nativeTokens.type[style].lineHeight}`}
          </Text>
          <Text variant={style}>{sample}</Text>
        </View>
      ))}
      <View>
        <Text tone="text-3" variant="micro">
          Numerals: Geist Mono, tabular
        </Text>
        <View style={{ flexDirection: "row", gap: 16, alignItems: "baseline" }}>
          <Numerals variant="figure-xl">21–18</Numerals>
          <Numerals variant="figure">3.42</Numerals>
          <Numerals family="ui" variant="figure-sm">
            $24.00
          </Numerals>
        </View>
      </View>
    </>
  );
}

function Icons() {
  return (
    <>
      <View style={{ flexDirection: "row", gap: 16, alignItems: "flex-end" }}>
        {(["chip", "inline", "control", "nav"] as const).map((size) => (
          <View key={size} style={{ alignItems: "center", gap: 4 }}>
            <Icon name="find" size={size} />
            <Text tone="text-3" variant="micro">
              {nativeTokens.icon.size[size]}
            </Text>
          </View>
        ))}
      </View>
      <View style={styles.wrap}>
        {glyphNames.map((name) => (
          <View key={name} style={styles.iconCell}>
            <Icon name={name} size="nav" />
            <Text numberOfLines={1} tone="text-2" variant="micro">
              {name}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}

function MotionVerbs() {
  const { colors, tokens } = useTheme();
  const reduceMotion = useReducedMotion();
  const haptics = useHaptics();
  const [rise, setRise] = useState(0);
  const [rally, setRally] = useState(0);
  const [cross, setCross] = useState(0);
  const [sets, setSets] = useState<SetInput[]>([{ home: 19, away: 18 }]);
  const state = useMemo(
    () =>
      netScoreState({
        status: "live",
        sets,
        bestOf: 3,
        rules: BEACH_VOLLEYBALL_RULES,
        names: { home: "Duna", away: "Sunset" },
      }),
    [sets],
  );
  const change = useScoreChange(state, {
    names: { home: "Duna", away: "Sunset" },
  });
  const point = (side: "home" | "away") =>
    setSets((current) => {
      const last = current[current.length - 1]!;
      return [...current.slice(0, -1), { ...last, [side]: last[side] + 1 }];
    });
  const headline =
    state.headline.kind === "points" ? state.headline : { home: 0, away: 0 };
  const bar = { height: 8, borderRadius: 4, backgroundColor: colors.action };
  return (
    <>
      <Text tone="text-2" variant="phone-meta">
        {reduceMotion
          ? "Reduced motion: each verb is a 200 ms fade"
          : "Rise 600 ms · Rally 120 ms apart · Cross 320 ms"}
      </Text>
      <View style={{ gap: 8 }}>
        <Rise from="left" mode="grow" trigger={rise}>
          <View style={[bar, { width: "70%" }]} />
        </Rise>
        <Rise trigger={rise}>
          <Text variant="phone-body">Booking confirmed for Sat 10:30 AM</Text>
        </Rise>
        <StateAction
          kind="quiet"
          label="Play Rise"
          onPress={() => setRise((n) => n + 1)}
        />
      </View>
      <View style={{ gap: 8 }}>
        <Rally trigger={rally}>
          {["Mara / Theo", "Noa / Elena", "Ari / Liv"].map((name) => (
            <View key={name} style={[styles.row, { borderColor: colors.line }]}>
              <Text variant="phone-body">{name}</Text>
            </View>
          ))}
        </Rally>
        <StateAction
          kind="quiet"
          label="Play Rally"
          onPress={() => setRally((n) => n + 1)}
        />
      </View>
      <View style={{ gap: 8, overflow: "hidden" }}>
        <Cross crossKey={cross}>
          <View style={[styles.row, { borderColor: colors.line }]}>
            <Text variant="phone-body">
              {cross % 2 === 0 ? "Find" : "Play"}
            </Text>
          </View>
        </Cross>
        <StateAction
          kind="quiet"
          label="Play Cross"
          onPress={() => setCross((n) => n + 1)}
        />
      </View>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <ScoreNumerals value={headline.home} variant="figure-xl" />
          <View
            style={{
              width: 1.5,
              height: 48,
              backgroundColor: colors["line-strong"],
            }}
          />
          <ScoreNumerals value={headline.away} variant="figure-xl" />
        </View>
        <Text
          accessibilityLiveRegion="polite"
          tone="text-2"
          variant="phone-meta"
        >
          {change.parts.length > 0
            ? describeScoreParts(change.parts, { home: "Duna", away: "Sunset" })
            : state.accessibleSummary}
        </Text>
        <View style={styles.wrap}>
          <StateAction
            kind="quiet"
            label="Point Duna"
            onPress={() => point("home")}
          />
          <StateAction
            kind="quiet"
            label="Point Sunset"
            onPress={() => point("away")}
          />
          <StateAction
            kind="quiet"
            label="Reset"
            onPress={() => setSets([{ home: 19, away: 18 }])}
          />
        </View>
      </View>
      <View style={styles.wrap}>
        {([0, 1, 2] as ConfirmationTier[]).map((tier) => (
          <StateAction
            key={tier}
            kind="quiet"
            label={`Haptic tier ${tier}`}
            onPress={() => haptics.confirmed(tier)}
          />
        ))}
      </View>
      <View style={{ height: tokens.space["2"] }} />
    </>
  );
}

function Loaders({ onFirstOpen }: { readonly onFirstOpen: () => void }) {
  const { colors, tokens } = useTheme();
  const [done, setDone] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  return (
    <>
      <View style={[styles.wrap, { alignItems: "flex-end", gap: 24 }]}>
        <RallyLoader label="Rally" />
        <CrossingLoader label="Crossing" size={36} />
        <SetBySetLoader done={done} label={`Set by set ${done}/3`} steps={3} />
        <View style={{ alignItems: "center" }}>
          <PullToRefreshIndicator progress={0.7} refreshing={refreshing} />
          <Text tone="text-2" variant="phone-meta">
            Pull to refresh
          </Text>
        </View>
      </View>
      <View style={styles.wrap}>
        <StateAction
          kind="quiet"
          label="Next step"
          onPress={() => setDone((n) => (n >= 3 ? 0 : n + 1))}
        />
        <StateAction
          kind="quiet"
          label={refreshing ? "Stop refresh" : "Release"}
          onPress={() => setRefreshing((r) => !r)}
        />
      </View>
      <View style={{ gap: 6 }}>
        <Text tone="text-2" variant="phone-meta">
          Tide sweep
        </Text>
        <TideSweep />
      </View>
      <View style={{ gap: 6 }}>
        <Text tone="text-2" variant="phone-meta">
          Sand shimmer
        </Text>
        <Skeleton count={2} kind="row" />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            minHeight: tokens.size.target,
            paddingHorizontal: 20,
            borderRadius: tokens.radius.pill,
            backgroundColor: colors.action,
          }}
        >
          <ButtonLoader color={colors["on-action"]} size={16} />
          <Text tone="on-action" variant="label" weight={600}>
            Saving
          </Text>
        </View>
        <Spinner size="xs" />
        <Spinner size="sm" />
        <Spinner size="lg" />
        <LiveCrest />
      </View>
      <View style={{ borderRadius: tokens.radius.lg, overflow: "hidden" }}>
        <ServeLoader height={180} label="Serve" />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
        <DunaMark size={40} />
        <DunaWordmark width={96} />
      </View>
      <StateAction label="Play first open" onPress={onFirstOpen} />
    </>
  );
}

function States() {
  const now = new Date();
  return (
    <>
      <EmptyState
        action={{ label: "Find a game", onPress: () => undefined }}
        compact
        text="Games you join show up here."
        title="Nothing on your calendar yet"
      />
      <ErrorState
        compact
        onRetry={() => undefined}
        reference="err_7Q4K2M9XAB"
      />
      <OfflineState
        compact
        lastFreshAt={new Date(now.getTime() - 12 * 60_000)}
        now={now}
        queued={2}
      />
      <NotConfiguredState compact feature="Text messages" />
      <PermissionDeniedState
        compact
        what="payouts"
        who="an owner of your club"
      />
    </>
  );
}

/**
 * The development-only Foundations gallery (each app's dev area): palette by
 * role, type roles, the icon sheet, the motion verbs, loaders and the state
 * parts, in light, dark and live, with reduced motion forced or from the
 * device. Open with `duna://dev/foundations` / `duna-pro://dev/foundations`
 * (query: `section`, `theme`, `motion=reduced`).
 */
export function FoundationsScreen({
  appName,
  onClose,
  initial = {},
}: {
  readonly appName: string;
  readonly onClose: () => void;
  readonly initial?: FoundationsOptions;
}) {
  const [theme, setTheme] = useState<FoundationTheme>(initial.theme ?? "light");
  const [reduced, setReduced] = useState<boolean | undefined>(
    initial.reduceMotion,
  );
  const [section, setSection] = useState<FoundationSection | "all">(
    initial.section ?? "all",
  );
  const [launching, setLaunching] = useState(false);
  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible
    >
      <ThemeOverride theme={theme}>
        <MotionPreference reduceMotion={reduced ?? null}>
          <TitleRegion name="foundations">
            <Body
              appName={appName}
              launching={launching}
              onClose={onClose}
              reduced={reduced}
              section={section}
              setLaunching={setLaunching}
              setReduced={setReduced}
              setSection={setSection}
              setTheme={setTheme}
              theme={theme}
            />
          </TitleRegion>
        </MotionPreference>
      </ThemeOverride>
    </Modal>
  );
}

function Body({
  appName,
  onClose,
  theme,
  setTheme,
  reduced,
  setReduced,
  section,
  setSection,
  launching,
  setLaunching,
}: {
  readonly appName: string;
  readonly onClose: () => void;
  readonly theme: FoundationTheme;
  readonly setTheme: (theme: FoundationTheme) => void;
  readonly reduced: boolean | undefined;
  readonly setReduced: (value: boolean | undefined) => void;
  readonly section: FoundationSection | "all";
  readonly setSection: (section: FoundationSection | "all") => void;
  readonly launching: boolean;
  readonly setLaunching: (value: boolean) => void;
}) {
  const { colors, tokens } = useTheme();
  const insets = useSafeAreaInsets();
  const show = (name: FoundationSection) =>
    section === "all" || section === name;
  return (
    <View style={{ flex: 1, backgroundColor: colors.ground }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + tokens.space["4"],
          paddingBottom: insets.bottom + tokens.space["12"],
          paddingHorizontal: tokens.space["4"],
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            family="mono"
            style={{ textTransform: "uppercase" }}
            tone="text-3"
            variant="micro"
          >
            {`${appName} · development only`}
          </Text>
          <StateAction kind="quiet" label="Close" onPress={onClose} />
        </View>
        <Title>Foundations</Title>
        <View style={[styles.wrap, { marginTop: tokens.space["3"] }]}>
          {(["light", "dark", "live"] as const).map((value) => (
            <Chip
              key={value}
              label={
                value === "live" ? "Live" : value === "dark" ? "Dark" : "Light"
              }
              onPress={() => setTheme(value)}
              selected={theme === value}
            />
          ))}
          <Chip
            label="Reduced motion"
            onPress={() => setReduced(reduced ? undefined : true)}
            selected={reduced === true}
          />
        </View>
        <View style={[styles.wrap, { marginTop: tokens.space["2"] }]}>
          {(["all", ...FOUNDATION_SECTIONS] as const).map((value) => (
            <Chip
              key={value}
              label={value[0]!.toUpperCase() + value.slice(1)}
              onPress={() => setSection(value)}
              selected={section === value}
            />
          ))}
        </View>
        {show("palette") ? (
          <Section title="Palette by role">
            <Palette />
          </Section>
        ) : null}
        {show("type") ? (
          <Section title="Type roles">
            <TypeRoles />
          </Section>
        ) : null}
        {show("icons") ? (
          <Section title={`Icons · ${glyphNames.length} glyphs · 1.75 stroke`}>
            <Icons />
          </Section>
        ) : null}
        {show("motion") ? (
          <Section title="Motion verbs">
            <MotionVerbs />
          </Section>
        ) : null}
        {show("loaders") ? (
          <Section title="Loaders">
            <Loaders onFirstOpen={() => setLaunching(true)} />
          </Section>
        ) : null}
        {show("states") ? (
          <Section title="State parts">
            <States />
          </Section>
        ) : null}
      </ScrollView>
      {launching ? (
        <LaunchSequence onComplete={() => setLaunching(false)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  brandSwatch: { gap: 2, width: 96 },
  iconCell: { alignItems: "center", gap: 4, width: 76, paddingVertical: 6 },
  roleSwatch: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    width: 150,
  },
  row: { borderRadius: 8, borderWidth: 1, padding: 12 },
  swatch: { borderRadius: 8, borderWidth: 1, height: 40, width: 88 },
  swatchSmall: { borderRadius: 6, borderWidth: 1, height: 28, width: 28 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
});
