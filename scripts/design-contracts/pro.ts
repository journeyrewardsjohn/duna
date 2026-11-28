import { adaptiveScreenCheck } from "./adaptive-screens";
import type { SurfaceContract } from "./types";

/** Paths on the Duna Design System; `src/features/**` entries also get the adaptive-layout rule. */
const migrated: readonly string[] = [];

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
      "apps/pro/assets/icon-light.png",
      "apps/pro/assets/icon-tinted.png",
      "apps/pro/assets/monochrome-icon.png",
    ].map((path) => ({ kind: "exists", path }) as const),
  ],
};
