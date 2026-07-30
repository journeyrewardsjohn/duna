"use server";

import { revalidatePath } from "next/cache";
import { getServerCaller } from "@/lib/api";

export interface GuardianReviewActionState {
  readonly status: "idle" | "success" | "error";
  readonly message: string;
}

export async function reviewGuardianshipAction(
  _previous: GuardianReviewActionState,
  formData: FormData,
): Promise<GuardianReviewActionState> {
  const guardianId = String(formData.get("guardianId") ?? "");
  const minorId = String(formData.get("minorId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  if (
    !guardianId ||
    !minorId ||
    !["verified", "rejected"].includes(decision) ||
    reason.length < 10
  ) {
    return {
      status: "error",
      message: "Add a review reason of at least 10 characters.",
    };
  }

  try {
    const caller = await getServerCaller();
    const result = await caller.admin.reviewGuardianship({
      guardianId,
      minorId,
      decision: decision as "verified" | "rejected",
      reason,
      idempotencyKey: crypto.randomUUID(),
    });
    revalidatePath("/admin");
    revalidatePath("/admin/trust");
    return {
      status: "success",
      message:
        result.status === "verified"
          ? "Relationship verified. Guardian-gated flows are now available."
          : "Relationship rejected and retained in the audit record.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Review could not be saved.",
    };
  }
}
