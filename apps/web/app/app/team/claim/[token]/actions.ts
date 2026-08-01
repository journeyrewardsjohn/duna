"use server";

import { getServerCaller } from "@/lib/api";

export interface TeamClaimActionState {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
  readonly paymentRequired?: boolean;
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
