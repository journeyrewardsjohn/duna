import "server-only";

import type { MatchSummary, PersonSummary } from "@duna/core";
import { getAppSession, loadDashboard } from "@/components/app-shell/session";
import type { AppSession } from "@/components/app-shell/session-types";
import { getServerCaller } from "@/lib/api";
import { settleServerRead, type ServerRead } from "@/lib/server-read";
import {
  demoMatch,
  demoMatchList,
  demoMatchScoring,
  demoOpponentOf,
  demoViewerIsOpponent,
  demoWithoutDatabase,
} from "../demo";
import type { ResultScoring } from "../result-copy";

export interface MatchesData {
  readonly session: AppSession;
  readonly me: PersonSummary;
  readonly matches: readonly MatchSummary[];
}

/** The person's results (and, in demo mode, the demo results saved this run). */
export async function loadMatches(): Promise<ServerRead<MatchesData>> {
  const session = await getAppSession();
  return settleServerRead(async () => {
    const caller = await getServerCaller();
    const [dashboard, history] = await Promise.all([
      loadDashboard(),
      caller.player.matches(),
    ]);
    const extra = demoWithoutDatabase(session.demo) ? demoMatchList() : [];
    const seen = new Set(history.map((match) => match.id));
    return {
      session,
      me: dashboard.player,
      matches: [...extra.filter((match) => !seen.has(match.id)), ...history],
    };
  }, "web.matches.read_failed");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface MatchData {
  readonly session: AppSession;
  readonly me: PersonSummary;
  /** Who is looking: the person, or in demo the other side. */
  readonly viewerId: string;
  readonly match: MatchSummary | null;
  readonly scoring?: ResultScoring;
  /** The address people open to confirm (the match's public page). */
  readonly demo: boolean;
}

/**
 * One result: from the person's history (the same list `matchById` reads),
 * with its scoring state for who has confirmed. A missing scoring state only
 * means nobody is named as the one to confirm.
 */
export async function loadMatch(id: string): Promise<ServerRead<MatchData>> {
  const session = await getAppSession();
  return settleServerRead(async () => {
    const caller = await getServerCaller();
    const noDatabase = demoWithoutDatabase(session.demo);
    const dashboard = await loadDashboard();
    const sample = noDatabase ? demoMatch(id) : undefined;
    if (sample) {
      const opponent = (await demoViewerIsOpponent())
        ? demoOpponentOf(id)
        : undefined;
      const scoring = demoMatchScoring(id);
      // The demo movement is the reporter's; the other side sees no figures.
      const rest: MatchSummary = { ...sample.summary };
      delete (rest as { ratingBefore?: number }).ratingBefore;
      delete (rest as { ratingAfter?: number }).ratingAfter;
      return {
        session,
        me: opponent ?? dashboard.player,
        viewerId: opponent?.id ?? dashboard.player.id,
        match: opponent ? { ...rest, ratingDelta: 0 } : sample.summary,
        ...(scoring ? { scoring } : {}),
        demo: true,
      };
    }
    const history = await caller.player.matches();
    const match = history.find((candidate) => candidate.id === id) ?? null;
    let scoring: ResultScoring | undefined;
    if (match && UUID.test(id) && !noDatabase) {
      const state = await settleServerRead(
        () => caller.player.matchScoringState({ matchId: id }),
        "web.match.scoring_failed",
      );
      if (state.ok) {
        scoring = {
          status: state.value.status,
          confirmedPersonIds: state.value.confirmation.confirmedPersonIds,
          pendingClaims:
            state.value.participantClaims?.pending.map((claim) => ({
              personId: claim.personId,
              displayName: claim.displayName,
            })) ?? [],
          ...(state.value.participantClaims?.shareUrl
            ? { shareUrl: state.value.participantClaims.shareUrl }
            : {}),
        };
      }
    }
    return {
      session,
      me: dashboard.player,
      viewerId: dashboard.player.id,
      match,
      ...(scoring ? { scoring } : {}),
      demo: false,
    };
  }, "web.match.read_failed");
}
