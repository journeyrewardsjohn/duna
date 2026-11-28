import type { EventSummary, MatchSummary } from "@duna/core";
import { createContext, useContext } from "react";
import type { HomeQuickAction } from "../features/home/home-quick-action";
import type { CourtBookingRequest } from "../features/courts/court-types";
import type { VideoTransferStatus } from "../../video-studio";
import type { WatchScoreDraft } from "../../watch-scoring";
import type { RouteKey, TabKey } from "./router";
import type { RouteEntry, ShellAction } from "./shell-state";

/**
 * What every screen inside the shell can ask of it: navigate, and open the
 * sheets the shell owns (bookings, events, matches, clubs, court booking,
 * create a match). Screens never hold their own copy of navigation state.
 */
export interface ShellNavigation {
  readonly dispatch: (action: ShellAction) => void;
  readonly open: (
    route: RouteKey,
    options?: Omit<Extract<ShellAction, { type: "open" }>, "type" | "route">,
  ) => void;
  readonly back: (tab: TabKey) => void;
  /** A Home or New-sheet action ("find-match", "record-video", …). */
  readonly action: (action: HomeQuickAction) => void;
  readonly askDuna: (prompt?: string) => void;
  readonly openBooking: (bookingId: string) => void;
  readonly openEvent: (event: EventSummary) => void;
  readonly openEventAtIndex: (index: number) => void;
  readonly registerForEvent: (index: number) => void;
  readonly openMatch: (match: MatchSummary) => void;
  readonly openOrganization: (slug: string) => void;
  readonly openVenue: (venueId: string) => void;
  readonly openCourtBooking: (request: CourtBookingRequest) => void;
  readonly createMatch: () => void;
  readonly editProfile: () => void;
  readonly openArtwork: () => void;
  readonly openPath: (href: string) => void;
  readonly unreadMessages: number;
  readonly setUnreadMessages: (count: number) => void;
  readonly watchScoreDraft?: WatchScoreDraft;
  readonly reviewWatchScore: (draft: WatchScoreDraft) => void;
  /** The film studio reports upload progress for the shell banner. */
  readonly onVideoTransfer: (status: VideoTransferStatus | undefined) => void;
  /** Long press on the preview chip (preview builds): the Layout lab. */
  readonly openLayoutLab: () => void;
}

export const ShellContext = createContext<ShellNavigation | null>(null);

export function useShell(): ShellNavigation {
  const value = useContext(ShellContext);
  if (!value) throw new Error("useShell must be used inside the Player shell");
  return value;
}

/** The route a screen was opened with (its intent, thread or prompt). */
export const RouteEntryContext = createContext<RouteEntry | null>(null);
