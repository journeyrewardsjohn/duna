import { assertAskDunaAdmin } from "@duna/api";
import { AskDunaAdmin } from "@/components/ask-duna-admin";
import { AdminShell } from "@/components/admin-shell";
import { AdminAccessDenied } from "@/components/admin-access-denied";
import { getServerContext } from "@/lib/api";

export const metadata = { title: "Ask Duna operations" };
export default async function AskDunaAdminPage() {
  const { actor } = await getServerContext();
  try {
    assertAskDunaAdmin(actor);
  } catch {
    return <AdminAccessDenied />;
  }
  return (
    <AdminShell active="ask-duna">
      <AskDunaAdmin />
    </AdminShell>
  );
}
