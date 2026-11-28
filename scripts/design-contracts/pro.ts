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
      file: "apps/pro/satoshi-text.tsx",
      when: "apps/pro/satoshi-text.tsx",
      values: ['fontFace("ui"'],
      message:
        "The legacy Pro text layer must render the Geist faces while it exists",
    },
  ],
};
