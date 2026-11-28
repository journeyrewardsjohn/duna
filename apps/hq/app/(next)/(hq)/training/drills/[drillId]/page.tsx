import { hqHref } from "@duna/core/hq-routes";
import { Button, Chip } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageSection } from "@/components/shell/page-header";
import {
  ListingPanel,
  ShareWithClub,
  SubmitForStore,
} from "@/components/training/drill-actions";
import { drillFacts, scopeLabels } from "@/components/training/drill-model";
import { SceneSlot } from "@/components/training/scene-slot";
import {
  loadDrill,
  trainingContext,
} from "@/components/training/training-data";
import {
  TrainingBlockState,
  TrainingScreen,
} from "@/components/training/training-screen";

export const metadata: Metadata = { title: "Drill" };

/**
 * A drill (DL-Detail): purpose, set-up, coaching points, variations, the
 * drawing, versions with how many plans use it, and sharing, the store
 * checks and the listing for the people who may change it. Duna and
 * purchased drills are read-only.
 */
export default async function DrillPage({
  params,
}: {
  readonly params: Promise<{ drillId: string }>;
}) {
  const { drillId } = await params;
  const context = await trainingContext();
  if (context.session.access !== "operator") return null;
  const drill = context.canWrite ? await loadDrill(drillId) : undefined;
  if (drill?.state === "not-found") notFound();
  const data = drill?.state === "ok" ? drill.data : undefined;
  const readOnly = !data || data.scope === "duna" || data.purchased;
  const isAuthor = Boolean(
    data?.author && data.author.personId === context.personId,
  );
  const canEdit =
    !readOnly &&
    (data!.scope === "personal" ? isAuthor : isAuthor || context.canManage);
  return (
    <TrainingScreen
      actions={
        data ? (
          <>
            <Button
              href={`${hqHref("trainingPracticePlanCreate")}?drill=${data.id}`}
              size="sm"
              variant="secondary"
            >
              Use in a plan
            </Button>
            {canEdit ? (
              <Button
                href={hqHref("trainingDrillEdit", { drillId: data.id })}
                size="sm"
                variant="primary"
              >
                Edit as a new version
              </Button>
            ) : null}
          </>
        ) : undefined
      }
      askLabel={data ? `${data.title} (drill)` : "Drill"}
      askStarters={[
        "Make an easier version of this drill",
        "Which plans use this drill?",
      ]}
      back={{ href: hqHref("trainingDrills"), label: "Drill library" }}
      crumb={data?.title ?? "Drill"}
      description={data ? drillFacts(data) : undefined}
      needsWrite
      parentHref={hqHref("trainingDrills")}
      tab="drills"
      title={data?.title ?? "Drill"}
    >
      {drill === undefined ? null : drill.state !== "ok" || !data ? (
        drill.state !== "ok" ? (
          <TrainingBlockState
            loaded={drill}
            organization={context.organization}
            what="this drill"
          />
        ) : null
      ) : (
        <>
          <p className="tr-chips">
            <Chip kind="taxonomy">
              {data.sourceLabel ?? scopeLabels[data.scope]}
            </Chip>
            {data.purchased ? <Chip kind="taxonomy">Purchased</Chip> : null}
            <Chip kind="metric">{`Version ${data.version}`}</Chip>
            <span className="tr-quiet">{`Used in ${data.usedInPlans} ${data.usedInPlans === 1 ? "plan" : "plans"}`}</span>
          </p>
          <div className="tr-grid2 tr-grid2--wide">
            <PageSection id="drawing" title="The drawing">
              <SceneSlot
                label={`${data.title}: the drawing`}
                mode="player"
                scene={data.scene?.document}
              />
              {data.scene && data.scene.source === "converted" ? (
                <p className="tr-quiet">
                  Converted from the drill&apos;s original drawing.
                </p>
              ) : null}
              {data.scene && data.scene.validationStatus === "invalid" ? (
                <p className="tr-quiet">
                  This drawing has problems to fix before it can go to the
                  store.
                </p>
              ) : null}
            </PageSection>
            <PageSection id="about" title="About the drill">
              <dl className="tr-facts">
                <div>
                  <dt>Purpose</dt>
                  <dd>{data.purpose || data.summary || "Not written yet"}</dd>
                </div>
                <div>
                  <dt>Set-up</dt>
                  <dd>
                    {[
                      `${data.players.min}–${data.players.max} players (best with ${data.players.recommended})`,
                      `${data.durationMinutes} min`,
                      data.equipment.length > 0
                        ? data.equipment.join(", ")
                        : undefined,
                      data.targetAudience || undefined,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </dd>
                </div>
                <div>
                  <dt>Estimates</dt>
                  <dd>{`Load ${data.load} · ${data.touches} contacts · ${data.jumps} jumps per player. Estimates for planning, not medical advice.`}</dd>
                </div>
                {data.successCriteria ? (
                  <div>
                    <dt>Success looks like</dt>
                    <dd>{data.successCriteria}</dd>
                  </div>
                ) : null}
                {data.rotationRule ? (
                  <div>
                    <dt>Rotation</dt>
                    <dd>{data.rotationRule}</dd>
                  </div>
                ) : null}
              </dl>
            </PageSection>
          </div>
          <div className="tr-grid2">
            <PageSection id="cues" title="Coaching points">
              {data.coachingCues.length === 0 ? (
                <p className="tr-quiet">No coaching points yet.</p>
              ) : (
                <ul className="tr-list">
                  {data.coachingCues.map((cue) => (
                    <li key={cue}>{cue}</li>
                  ))}
                </ul>
              )}
            </PageSection>
            <PageSection id="variations" title="Variations and notes">
              <p className="tr-body tr-prewrap">
                {data.descriptionMarkdown || "None written yet."}
              </p>
            </PageSection>
          </div>
          <PageSection flush id="versions" title="Versions">
            <ol aria-label="Versions" className="tr-rows">
              {[...data.versions]
                .sort((a, b) => b.version - a.version)
                .map((version) => (
                  <li className="tr-row" key={version.id}>
                    <div className="tr-row__main">
                      <span className="tr-row__name">{`Version ${version.version}`}</span>
                      <span className="tr-quiet">
                        {[
                          version.changeNote,
                          version.createdBy?.displayName,
                          new Intl.DateTimeFormat("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            timeZone: "UTC",
                          }).format(new Date(version.createdAt)),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                    {version.id === data.currentVersionId ? (
                      <Chip tone="positive">Current</Chip>
                    ) : null}
                  </li>
                ))}
            </ol>
            <p className="tr-quiet tr-pad">
              Plans keep the version they were built with and say when a newer
              one exists.
            </p>
          </PageSection>
          {canEdit ? (
            <div className="tr-grid2">
              <PageSection id="share" title="Sharing">
                <ShareWithClub drill={data} isAuthor={isAuthor} />
              </PageSection>
              <PageSection id="store" title="The Duna store">
                <SubmitForStore drill={data} />
                <ListingPanel
                  authorName={data.author?.displayName}
                  canListForClub={context.canManage}
                  clubName={context.organization}
                  drill={data}
                  listing={data.listing}
                />
              </PageSection>
            </div>
          ) : readOnly ? (
            <p className="tr-quiet">
              {data.scope === "duna"
                ? "Duna's drills are read-only."
                : "Purchased drills are read-only."}{" "}
              Use it in a plan, or make your own drill from it.
            </p>
          ) : null}
        </>
      )}
    </TrainingScreen>
  );
}
