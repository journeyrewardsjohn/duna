"use server";

/**
 * Joining a team entry from its claim link (`claimTeamEntry`), and the
 * captain changing the roster (`updateTeamEntryRoster`, which invites the new
 * people listed: the captain presses send after a confirmation).
 */
import { headers } from "next/headers";
import type { ActionResult } from "@/components/player/action-result";
import type { TeamClaim } from "@/components/player/api-types";
import { runAction } from "@/components/player/server-action";
import { getServerCaller } from "@/lib/api";

function applicationOrigin(headersValue: Headers): string {
  const protocol = headersValue.get("x-forwarded-proto") ?? "https";
  const host =
    headersValue.get("x-forwarded-host") ??
    headersValue.get("host") ??
    "localhost:3000";
  return `${protocol}://${host}`;
}

export async function updateTeamRosterAction(input: {
  readonly claimToken: string;
  readonly roster: readonly {
    readonly personId?: string;
    readonly inviteTarget?: string;
    readonly displayName?: string;
  }[];
  readonly idempotencyKey: string;
}): Promise<ActionResult<TeamClaim>> {
  return runAction("web.team_claim.roster_failed", async () => {
    const origin = applicationOrigin(new Headers(await headers()));
    const caller = await getServerCaller();
    return caller.player.updateTeamEntryRoster({
      claimToken: input.claimToken,
      roster: [...input.roster],
      applicationOrigin: origin,
      idempotencyKey: input.idempotencyKey,
    });
  });
}

export async function claimTeamAction(input: {
  readonly claimToken: string;
  readonly idempotencyKey: string;
}): Promise<
  ActionResult<{
    readonly message: string;
    readonly paymentRequired: boolean;
  }>
> {
  return runAction("web.team_claim.claim_failed", async () => {
    const caller = await getServerCaller();
    const result = await caller.player.claimTeamEntry({
      claimToken: input.claimToken,
      confirmed: true,
      idempotencyKey: input.idempotencyKey,
    });
    return {
      message:
        result.status === "ready"
          ? "The whole team is in."
          : "Your place on the team is claimed.",
      paymentRequired: result.paymentRequired,
    };
  });
}
