/**
 * Every route's renderer (M-R0). The table in `router.ts` says where a route
 * lives; this map says what it draws. `satisfies Record<RouteKey, …>` makes
 * the compiler refuse a route without a renderer.
 *
 * Legacy screens (`legacy: true`) keep their own props and the legacy
 * palette; the shell adapts them here. A screen package that rebuilds one
 * replaces its line with the new screen, which reads `useShell()` and
 * `useContext(RouteEntryContext)` instead of props.
 */
import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CoachVideoScreen } from "../../coach-video";
import { GetPaidScreen } from "../../get-paid";
import { ProMessagingScreen } from "../../messaging-screen";
import { MoneyScreen } from "../../money-screen";
import { OperatorCreateScreen } from "../../operator-create";
import { SessionNotesScreen } from "../../session-notes";
import { TicketScannerScreen } from "../../ticket-scanner";
import { TournamentControl } from "../../tournament-control";
import { AvailabilityScreen, TimeAwayScreen } from "../features/availability";
import { CalendarScreen } from "../features/calendar";
import { ScorerScreen } from "../features/courtside";
import { CoverScreen } from "../features/cover";
import { MoreScreen } from "../features/more";
import { PeopleScreen } from "../features/people";
import { AttendanceScreen, SessionScreen } from "../features/session";
import { styles as legacy } from "../legacy/styles";
import { colors, rgba } from "../shared/palette";
import { AccountScreen } from "./AccountScreen";
import type { ShellNavigation } from "./ShellContext";
import type { RouteKey } from "./router";
import type { RouteEntry } from "./shell-state";

export interface ScreenContext {
  readonly shell: ShellNavigation;
  /** Reloads the organisation after a change (create, notes saved). */
  readonly refresh: () => Promise<void>;
  /** The tab a pane route is in (for Back). */
  readonly tab: Parameters<ShellNavigation["back"]>[0];
}

type Renderer = (entry: RouteEntry, context: ScreenContext) => ReactNode;

/** The legacy screens' palette, read when they render (it follows the theme). */
function legacyPalette() {
  return {
    canvas: colors.canvas,
    surface: colors.depth,
    surfaceAlt: colors.navyLift,
    border: rgba(colors.overlayRgb, 0.12),
    text: colors.bone,
    ink: colors.bone,
    muted: colors.muted,
    accent: colors.aqua,
    onAccent: colors.onAccent,
    positive: colors.positive,
    warning: colors.warning,
    danger: colors.danger,
  };
}

function SafeWindow({
  children,
  bottom = true,
}: {
  readonly children: ReactNode;
  readonly bottom?: boolean;
}) {
  return (
    <SafeAreaView
      edges={
        bottom ? ["top", "left", "right", "bottom"] : ["top", "left", "right"]
      }
      style={legacy.safe}
    >
      {children}
    </SafeAreaView>
  );
}

const openMessages = (shell: ShellNavigation, personId: string) =>
  shell.open("messages", { personId });
const openNotes = (
  shell: ShellNavigation,
  sessionId: string,
  personId?: string,
) =>
  shell.open("notes", {
    entryId: sessionId,
    ...(personId ? { personId } : {}),
  });
const openGroup = (
  shell: ShellNavigation,
  entry: { readonly id: string; readonly sourceType: string },
) =>
  shell.open("messages", {
    audienceKey:
      entry.sourceType === "booking"
        ? `rental:${entry.id}`
        : `event:${entry.id}`,
  });

