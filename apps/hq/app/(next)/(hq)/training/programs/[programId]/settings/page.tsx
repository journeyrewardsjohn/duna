import { hqHref } from "@duna/core/hq-routes";
import { Button } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import {
  ActivateProgram,
  CancelProgram,
  PatternSettings,
} from "@/components/training/program-actions";
import { activationWords } from "@/components/training/program-model";
import { programPage } from "@/components/training/program-page";
import {
  loadCoaches,
  loadProgramSessions,
} from "@/components/training/training-data";
import { ProgramScreen } from "@/components/training/training-screen";

export const metadata: Metadata = { title: "Program settings" };

/**
 * A program › Settings: details, the weekly pattern (each day with its
 * own times), dates off and coaches, with a preview of exactly what
 * saving does to the season; activation and cancellation.
 */
export default async function ProgramSettingsPage({
  params,
}: {
  readonly params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const found = await programPage(programId);
  if (found.kind === "missing") notFound();
  if (found.kind === "state") return found.node;
  const { program, context } = found.page;
  const [sessions, coaches] = await Promise.all([
    loadProgramSessions(program.id, program.startDate, program.endDate),
    loadCoaches(),
  ]);
  const activation = activationWords({ program, now: context.now });
  const live = program.status === "draft" || program.status === "active";
  return (
    <ProgramScreen
      actions={
        program.status === "draft" && context.canManage ? (
          <ActivateProgram
            count={activation.count}
            programId={program.id}
            sentence={activation.sentence}
            title={program.title}
          />
        ) : undefined
      }
      askStarters={[
        "Add a travel day on the 22nd",
        "Move Wednesday practices to 5 PM",
      ]}
      program={program}
      tab="settings"
    >
      <PatternSettings
        canEdit={context.canManage}
        coaches={coaches}
        now={context.now}
        program={program}
        sessions={sessions.state === "ok" ? sessions.data.items : []}
      />
      <PageSection id="offering" title="Sell it">
        <p className="tr-body">
          {program.catalogItemId
            ? "This program is sold through a linked offering; its price and sign-ups live there."
            : "Sell the program through an offering: its price and sign-ups live there."}
        </p>
        <div className="tr-actions">
          <Button
            href={
              program.catalogItemId
                ? `/offerings/${program.catalogItemId}`
                : `${hqHref("offeringCreate")}?type=service&subtype=program`
            }
            size="sm"
            variant="secondary"
          >
            {program.catalogItemId
              ? "Open the offering"
              : "Sell as an offering"}
          </Button>
        </div>
      </PageSection>
      {context.canManage && live ? (
        <PageSection id="cancel" title="Cancel the program">
          <CancelProgram
            athleteCount={program.counts.athletes}
            program={program}
          />
        </PageSection>
      ) : null}
    </ProgramScreen>
  );
}
