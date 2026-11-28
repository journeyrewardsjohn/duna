import { adaptiveScreenCheck } from "./adaptive-screens";
import type { SurfaceContract } from "./types";

/**
 * Duna Player native (`apps/player`). Owners: M-P0 … M-P7 (mobile plan),
 * M-N1 for app config. Contracts follow the component declaration, not the
 * file path, so screens can move during the split.
 */
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