export const SCREENS = {
  courtside: (entry, { shell }) => (
    <SafeWindow bottom={false}>
      <View style={legacy.app}>
        <ScorerScreen
          initialMatchId={entry.matchId}
          key={entry.nonce}
          onExit={shell.closeWindow}
        />
      </View>
    </SafeWindow>
  ),
  notes: (entry, { shell, refresh }) =>
    entry.entryId ? (
      <SessionNotesScreen
        initialPersonId={entry.personId}
        key={entry.nonce}
        onClose={shell.closeWindow}
        onSaved={refresh}
        sessionId={entry.entryId}
      />
    ) : null,
  calendar: (entry, { shell }) => (
    <CalendarScreen
      focusEntryId={entry.entryId}
      key={entry.entryId ?? "calendar"}
      onCreate={() => shell.open("create")}
      onMessageGroup={(calendarEntry) => openGroup(shell, calendarEntry)}
      onOpenSession={(sessionId) =>
        shell.open("session", { entryId: sessionId })
      }
      onRecordNotes={(sessionId) => openNotes(shell, sessionId)}
      onScan={() => shell.open("checkin")}
      onScore={(matchId) => shell.open("courtside", matchId ? { matchId } : {})}
    />
  ),
  checkin: (_entry, { shell }) => (
    <SafeWindow>
      <TicketScannerScreen
        onClose={shell.closeWindow}
        palette={{ ...legacyPalette(), overlay: rgba(colors.inkRgb, 0.35) }}
      />
    </SafeWindow>
  ),
  events: (_entry, { shell }) => (
    <TournamentControl
      onClose={shell.closeWindow}
      onScore={(matchId) => shell.open("courtside", matchId ? { matchId } : {})}
      palette={legacyPalette()}
    />
  ),
  availability: () => <AvailabilityScreen />,
  timeAway: () => <TimeAwayScreen />,
  cover: () => <CoverScreen />,
  people: (_entry, { shell }) => (
    <PeopleScreen
      onMessage={(personId) => openMessages(shell, personId)}
      onRecordNotes={(sessionId, personId) =>
        openNotes(shell, sessionId, personId)
      }
    />
  ),
  film: (_entry, { shell }) => (
    <CoachVideoScreen onClose={shell.closeWindow} palette={legacyPalette()} />
  ),
  messages: (entry, { shell }) => (
    <SafeWindow>
      <ProMessagingScreen
        initialAudienceKey={entry.audienceKey}
        initialConversationId={entry.conversationId}
        initialPersonId={entry.personId}
        key={entry.nonce}
        onClose={shell.closeWindow}
        palette={legacyPalette()}
      />
    </SafeWindow>
  ),
  // Ask Duna: the shell keeps it mounted so its conversation survives.
  ai: () => null,
  money: (_entry, { shell, tab }) => (
    <MoneyScreen
      onClose={() => shell.back(tab)}
      onCollect={() => shell.open("getPaid")}
      palette={{ ...legacyPalette(), navy: colors.navy }}
    />
  ),
  getPaid: (_entry, { shell }) => (
    <GetPaidScreen
      onClose={shell.closeWindow}
      onCreate={() => shell.open("create")}
    />
  ),
  create: (_entry, { shell, refresh }) => (
    <OperatorCreateScreen
      onClose={shell.closeWindow}
      onCreated={refresh}
      onGetPaid={() => shell.open("getPaid")}
    />
  ),
  session: (entry) => (
    <SessionScreen key={entry.entryId} sessionId={entry.entryId} />
  ),
  attendance: (entry) => (
    <AttendanceScreen key={entry.entryId} sessionId={entry.entryId} />
  ),
  account: () => <AccountScreen />,
  tools: (_entry, { shell }) => (
    <MoreScreen
      onCalendar={() => shell.open("calendar")}
      onCreate={() => shell.open("create")}
      onGetPaid={() => shell.open("getPaid")}
      onMessages={() => shell.open("messages")}
      onMoney={() => shell.open("money")}
      onPeople={() => shell.open("people")}
      onTournament={() => shell.open("events")}
      onVideo={() => shell.open("film")}
    />
  ),
} satisfies Record<RouteKey, Renderer>;

/** Ask Duna's palette (the legacy screen's own names). */
export function askDunaPalette() {
  return legacyPalette();
}
