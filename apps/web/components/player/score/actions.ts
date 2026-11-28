"use server";

/**
 * Add a result, signed in (`/app/score`): saved through `recordCompletedMatch`
 * (the procedure the old recorder used), with Duna players by id and people
 * not on Duna by name (and an optional phone or email for their confirm
 * link). The person's own side is confirmed by saving; the other side
 * confirms on the match page.
 */
import type { PersonSummary } from "@duna/core";
import { demoPeople, demoPlayer } from "@duna/core/demo";
import { log } from "@duna/observability";
import { revalidatePath } from "next/cache";
import { getAppSession } from "@/components/app-shell/session";
import { getServerCaller } from "@/lib/api";
import type { ActionResult } from "../action-result";
import { demoWithoutDatabase, recordDemoMatch } from "../demo";
import { runAction } from "../server-action";

export interface ResultPlayer {
  /** A Duna player's person id; absent for someone added by name. */
  readonly personId?: string;
  readonly givenName?: string;
  readonly familyName?: string;
  readonly email?: string;
  readonly phoneE164?: string;
  /** For the demo store: the name the page showed. */
  readonly name: string;
}

export interface SaveResultInput {
  readonly teamA: readonly ResultPlayer[];
  readonly teamB: readonly ResultPlayer[];
  readonly venueId?: string;
  readonly location?: {
    readonly label: string;
    readonly googlePlaceId?: string;
    readonly name?: string;
    readonly address?: string;
    readonly latitude?: number;
    readonly longitude?: number;
  };
  /** `YYYY-MM-DD`, the person's own calendar day. */
  readonly playedOn: string;
  readonly setsToWin: 1 | 2 | 3;
  readonly sets: readonly { readonly a: number; readonly b: number }[];
  readonly matchType: "competitive" | "friendly";
  readonly agreed: true;
  readonly deviceId: string;
  readonly idempotencyKey: string;
}

/** Noon on the day played, so the day never shifts across time zones. */
function playedAt(day: string): string {
  return new Date(`${day}T12:00:00.000Z`).toISOString();
}

export async function saveResultAction(
  input: SaveResultInput,
): Promise<ActionResult<{ readonly matchId: string }>> {
  return runAction("web.score.save_failed", async () => {
    const session = await getAppSession();
    if (demoWithoutDatabase(session.demo)) {
      const people = [demoPlayer, ...demoPeople];
      const asPerson = (player: ResultPlayer, index: number): PersonSummary =>
        (player.personId
          ? people.find((person) => person.id === player.personId)
          : undefined) ??
        ({
          id: crypto.randomUUID(),
          displayName: player.name,
          handle: `new-player-${index}`,
          initials: player.name
            .split(/\s+/)
            .map((part) => part[0] ?? "")
            .join("")
            .slice(0, 2)
            .toUpperCase(),
          homeMarket: "",
          roles: ["player"],
          profileClaimStatus: "unclaimed",
          rating: {
            display: 3,
            mu: 1500,
            phi: 350,
            sigma: 0.06,
            confidence: "Provisional",
            discipline: "beach-2s",
          },
        } as PersonSummary);
      const matchId = recordDemoMatch({
        teamA: input.teamA.map(asPerson),
        teamB: input.teamB.map(asPerson),
        sets: input.sets.map((set) => [set.a, set.b] as const),
        venueName: input.location?.label ?? "Where you played",
        playedAt: playedAt(input.playedOn),
        matchType: input.matchType,
      });
      return { matchId };
    }
    const caller = await getServerCaller();
    const provisional = (side: "A" | "B", players: readonly ResultPlayer[]) =>
      players
        .filter((player) => !player.personId)
        .map((player) => ({
          side,
          givenName: player.givenName ?? player.name,
          familyName: player.familyName ?? "",
          ...(player.email ? { email: player.email } : {}),
          ...(player.phoneE164 ? { phoneE164: player.phoneE164 } : {}),
        }));
    const scoring = await caller.player.recordCompletedMatch({
      teamAIds: input.teamA.flatMap((player) =>
        player.personId ? [player.personId] : [],
      ),
      teamBIds: input.teamB.flatMap((player) =>
        player.personId ? [player.personId] : [],
      ),
      provisionalParticipants: [
        ...provisional("A", input.teamA),
        ...provisional("B", input.teamB),
      ],
      ...(input.venueId ? { venueId: input.venueId } : {}),
      ...(input.location ? { location: input.location } : {}),
      playedAt: playedAt(input.playedOn),
      setsToWin: input.setsToWin,
      setScores: [...input.sets],
      matchType: input.matchType,
      allPlayersAgreedToRecord: true,
      deviceId: input.deviceId,
      idempotencyKey: input.idempotencyKey,
    });
    log.info("web.score.saved", { teamSize: input.teamA.length });
    revalidatePath("/app/matches");
    revalidatePath("/app");
    return { matchId: scoring.matchId };
  });
}

export interface FoundPlayer {
  readonly id: string;
  readonly name: string;
  readonly level?: string;
  readonly detail?: string;
}

/** Duna players by name (two letters or more), for the players step. */
export async function searchResultPlayersAction(
  query: string,
): Promise<readonly FoundPlayer[]> {
  const text = query.trim();
  if (text.length < 2) return [];
  try {
    const caller = await getServerCaller();
    const found = await caller.public.searchPlayers({ query: text, limit: 12 });
    return found.map((person) => ({
      id: person.id,
      name: person.displayName,
      ...(person.sandRating !== null && person.confidence !== "Provisional"
        ? { level: person.sandRating.toFixed(1) }
        : {}),
      ...(person.homeMarket ? { detail: person.homeMarket } : {}),
    }));
  } catch {
    return [];
  }
}
