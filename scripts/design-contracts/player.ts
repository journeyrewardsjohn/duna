import { adaptiveScreenCheck } from "./adaptive-screens";
import type { SurfaceContract } from "./types";

/**
 * Duna Player native (`apps/player`). Owners: M-P0 … M-P7 (mobile plan),
 * M-N1 for app config. Contracts follow the component declaration, not the
 * file path, so screens can move during the split.
 */
const legacy =
  "legacy: delete when Player native migrates (M-P0/M-P1)" as const;
const root = "apps/player";
/** Paths on the Duna Design System; `src/features/**` entries also get the adaptive-layout rule. */
const migrated: readonly string[] = [];

export const player: SurfaceContract = {
  surface: "player",
  owners: "M-P0 … M-P7, M-N1",
  migrated,
  checks: [
    adaptiveScreenCheck("player", migrated),
    { kind: "expoAppConfig", app: "player" },
    {
      kind: "fontLoader",
      app: "player",
      loader: "apps/player/satoshi-text.tsx",
      when: "apps/player/satoshi-text.tsx",
      forbidden: [
        "@expo-google-fonts/archivo",
        "Fraunces",
        "Instrument Serif",
        "Figtree",
      ],
    },
    {
      kind: "excludes",
      file: "apps/player/package.json",
      values: ["@expo-google-fonts/archivo"],
      message:
        "apps/player/package.json must bundle font files, not @expo-google-fonts/archivo",
    },
    ...[
      "apps/player/assets/icon-dark.png",
      "apps/player/assets/icon-tinted.png",
      "apps/player/assets/monochrome-icon.png",
    ].map((path) => ({ kind: "exists", path }) as const),
    ...[
      "apps/player/assets/duna-hero.mp4",
      "apps/player/assets/duna-hero-poster.jpg",
      "apps/player/liquid-glass-surface.tsx",
      "apps/player/liquid-glass-surface.ios.tsx",
    ].map((path) => ({ kind: "exists", path, legacy }) as const),
    {
      kind: "includes",
      file: "apps/player/App.tsx",
      values: ["<AppRoot />", "SplashScreen.preventAutoHideAsync()"],
      message:
        "apps/player/App.tsx must mount the design-system root (AppRoot)",
    },
    {
      kind: "includes",
      file: "apps/player/src/app/AppRoot.tsx",
      values: [
        "<ThemeProvider",
        "themeStorage(AsyncStorage)",
        "<HapticsProvider",
        "<AppErrorBoundary",
        "installReactNativeErrorHandler()",
        "<LaunchSequence",
      ],
      message:
        "The Player root must mount the Tideline theme provider, haptics, the observability error boundary and the first-open sequence",
    },
    {
      kind: "includes",
      file: "apps/player/app.json",
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
        "apps/player/app.json must embed the brand fonts (Jost Medium, Geist, Geist Mono) with the expo-font plugin",
    },
    {
      kind: "includes",
      file: "apps/player/satoshi-text.tsx",
      when: "apps/player/satoshi-text.tsx",
      values: ['fontFace("ui"'],
      message:
        "The legacy Player text layer must render the Geist faces while it exists",
    },
    {
      kind: "declares",
      root,
      declarations: ["function HomeScreenV3(", "function HomeV3Screen("],
      values: [
        "const bookingItems = bookings",
        "new Date(booking.endsAt).getTime() > now",
        'title="Next up"',
      ],
      message:
        "Player Home must preserve the booking-derived schedule contract (Next up from future bookings only)",
      legacy:
        "legacy: delete when Home migrates (M-P1); keep the future-only rule in a test",
    },
    {
      kind: "declaresInOrder",
      root,
      declaration: "function HomeV3Screen(",
      markers: [
        "styles.header",
        "styles.taskSection",
        "contentContainerStyle={styles.quickActions}",
        'title="Next up"',
        "styles.tabs",
      ],
      message:
        "Player Home must preserve greeting, editable Duna prompt, quick actions, personal Next up, then secondary discovery",
      legacy: "legacy: delete when Home migrates (M-P1)",
    },
    {
      kind: "declares",
      root,
      declarations: ["function TabBar("],
      values: [
        'destinationButton("home", "Home", "home")',
        'destinationButton("calendar", "Calendar", "calendar")',
        'accessibilityLabel="Duna AI"',
        'accessibilityLabel="Quick actions"',
        'destinationButton("messages", "Messages", "message")',
        "<LiquidGlassSurface",
        "<DunaMark size={mobileGrid[5]} />",
      ],
      message: "Player dock must preserve the icon-only glass dock contract",
      legacy:
        "legacy: delete when the Player shell moves to the system tab bar with Find / Play / Improve / Connect (M-P0)",
    },
    {
      kind: "declares",
      root,
      declarations: ["function PlayerMessagingScreen("],
      values: [
        'accessibilityLabel="Close Duna AI and Messages"',
        'accessibilityHint="Returns to the Player home screen"',
        'accessibilityLabel="Open recent Duna AI chats"',
      ],
      message:
        "Player messaging must preserve the full-screen chat exit contract",
      legacy:
        "legacy: delete when Connect / Concierge migrates (M-P5a); keep an accessible exit",
    },
    {
      kind: "treeExcludes",
      root,
      values: [
        "ThemeButton",
        'AsyncStorage.getItem("duna-theme")',
        "useColorScheme",
      ],
      message: "Player must not restore the retired global appearance control",
      legacy:
        "legacy: delete when the native theme provider lands (M-F1 may read the device scheme)",
    },
  ],
};
