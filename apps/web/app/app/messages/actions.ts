"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerCaller } from "@/lib/api";

function required(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

export async function sendPlayerMessage(formData: FormData) {
  const conversationId = required(formData, "conversationId");
  const body = required(formData, "body");
  const clientMessageId = required(formData, "clientMessageId");
  const support = formData.get("support") === "true";
  const caller = await getServerCaller();
  if (support) {
    await caller.messaging.askDuna({
      conversationId,
      question: body,
      clientMessageId,
      responseClientMessageId: required(formData, "responseClientMessageId"),
    });
  } else {
    await caller.messaging.send({
      asPrincipal: "user",
      message: {
        conversationId,
        clientMessageId,
        kind: "text",
        body,
        widgets: [],
        attachmentUploadIds: [],
      },
    });
  }
  revalidatePath("/app/messages");
  redirect(`/app/messages?thread=${conversationId}`);
}

export async function blockPlayerMessagingPrincipal(formData: FormData) {
  const blockedPrincipalType = required(formData, "principalType");
  if (
    blockedPrincipalType !== "user" &&
    blockedPrincipalType !== "organization"
  ) {
    throw new Error("Unsupported messaging principal");
  }
  const caller = await getServerCaller();
  await caller.messaging.block({
    blockedPrincipalType,
    blockedPrincipalId: required(formData, "principalId"),
    blocked: true,
    reason: "Member stopped future messages from this conversation.",
  });
  revalidatePath("/app/messages");
  redirect("/app/messages");
}

export async function recordPlayerMessageAction(formData: FormData) {
  const actionType = required(formData, "actionType");
  if (
    actionType !== "acknowledge" &&
    actionType !== "quick-action" &&
    actionType !== "poll-vote"
  ) {
    throw new Error("Unsupported message action");
  }
  const caller = await getServerCaller();
  await caller.messaging.act({
    messageId: required(formData, "messageId"),
    actionId: required(formData, "actionId"),
    actionType,
  });
  revalidatePath("/app/messages");
}

export async function ensureDunaSupportConversation() {
  const caller = await getServerCaller();
  const result = await caller.messaging.create({
    asPrincipal: "user",
    conversation: {
      type: "support",
      title: "Duna Support",
      recipientPersonIds: [],
      announcementOnly: false,
      followerBroadcast: false,
    },
  });
  revalidatePath("/app/messages");
  redirect(`/app/messages?thread=${result.id}`);
}

export async function createPlayerConversation(formData: FormData) {
  const caller = await getServerCaller();
  const followerBroadcast = formData.get("followerBroadcast") === "true";
  const recipientPersonIds = formData
    .getAll("recipientPersonId")
    .filter((value): value is string => typeof value === "string");
  const result = await caller.messaging.create({
    asPrincipal: "user",
    conversation: {
      type: followerBroadcast
        ? "broadcast"
        : recipientPersonIds.length === 1
          ? "dm"
          : "group",
      title: required(formData, "title"),
      recipientPersonIds: followerBroadcast ? [] : recipientPersonIds,
      announcementOnly: followerBroadcast,
      followerBroadcast,
      initialMessage: required(formData, "body"),
      clientMessageId: required(formData, "clientMessageId"),
    },
  });
  revalidatePath("/app/messages");
  redirect(`/app/messages?thread=${result.id}`);
}
