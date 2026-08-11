import {
  getDatabase,
  isDatabaseConfigured,
  messagingConversationParticipants,
  messagingConversations,
  organizationMemberships,
} from "@duna/db";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { waitUntil } from "@vercel/functions";
import type { ApiActor } from "./context";

const SUPPORT_CHANNEL = "wake:staff:support";
const PUBLISH_TIMEOUT_MS = 2_500;
const STREAM_LIFETIME_MS = 50_000;

interface UpstashConfiguration {
  readonly url: string;
  readonly token: string;
}

function upstashConfiguration(): UpstashConfiguration | undefined {
  const url = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/+$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return undefined;
  return { url, token };
}

function userChannel(personId: string): string {
  return `wake:user:${personId}`;
}

export function messagingWakeChannelsForActor(
  actor: ApiActor,
): readonly string[] {
  return [
    userChannel(actor.personId),
    ...(actor.roles.includes("admin") || actor.roles.includes("super-admin")
      ? [SUPPORT_CHANNEL]
      : []),
  ];
}

async function publishCommands(
  commands: readonly (readonly ["PUBLISH", string, string])[],
): Promise<boolean> {
  const configuration = upstashConfiguration();
  if (!configuration || commands.length === 0) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PUBLISH_TIMEOUT_MS);
  try {
    const response = await fetch(`${configuration.url}/pipeline`, {
      body: JSON.stringify(commands),
      headers: {
        authorization: `Bearer ${configuration.token}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Publishes only a hint after a committed write. Neon remains the source of
 * truth, so a missing or failed publish never changes the write result.
 */
export async function publishConversationWakeUp(input: {
  readonly conversationId: string;
  readonly seq: number;
}): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const database = getDatabase();
  const [conversation, participants] = await Promise.all([
    database.query.messagingConversations.findFirst({
      columns: { type: true },
      where: eq(messagingConversations.id, input.conversationId),
    }),
    database
      .select({
        organizationId: messagingConversationParticipants.organizationId,
        personId: messagingConversationParticipants.personId,
        principalType: messagingConversationParticipants.principalType,
      })
      .from(messagingConversationParticipants)
      .where(
        and(
          eq(
            messagingConversationParticipants.conversationId,
            input.conversationId,
          ),
          isNull(messagingConversationParticipants.leftAt),
        ),
      ),
  ]);
  const personIds = new Set(
    participants.flatMap((participant) =>
      participant.principalType === "user" && participant.personId
        ? [participant.personId]
        : [],
    ),
  );
  const organizationIds = [
    ...new Set(
      participants.flatMap((participant) =>
        participant.principalType === "organization" &&
        participant.organizationId
          ? [participant.organizationId]
          : [],
      ),
    ),
  ];
  if (organizationIds.length > 0) {
    const staff = await database
      .select({ personId: organizationMemberships.personId })
      .from(organizationMemberships)
      .where(
        and(
          inArray(organizationMemberships.organizationId, organizationIds),
          eq(organizationMemberships.active, true),
          inArray(organizationMemberships.role, [
            "owner",
            "manager",
            "coach",
            "front-desk",
          ]),
        ),
      );
    for (const member of staff) personIds.add(member.personId);
  }
  const channels = new Set([...personIds].map(userChannel));
  if (conversation?.type === "support") channels.add(SUPPORT_CHANNEL);
  const payload = JSON.stringify({ c: input.conversationId, s: input.seq });
  return publishCommands(
    [...channels].map((channel) => ["PUBLISH", channel, payload] as const),
  );
}

export function scheduleConversationWakeUp(input: {
  readonly conversationId: string;
  readonly seq: number;
}): void {
  const task = publishConversationWakeUp(input).catch(() => false);
  if (process.env.VERCEL) {
    try {
      waitUntil(task);
      return;
    } catch {
      // Local and non-request workers do not have a Vercel request context.
    }
  }
  void task;
}

export async function openMessagingUpdatesStream(input: {
  readonly actor: ApiActor;
  readonly signal?: AbortSignal;
}): Promise<Response> {
  if (process.env.MESSAGING_SSE_ENABLED === "false") {
    return Response.json(
      {
        error:
          "Messaging wake-ups are disabled; cursor polling remains active.",
      },
      { status: 503 },
    );
  }
  const configuration = upstashConfiguration();
  if (!configuration) {
    return Response.json(
      {
        error:
          "Messaging wake-ups are not configured; cursor polling remains active.",
      },
      { status: 503 },
    );
  }
  const channels = messagingWakeChannelsForActor(input.actor);
  const controller = new AbortController();
  const abort = () => controller.abort();
  input.signal?.addEventListener("abort", abort, { once: true });
  const subscribeUrl = `${configuration.url}/subscribe/${channels
    .map(encodeURIComponent)
    .join("/")}`;
  let upstream: Response;
  try {
    upstream = await fetch(subscribeUrl, {
      headers: {
        accept: "text/event-stream",
        authorization: `Bearer ${configuration.token}`,
      },
      method: "POST",
      signal: controller.signal,
    });
  } catch {
    input.signal?.removeEventListener("abort", abort);
    return Response.json(
      { error: "Messaging wake-ups are temporarily unavailable." },
      { status: 503 },
    );
  }
  if (!upstream.ok || !upstream.body) {
    controller.abort();
    input.signal?.removeEventListener("abort", abort);
    return Response.json(
      { error: "Messaging wake-ups are temporarily unavailable." },
      { status: 503 },
    );
  }

  const encoder = new TextEncoder();
  const reader = upstream.body.getReader();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(streamController) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (deadline) clearTimeout(deadline);
        input.signal?.removeEventListener("abort", abort);
        controller.abort();
        void reader.cancel().catch(() => undefined);
        try {
          streamController.close();
        } catch {
          // The browser may already have closed the stream.
        }
      };
      input.signal?.addEventListener("abort", close, { once: true });
      heartbeat = setInterval(() => {
        if (!closed)
          streamController.enqueue(encoder.encode(": heartbeat\n\n"));
      }, 20_000);
      deadline = setTimeout(close, STREAM_LIFETIME_MS);
      streamController.enqueue(encoder.encode(": connected\n\n"));
      void (async () => {
        try {
          while (!closed) {
            const result = await reader.read();
            if (result.done) break;
            streamController.enqueue(result.value);
          }
        } catch {
          // Reconnection and cursor gap-fill are owned by the client engine.
        } finally {
          close();
        }
      })();
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      if (deadline) clearTimeout(deadline);
      input.signal?.removeEventListener("abort", abort);
      controller.abort();
      return reader.cancel().catch(() => undefined);
    },
  });
  return new Response(stream, {
    headers: {
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "content-type": "text/event-stream; charset=utf-8",
      "x-accel-buffering": "no",
    },
  });
}
