import { adaptiveScreenCheck } from "./adaptive-screens";
import type { SurfaceContract } from "./types";

/** Paths on the Duna Design System; `src/features/**` entries also get the adaptive-layout rule. */
const migrated: readonly string[] = [
  "apps/pro/src/app",
  "apps/pro/src/features/today",
  "apps/pro/src/features/session",
  "apps/pro/src/features/availability",
  "apps/pro/src/features/cover",
  "apps/pro/src/features/earnings",
];

/** Duna Pro native (`apps/pro`). Owners: M-F5, M-R0 … M-R6, M-N1 for app config. */
export const pro: SurfaceContract = {
  surface: "pro",
  owners: "M-F5, M-R0 … M-R6, M-N1",
  migrated,
  checks: [
    adaptiveScreenCheck("pro", migrated),
    { kind: "expoAppConfig", app: "pro" },
    {
      kind: "fontLoader",
      app: "pro",
      loader: "apps/pro/satoshi-text.tsx",
      when: "apps/pro/satoshi-text.tsx",
      forbidden: [
        "@expo-google-fonts/archivo",
        "Fraunces",
        "Instrument Serif",
        "Figtree",
      ],
    },
    {
      kind: "excludes",
      file: "apps/pro/package.json",
      values: ["@expo-google-fonts/archivo"],
      message:
        "apps/pro/package.json must bundle font files, not @expo-google-fonts/archivo",
    },
    ...[
      "apps/pro/assets/icon-dark.png",
      "apps/pro/assets/icon-tinted.png",
      "apps/pro/assets/monochrome-icon.png",
    ].map((path) => ({ kind: "exists", path }) as const),
    {
      kind: "includes",
      file: "apps/pro/App.tsx",
      values: ["<AppRoot />", "SplashScreen.preventAutoHideAsync()"],
      message: "apps/pro/App.tsx must mount the design-system root (AppRoot)",
    },
    {
      kind: "includes",
      file: "apps/pro/src/app/AppRoot.tsx",
      values: [
        "<ThemeProvider",
        "themeStorage(AsyncStorage)",
        "<HapticsProvider",
        "<AppErrorBoundary",
        "installReactNativeErrorHandler()",
        "<LaunchSequence",
      ],
      message:
        "The Pro root must mount the Tideline theme provider, haptics, the observability error boundary and the first-open sequence",
    },
    {
      kind: "includes",
      file: "apps/pro/app.json",
      values: [
        "../../packages/ui/assets/fonts/Geist-Regular.ttf",
        "../../packages/ui/assets/fonts/Geist-Medium.ttf",
        "../../packages/ui/assets/fonts/Geist-SemiBold.ttf",
        "../../packages/ui/assets/fonts/Geist-Bold.ttf",
        "../../packages/ui/assets/fonts/GeistMono-Regular.ttf",
        "../../packages/ui/assets/fonts/GeistMono-Medium.ttf",
        "../../packages/ui/assets/fonts/GeistMono-SemiBold.ttf",
        "../../packages/ui/assets/fonts/Jost-Medium.ttf",
      ],
      message:
        "apps/pro/app.json must embed the brand fonts (Jost Medium, Geist, Geist Mono) with the expo-font plugin",
    },
    {
      kind: "includes",
      file: "apps/pro/src/app/ProApp.tsx",
      values: ["<NavigationChrome", "<TabRoot", "<NewSheet", "<DayProvider"],
      message:
        "The Pro shell is the system tab bar (NavigationChrome) with one TabRoot per tab, the Create sheet and one day source",
    },
    {
      kind: "includes",
      file: "apps/pro/src/app/router.ts",
      values: [
        'key: "today"',
        'key: "schedule"',
        'key: "people"',
        'key: "inbox"',
        'key: "money"',
        'coach: "Students"',
        'coach: "Threads"',
        'coach: "Earnings"',
        'export const INITIAL_TAB: TabKey = "today"',
      ],
      message:
        "Duna Pro navigates by the coach tabs, shaped by role (board P00-NavMap, contract R15)",
    },
    {
      kind: "includes",
      file: "apps/pro/src/app/TabRoot.tsx",
      values: ["<AdaptiveScaffold", "<FoldScaffold", "useRegionLayout()"],
      message:
        "Pro tab roots lay out by size class and posture with the adaptive scaffolds",
    },
    {
      kind: "includes",
      file: "apps/pro/src/app/TopBar.tsx",
      values: [
        "<DunaMark",
        'label="Ask Duna"',
        'label="Create"',
        "Preview data · live operations and money actions are off",
      ],
      message:
        "Every Pro tab has the top bar (organisation, Ask Duna with the Crest mark, Create, account) and the quiet preview notice",
    },
    {
      kind: "excludes",
      file: "apps/pro/src/app/TopBar.tsx",
      values: ["PREVIEW DATA"],
      message: "The preview notice is sentence case, never capitals",
    },
    {
      kind: "includes",
      file: "apps/pro/src/app/AccountScreen.tsx",
      values: ["Create new organisation", "switchOrganization", "Sign out"],
      message:
        "The Pro shell keeps the organisation switcher, Create new organisation and sign out (identity chrome)",
    },
    {
      kind: "includes",
      file: "apps/pro/src/features/today/TodayScreen.tsx",
      values: [
        "<DayConditionsLine",
        "<UpNextCard",
        "<DayComplete",
        "<NeedsYou",
        "<LoadingState",
        "<EmptyState",
        "<ErrorState",
      ],
      message:
        "Pro Today shows one line of conditions, up next, what needs the coach and the day-complete state, with loading, empty and error states",
    },
    {
      kind: "includes",
      file: "apps/pro/src/features/today/parts.tsx",
      values: ["<ConditionsLine", "<LiveZone>", "<OfflineState"],
      message:
        "Today and Schedule draw conditions as one line (never a card), live matches in the Live zone, and an offline state",
    },
    {
      kind: "includes",
      file: "apps/pro/satoshi-text.tsx",
      when: "apps/pro/satoshi-text.tsx",
      values: ['fontFace("ui"'],
      message:
        "The legacy Pro text layer must render the Geist faces while it exists",
    },
  ],
};
