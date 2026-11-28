"use client";

import type {
  TrainingDrillsSummary,
  TrainingProgramsPracticePlan,
} from "@duna/api";
import { hqHref } from "@duna/core/hq-routes";
import { Icon } from "@duna/ui/icons";
import {
  AnimatedList,
  Button,
  Chip,
  EmptyResults,
  Field,
  FilterChip,
  IconButton,
  Input,
  Notice,
  NumberChange,
  NumberInput,
  RallyLoader,
  SearchField,
  Segmented,
  useAction,
  useDebouncedValue,
  useLeaveGuard,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  attachPlanAction,
  drillForPlanAction,
  proposePlanAction,
  savePlanAction,
} from "@/app/(next)/(hq)/training/actions";
import { unwrap } from "../money/money-action-result";
import { reportFailure } from "../team/team-report";
import { SceneSlot } from "./scene-slot";
import {
  appendBlock,
  blockKindLabels,
  type DraftBlock,
  drillBlock,
  estimateSourceWords,
  fromSaved,
  groupsOf,
  minuteLabel,
  moveBlock,
  type PlanAssumptions,
  pinWords,
  planTotals,
  planWarnings,
  proposalBasis,
  QUICK_BLOCKS,
  quickBlock,
  relayout,
  removeBlock,
  setParallel,
  toSaveBlocks,
  updateBlock,
} from "./plan-model";

type Plan = TrainingProgramsPracticePlan;

export interface BuilderSession {
  readonly id: string;
  readonly when: string;
  readonly minutes: number;
  /** "16:00": block times read as clock times. */
  readonly startsAt: string;
}

/**
 * The practice plan builder (PP-Builder): a timeline of blocks for one
 * practice, from quick blocks and the drill library. Each block shows its
 * minutes, focus, estimated load, contacts and jumps (from the drill's
 * drawing where there is one); totals sit against the practice length
 * with warnings, never errors. "Draft this practice with Duna" returns a
 * proposal the coach reviews and edits; nothing is saved until Save, and
 * every save is a new version.
 */
