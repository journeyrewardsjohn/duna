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

export async function sendOrganizationMessage(formData: FormData) {
  const conversationId = required(formData, "conversationId");
  const caller = await getServerCaller();
  await caller.messaging.send({
    asPrincipal: "organization",
    message: {
      conversationId,
      clientMessageId: required(formData, "clientMessageId"),
      kind:
        formData.get("announcementOnly") === "true" ? "announcement" : "text",
      body: required(formData, "body"),
      widgets: [],
      attachmentUploadIds: [],
    },
  });
  revalidatePath("/messages");
  redirect(`/messages?thread=${conversationId}`);
}

export async function createOrganizationConversation(formData: FormData) {
  const caller = await getServerCaller();
  const audienceValue = required(formData, "audience");
  const [audienceType, audienceId, ...labelParts] = audienceValue.split("::");
  const label = labelParts.join("::");
  const organizationId = required(formData, "organizationId");
  const selectedRecipientPersonIds = formData
    .getAll("recipientPersonId")
    .filter((value): value is string => typeof value === "string");
  const recipientPersonIds =
    audienceType === "specific" ? selectedRecipientPersonIds : [];
  const context =
    audienceType === "specific"
      ? undefined
      : {
          type:
            audienceType === "league"
              ? ("league" as const)
              : audienceType === "division"
                ? ("division" as const)
                : audienceType === "lesson"
                  ? ("lesson" as const)
                  : audienceType === "rental"
                    ? ("rental" as const)
                    : audienceType === "organization"
                      ? ("organization" as const)
                      : ("event" as const),
          id: audienceId || organizationId,
          label: label || "Organization members",
          organizationId,
        };
  const result = await caller.messaging.create({
    asPrincipal: "organization",
    conversation: {
      type:
        audienceType === "league"
          ? "league"
          : audienceType === "division"
            ? "division"
            : audienceType === "event"
              ? "event"
              : "group",
      title: required(formData, "title"),
      recipientPersonIds,
      context,
      announcementOnly: formData.get("announcementOnly") === "on",
      followerBroadcast: false,
      initialMessage: required(formData, "message"),
      clientMessageId: required(formData, "clientMessageId"),
    },
  });
  revalidatePath("/messages");
  redirect(`/messages?thread=${result.id}`);
}
