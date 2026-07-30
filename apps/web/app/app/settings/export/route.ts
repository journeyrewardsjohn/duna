import { getServerCaller } from "@/lib/api";

export async function GET() {
  try {
    const caller = await getServerCaller();
    const data = await caller.player.dataExport();
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="duna-data-export-${date}.json"`,
        "content-type": "application/json; charset=utf-8",
      },
    });
  } catch {
    return Response.json(
      { error: "The authenticated data export could not be generated." },
      { status: 401 },
    );
  }
}