export function PlanBuilder({
  plan,
  pins,
  library,
  session,
  defaultMinutes = 90,
  canEdit,
  prefill,
}: {
  readonly plan?: Plan;
  /** Pinned and current version numbers of the plan's drills, by block id. */
  readonly pins?: Readonly<
    Record<string, { pinned?: number; current?: number; scene?: unknown }>
  >;
  readonly library: readonly TrainingDrillsSummary[];
  readonly session?: BuilderSession;
  readonly defaultMinutes?: number;
  readonly canEdit: boolean;
  /** A drill to start a new plan with (`?drill=` from the library). */
  readonly prefill?: Parameters<typeof drillBlock>[0];
}) {
  const router = useRouter();
  const initialBlocks = useMemo(
    () =>
      relayout(
        groupsOf(
          (plan?.blocks ?? []).map((block) => ({
            ...fromSaved(block),
            pinnedVersion: pins?.[block.id]?.pinned,
            currentVersion: pins?.[block.id]?.current,
            scene: pins?.[block.id]?.scene,
          })),
        ),
      ),
    [plan, pins],
  );
  const [title, setTitle] = useState(
    plan?.title ?? (session ? `Practice, ${session.when}` : ""),
  );
  const [focus, setFocus] = useState(plan?.purpose ?? "");
  const [minutes, setMinutes] = useState<number | null>(
    session?.minutes ?? plan?.durationMinutes ?? defaultMinutes,
  );
  const [targetLoad, setTargetLoad] = useState<number | null>(
    plan?.targetLoad ?? null,
  );
  const [assumptions, setAssumptions] = useState<PlanAssumptions>(
    plan?.assumptions ?? {
      athletes: 12,
      courts: 2,
      ballsPerCourt: 3,
      level: "Intermediate",
    },
  );
  const [blocks, setBlocks] = useState<DraftBlock[]>(() =>
    !plan && prefill ? appendBlock([], drillBlock(prefill)) : initialBlocks,
  );
  const [besides, setBesides] = useState(false);
  const [changeNote, setChangeNote] = useState("");
  const [proposed, setProposed] = useState<string>();
  const [saved, setSaved] = useState<Plan | undefined>(plan);
  const [attached, setAttached] = useState(false);
  const plannedMinutes = Math.max(1, minutes ?? defaultMinutes);
  const target = targetLoad ?? undefined;
  const totals = planTotals({ blocks, plannedMinutes, targetLoad: target });
  const warnings = planWarnings({ blocks, plannedMinutes, targetLoad: target });
  const changed =
    JSON.stringify(toSaveBlocks(blocks)) !==
      JSON.stringify(toSaveBlocks(initialBlocks)) ||
    title !== (plan?.title ?? title);
  const leave = useLeaveGuard(canEdit && changed && saved === plan);

  const addDrill = useAction(
    async (_context, drillId: string) =>
      unwrap(await drillForPlanAction(drillId)),
    {
      report: reportFailure("hq.training.add_drill_failed"),
      // Coaches add drills one after another; each press is a new drill.
      repeatGuardMs: 0,
      onSuccess: (drill) =>
        setBlocks((current) =>
          appendBlock(current, drillBlock(drill), besides),
        ),
      messages: { success: (drill) => `${drill.title} added` },
    },
  );

  const propose = useAction(
    async () =>
      unwrap(
        await proposePlanAction({
          assumptions: {
            ...assumptions,
            ...(target !== undefined ? { targetLoad: target } : {}),
          },
          durationMinutes: Math.min(360, Math.max(10, plannedMinutes)),
          ...(focus.trim() ? { focus: focus.trim() } : {}),
          ...(session ? { sessionId: session.id } : {}),
        }),
      ),
    {
      report: reportFailure("hq.training.propose_plan_failed"),
      onSuccess: (proposal) => {
        setBlocks(relayout(groupsOf(proposal.blocks.map(fromSaved))));
        if (!title.trim()) setTitle(proposal.title);
        setProposed(
          proposalBasis({
            focus,
            durationMinutes: plannedMinutes,
            assumptions,
          }),
        );
      },
    },
  );

  const save = useAction(
    async ({ idempotencyKey }) =>
      unwrap(
        await savePlanAction({
          ...(saved ? { practicePlanId: saved.id } : {}),
          title: title.trim(),
          purpose: focus.trim(),
          targetAudience: saved?.targetAudience ?? "",
          status:
            saved?.status === "archived" ? "draft" : (saved?.status ?? "draft"),
          ...(target !== undefined ? { targetLoad: target } : {}),
          assumptions: {
            ...assumptions,
            ...(target !== undefined ? { targetLoad: target } : {}),
          },
          blocks: toSaveBlocks(blocks),
          ...(changeNote.trim() ? { changeNote: changeNote.trim() } : {}),
          idempotencyKey,
        }),
      ),
    {
      report: reportFailure("hq.training.save_plan_failed"),
      messages: { success: (result) => `Saved as version ${result.version}` },
      onSuccess: (result) => {
        setSaved(result);
        setProposed(undefined);
        setChangeNote("");
        if (!plan) {
          router.replace(
            `${hqHref("trainingPracticePlan", { planId: result.id })}${session ? `?session=${session.id}` : ""}`,
          );
        } else {
          router.refresh();
        }
      },
    },
  );

  const attach = useAction(
    async () =>
      unwrap(
        await attachPlanAction({
          sessionId: session!.id,
          practicePlanId: saved!.id,
        }),
      ),
    {
      report: reportFailure("hq.training.attach_plan_failed"),
      messages: {
        success: () => `Attached to ${session?.when ?? "the practice"}`,
      },
      onSuccess: () => setAttached(true),
    },
  );

  const titleMissing = !title.trim();
  return (
    <div className="tr-builder">
      <div className="tr-builder__main">
        <section aria-labelledby="pb-practice" className="tr-card">
          <h2 className="tr-h2" id="pb-practice">
            The practice
          </h2>
          {session ? <p className="tr-quiet">{`For ${session.when}`}</p> : null}
          <div className="tr-grid2">
            <Field
              error={
                titleMissing && save.status === "error"
                  ? "Name the plan."
                  : undefined
              }
              label="Plan name"
            >
              <Input
                disabled={!canEdit}
                maxLength={160}
                onChange={(event) => setTitle(event.currentTarget.value)}
                value={title}
              />
            </Field>
            <Field label="Focus" optional>
              <Input
                disabled={!canEdit}
                maxLength={200}
                onChange={(event) => setFocus(event.currentTarget.value)}
                placeholder="Serve-receive"
                value={focus}
              />
            </Field>
            <Field label="Practice length (min)">
              <NumberInput
                disabled={!canEdit}
                max={360}
                min={10}
                onValueChange={setMinutes}
                value={minutes}
              />
            </Field>
            <Field hint="0 to 100, an estimate" label="Target load" optional>
              <NumberInput
                disabled={!canEdit}
                max={100}
                min={0}
                onValueChange={setTargetLoad}
                value={targetLoad}
              />
            </Field>
          </div>
          <details className="tr-details">
            <summary>{`Assumes ${assumptions.athletes} athletes, ${assumptions.courts} ${assumptions.courts === 1 ? "court" : "courts"}, ${assumptions.ballsPerCourt} balls a court, ${assumptions.level}`}</summary>
            <div className="tr-grid2">
              <Field label="Athletes">
                <NumberInput
                  disabled={!canEdit}
                  min={1}
                  onValueChange={(value) =>
                    value &&
                    setAssumptions((a) => ({
                      ...a,
                      athletes: Math.trunc(value),
                    }))
                  }
                  value={assumptions.athletes}
                />
              </Field>
              <Field label="Courts">
                <NumberInput
                  disabled={!canEdit}
                  min={1}
                  onValueChange={(value) =>
                    value &&
                    setAssumptions((a) => ({ ...a, courts: Math.trunc(value) }))
                  }
                  value={assumptions.courts}
                />
              </Field>
              <Field label="Balls a court">
                <NumberInput
                  disabled={!canEdit}
                  min={0}
                  onValueChange={(value) =>
                    value !== null &&
                    setAssumptions((a) => ({
                      ...a,
                      ballsPerCourt: Math.trunc(value),
                    }))
                  }
                  value={assumptions.ballsPerCourt}
                />
              </Field>
              <Field label="Level">
                <Input
                  disabled={!canEdit}
                  maxLength={80}
                  onChange={(event) => {
                    const level = event.currentTarget.value;
                    setAssumptions((a) => ({
                      ...a,
                      level: level || "Intermediate",
                    }));
                  }}
                  value={assumptions.level}
                />
              </Field>
            </div>
          </details>
          {canEdit ? (
            <div className="tr-actions">
              <Button
                icon={<Icon name="find" />}
                loading={propose.showPending}
                onClick={() => void propose.run()}
                variant="secondary"
              >
                Draft this practice with Duna
              </Button>
              {propose.showPending ? (
                <RallyLoader label="Drafting the practice" />
              ) : null}
            </div>
          ) : null}
          {proposed ? (
            <Notice title="Duna's draft: review it before you save" tone="info">
              {`Based on ${proposed}, and the club's and Duna's drills that match. Every number is an estimate. Change anything; nothing is saved until you press Save.`}
            </Notice>
          ) : null}
          {propose.status === "error" ? (
            <Notice title="No draft this time" tone="attention">
              {propose.error instanceof Error ? propose.error.message : null}
            </Notice>
          ) : null}
        </section>

        <section aria-labelledby="pb-timeline" className="tr-card">
          <div className="tr-card__head">
            <h2 className="tr-h2" id="pb-timeline">
              Timeline
            </h2>
            <span className="tr-quiet">
              {`${totals.minutes} of ${plannedMinutes} min`}
            </span>
          </div>
          {blocks.length === 0 ? (
            <p className="tr-quiet">
              Add quick blocks or drills, or let Duna draft the practice.
            </p>
          ) : (
            <Timeline
              blocks={blocks}
              canEdit={canEdit}
              onChange={setBlocks}
              startsAt={session?.startsAt}
            />
          )}
        </section>
      </div>

      <aside
        aria-label="Add to the plan and totals"
        className="tr-builder__side"
      >
        <Totals
          plannedMinutes={plannedMinutes}
          totals={totals}
          warnings={warnings}
        />
        {canEdit ? (
          <AddPanel
            adding={addDrill.pending}
            besides={besides}
            canBeside={blocks.length > 0}
            focus={focus}
            library={library}
            onAddDrill={(id) => void addDrill.run(id)}
            onAddQuick={(block) =>
              setBlocks((current) => appendBlock(current, block, besides))
            }
            onBesides={setBesides}
          />
        ) : null}
        {canEdit ? (
          <section aria-label="Save" className="tr-card tr-save">
            <Field label="What changed" optional>
              <Input
                maxLength={500}
                onChange={(event) => setChangeNote(event.currentTarget.value)}
                placeholder="Longer serve-receive block"
                value={changeNote}
              />
            </Field>
            <Button
              block
              disabled={titleMissing || blocks.length === 0}
              loading={save.showPending}
              onClick={() => void save.run()}
              variant="primary"
            >
              {saved ? "Save a new version" : "Save the plan"}
            </Button>
            <p className="tr-quiet">
              {saved
                ? `Version ${saved.version} is saved. Saving makes version ${saved.version + 1}; practices keep the version they were given.`
                : "Saving makes version 1."}
            </p>
            {save.status === "error" ? (
              <p className="tr-problem" role="alert">
                <Icon name="alert" size="inline" />
                {save.error instanceof Error
                  ? save.error.message
                  : "Not saved."}
                {save.reference ? ` Reference: ${save.reference}` : ""}
              </p>
            ) : null}
            {saved ? (
              <div className="tr-actions">
                <Button
                  href={hqHref("trainingPracticePlanPrint", {
                    planId: saved.id,
                  })}
                  onClick={(event) => {
                    if (changed) {
                      event.preventDefault();
                      void leave.guard(() =>
                        router.push(
                          hqHref("trainingPracticePlanPrint", {
                            planId: saved.id,
                          }),
                        ),
                      );
                    }
                  }}
                  size="sm"
                  variant="ghost"
                >
                  Print
                </Button>
                {session && !attached ? (
                  <Button
                    loading={attach.showPending}
                    onClick={() => void attach.run()}
                    size="sm"
                    variant="secondary"
                  >
                    {`Attach to ${session.when}`}
                  </Button>
                ) : null}
                {attached ? (
                  <span className="tr-quiet">
                    <Icon name="success" size="inline" /> Attached
                  </span>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}
      </aside>
    </div>
  );
}

/* --------------------------------------------------------------- timeline */

function Timeline({
  blocks,
  onChange,
  canEdit,
  startsAt,
}: {
  readonly blocks: readonly DraftBlock[];
  readonly onChange: (blocks: DraftBlock[]) => void;
  readonly canEdit: boolean;
  readonly startsAt?: string;
}) {
  const groups = groupsOf(blocks);
  return (
    <section aria-label="Blocks in order">
      <AnimatedList
        className="tr-timeline"
        getKey={(group) => group.map((block) => block.key).join("+")}
        itemClassName="tr-timeline__item"
        items={groups}
        renderItem={(group) => {
          const groupIndex = groups.indexOf(group);
          return (
            <div
              className="tr-timeline__group"
              data-parallel={group.length > 1 || undefined}
            >
              <span className="tr-timeline__time">
                {minuteLabel(group[0]!.startsAtMinute, startsAt)}
              </span>
              <div className="tr-timeline__lanes">
                {group.map((block) => (
                  <BlockCard
                    block={block}
                    blocks={blocks}
                    canEdit={canEdit}
                    first={groupIndex === 0}
                    key={block.key}
                    last={groupIndex === groups.length - 1}
                    onChange={onChange}
                  />
                ))}
              </div>
            </div>
          );
        }}
      />
    </section>
  );
}

function BlockCard({
  block,
  blocks,
  onChange,
  canEdit,
  first,
  last,
}: {
  readonly block: DraftBlock;
  readonly blocks: readonly DraftBlock[];
  readonly onChange: (blocks: DraftBlock[]) => void;
  readonly canEdit: boolean;
  readonly first: boolean;
  readonly last: boolean;
}) {
  const pin = pinWords(block);
  const parallel = block.lane !== "all";
  const name = block.title || "this block";
  return (
    <article
      aria-label={block.title}
      className="tr-block"
      data-kind={block.kind}
    >
      <div className="tr-block__head">
        <Chip kind="taxonomy">{blockKindLabels[block.kind]}</Chip>
        {parallel ? <Chip kind="taxonomy">{block.lane}</Chip> : null}
        {pin ? (
          <Chip tone={pin.newer ? "attention" : "neutral"}>{pin.label}</Chip>
        ) : null}
      </div>
      {canEdit && !block.locked ? (
        <Input
          aria-label="Block name"
          className="tr-block__title"
          maxLength={160}
          onChange={(event) =>
            onChange(
              updateBlock(blocks, block.key, {
                title: event.currentTarget.value,
              }),
            )
          }
          value={block.title}
        />
      ) : (
        <h3 className="tr-block__name">{block.title}</h3>
      )}
      {block.scene ? (
        <SceneSlot
          compact
          label={`${block.title}: the drawing`}
          mode="diagram"
          scene={block.scene}
        />
      ) : null}
      <div className="tr-block__fields">
        <Field label="Minutes">
          <NumberInput
            disabled={!canEdit || block.locked}
            max={240}
            min={1}
            onValueChange={(value) =>
              value &&
              onChange(
                updateBlock(blocks, block.key, {
                  durationMinutes: Math.trunc(value),
                }),
              )
            }
            value={block.durationMinutes}
          />
        </Field>
        <Field
          hint={`Load ${block.plannedLoad} (estimate)`}
          label="Intensity, 1 to 10"
        >
          <NumberInput
            disabled={!canEdit || block.locked}
            max={10}
            min={1}
            onValueChange={(value) =>
              value &&
              onChange(
                updateBlock(blocks, block.key, {
                  intensity: Math.trunc(value),
                }),
              )
            }
            value={block.intensity}
          />
        </Field>
        <Field label="Focus" optional>
          <Input
            disabled={!canEdit || block.locked}
            maxLength={80}
            onChange={(event) =>
              onChange(
                updateBlock(blocks, block.key, {
                  focus: event.currentTarget.value,
                }),
              )
            }
            value={block.focus ?? ""}
          />
        </Field>
      </div>
      <p className="tr-block__estimates">
        <span>{`${block.estimatedTouches ?? 0} contacts · ${block.estimatedJumps ?? 0} jumps per player`}</span>
        <span className="tr-quiet">{`Estimates. ${estimateSourceWords(block)}.`}</span>
      </p>
      {canEdit && !block.locked ? (
        <div className="tr-block__tools">
          <IconButton
            disabled={first}
            label={`Move ${name} earlier`}
            onClick={() => onChange(moveBlock(blocks, block.key, -1))}
            size="sm"
            variant="ghost"
          >
            <Icon name="chevron-left" />
          </IconButton>
          <IconButton
            disabled={last}
            label={`Move ${name} later`}
            onClick={() => onChange(moveBlock(blocks, block.key, 1))}
            size="sm"
            variant="ghost"
          >
            <Icon name="chevron-right" />
          </IconButton>
          <Button
            onClick={() => onChange(setParallel(blocks, block.key, !parallel))}
            size="sm"
            variant="ghost"
          >
            {parallel ? "Run on its own" : "Run beside the block before"}
          </Button>
          <IconButton
            label={`Remove ${name}`}
            onClick={() => onChange(removeBlock(blocks, block.key))}
            size="sm"
            variant="ghost"
          >
            <Icon name="close" />
          </IconButton>
        </div>
      ) : null}
    </article>
  );
}

/* ----------------------------------------------------------------- totals */

function Totals({
  totals,
  plannedMinutes,
  warnings,
}: {
  readonly totals: ReturnType<typeof planTotals>;
  readonly plannedMinutes: number;
  readonly warnings: readonly string[];
}) {
  return (
    <section aria-labelledby="pb-totals" className="tr-card tr-totals">
      <h2 className="tr-h2" id="pb-totals">
        Practice totals
      </h2>
      <dl className="tr-totals__grid">
        <div>
          <dt>Time</dt>
          <dd>
            <NumberChange value={totals.minutes} />{" "}
            <span className="tr-quiet">{`of ${plannedMinutes} min`}</span>
          </dd>
        </div>
        <div>
          <dt>Load (estimate)</dt>
          <dd>
            <NumberChange value={totals.load} />
            {totals.targetLoad !== undefined ? (
              <span className="tr-quiet">{` · target ${totals.targetLoad}`}</span>
            ) : null}
          </dd>
        </div>
        <div>
          <dt>Contacts per player (estimate)</dt>
          <dd>
            <NumberChange value={totals.touches} />
          </dd>
        </div>
        <div>
          <dt>Jumps per player (estimate)</dt>
          <dd>
            <NumberChange value={totals.jumps} />
          </dd>
        </div>
        <div>
          <dt>Work to rest</dt>
          <dd>{totals.workRestRatio}</dd>
        </div>
      </dl>
      {totals.focusMix.length > 0 ? (
        <p className="tr-quiet">
          {`Mix by focus: ${totals.focusMix.map((row) => `${row.focus} ${row.percent}%`).join(" · ")}`}
        </p>
      ) : null}
      {warnings.length > 0 ? (
        <ul aria-label="Worth a look" className="tr-warnings">
          {warnings.map((warning) => (
            <li key={warning}>
              <Icon name="info" size="inline" />
              {warning}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="tr-quiet">
        Planning estimates only: not medical or injury-prevention advice.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------- add panel */

function AddPanel({
  library,
  focus,
  besides,
  canBeside,
  onBesides,
  onAddQuick,
  onAddDrill,
  adding,
}: {
  readonly library: readonly TrainingDrillsSummary[];
  readonly focus: string;
  readonly besides: boolean;
  readonly canBeside: boolean;
  readonly onBesides: (value: boolean) => void;
  readonly onAddQuick: (block: DraftBlock) => void;
  readonly onAddDrill: (drillId: string) => void;
  readonly adding: boolean;
}) {
  const [view, setView] = useState<"quick" | "drills">("quick");
  const [query, setQuery] = useState("");
  const [focusFilter, setFocusFilter] = useState<string>();
  const debounced = useDebouncedValue(query);
  const focuses = [...new Set(library.map((drill) => drill.focus))]
    .sort()
    .slice(0, 8);
  const shown = library.filter((drill) => {
    const text = debounced.trim().toLowerCase();
    return (
      (!focusFilter || drill.focus === focusFilter) &&
      (!text ||
        drill.title.toLowerCase().includes(text) ||
        drill.focus.toLowerCase().includes(text))
    );
  });
  return (
    <section aria-labelledby="pb-add" className="tr-card tr-add">
      <h2 className="tr-h2" id="pb-add">
        Add to the plan
      </h2>
      <Segmented
        aria-label="Add from"
        block
        onValueChange={(value) => setView(value as "quick" | "drills")}
        options={[
          { value: "quick", label: "Quick blocks" },
          { value: "drills", label: "Drills" },
        ]}
        value={view}
      />
      {canBeside ? (
        <FilterChip onPressedChange={onBesides} pressed={besides}>
          Run beside the last block (another court)
        </FilterChip>
      ) : null}
      {view === "quick" ? (
        <ul aria-label="Quick blocks" className="tr-add__list">
          {QUICK_BLOCKS.map((preset) => (
            <li key={preset.id}>
              <button
                className="tr-add__item"
                onClick={() =>
                  onAddQuick(quickBlock(preset, focus || undefined))
                }
                type="button"
              >
                <span className="tr-row__name">{`Add ${preset.label}`}</span>
                <span className="tr-quiet">{`${preset.minutes} min · ${preset.summary}`}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <SearchField
            label="Search drills"
            onValueChange={setQuery}
            placeholder="Name or focus"
            resultCount={shown.length}
            value={query}
          />
          {focuses.length > 0 ? (
            <div aria-label="Focus" className="tr-chips" role="group">
              {focuses.map((item) => (
                <FilterChip
                  key={item}
                  onPressedChange={(pressed) =>
                    setFocusFilter(pressed ? item : undefined)
                  }
                  pressed={focusFilter === item}
                >
                  {item}
                </FilterChip>
              ))}
            </div>
          ) : null}
          {shown.length === 0 ? (
            library.length === 0 ? (
              <p className="tr-quiet">No drills in your library yet.</p>
            ) : (
              <EmptyResults
                onClear={() => {
                  setQuery("");
                  setFocusFilter(undefined);
                }}
                query={debounced}
              />
            )
          ) : (
            <ul aria-label="Drills" className="tr-add__list">
              {shown.slice(0, 30).map((drill) => (
                <li key={drill.id}>
                  <button
                    className="tr-add__item"
                    disabled={adding}
                    onClick={() => onAddDrill(drill.id)}
                    type="button"
                  >
                    <span className="tr-row__name">{`Add ${drill.title}`}</span>
                    <span className="tr-quiet">
                      {`${drill.focus} · ${drill.durationMinutes} min · load ${drill.load} · v${drill.version}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
