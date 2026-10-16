import type { Page } from "@playwright/test";

export const askConversationId = "30000000-0000-4000-8000-000000000001";
export async function installAskDunaFixture(
  page: Page,
  options: {
    creationFails?: boolean;
    recoverableFailure?: boolean;
    assistantReply?: string;
  } = {},
) {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const turns: Record<string, unknown>[] = [];
  let modelRecovered = false;
  const conversation = {
    id: askConversationId,
    sessionId: "test-eve-session",
    title: "Plan next week",
    preview: "Review the court schedule",
    effort: "medium",
    page: "/ask",
    status: "ready",
    updatedAt: new Date().toISOString(),
    archivedAt: null as string | null,
  };
  let action = {
    id: "40000000-0000-4000-8000-000000000001",
    operation: "operator.createCourt",
    input: { name: "Court 2" },
    summary: "Add Court 2 to your venue",
    status: "pending",
    expiresAt: new Date(Date.now() + 900_000).toISOString(),
    result: null as Record<string, unknown> | null,
  };
  await page.route("**/api/ask-duna/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname.replace("/api/ask-duna/", "");
    const method = route.request().method();
    const body = method !== "GET" ? (route.request().postDataJSON() ?? {}) : {};
    if (method !== "GET") writes.push({ path, body });
    if (path === "conversations" && method === "POST") {
      if (options.creationFails)
        return route.fulfill({
          status: 503,
          json: { error: "The agent could not start. Try again in a moment." },
        });
      Object.assign(conversation, body);
      return route.fulfill({ status: 201, json: { conversation } });
    }
    if (path === "conversations") {
      const matches =
        !url.searchParams.get("q") ||
        `${conversation.title} ${conversation.preview}`
          .toLowerCase()
          .includes(url.searchParams.get("q")!.toLowerCase());
      return route.fulfill({
        json: {
          conversations:
            matches &&
            (!conversation.archivedAt ||
              url.searchParams.get("archived") === "true")
              ? [conversation]
              : [],
          nextOffset: null,
        },
      });
    }
    if (path === `conversations/${askConversationId}`) {
      if (method === "PATCH")
        Object.assign(
          conversation,
          body,
          body.archived === undefined
            ? {}
            : { archivedAt: body.archived ? new Date().toISOString() : null },
        );
      return route.fulfill({ json: { conversation, actions: [action] } });
    }
    if (path.endsWith("/token"))
      return route.fulfill({ json: { token: "test-browser-transport-only" } });
    if (path.endsWith("/actions"))
      return route.fulfill({ json: { actions: [action] } });
    if (path.endsWith("/review")) {
      action = {
        ...action,
        status: body.decision === "approve" ? "succeeded" : "declined",
        result: { operation: action.operation, output: { name: "Court 2" } },
      };
      return route.fulfill({ json: { action } });
    }
    if (path === "references")
      return route.fulfill({
        json: {
          records:
            url.searchParams.get("kind") === "events"
              ? [{ id: "event-test", title: "Friday open play" }]
              : [{ id: "person-test", displayName: "Devon Parker" }],
        },
      });
    return route.fulfill({
      status: 404,
      json: { error: "Test route not found" },
    });
  });
  await page.route("**/eve/v1/**", async (route) => {
    if (route.request().method() === "POST") {
      turns.push(route.request().postDataJSON());
      return route.fulfill({
        status: 202,
        json: { sessionId: "test-eve-session", deliveryId: "delivery-test" },
      });
    }
    const failed = options.recoverableFailure && !modelRecovered;
    const events = [
      { type: "session.started", data: {} },
      { type: "turn.started", data: { sequence: 0, turnId: "turn-test" } },
      {
        type: "message.received",
        data: {
          sequence: 1,
          turnId: "turn-test",
          message: "Help me add a court",
          parts: [{ type: "text", text: "Help me add a court" }],
        },
      },
      {
        type: "step.started",
        data: {
          sequence: 2,
          turnId: "turn-test",
          stepIndex: 0,
          modelId: "test-model",
        },
      },
      ...(failed
        ? [
            {
              type: "turn.failed",
              data: {
                sequence: 3,
                turnId: "turn-test",
                code: "MODEL_CALL_FAILED",
                message: "The AI Gateway project budget has been exceeded.",
                terminal: false,
              },
            },
          ]
        : [
            {
              type: "message.completed",
              data: {
                sequence: 3,
                turnId: "turn-test",
                stepIndex: 0,
                finishReason: "stop",
                message:
                  options.assistantReply ??
                  "I’ve prepared the change for your review. **Court 2** will be added when you approve it.",
              },
            },
            {
              type: "turn.completed",
              data: { sequence: 4, turnId: "turn-test" },
            },
          ]),
      {
        type: "session.waiting",
        data: {
          continuationToken: "test-eve-session",
          wait: "next-user-message",
        },
      },
    ].map((event, index) => ({
      ...event,
      meta: {
        id: `${options.recoverableFailure ? (failed ? "failed-" : "recovered-") : ""}event-${index}`,
        at: new Date().toISOString(),
        deliveryIds: ["delivery-test"],
      },
    }));
    return route.fulfill({
      headers: {
        "content-type": "application/x-ndjson",
        "x-eve-stream-format": "ndjson",
        "x-eve-stream-version": "26",
        "x-eve-stream-tail-index": String(events.length),
      },
      body: events.map((event) => JSON.stringify(event)).join("\n") + "\n",
    });
  });
  return {
    writes,
    turns,
    conversation,
    recoverModel: () => {
      modelRecovered = true;
    },
  };
}
