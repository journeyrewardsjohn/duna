import { getOrganizationSetupReadiness } from "@duna/api";
import { Badge, DunaActionTrigger, Numeric } from "@duna/ui";
import { ArrowRight, Check, ClipboardCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { OperatorShell } from "@/components/operator-shell";
import { getServerCaller } from "@/lib/api";

export const metadata = {
  title: "Get started",
};

export default async function OrganizationSetupPage() {
  const caller = await getServerCaller();
  const [dashboard, workspace] = await Promise.all([
    caller.operator.dashboard(),
    caller.operator.workspace(),
  ]);
  const readiness = getOrganizationSetupReadiness(workspace);
  const nextStep = readiness.nextStep;

  return (
    <OperatorShell
      active="setup"
      messageDraftCount={workspace.messageDrafts.length}
      organization={dashboard.organization}
    >
      <main className="hq-page hq-setup-page">
        <header className="hq-page-heading hq-setup-page__heading">
          <div>
            <span className="hq-eyebrow">Start here</span>
            <h1>Get {dashboard.organization.name} ready.</h1>
            <p>
              Six clear steps connect your organization, storefront, people,
              schedule, and payments. Duna keeps the order simple and shows what
              is already done.
            </p>
          </div>
        </header>

        <section
          className="hq-setup-progress"
          data-complete={readiness.complete}
        >
          <div className="hq-setup-progress__score">
            <Numeric tier="hero">{readiness.completionPercent}%</Numeric>
            <span>
              {readiness.completedCount} of {readiness.totalCount} complete
            </span>
          </div>
          <div className="hq-setup-progress__copy">
            <Badge tone={readiness.complete ? "positive" : "neutral"}>
              {readiness.complete ? "Ready to run" : "Recommended next step"}
            </Badge>
            <h2>{nextStep?.label ?? "Your essential setup is complete."}</h2>
            <p>
              {nextStep?.detail ??
                "You can return here whenever the organization changes or a new teammate needs orientation."}
            </p>
            <div>
              {nextStep ? (
                <Link
                  className="hq-button hq-button--primary"
                  href={nextStep.href}
                >
                  {nextStep.actionLabel} <ArrowRight aria-hidden size={16} />
                </Link>
              ) : (
                <Link className="hq-button hq-button--primary" href="/calendar">
                  Open today’s schedule <ArrowRight aria-hidden size={16} />
                </Link>
              )}
              <DunaActionTrigger
                className="hq-button hq-button--secondary"
                panel="chat"
              >
                <Sparkles aria-hidden size={16} /> Ask Duna to guide me
              </DunaActionTrigger>
            </div>
          </div>
        </section>

        <section
          className="hq-setup-list"
          aria-labelledby="setup-checklist-title"
        >
          <header>
            <div>
              <span className="hq-eyebrow">Your checklist</span>
              <h2 id="setup-checklist-title">One decision at a time.</h2>
            </div>
            <p>
              Open any step to review it. Nothing player-facing or financial
              changes without the normal review and confirmation.
            </p>
          </header>
          <ol>
            {readiness.steps.map((step, index) => (
              <li data-complete={step.complete} key={step.id}>
                <span className="hq-setup-list__number">
                  {step.complete ? (
                    <Check aria-hidden size={18} />
                  ) : (
                    <Numeric>{String(index + 1).padStart(2, "0")}</Numeric>
                  )}
                </span>
                <span className="hq-setup-list__copy">
                  <span>{step.complete ? "Complete" : "To do"}</span>
                  <strong>{step.label}</strong>
                  <small>{step.detail}</small>
                </span>
                <Link href={step.href}>
                  {step.complete ? "Review" : step.actionLabel}
                  <ArrowRight aria-hidden size={16} />
                </Link>
              </li>
            ))}
          </ol>
        </section>

        <aside className="hq-setup-ai">
          <span>
            <Sparkles aria-hidden size={19} />
          </span>
          <div>
            <span className="hq-eyebrow">Duna AI setup guide</span>
            <h2>Ask in plain language.</h2>
            <p>
              Duna reads this checklist from your current organization, explains
              what is missing, and links you to the right place. It never marks
              work complete or applies a sensitive change without proof and
              review.
            </p>
          </div>
          <DunaActionTrigger
            className="hq-button hq-button--secondary"
            panel="chat"
          >
            <ClipboardCheck aria-hidden size={16} /> Plan my setup
          </DunaActionTrigger>
        </aside>
      </main>
    </OperatorShell>
  );
}
