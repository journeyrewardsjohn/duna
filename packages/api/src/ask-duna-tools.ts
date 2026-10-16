import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { appRouter, createCaller } from "./router";
import type { ApiActor } from "./context";
import { askDunaActionInput } from "./ask-duna-contracts";
import { ASK_DUNA_CAPABILITIES } from "./ask-duna-capabilities";
import {
  assertAskDunaEnabled,
  assertAskDunaOperator,
  claimAskDunaAction,
  getAskDunaConversation,
  resolveAskDunaActor,
  saveAskDunaAction,
  settleAskDunaAction,
} from "./ask-duna-store";

type Procedure = {
  _def: {
    type: "query" | "mutation" | "subscription";
    meta?: { requiredScope?: string; organizationScoped?: boolean };
    inputs: readonly unknown[];
  };
};

function operationEntry(
  actor: ApiActor,
  name: string,
  expected?: "query" | "mutation",
) {
  assertAskDunaOperator(actor);
  if (
    !/^operator\.[a-zA-Z][a-zA-Z0-9]*$/.test(name) ||
    !ASK_DUNA_CAPABILITIES.has(name.slice(9))
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This operation requires its dedicated Duna workflow.",
    });
  }
  const procedure = (
    appRouter._def.procedures as unknown as Record<string, Procedure>
  )[name];
  const policy = procedure?._def.meta;
  if (
    !procedure ||
    !policy?.organizationScoped ||
    !policy.requiredScope ||
    (expected && procedure._def.type !== expected)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This operation is not available through Ask Duna.",
    });
  }
  if (
    !actor.scopes.includes("*") &&
    !actor.scopes.includes(policy.requiredScope)
  ) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Your Duna role does not permit this operation.",
    });
  }
  return procedure;
}

export function askDunaOperationCatalog(actor: ApiActor, search = "") {
  assertAskDunaOperator(actor);
  const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
  return Object.keys(appRouter._def.procedures).flatMap((name) => {
    try {
      const procedure = operationEntry(actor, name);
      if (procedure._def.type === "subscription") return [];
      const label = name.slice(9).replace(/([a-z])([A-Z])/g, "$1 $2");
      if (
        !terms.every((term) =>
          `${name} ${label} ${procedure._def.meta?.requiredScope}`
            .toLowerCase()
            .includes(term),
        )
      )
        return [];
      return [
        {
          name,
          label,
          kind: procedure._def.type,
          scope: procedure._def.meta!.requiredScope!,
          approvalRequired: procedure._def.type === "mutation",
        },
      ];
    } catch {
      return [];
    }
  });
}

export function describeAskDunaOperation(actor: ApiActor, name: string) {
  const procedure = operationEntry(actor, name);
  const inputs = procedure._def.inputs.map((schema) =>
    z.toJSONSchema(schema as z.ZodType, {
      io: "input",
      unrepresentable: "any",
    }),
  );
  return {
    name,
    kind: procedure._def.type,
    approvalRequired: procedure._def.type === "mutation",
    inputSchema:
      inputs.length === 0
        ? { type: "object", properties: {} }
        : inputs.length === 1
          ? inputs[0]
          : { allOf: inputs },
    note: "Use actual IDs returned by Duna. The server supplies idempotencyKey for changes. Authorization and all domain validation run again when executed.",
  };
}

function validateInput(procedure: Procedure, input: Record<string, unknown>) {
  let parsed: unknown = input;
  for (const schema of procedure._def.inputs)
    parsed = (schema as z.ZodType).parse(input);
  return parsed;
}

function boundedResult(value: unknown) {
  const text = JSON.stringify(value ?? null);
  return text.length <= 48_000
    ? (JSON.parse(text) as unknown)
    : {
        truncated: true,
        excerpt: text.slice(0, 48_000),
        instruction:
          "Narrow the query to a specific record for complete details.",
      };
}

async function callOperation(
  actor: ApiActor,
  name: string,
  input: unknown,
  requestId: string,
) {
  const caller = createCaller({ actor, requestId, now: new Date() });
  const procedure = (
    caller.operator as unknown as Record<
      string,
      (input: unknown) => Promise<unknown>
    >
  )[name.slice(9)];
  return procedure!(input);
}

export async function readAskDunaOperation(
  actor: ApiActor,
  name: string,
  input: Record<string, unknown> = {},
) {
  await assertAskDunaEnabled();
  const procedure = operationEntry(actor, name, "query");
  return boundedResult(
    await callOperation(
      actor,
      name,
      validateInput(procedure, input),
      crypto.randomUUID(),
    ),
  );
}

export async function readAskDunaReferences(
  actor: ApiActor,
  kind: "members" | "events",
  search = "",
) {
  await assertAskDunaEnabled();
  const name = `operator.${kind}`;
  const procedure = operationEntry(actor, name, "query");
  const result = await callOperation(
    actor,
    name,
    validateInput(procedure, {}),
    crypto.randomUUID(),
  );
  if (!Array.isArray(result)) return [];
  // Project only picker fields before applying the normal tool response limit.
  return result
    .flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const row = value as Record<string, unknown>;
      const label = row.displayName ?? row.title ?? row.name;
      return typeof row.id === "string" &&
        typeof label === "string" &&
        label.toLowerCase().includes(search.toLowerCase())
        ? [{ id: row.id, name: label }]
        : [];
    })
    .slice(0, 50);
}

export async function proposeAskDunaOperation(
  actor: ApiActor,
  conversationId: string,
  raw: unknown,
) {
  const proposal = askDunaActionInput.parse(raw);
  const procedure = operationEntry(actor, proposal.operation, "mutation");
  // Validate before showing a proposal, without calling a mutating procedure.
  validateInput(procedure, {
    ...proposal.input,
    idempotencyKey: crypto.randomUUID(),
  });
  return saveAskDunaAction(actor, conversationId, proposal);
}

export async function reviewAskDunaOperation(
  actor: ApiActor,
  conversationId: string,
  actionId: string,
  decision: "approve" | "decline",
) {
  const conversation = await getAskDunaConversation(actor, conversationId);
  const currentActor = await resolveAskDunaActor(
    actor.personId,
    conversation.organizationId,
  );
  const action = await claimAskDunaAction(
    currentActor,
    conversationId,
    actionId,
    decision,
  );
  if (decision === "decline") return { ...action, status: "declined" };
  try {
    await assertAskDunaEnabled(true);
    const procedure = operationEntry(
      currentActor,
      action.operation,
      "mutation",
    );
    const result = boundedResult(
      await callOperation(
        currentActor,
        action.operation,
        validateInput(procedure, action.input),
        action.id,
      ),
    );
    const receipt = { operation: action.operation, output: result };
    await settleAskDunaAction(action.id, "succeeded", receipt);
    return { ...action, status: "succeeded", result: receipt };
  } catch (error) {
    // A timeout can follow an external side effect. Never replay automatically.
    const knownRejection =
      error instanceof z.ZodError ||
      (error instanceof TRPCError &&
        [
          "BAD_REQUEST",
          "FORBIDDEN",
          "UNAUTHORIZED",
          "NOT_FOUND",
          "PRECONDITION_FAILED",
        ].includes(error.code));
    const status = knownRejection ? "failed" : "uncertain";
    const result = {
      error: knownRejection
        ? (error as Error).message
        : "The outcome could not be confirmed. Check the affected record before trying again.",
    };
    await settleAskDunaAction(action.id, status, result);
    return { ...action, status, result };
  }
}
