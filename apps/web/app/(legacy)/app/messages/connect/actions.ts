"use server";
import { getServerCaller } from "@/lib/api";
export interface ChannelLinkState {
  error?: string;
  command?: string;
  endpoint?: string;
  clubName?: string;
  expiresAt?: string;
  disconnected?: boolean;
}
export async function connectPhone(
  _previous: ChannelLinkState,
  form: FormData,
): Promise<ChannelLinkState> {
  try {
    const caller = await getServerCaller();
    if (form.get("intent") === "disconnect") {
      await caller.messaging.revokeChannelLinks();
      return { disconnected: true };
    }
    return await caller.messaging.beginChannelLink({
      conversationId: String(form.get("conversationId") ?? ""),
    });
  } catch (error) {
    return {
      error:
        error instanceof Error &&
        "code" in error &&
        ["BAD_REQUEST", "FORBIDDEN", "PRECONDITION_FAILED"].includes(
          String(error.code),
        )
          ? error.message
          : "Could not connect. Please try again.",
    };
  }
}
