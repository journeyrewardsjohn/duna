import {
  SettingsCenter,
  type SettingsSection,
} from "@/components/settings-center";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata = {
  title: "Settings",
};

const settingsSections = new Set<SettingsSection>([
  "overview",
  "business",
  "brand",
  "money",
  "operations",
]);

export default async function SettingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ section?: string }>;
}) {
  const caller = await getServerCaller();
  const [{ section }, dashboard, workspace] = await Promise.all([
    searchParams,
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);
  const initialSection = settingsSections.has(section as SettingsSection)
    ? (section as SettingsSection)
    : "overview";

  return (
    <OperatorShell
      active="settings"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <main className="hq-page settings-page">
        <header className="hq-page-heading settings-page__heading">
          <div>
            <span className="hq-eyebrow">Workspace configuration</span>
            <h1>Settings</h1>
            <p>
              Set up the business once, then let Duna carry the right details
              into every schedule, storefront, payment, and customer touchpoint.
            </p>
          </div>
        </header>
        <SettingsCenter initialSection={initialSection} workspace={workspace} />
      </main>
    </OperatorShell>
  );
}
