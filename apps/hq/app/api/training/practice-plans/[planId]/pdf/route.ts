import { createTrainingPracticePlanPdf } from "@duna/api";
import { getServerCaller } from "@/lib/api";

function filename(value: string): string {
  return value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "")
    .slice(0, 80);
}

export async function GET(
  request: Request,
  { params }: { readonly params: Promise<{ planId: string }> },
) {
  const { planId } = await params;
  const isBlank = planId === "blank";
  let title = "Duna Practice Run Sheet";
  let bytes: Uint8Array;

  if (isBlank) {
    bytes = await createTrainingPracticePlanPdf();
  } else {
    const caller = await getServerCaller();
    const [dashboard, workspace] = await Promise.all([
      caller.operator.dashboard(),
      caller.operator.trainingWorkspace(),
    ]);
    const plan = workspace.practicePlans.find(
      (candidate) => candidate.id === planId,
    );
    if (!plan) return new Response("Practice plan not found.", { status: 404 });
    title = plan.title;
    const requestedDate = new URL(request.url).searchParams.get("date") ?? "";
    bytes = await createTrainingPracticePlanPdf({
      plan,
      organizationName: dashboard.organization.name,
      dateLabel: requestedDate,
    });
  }

  return new Response(Uint8Array.from(bytes).buffer, {
    headers: {
      "Cache-Control": isBlank
        ? "public, max-age=3600, stale-while-revalidate=86400"
        : "private, no-store",
      "Content-Disposition": `inline; filename="${filename(title)}.pdf"`,
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
