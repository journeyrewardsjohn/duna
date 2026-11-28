import { Download, Printer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Practice run sheet" };

export default async function PracticePlanPrintPage({
  params,
}: {
  readonly params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const caller = await getServerCaller();
  const [dashboard, operatorWorkspace, trainingWorkspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
    caller.operator.trainingWorkspace(),
  ]);
  const plan = trainingWorkspace.practicePlans.find(
    (candidate) => candidate.id === planId,
  );
  if (!plan) notFound();
  const pdfHref = `/api/training/practice-plans/${plan.id}/pdf`;

  return (
    <OperatorShell
      active="training"
      immersive
      messageDraftCount={operatorWorkspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <main className="hq-page training-pdf-page" data-zone="editorial">
        <header>
          <div>
            <span className="hq-eyebrow">Training · Print-ready run sheet</span>
            <h1>{plan.title}</h1>
            <p>
              Version {plan.version} · {plan.durationMinutes} minutes · planned
              load {plan.plannedLoad}/100
            </p>
          </div>
          <div>
            <Link className="hq-button hq-button--secondary" href="/training">
              Back to Training
            </Link>
            <a
              className="hq-button hq-button--secondary"
              download
              href={pdfHref}
            >
              <Download aria-hidden size={16} /> Download PDF
            </a>
            <a className="hq-button hq-button--primary" href={pdfHref}>
              <Printer aria-hidden size={16} /> Open to print
            </a>
          </div>
        </header>
        <iframe src={pdfHref} title={`${plan.title} printable run sheet`} />
      </main>
    </OperatorShell>
  );
}
