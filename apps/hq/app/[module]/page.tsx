import { notFound } from "next/navigation";
import { ModulePanel } from "@/components/module-panels";
import { operatorModules, type OperatorModule } from "@/components/navigation";
import { OperatorShell } from "@/components/operator-shell";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  const item = operatorModules.find((entry) => entry.slug === module);
  return { title: item?.label ?? "HQ" };
}

export default async function OperatorModulePage({
  params,
}: {
  readonly params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  const item = operatorModules.find((entry) => entry.slug === module);
  if (!item || module === "overview") notFound();
  return (
    <OperatorShell active={module as OperatorModule}>
      <ModulePanel module={module as OperatorModule} />
    </OperatorShell>
  );
}
