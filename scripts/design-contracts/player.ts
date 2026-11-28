import { adaptiveScreenCheck } from "./adaptive-screens";
import type { SurfaceContract } from "./types";

/**
 * Duna Player native (`apps/player`). Owners: M-P0 … M-P7 (mobile plan),
 * M-N1 for app config. Contracts follow the component declaration, not the
 * file path, so screens can move during the split.
 */
const root = "apps/player";
/** Paths on the Duna Design System; `src/features/**` entries also get the adaptive-layout rule. */
const migrated: readonly string[] = [
  "apps/player/src/app",
  "apps/player/src/features/home",
];

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
      "apps/player/assets/icon.png",
      "apps/player/assets/icon-dark.png",
      "apps/player/assets/icon-tinted.png",
      "apps/player/assets/monochrome-icon.png",
      "apps/player/assets/brand/icon.svg",
    ].map((path) => ({ kind: "exists", path }) as const),
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
      kind: "includes",
      file: "apps/player/src/features/home/home-model.ts",
      values: [
        "new Date(booking.endsAt).getTime() > now",
        "const futureBookings = input.bookings",
      ],
      message:
        "Player Home keeps the booking-derived schedule contract (Next up from future bookings only)",
    },
    {
      kind: "includes",
      file: "apps/player/src/features/home/HomeScreen.tsx",
      values: [
        'title="Next up"',
        "<RatingRing",
        "<ConditionsLine",
        "<DunaMark",
        'label="Ask Duna"',
        "<LoadingState",
        "<ErrorState",
        "<OfflineState",
        "<EmptyState",
      ],
      message:
        "Player Home shows Next up, conditions, the two-ring Sand Rating and Ask Duna with the Crest mark, with loading, empty, error and offline states",
    },
    {
      kind: "includes",
      file: "apps/player/src/app/DunaApp.tsx",
      values: ["<NavigationChrome", "centerAction={{", "<TabRoot", "<NewSheet"],
      message:
        "The Player shell is the system tab bar (NavigationChrome) with the centre New action and one TabRoot per tab",
    },
    {
      kind: "includes",
      file: "apps/player/src/app/router.ts",
      values: [
        'key: "find"',
        'key: "play"',
        'key: "improve"',
        'key: "connect"',
        'export const INITIAL_TAB: TabKey = "play"',
      ],
      message:
        "The Player navigates by Find / Play / + / Improve / Connect (contract: Navigation)",
    },
    {
      kind: "includes",
      file: "apps/player/src/app/TabRoot.tsx",
      values: ["<AdaptiveScaffold", "<FoldScaffold", "useRegionLayout()"],
      message:
        "Player tab roots lay out by size class and posture with the adaptive scaffolds",
    },
    {
      kind: "includes",
      file: "apps/player/src/features/find/FindScreen.tsx",
      values: [
        "<SearchBar",
        "<Title>Find</Title>",
        "<LoadingState",
        "<ErrorState",
        "<OfflineState",
        "<EmptyState",
        "<ResultRow",
      ],
      message:
        "Player Find leads with Where · When · What and lists results by What with loading, empty, error and offline states (M-P1)",
    },
    {
      kind: "includes",
      file: "apps/player/src/features/find/FindMap.tsx",
      values: [
        "<MapPin",
        "<MapStyleToggle",
        "mapStyleForZoom",
        "<NotConfiguredState",
      ],
      message:
        "Find's map draws Duna pins by zoom with the single map / satellite toggle and an honest not-set-up state",
    },
    {
      kind: "includes",
      file: "apps/player/src/features/find/SessionDetailScreen.tsx",
      values: [
        "<ParticipationChip",
        "<ParticipationLine",
        "<PriceLadder",
        "player.participation.quote",
        "createInvite",
      ],
      message:
        "A group session shows the backend's participation words, the price ladder and invite (PART-11)",
    },
    {
      kind: "includes",
      file: "apps/player/src/features/booking/BookingSheet.tsx",
      values: [
        "<AdaptiveSheet",
        "The most you can be charged",
        "joinWaitlist",
        "I understand",
      ],
      message:
        "Booking restates the most you can be charged before payment, joins waitlists and asks for the late-cancel acknowledgement",
    },
    {
      kind: "includes",
      file: "apps/player/src/app/AccountScreen.tsx",
      values: ["Create new organisation", "switchOrganization", "Sign out"],
      message:
        "The Player shell keeps the organisation switcher, Create new organisation and sign out (identity chrome)",
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
  ],
};
