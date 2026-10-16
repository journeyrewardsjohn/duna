import { assertAskDunaOperator } from "@duna/api";
import { notFound } from "next/navigation";
import { AskDunaWorkspace } from "@/components/ask-duna-workspace";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller, getServerContext } from "@/lib/api";

export const metadata = { title: "Ask Duna" };

export default async function AskDunaPage({
  params,
}: {
  params: Promise<{ conversation?: string[] }>;
}) {
  const parts = (await params).conversation ?? [];
  if (
    parts.length > 1 ||
    (parts[0] && parts[0] !== "history" && !/^[0-9a-f-]{36}$/i.test(parts[0]))
  )
    notFound();
  const { actor } = await getServerContext();
  assertAskDunaOperator(actor);
  const caller = await getServerCaller();
  const workspace = await caller.operator.workspace();
  return (
    <OperatorShell active="ai" organization={workspace.organization}>
      <AskDunaWorkspace
        key={`${actor.personId}:${actor.organizationId}:${parts[0] ?? "new"}`}
        history={parts[0] === "history"}
        conversationId={parts[0] === "history" ? undefined : parts[0]}
        operatorName={actor.displayName}
        organizationName={workspace.organization.name}
        scopeKey={`${actor.personId}:${actor.organizationId}`}
      />
    </OperatorShell>
  );
}
