import type { SurfaceContract } from "./types";

/**
 * Duna Player native (`apps/player`). Owners: M-P0 … M-P7 (mobile plan),
 * M-N1 for app config. Contracts follow the component declaration, not the
 * file path, so screens can move during the split.
 */
const legacy =
  "legacy: delete when Player native migrates (M-P0/M-P1)" as const;
const root = "apps/player";

export const player: SurfaceContract = {
  surface: "player",
  owners: "M-P0 … M-P7, M-N1",
  migrated: [],
  checks: [
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
      file: "apps/player/satoshi-text.tsx",
      when: "apps/player/satoshi-text.tsx",
      values: [
        "./assets/fonts/Satoshi-Light.ttf",
        "./assets/fonts/Satoshi-Regular.ttf",
        "./assets/fonts/Satoshi-Medium.ttf",
        "./assets/fonts/Satoshi-Bold.ttf",
        "./assets/fonts/Satoshi-Black.ttf",
      ],
      message:
        "apps/player/satoshi-text.tsx must load every local Satoshi face",
      legacy: "legacy: delete when Player text moves to @duna/ui/native (M-F1)",
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
