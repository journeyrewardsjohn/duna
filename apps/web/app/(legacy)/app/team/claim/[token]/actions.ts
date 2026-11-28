"use server";

import { headers } from "next/headers";
import { getServerCaller } from "@/lib/api";

function applicationOrigin(headersValue: Headers): string {
  const protocol = headersValue.get("x-forwarded-proto") ?? "https";
  const host =
    headersValue.get("x-forwarded-host") ??
    headersValue.get("host") ??
    "localhost:3000";
  return `${protocol}://${host}`;
}

export interface TeamClaimActionState {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
  readonly paymentRequired?: boolean;
}

export async function updateTeamRosterAction(input: {
  readonly claimToken: string;
  readonly roster: readonly {
    readonly personId?: string;
    readonly inviteTarget?: string;
    readonly displayName?: string;
  }[];
}) {
  try {
    const incoming = await headers();
    const origin = applicationOrigin(new Headers(incoming));
    const caller = await getServerCaller();
    const claim = await caller.player.updateTeamEntryRoster({
      claimToken: input.claimToken,
      roster: [...input.roster],
      applicationOrigin: origin,
      idempotencyKey: crypto.randomUUID(),
    });
    return { ok: true as const, claim };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof Error
          ? error.message
          : "The roster could not be updated.",
    };
  }
}

export async function claimTeamAction(
  _previous: TeamClaimActionState,
  formData: FormData,
): Promise<TeamClaimActionState> {
  try {
    if (String(formData.get("confirmed") ?? "") !== "true") {
      throw new Error("Confirm that you want to join this team.");
    }
    const claimToken = String(formData.get("claimToken") ?? "");
    const caller = await getServerCaller();
    const result = await caller.player.claimTeamEntry({
      claimToken,
      confirmed: true,
      idempotencyKey: crypto.randomUUID(),
    });
    return {
      status: "success",
      message:
        result.status === "ready"
          ? "The full team is now assembled."
          : "Your place on the team is claimed.",
      paymentRequired: result.paymentRequired,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "The team invitation could not be claimed.",
    };
  }
}
