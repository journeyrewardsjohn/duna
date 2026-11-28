/**
 * Every route's renderer (M-P0). The table in `router.ts` says where a route
 * lives; this map says what it draws. `satisfies Record<RouteKey, …>` makes
 * the compiler refuse a route without a renderer.
 *
 * Legacy screens (`legacy: true` in the table) keep their own props; the
 * shell adapts them here. A screen package that rebuilds a screen replaces
 * its line here with the new screen, which takes no props and reads
 * `useShell()` and `useContext(RouteEntryContext)` instead.
 */
import type { ReactNode } from "react";
import { HealthScreen } from "../../health-screen";
import { PlayerMessagingScreen } from "../../messaging-screen";
import { ProfileHubScreen } from "../../profile-hub";
import { PlayerTrainingScreen } from "../../training-screen";
import { PlansScreen } from "../features/calendar/PlansScreen";
import { FindCoachScreen } from "../features/coaches/FindCoachScreen";
import { CourtTimesScreen } from "../features/find/CourtTimesScreen";
import { SessionDetailScreen } from "../features/find/SessionDetailScreen";
import { PredictionPortfolioScreen } from "../features/predictions/PredictionPortfolioScreen";
import { PerformanceScreen } from "../features/profile/PerformanceScreen";
import { RatingHomeScreen } from "../features/rating/RatingHomeScreen";
import { AddResultScreen } from "../features/score/AddResultScreen";
import { ResultScreen } from "../features/score/ResultScreen";
import { WalletScreen } from "../features/wallet/WalletScreen";
import { colors, rgba } from "../shared/palette";
import { AccountScreen } from "./AccountScreen";
import type { ShellNavigation } from "./ShellContext";
import type { RouteKey } from "./router";
import type { RouteEntry } from "./shell-state";

type Renderer = (entry: RouteEntry, shell: ShellNavigation) => ReactNode;

/** The legacy messaging palette, unchanged until Concierge rebuilds (M-P5a). */
const messagingPalette = {
  canvas: colors.canvas,
  surface: colors.depth,
  surfaceAlt: colors.navyLift,
  border: rgba(colors.overlayRgb, 0.12),
  text: colors.bone,
  muted: colors.muted,
  accent: colors.aqua,
  onAccent: colors.onAccent,
  positive: colors.positive,
  warning: colors.warning,
  danger: colors.danger,
};

export const SCREENS = {
  // Find's root is drawn by `TabRoot` (list, map and search share one
  // provider); opening "discover" applies its intent there.
  discover: () => null,
  session: () => <SessionDetailScreen />,
  court: () => <CourtTimesScreen />,
  coaches: (_entry, shell) => (
    <FindCoachScreen
      onBack={() => shell.back("find")}
      onOpenEvent={shell.openEventAtIndex}
    />
  ),
  plans: (_entry, shell) => (
    <PlansScreen
      onOpenBooking={shell.openBooking}
      onOpenEvent={shell.openEventAtIndex}
      onReserveCourtVenue={shell.openCourtBooking}
      onSeeAllMatches={() => shell.open("discover", { intent: "find-match" })}
      onTraining={() => shell.open("training")}
    />
  ),
  score: (entry, shell) => (
    <AddResultScreen
      draft={shell.scoreDraft}
      key={`${shell.scoreDraft?.id ?? "add-result"}-${entry.nonce}`}
    />
  ),
  result: (entry) => <ResultScreen key={entry.targetId ?? "result"} />,
  // The scorekeeper covers the window; `DunaApp` renders it.
  live: () => null,
  performance: () => <RatingHomeScreen />,
  insights: (_entry, shell) => (
    <PerformanceScreen
      onArtwork={shell.openArtwork}
      onBack={() => shell.open("performance")}
      onEditProfile={shell.editProfile}
      onHealth={() => shell.open("health")}
      onPredictions={() => shell.open("predictions")}
      onWallet={() => shell.open("wallet")}
    />
  ),
  // The film studio stays mounted for the whole session (uploads and the
  // capture session survive switching tabs); `TabRoot` renders it.
  video: () => null,
  health: (_entry, shell) => (
    <HealthScreen onBack={() => shell.back("improve")} theme="light" />
  ),
  training: (_entry, shell) => (
    <PlayerTrainingScreen onBack={() => shell.back("improve")} />
  ),
  you: (_entry, shell) => (
    <ProfileHubScreen
      onArtwork={shell.openArtwork}
      onDestination={(destination) => shell.open(destination)}
      onEditProfile={shell.editProfile}
      onOrganization={shell.openOrganization}
    />
  ),
  messages: (entry, shell) => (
    <PlayerMessagingScreen
      initialConversationId={
        entry.conversationId && entry.conversationId !== "support"
          ? entry.conversationId
          : undefined
      }
      initialSupport={entry.conversationId === "support"}
      key={entry.nonce}
      onClose={() => shell.dispatch({ type: "close-window" })}
      onOpenDunaAi={() => shell.open("ai")}
      onUnreadCountChange={shell.setUnreadMessages}
      palette={messagingPalette}
    />
  ),
  // Ask Duna stays mounted for the whole session (its conversation survives);
  // `DunaApp` renders it over the window.
  ai: () => null,
  wallet: (_entry, shell) => (
    <WalletScreen onClose={() => shell.back("connect")} />
  ),
  predictions: (_entry, shell) => (
    <PredictionPortfolioScreen onBack={() => shell.open("wallet")} />
  ),
  account: () => <AccountScreen />,
} satisfies Record<RouteKey, Renderer>;
