"use server";

import { revalidatePath } from "next/cache";
import { getServerCaller } from "@/lib/api";

function required(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${key} required`);
  return value.trim();
}

export async function reviewMessageSafetyCase(formData: FormData) {
  const decision = required(formData, "decision");
  if (
    decision !== "cleared" &&
    decision !== "restricted" &&
    decision !== "escalated"
  ) {
    throw new Error("Invalid review decision");
  }
  const caller = await getServerCaller();
  await caller.messaging.reviewModeration({
    caseId: required(formData, "caseId"),
    decision,
    note: required(formData, "note"),
  });
  revalidatePath("/admin/messaging-safety");
}
