import {
  ASK_DUNA_MODEL,
  askDunaConversationInput,
  askDunaEffortSchema,
  askDunaOperationCatalog,
  assertAskDunaAdmin,
  assertAskDunaOperator,
  bindAskDunaSession,
  consumeRateLimit,
  createAskDunaConversation,
  getAskDunaAdminOverview,
  getAskDunaConversation,
  getAskDunaTranscript,
  hasDunaAiGatewayCredential,
  listAskDunaActions,
  listAskDunaConversations,
  readAskDunaReferences,
  reviewAskDunaOperation,
  updateAskDunaControls,
  updateAskDunaConversation,
} from "@duna/api";
import { Client } from "eve/client";
import { z } from "zod";
import { askDunaRequestContext } from "@/lib/ask-duna-auth";
import { assertAskDunaOrigin, readAskDunaJson } from "@/lib/ask-duna-http";
import {
  hasAskDunaSessionSecret,
  signAskDunaToken,
} from "@/lib/ask-duna-tokens";

export const runtime = "nodejs";
export const maxDuration = 60;
type Route = { params: Promise<{ path?: string[] }> };
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "cache-control": "no-store" } });

async function handle(request: Request, { params }: Route) {
  try {
    const { actor } = await askDunaRequestContext(request);
    if (!actor || actor.isDemo)
      return json({ error: "Sign in to use Ask Duna." }, 401);
    const path = (await params).path ?? [];
    if (path.length > 3) return json({ error: "Not found." }, 404);
    const [resource, id, action] = path;
    const url = new URL(request.url);
    if (request.method !== "GET") assertAskDunaOrigin(request);
    if (resource === "admin") {
      assertAskDunaAdmin(actor);
      if (request.method === "GET" && !id)
        return json({
          ...(await getAskDunaAdminOverview(actor)),
          runtime: {
            gatewayConfigured: hasDunaAiGatewayCredential(),
            sessionSecretConfigured: hasAskDunaSessionSecret(),
            model: process.env.DUNA_ASK_MODEL || ASK_DUNA_MODEL,
            engine: "eve",
            channels: ["Duna HQ", "Chat SDK review cards"],
          },
        });
      if (request.method === "PATCH" && id === "controls")
        return json(
          await updateAskDunaControls(
            actor,
            z
              .object({ enabled: z.boolean(), mutationsEnabled: z.boolean() })
              .strict()
              .parse(await readAskDunaJson(request)),
          ),
        );
      if (request.method === "GET" && id) {
        z.uuid().parse(id);
        return json({
          conversation: await getAskDunaConversation(actor, id, true),
          events: await getAskDunaTranscript(actor, id, true),
          actions: await listAskDunaActions(actor, id, true),
        });
      }
    }
    assertAskDunaOperator(actor);
    if (resource === "capabilities" && request.method === "GET")
      return json({
        capabilities: askDunaOperationCatalog(
          actor,
          url.searchParams.get("q") ?? "",
        ),
      });
    if (resource === "references" && request.method === "GET") {
      const kind =
        url.searchParams.get("kind") === "events" ? "events" : "members";
      return json({
        kind,
        records: await readAskDunaReferences(
          actor,
          kind,
          (url.searchParams.get("q") ?? "").slice(0, 120),
        ),
      });
    }
    if (resource !== "conversations") return json({ error: "Not found." }, 404);
    if (!id && request.method === "GET")
      return json(
        await listAskDunaConversations(
          actor,
          (url.searchParams.get("q") ?? "").slice(0, 120),
          url.searchParams.get("archived") === "true",
          z.coerce
            .number()
            .int()
            .min(0)
            .max(100_000)
            .parse(url.searchParams.get("offset") ?? 0),
        ),
      );
    if (!id && request.method === "POST") {
      if (!hasAskDunaSessionSecret() || !hasDunaAiGatewayCredential())
        return json(
          {
            error:
              "Ask Duna is awaiting its agent connection. Your operator workspace is still available.",
          },
          503,
        );
      const rate = await consumeRateLimit({
        key: `ask-duna-create:${actor.personId}`,
        capacity: 10,
        refillPerMinute: 2,
        now: new Date(),
      });
      if (!rate.allowed)
        return json(
          { error: "Please wait before starting another conversation." },
          429,
        );
      const input = askDunaConversationInput.parse(
        await readAskDunaJson(request),
      );
      const conversation = await createAskDunaConversation(actor, input);
      const token = await signAskDunaToken({
        sub: actor.personId,
        organizationId: actor.organizationId,
        conversationId: conversation.id,
        sessionId: null,
        purpose: "create",
      });
      const client = new Client({
        host: process.env.DUNA_ASK_AGENT_ORIGIN || url.origin,
        auth: { bearer: token },
        redirect: "manual",
        headers: process.env.VERCEL_AUTOMATION_BYPASS_SECRET
          ? {
              "x-vercel-protection-bypass":
                process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
            }
          : undefined,
      });
      try {
        const { session } = await client.sessions.create();
        return json(
          {
            conversation: await bindAskDunaSession(
              actor,
              conversation.id,
              session.state.sessionId,
            ),
          },
          201,
        );
      } catch {
        await updateAskDunaConversation(actor, conversation.id, {
          archived: true,
        });
        return json(
          { error: "The agent could not start. Try again in a moment." },
          503,
        );
      }
    }
    const conversationId = z.uuid().parse(id);
    const conversation = await getAskDunaConversation(actor, conversationId);
    if (!action && request.method === "GET")
      return json({
        conversation,
        actions: await listAskDunaActions(actor, conversationId),
      });
    if (!action && request.method === "PATCH") {
      const input = z
        .object({
          title: z.string().trim().min(1).max(120).optional(),
          effort: askDunaEffortSchema.optional(),
          archived: z.boolean().optional(),
        })
        .strict()
        .parse(await readAskDunaJson(request));
      return json({
        conversation: await updateAskDunaConversation(
          actor,
          conversationId,
          input,
        ),
      });
    }
    if (action === "token" && request.method === "POST") {
      if (!conversation.sessionId)
        return json({ error: "This conversation has no active session." }, 409);
      return json({
        token: await signAskDunaToken({
          sub: actor.personId,
          organizationId: actor.organizationId,
          conversationId,
          sessionId: conversation.sessionId,
          purpose: "operate",
        }),
      });
    }
    if (action === "actions" && request.method === "GET")
      return json({ actions: await listAskDunaActions(actor, conversationId) });
    if (action === "review" && request.method === "POST") {
      const input = z
        .object({
          actionId: z.uuid(),
          decision: z.enum(["approve", "decline"]),
        })
        .strict()
        .parse(await readAskDunaJson(request));
      return json({
        action: await reviewAskDunaOperation(
          actor,
          conversationId,
          input.actionId,
          input.decision,
        ),
      });
    }
    return json({ error: "Not found." }, 404);
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    const status =
      (
        {
          BAD_REQUEST: 400,
          UNAUTHORIZED: 401,
          FORBIDDEN: 403,
          NOT_FOUND: 404,
          CONFLICT: 409,
          PAYLOAD_TOO_LARGE: 413,
          PRECONDITION_FAILED: 503,
        } as Record<string, number>
      )[code] ?? (error instanceof z.ZodError ? 400 : 500);
    return json(
      {
        error:
          status === 500
            ? "Ask Duna is unavailable. Please try again."
            : error instanceof Error
              ? error.message
              : "Request could not be completed.",
      },
      status,
    );
  }
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
