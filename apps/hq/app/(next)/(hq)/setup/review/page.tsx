import { hqHref } from "@duna/core/hq-routes";
import { Button, EmptyFirstUse } from "@duna/ui/tideline";
import type { Metadata } from "next";
import {
  loadLatestRun,
  loadProposals,
  loadRun,
  loadWorkspace,
  websiteReaderStatus,
} from "@/components/setup/setup-data";
import { ReviewScreen } from "@/components/setup/review-screen";
import { SetupScreen, setupContext } from "@/components/setup/setup-screen";
import { SetupBlockState } from "@/components/setup/setup-states";
import { isRunActive, siteName } from "@/components/setup/setup-model";

export const metadata: Metadata = { title: "Website read" };

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Club setup › Website read (CS-Reading, CS-Found, CS-States): a read in
 * progress, or what it found for Keep / Edit / Skip and Apply. Resumable:
 * with no `run` it opens the latest read.
 */
export default async function SetupReviewPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ run?: string }>;
}) {
  const { run: runParam } = await searchParams;
  const context = await setupContext();
  const [loaded, reader, workspace] = await Promise.all([
    runParam && uuid.test(runParam) ? loadRun(runParam) : loadLatestRun(),
    websiteReaderStatus(),
    loadWorkspace(),
  ]);
  const run = loaded.state === "ok" ? loaded.data : null;
  const proposals =
    run &&
    !isRunActive(run) &&
    (run.status === "review" || run.status === "applied")
      ? await loadProposals(run.id)
      : undefined;
  const pending =
    proposals?.state === "ok"
      ? proposals.data.filter((p) => p.decision === "pending").length
      : undefined;
  const theme = workspace.state === "ok" ? workspace.data.theme : undefined;
  const clubName =
    theme?.brandDisplayName ??
    (workspace.state === "ok"
      ? workspace.data.organization.name
      : context.organization);

  return (
    <SetupScreen
      askLabel="Website read"
      askStarters={[
        "Which of these should I check before keeping?",
        "Why is this price marked as needing a check?",
        "What will Apply create?",
      ]}
      description={
        run
          ? run.sourceKind === "description"
            ? "What Duna proposes from your description"
            : `What Duna found on ${siteName(run.sourceUrl)}`
          : "What Duna found on your website"
      }
      pending={pending}
      tab="review"
      title="Website read"
    >
      {loaded.state !== "ok" ? (
        <div className="hqs-section">
          <SetupBlockState
            loaded={loaded}
            organization={context.organization}
            retryHref={hqHref("setupReview")}
            what="this website read"
          />
        </div>
      ) : !run ? (
        <div className="hqs-section">
          <EmptyFirstUse
            action={
              <Button
                href={`${hqHref("setupStart")}?path=website`}
                variant="primary"
              >
                {reader === "ready"
                  ? "Read my website"
                  : "Fill in your club by hand"}
              </Button>
            }
            description={
              reader === "ready"
                ? "Give Duna your club's website and it proposes your places, hours, offerings and team for you to keep or skip."
                : "Duna's website reader isn't set up here yet. You can fill in your club by hand."
            }
            icon="find"
            title="Duna hasn't read your website yet"
          />
        </div>
      ) : proposals && proposals.state !== "ok" ? (
        <div className="hqs-section">
          <SetupBlockState
            loaded={proposals}
            organization={context.organization}
            retryHref={`${hqHref("setupReview")}?run=${run.id}`}
            what="what Duna found"
          />
        </div>
      ) : (
        <ReviewScreen
          brand={{
            color: theme?.palette.primary ?? "#0E1A22",
            logo: theme?.logoUrl ?? null,
            tile: theme?.markUrl ?? null,
          }}
          clubName={clubName}
          currency={
            workspace.state === "ok"
              ? workspace.data.organization.currency
              : "USD"
          }
          initialProposals={proposals?.state === "ok" ? proposals.data : null}
          initialRun={run}
          key={run.id}
          reader={reader}
        />
      )}
    </SetupScreen>
  );
}
