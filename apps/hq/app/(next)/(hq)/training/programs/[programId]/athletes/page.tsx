import { Button, Notice } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import { programPage } from "@/components/training/program-page";
import { ProgramScreen } from "@/components/training/training-screen";

export const metadata: Metadata = { title: "Program athletes" };

/**
 * A program › Athletes. The program read carries how many athletes are on
 * it, not who they are, and there is no procedure to enrol or remove one
 * yet: this tab says so plainly instead of showing an invented roster.
 */
export default async function ProgramAthletesPage({
  params,
}: {
  readonly params: Promise<{ programId: string }>;
}) {
  const { programId } = await params;
  const found = await programPage(programId);
  if (found.kind === "missing") notFound();
  if (found.kind === "state") return found.node;
  const { program } = found.page;
  const count = program.counts.athletes;
  return (
    <ProgramScreen
      askStarters={["Who missed the most practices this month?"]}
      program={program}
      tab="athletes"
    >
      <PageSection id="athletes" title="Athletes">
        <p className="tr-lead">
          <span className="tr-num">{count}</span>
          {count === 1
            ? " athlete is on this program."
            : " athletes are on this program."}
        </p>
        <Notice title="The athlete list isn't shown here yet" tone="info">
          Duna can count the program&apos;s athletes but can&apos;t list, enrol
          or remove them from this screen yet. Athletes join through the
          program&apos;s offering; each person&apos;s page in People shows their
          programs.
        </Notice>
        <div className="tr-actions">
          <Button href="/people" size="sm" variant="secondary">
            Open People
          </Button>
          {program.catalogItemId ? (
            <Button
              href={`/offerings/${program.catalogItemId}`}
              size="sm"
              variant="ghost"
            >
              Open the program&apos;s offering
            </Button>
          ) : null}
        </div>
      </PageSection>
    </ProgramScreen>
  );
}
