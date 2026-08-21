"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { messageWidgetSchema } from "@duna/messaging-client";
import { getServerCaller } from "@/lib/api";

export interface MessagingActionState {
  readonly status: "idle" | "error";
  readonly message: string;
}

const userFacingErrorCodes = new Set([
  "BAD_REQUEST",
  "CONFLICT",
  "FORBIDDEN",
  "NOT_FOUND",
  "PRECONDITION_FAILED",
  "TOO_MANY_REQUESTS",
  "UNAUTHORIZED",
  "UNPROCESSABLE_CONTENT",
]);

function required(formData: FormData, key: string): string {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

function actionError(error: unknown, fallback: string): MessagingActionState {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : undefined;
  const message =
    error instanceof Error && code && userFacingErrorCodes.has(code)
      ? error.message
      : fallback;
  if (message === fallback) {
    console.error("HQ messaging action failed", error);
  }
  return {
    status: "error",
    message,
  };
}

function widgets(formData: FormData) {
  const raw = formData.get("widgets");
  if (typeof raw !== "string" || !raw.trim()) return [];
  return messageWidgetSchema.array().max(8).parse(JSON.parse(raw));
}

export async function sendOrganizationMessage(
  _previous: MessagingActionState,
  formData: FormData,
): Promise<MessagingActionState> {
  let conversationId: string;
  try {
    conversationId = required(formData, "conversationId");
    const caller = await getServerCaller();
    await caller.messaging.send({
      asPrincipal: "organization",
      message: {
        conversationId,
        clientMessageId: required(formData, "clientMessageId"),
        kind:
          formData.get("announcementOnly") === "true" ? "announcement" : "text",
        body: required(formData, "body"),
        widgets: widgets(formData),
        attachmentUploadIds: [],
      },
    });
  } catch (error) {
    return actionError(error, "The message could not be sent. Try again.");
  }
  revalidatePath("/messages");
  redirect(`/messages?thread=${conversationId}`);
}

export async function createOrganizationConversation(
  _previous: MessagingActionState,
  formData: FormData,
): Promise<MessagingActionState> {
  let conversationId: string;
  try {
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
        initialWidgets: widgets(formData),
        clientMessageId: required(formData, "clientMessageId"),
      },
    });
    conversationId = result.id;
  } catch (error) {
    return actionError(
      error,
      "The conversation could not be created. Review the audience and try again.",
    );
  }
  revalidatePath("/messages");
  redirect(`/messages?thread=${conversationId}`);
}
