"use server";

import { getServerCaller } from "@/lib/api";

export async function previewAudienceAction(input: {
  readonly mode: "static" | "dynamic" | "hybrid";
  readonly ruleAst: unknown;
  readonly includePersonIds: readonly string[];
  readonly excludePersonIds: readonly string[];
}) {
  const caller = await getServerCaller();
  return caller.operator.previewAudience({
    ...input,
    ruleAst: input.ruleAst as never,
    includePersonIds: [...input.includePersonIds],
    excludePersonIds: [...input.excludePersonIds],
  });
}

export async function createAudienceAction(input: {
  readonly name: string;
  readonly mode: "static" | "dynamic" | "hybrid";
  readonly ruleAst: unknown;
  readonly includePersonIds: readonly string[];
  readonly excludePersonIds: readonly string[];
  readonly idempotencyKey: string;
}) {
  const caller = await getServerCaller();
  return caller.operator.createAudience({
    ...input,
    ruleAst: input.ruleAst as never,
    includePersonIds: [...input.includePersonIds],
    excludePersonIds: [...input.excludePersonIds],
    idempotencyKey: input.idempotencyKey,
  });
}

export async function reviseAudienceAction(input: {
  readonly audienceId: string;
  readonly ruleAst: unknown;
  readonly includePersonIds: readonly string[];
  readonly excludePersonIds: readonly string[];
  readonly idempotencyKey: string;
}) {
  const caller = await getServerCaller();
  return caller.operator.reviseAudience({
    ...input,
    ruleAst: input.ruleAst as never,
    includePersonIds: [...input.includePersonIds],
    excludePersonIds: [...input.excludePersonIds],
    idempotencyKey: input.idempotencyKey,
  });
}

export async function archiveAudienceAction(
  audienceId: string,
  idempotencyKey: string,
) {
  const caller = await getServerCaller();
  return caller.operator.archiveAudience({ audienceId, idempotencyKey });
}
