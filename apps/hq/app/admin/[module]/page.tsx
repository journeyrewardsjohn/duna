import { notFound } from "next/navigation";
import { AdminPanel } from "@/components/admin-panels";
import { adminModules, type AdminModule } from "@/components/navigation";
import { AdminShell } from "@/components/admin-shell";

export async function generateMetadata({
  params,
}: {
  readonly params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  const item = adminModules.find((entry) => entry.slug === module);
  return { title: item?.label ?? "Admin" };
}

export default async function AdminModulePage({
  params,
}: {
  readonly params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  const item = adminModules.find((entry) => entry.slug === module);
  if (!item || module === "overview") notFound();
  return (
    <AdminShell active={module as AdminModule}>
      <AdminPanel module={module as AdminModule} />
    </AdminShell>
  );
}
