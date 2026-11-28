"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getServerCaller } from "@/lib/api";

export type HealthCheckInActionState = {
  readonly status: "idle" | "success" | "error";
  readonly message?: string;
};

function rating(formData: FormData, key: string): number {
  const value = Number(formData.get(key));
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error("Complete each 1–5 check-in rating.");
  }
  return value;
}

export async function saveHealthCheckInAction(
  _previous: HealthCheckInActionState,
  formData: FormData,
): Promise<HealthCheckInActionState> {
  try {
    const date = String(formData.get("date") ?? "");
    const practiceRpeValue = String(formData.get("practiceRpe") ?? "");
    const practiceMinutesValue = String(formData.get("practiceMinutes") ?? "");
    const practiceRpe = practiceRpeValue ? Number(practiceRpeValue) : undefined;
    const practiceMinutes = practiceMinutesValue
      ? Number(practiceMinutesValue)
      : undefined;
    const note = String(formData.get("note") ?? "").trim() || undefined;
    const caller = await getServerCaller();
    await caller.player.saveHealthCheckIn({
      checkIn: {
        date,
        perceivedRecovery: rating(formData, "perceivedRecovery"),
        energy: rating(formData, "energy"),
        stress: rating(formData, "stress"),
        soreness: rating(formData, "soreness"),
        practiceRpe,
        practiceMinutes,
        note,
      },
      idempotencyKey: randomUUID(),
    });
    revalidatePath("/app/health");
    return {
      status: "success",
      message:
        "Your private check-in is now part of today’s readiness context.",
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Your private check-in could not be saved.",
    };
  }
}
