import { unavailableAccountDeletionReadiness } from "@duna/api";
import { HqAccountSettings } from "@/components/hq-account-settings";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Personal account" };

export default async function HqAccountPage() {
  const caller = await getServerCaller();
  const [dashboard, workspace, settings, deletionReadiness] = await Promise.all(
    [
      caller.operator.dashboard(),
      caller.operator.workspace(),
      caller.player.settings(),
      caller.player
        .accountDeletionReadiness()
        .catch(() => unavailableAccountDeletionReadiness),
    ],
  );
  const webUrl = (
    process.env.NEXT_PUBLIC_DUNA_WEB_URL ??
    process.env.NEXT_PUBLIC_WEB_URL ??
    "https://duna.coach"
  ).replace(/\/+$/, "");

  return (
    <OperatorShell
      active="settings"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <HqAccountSettings
        deletionReadiness={deletionReadiness}
        settings={settings}
        webUrl={webUrl}
      />
    </OperatorShell>
  );
}
