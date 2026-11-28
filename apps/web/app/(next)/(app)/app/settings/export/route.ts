import { report } from "@duna/observability";
import { getAppSession, loadSettings } from "@/components/app-shell/session";
import { demoWithoutDatabase } from "@/components/player/demo";
import { getServerCaller } from "@/lib/api";

/**
 * The person's data export (`player.dataExport`), as a private file. The
 * Settings page asks before it downloads. Demo mode without a database
 * returns the sample profile, marked as a demo.
 */
export async function GET() {
  try {
    const session = await getAppSession();
    const data = demoWithoutDatabase(session.demo)
      ? {
          demo: true,
          note: "Demo: sample data only. Nothing here is a real account.",
          profile: (await loadSettings()).profile,
        }
      : await (await getServerCaller()).player.dataExport();
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="duna-data-export-${date}.json"`,
        "content-type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    const reference = report(error, { event: "web.settings.export_failed" });
    return Response.json(
      { error: "Your data export couldn’t be made just now.", reference },
      { status: 500 },
    );
  }
}
