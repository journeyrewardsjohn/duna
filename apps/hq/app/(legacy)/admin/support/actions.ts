"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerCaller } from "@/lib/api";

function required(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${key} required`);
  return value.trim();
}

export async function replyAsDunaSupport(formData: FormData) {
  const conversationId = required(formData, "conversationId");
  const caller = await getServerCaller();
  await caller.messaging.supportReply({
    conversationId,
    body: required(formData, "body"),
    clientMessageId: required(formData, "clientMessageId"),
  });
  revalidatePath("/admin/support");
  redirect(`/admin/support?thread=${conversationId}`);
}
