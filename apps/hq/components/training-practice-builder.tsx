"use client";

import type {
  TrainingDrill,
  TrainingFocusArea,
  TrainingPracticePlan,
} from "@duna/api/training-contracts";
import {
  ArrowDown,
  ArrowUp,
  BookOpenText,
  Check,
  CircleAlert,
  CirclePlay,
  FileDown,
  Flame,
  Gauge,
  GripVertical,
  Layers3,
  MessageSquareText,
  Plus,
  Save,
  Search,
  Snowflake,
  Sparkles,
  SquarePen,
  Target,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { useMemo, useState, useTransition, type CSSProperties } from "react";
import { saveTrainingPracticePlanAction } from "@/app/training/actions";
import { TrainingCourtAnimation } from "./training-court-animation";
import {
  createQuickPracticeBlock,
  normalizePracticeBlockTags,
  practiceBlockKindLabel,
  QUICK_PRACTICE_BLOCK_PRESETS,
  type PracticeBuilderBlock,
  type QuickPracticeBlockId,
} from "./training-practice-block-presets";

type BuilderBlock = PracticeBuilderBlock;

function variableStyle(name: string, value: string): CSSProperties {
  return { [name]: value } as CSSProperties;
}

function warmup(): BuilderBlock {
  return {
    localId: "warmup",
    groupId: "warmup",
    title: "Move, see, connect",
    kind: "warmup",
    lane: "all",
    durationMinutes: 10,
    transitionMinutes: 2,
    intensity: 3,
    plannedLoad: 24,
    focusArea: "Footwork",
    tags: ["Warmup", "Footwork"],
    instructions:
      "Dynamic movement into partner ball control. Finish with approach rhythm.",
    touchesTypical: 22,
    jumpsTypical: 4,
    locked: true,
  };
}

function cooldown(): BuilderBlock {
  return {
    localId: "cooldown",
    groupId: "cooldown",
    title: "Downshift + reflect",
    kind: "cool-down",
    lane: "all",
    durationMinutes: 6,
    transitionMinutes: 0,
    intensity: 1,
    plannedLoad: 10,
    tags: ["Recovery", "Mobility"],
    instructions:
      "Breathing reset, lower-leg mobility, and one athlete-led reflection.",
    touchesTypical: 0,
    jumpsTypical: 0,
    locked: true,
  };
}

function fromDrill(
  drill: TrainingDrill,
  id = crypto.randomUUID(),
): BuilderBlock {
  return {
    localId: id,
    groupId: id,
    title: drill.title,
    kind: drill.activityKind,
    drillId: drill.id,
    lane: "all",
    durationMinutes: drill.durationMinutes,
    transitionMinutes: 2,
    intensity: drill.intensity,
    plannedLoad: Math.min(100, Math.round(drill.intensity * 9.2)),
    focusArea: drill.focusArea,
    tags: drill.tags.map((tag) => tag.label),
    touchesTypical: drill.estimate.touchesTypical,
    jumpsTypical: drill.estimate.jumpsTypical,
    locked: false,
  };
}

function fromPracticePlan(plan: TrainingPracticePlan): readonly BuilderBlock[] {
  return [...plan.blocks]
    .sort(
      (first, second) =>
        first.startsAtMinute - second.startsAtMinute ||
        first.sequence - second.sequence ||
        first.lane.localeCompare(second.lane),
    )
    .map((block) => ({
      localId: block.id,
      groupId: `restored-${block.startsAtMinute}`,
      title: block.title,
      kind: block.kind,
      ...(block.drillId ? { drillId: block.drillId } : {}),
      lane: block.lane,
      durationMinutes: block.durationMinutes,
      transitionMinutes: block.transitionMinutes,
      intensity: block.intensity,
      plannedLoad: block.plannedLoad,
      ...(block.focusArea ? { focusArea: block.focusArea } : {}),
      tags: block.tags,
      ...(block.instructions ? { instructions: block.instructions } : {}),
      touchesTypical: block.touchesTypical,
      jumpsTypical: block.jumpsTypical,
      locked: block.locked,
    }));
}

function insertBeforeClosingCooldown(
  current: readonly BuilderBlock[],
  block: BuilderBlock,
) {
  const closingBlock = current.at(-1);
  if (closingBlock?.kind === "cool-down" && closingBlock.locked) {
    return [...current.slice(0, -1), block, closingBlock];
  }
  return [...current, block];
}

function QuickBlockIcon({ id }: { readonly id: QuickPracticeBlockId }) {
  const Icon =
    id === "drill-block"
      ? BookOpenText
      : id === "team-meeting"
        ? MessageSquareText
        : id === "warmup"
          ? Flame
          : id === "cool-down"
            ? Snowflake
            : id === "free-play"
              ? CirclePlay
              : SquarePen;
  return <Icon aria-hidden size={18} />;
}

function groupBlocks(blocks: readonly BuilderBlock[]) {
  const groups: {
    readonly id: string;
    readonly blocks: readonly BuilderBlock[];
  }[] = [];
  for (const block of blocks) {
    const existingIndex = groups.findIndex(
      (group) => group.id === block.groupId,
    );
    if (existingIndex < 0) {
      groups.push({ id: block.groupId, blocks: [block] });
    } else {
      groups[existingIndex] = {
        ...groups[existingIndex]!,
        blocks: [...groups[existingIndex]!.blocks, block],
      };
    }
  }
  return groups;
}

function layoutBlocks(blocks: readonly BuilderBlock[]) {
  let startsAtMinute = 0;
  return groupBlocks(blocks).flatMap((group, groupIndex) => {
    const laidOut = group.blocks.map((block, laneIndex) => ({
      ...block,
      sequence: groupIndex + 1,
      startsAtMinute,
      lane:
        group.blocks.length > 1 && block.lane === "all"
          ? `Court ${laneIndex + 1}`
          : block.lane,
    }));
    startsAtMinute += Math.max(
      ...group.blocks.map(
        (block) => block.durationMinutes + block.transitionMinutes,
      ),
    );
    return laidOut;
  });
}

export function TrainingPracticeBuilder({
  drills,
  focusAreas,
  initialDrillId,
  initialPlan,
  editingPlanId,
}: {
  readonly drills: readonly TrainingDrill[];
  readonly focusAreas: readonly TrainingFocusArea[];
  readonly initialDrillId?: string;
  readonly initialPlan?: TrainingPracticePlan;
  readonly editingPlanId?: string;
}) {
  const initialDrill = drills.find((drill) => drill.id === initialDrillId);
  const [title, setTitle] = useState(
    initialPlan?.title ?? "Sideout Under Pressure",
  );
  const [purpose, setPurpose] = useState(
    initialPlan?.purpose ??
      "Carry first-contact quality through attack choice, transition, and late-practice serving pressure.",
  );
  const [audience, setAudience] = useState(
    initialPlan?.targetAudience ??
      "Competitive 16U–18U beach athletes; 8–12 players on two courts.",
  );
  const [focusArea, setFocusArea] = useState<TrainingFocusArea>(
    initialPlan?.focusArea ?? "Offensive Systems",
  );
  const [visibility, setVisibility] = useState<"organization" | "public">(
    initialPlan?.visibility ?? "organization",
  );
  const [libraryView, setLibraryView] = useState<"drills" | "quick-blocks">(
    "drills",
  );
  const [quickPickerOpen, setQuickPickerOpen] = useState(false);
  const [blocks, setBlocks] = useState<readonly BuilderBlock[]>(() =>
    initialPlan
      ? fromPracticePlan(initialPlan)
      : [
          warmup(),
          ...(initialDrill
            ? [fromDrill(initialDrill, "initial-drill")]
            : drills
                .slice(0, 2)
                .map((drill, index) => fromDrill(drill, `starter-${index}`))),
          cooldown(),
        ],
  );
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(
    initialDrill?.id ??
      initialPlan?.blocks.find((block) => block.drillId)?.drillId ??
      drills[0]?.id,
  );
  const [notice, setNotice] = useState<{
    readonly status: "success" | "error";
    readonly message: string;
  }>();
  const [saving, startSaving] = useTransition();
  const selected = drills.find((drill) => drill.id === selectedId) ?? drills[0];
  const filteredDrills = drills.filter((drill) =>
    `${drill.title} ${drill.focusArea} ${drill.tags.map((tag) => tag.label).join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const groups = useMemo(() => groupBlocks(blocks), [blocks]);
  const laidOut = useMemo(() => layoutBlocks(blocks), [blocks]);
  const totalMinutes = groups.reduce(
    (sum, group) =>
      sum +
      Math.max(
        ...group.blocks.map(
          (block) => block.durationMinutes + block.transitionMinutes,
        ),
      ),
    0,
  );
  const plannedLoad = totalMinutes
    ? Math.round(
        groups.reduce((sum, group) => {
          const groupMinutes = Math.max(
            ...group.blocks.map((block) => block.durationMinutes),
          );
          const groupLoad =
            group.blocks.reduce(
              (value, block) => value + block.plannedLoad,
              0,
            ) / group.blocks.length;
          return sum + groupMinutes * groupLoad;
        }, 0) / totalMinutes,
      )
    : 0;
  const totalTouches = Math.round(
    groups.reduce(
      (sum, group) =>
        sum +
        group.blocks.reduce((value, block) => value + block.touchesTypical, 0) /
          group.blocks.length,
      0,
    ),
  );
  const totalJumps = Math.round(
    groups.reduce(
      (sum, group) =>
        sum +
        group.blocks.reduce((value, block) => value + block.jumpsTypical, 0) /
          group.blocks.length,
      0,
    ),
  );
  const focusMinutes = laidOut.reduce<Map<TrainingFocusArea, number>>(
    (result, block) => {
      if (block.focusArea) {
        result.set(
          block.focusArea,
          (result.get(block.focusArea) ?? 0) + block.durationMinutes,
        );
      }
      return result;
    },
    new Map(),
  );

  const patchBlock = (localId: string, patch: Partial<BuilderBlock>) =>
    setBlocks((current) =>
      current.map((block) =>
        block.localId === localId ? { ...block, ...patch } : block,
      ),
    );

  const setBlockFocus = (localId: string, value: string) =>
    setBlocks((current) =>
      current.map((block) => {
        if (block.localId !== localId) return block;
        if (value) {
          return { ...block, focusArea: value as TrainingFocusArea };
        }
        const withoutFocus = { ...block };
        delete withoutFocus.focusArea;
        return withoutFocus;
      }),
    );

  const addQuickBlock = (presetId: QuickPracticeBlockId) => {
    const block = createQuickPracticeBlock(presetId, focusArea);
    setBlocks((current) => insertBeforeClosingCooldown(current, block));
    setQuickPickerOpen(false);
  };

  const addSelectedDrill = () => {
    if (!selected) return;
    setBlocks((current) =>
      insertBeforeClosingCooldown(current, fromDrill(selected)),
    );
  };

  const moveGroup = (groupId: string, direction: -1 | 1) => {
    setBlocks((current) => {
      const currentGroups = groupBlocks(current);
      const index = currentGroups.findIndex((group) => group.id === groupId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= currentGroups.length)
        return current;
      const reordered = [...currentGroups];
      const [moved] = reordered.splice(index, 1);
      reordered.splice(target, 0, moved!);
      return reordered.flatMap((group) => group.blocks);
    });
  };

  const runParallelWithPrevious = (groupId: string) => {
    setBlocks((current) => {
      const currentGroups = groupBlocks(current);
      const index = currentGroups.findIndex((group) => group.id === groupId);
      if (index <= 0) return current;
      const previous = currentGroups[index - 1]!;
      const currentGroup = currentGroups[index]!;
      if (previous.blocks.some((block) => block.kind !== "drill"))
        return current;
      const mergedId = previous.id;
      const merged = [
        ...previous.blocks.map((block, lane) => ({
          ...block,
          groupId: mergedId,
          lane: `Court ${lane + 1}`,
        })),
        ...currentGroup.blocks.map((block, lane) => ({
          ...block,
          groupId: mergedId,
          lane: `Court ${previous.blocks.length + lane + 1}`,
        })),
      ];
      const mergedGroups = [...currentGroups];
      mergedGroups.splice(index - 1, 2, { id: mergedId, blocks: merged });
      return mergedGroups.flatMap((group) => group.blocks);
    });
  };

  const save = () => {
    setNotice(undefined);
    const primaryTag = drills
      .flatMap((drill) => drill.tags)
      .find((tag) => tag.label === focusArea && tag.isFocusArea) ?? {
      id: crypto.randomUUID(),
      label: focusArea,
      slug: focusArea
        .toLowerCase()
        .replaceAll(/[^a-z0-9]+/g, "-")
        .replaceAll(/^-|-$/g, ""),
      category: "focus" as const,
      isFocusArea: true,
    };
    startSaving(async () => {
      const result = await saveTrainingPracticePlanAction({
        ...(editingPlanId ? { practicePlanId: editingPlanId } : {}),
        title,
        slug: title
          .toLowerCase()
          .replaceAll(/[^a-z0-9]+/g, "-")
          .replaceAll(/^-|-$/g, ""),
        purpose,
        targetAudience: audience,
        status: "draft",
        visibility,
        durationMinutes: totalMinutes,
        plannedLoad,
        focusArea,
        tags: [primaryTag],
        blocks: laidOut.map((block) => ({
          sequence: block.sequence,
          lane: block.lane,
          title: block.title,
          kind: block.kind,
          drillId: block.drillId,
          startsAtMinute: block.startsAtMinute,
          durationMinutes: block.durationMinutes,
          transitionMinutes: block.transitionMinutes,
          intensity: block.intensity,
          plannedLoad: block.plannedLoad,
          focusArea: block.focusArea,
          tags: block.tags,
          instructions: block.instructions,
          touchesTypical: block.touchesTypical,
          jumpsTypical: block.jumpsTypical,
          locked: block.locked,
        })),
      });
      setNotice(result);
    });
  };

  return (
    <div className="training-practice-builder">
      <aside
        className={`training-practice-library${libraryView === "quick-blocks" ? " quick" : ""}`}
      >
        <header>
          <span className="hq-eyebrow">
            {libraryView === "drills" ? "Drill library" : "Quick blocks"}
          </span>
          <strong>
            {libraryView === "drills"
              ? `${drills.length} available`
              : "No setup required"}
          </strong>
        </header>
        <nav aria-label="Practice block sources">
          <button
            className={libraryView === "drills" ? "active" : undefined}
            onClick={() => setLibraryView("drills")}
            type="button"
          >
            Library drills
          </button>
          <button
            className={libraryView === "quick-blocks" ? "active" : undefined}
            onClick={() => setLibraryView("quick-blocks")}
            type="button"
          >
            Quick blocks
          </button>
        </nav>
        {libraryView === "drills" ? (
          <>
            <label>
              <Search aria-hidden size={16} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search drills"
                type="search"
                value={query}
              />
            </label>
            <div className="training-practice-drill-list">
              {filteredDrills.map((drill) => (
                <button
                  className={selected?.id === drill.id ? "active" : undefined}
                  key={drill.id}
                  onClick={() => setSelectedId(drill.id)}
                  type="button"
                >
                  <TrainingCourtAnimation compact drill={drill} />
                  <span>
                    <small>{drill.focusArea}</small>
                    <strong>{drill.title}</strong>
                    <em>
                      {drill.durationMinutes}m · ~
                      {drill.estimate.touchesTypical} touches
                    </em>
                  </span>
                </button>
              ))}
            </div>
            {selected && (
              <footer>
                <p>{selected.summary}</p>
                <button
                  className="hq-button hq-button--primary"
                  onClick={addSelectedDrill}
                  type="button"
                >
                  <Plus aria-hidden size={16} /> Add to timeline
                </button>
              </footer>
            )}
          </>
        ) : (
          <div className="training-quick-block-list">
            {QUICK_PRACTICE_BLOCK_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => addQuickBlock(preset.id)}
                type="button"
              >
                <i>
                  <QuickBlockIcon id={preset.id} />
                </i>
                <span>
                  <strong>{preset.label}</strong>
                  <small>{preset.summary}</small>
                  <em>
                    {preset.durationMinutes}m · intensity {preset.intensity}
                  </em>
                </span>
                <Plus aria-hidden size={15} />
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="training-practice-canvas">
        <header>
          <div>
            <span className="hq-eyebrow">Practice canvas</span>
            <input
              aria-label="Practice plan title"
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
            <textarea
              aria-label="Practice purpose"
              onChange={(event) => setPurpose(event.target.value)}
              rows={2}
              value={purpose}
            />
          </div>
          <div>
            <label>
              <span>Primary focus</span>
              <select
                onChange={(event) =>
                  setFocusArea(event.target.value as TrainingFocusArea)
                }
                value={focusArea}
              >
                {focusAreas.map((area) => (
                  <option key={area} value={area}>
                    {area}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Target group</span>
              <input
                onChange={(event) => setAudience(event.target.value)}
                value={audience}
              />
            </label>
          </div>
        </header>
        <div className="training-practice-canvas__ruler">
          <span>0</span>
          <i />
          <span>{Math.round(totalMinutes / 2)}m</span>
          <i />
          <span>{totalMinutes}m</span>
        </div>
        <div className="training-practice-groups">
          {groups.map((group, groupIndex) => {
            const start =
              laidOut.find((block) => block.groupId === group.id)
                ?.startsAtMinute ?? 0;
            return (
              <section
                className={group.blocks.length > 1 ? "parallel" : undefined}
                key={group.id}
              >
                <aside>
                  <GripVertical aria-hidden size={16} />
                  <strong>+{start}</strong>
                  <small>min</small>
                </aside>
                <div>
                  {group.blocks.map((block) => {
                    const editableQuickBlock = !block.drillId && !block.locked;
                    return (
                      <article
                        className={
                          editableQuickBlock ? "quick-block" : undefined
                        }
                        key={block.localId}
                      >
                        <header>
                          <span>
                            {group.blocks.length > 1
                              ? block.lane
                              : practiceBlockKindLabel(block)}
                          </span>
                          <div>
                            <button
                              aria-label="Move earlier"
                              disabled={groupIndex === 0}
                              onClick={() => moveGroup(group.id, -1)}
                              type="button"
                            >
                              <ArrowUp aria-hidden size={14} />
                            </button>
                            <button
                              aria-label="Move later"
                              disabled={groupIndex === groups.length - 1}
                              onClick={() => moveGroup(group.id, 1)}
                              type="button"
                            >
                              <ArrowDown aria-hidden size={14} />
                            </button>
                            <button
                              aria-label={`Remove ${block.title}`}
                              disabled={block.locked}
                              onClick={() =>
                                setBlocks((current) =>
                                  current.filter(
                                    (candidate) =>
                                      candidate.localId !== block.localId,
                                  ),
                                )
                              }
                              type="button"
                            >
                              <Trash2 aria-hidden size={14} />
                            </button>
                          </div>
                        </header>
                        {editableQuickBlock ? (
                          <div className="training-practice-block-copy">
                            <input
                              aria-label="Block name"
                              onChange={(event) =>
                                patchBlock(block.localId, {
                                  title: event.target.value,
                                })
                              }
                              placeholder="Name this block"
                              value={block.title}
                            />
                            <textarea
                              aria-label="Block sub-text"
                              onChange={(event) =>
                                patchBlock(block.localId, {
                                  instructions: event.target.value,
                                })
                              }
                              placeholder="What happens in this block?"
                              rows={2}
                              value={block.instructions ?? ""}
                            />
                          </div>
                        ) : (
                          <strong>{block.title}</strong>
                        )}
                        <div className="training-practice-block-fields">
                          <label>
                            <span>Minutes</span>
                            <input
                              min="1"
                              onChange={(event) =>
                                patchBlock(block.localId, {
                                  durationMinutes: Number(event.target.value),
                                })
                              }
                              type="number"
                              value={block.durationMinutes}
                            />
                          </label>
                          <label>
                            <span>Transition</span>
                            <input
                              min="0"
                              onChange={(event) =>
                                patchBlock(block.localId, {
                                  transitionMinutes: Number(event.target.value),
                                })
                              }
                              type="number"
                              value={block.transitionMinutes}
                            />
                          </label>
                          <label>
                            <span>Intensity</span>
                            <input
                              max="10"
                              min="1"
                              onChange={(event) => {
                                const intensity = Number(event.target.value);
                                patchBlock(block.localId, {
                                  intensity,
                                  plannedLoad: Math.round(intensity * 9.2),
                                });
                              }}
                              type="number"
                              value={block.intensity}
                            />
                          </label>
                        </div>
                        {editableQuickBlock && (
                          <div className="training-practice-block-details">
                            <label>
                              <span>Focus area</span>
                              <select
                                aria-label="Block focus area"
                                onChange={(event) =>
                                  setBlockFocus(
                                    block.localId,
                                    event.target.value,
                                  )
                                }
                                value={block.focusArea ?? ""}
                              >
                                <option value="">No primary focus</option>
                                {focusAreas.map((area) => (
                                  <option key={area} value={area}>
                                    {area}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              <span>Tags</span>
                              <input
                                aria-label="Block tags"
                                defaultValue={block.tags.join(", ")}
                                onBlur={(event) => {
                                  const tags = normalizePracticeBlockTags(
                                    event.target.value,
                                  );
                                  event.target.value = tags.join(", ");
                                  patchBlock(block.localId, { tags });
                                }}
                                placeholder="e.g. Team culture, recovery"
                                type="text"
                              />
                            </label>
                            <label>
                              <span>Est. touches / player</span>
                              <input
                                aria-label="Estimated touches per player"
                                max="10000"
                                min="0"
                                onChange={(event) =>
                                  patchBlock(block.localId, {
                                    touchesTypical: Number(event.target.value),
                                  })
                                }
                                type="number"
                                value={block.touchesTypical}
                              />
                            </label>
                          </div>
                        )}
                        <footer>
                          <span>
                            {block.focusArea ??
                              block.tags[0] ??
                              practiceBlockKindLabel(block)}
                          </span>
                          <small>
                            {block.touchesTypical
                              ? `~${block.touchesTypical} touches`
                              : "No ball contacts"}
                          </small>
                          <i
                            style={variableStyle(
                              "--training-value",
                              `${block.plannedLoad}%`,
                            )}
                          />
                        </footer>
                      </article>
                    );
                  })}
                </div>
                {groupIndex > 0 &&
                  group.blocks.every((block) => block.kind === "drill") &&
                  group.blocks.length === 1 &&
                  groups[groupIndex - 1]?.blocks.every(
                    (block) => block.kind === "drill",
                  ) && (
                    <button
                      className="training-make-parallel"
                      onClick={() => runParallelWithPrevious(group.id)}
                      type="button"
                    >
                      <Layers3 aria-hidden size={14} /> Run beside previous
                      drill
                    </button>
                  )}
              </section>
            );
          })}
        </div>
        {quickPickerOpen && (
          <section className="training-quick-block-picker">
            <header>
              <div>
                <span className="hq-eyebrow">Quick add</span>
                <strong>What belongs next?</strong>
                <small>
                  Start from a smart preset. Every field stays editable.
                </small>
              </div>
              <button
                aria-label="Close quick block picker"
                onClick={() => setQuickPickerOpen(false)}
                type="button"
              >
                <X aria-hidden size={16} />
              </button>
            </header>
            <div>
              {QUICK_PRACTICE_BLOCK_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => addQuickBlock(preset.id)}
                  type="button"
                >
                  <i>
                    <QuickBlockIcon id={preset.id} />
                  </i>
                  <span>
                    <strong>{preset.label}</strong>
                    <small>{preset.summary}</small>
                  </span>
                  <Plus aria-hidden size={15} />
                </button>
              ))}
            </div>
          </section>
        )}
        <button
          aria-expanded={quickPickerOpen}
          className="training-practice-add"
          onClick={() => setQuickPickerOpen((current) => !current)}
          type="button"
        >
          <Plus aria-hidden size={16} />
          {quickPickerOpen ? "Close block menu" : "Add another block"}
        </button>
      </section>

      <aside className="training-practice-summary">
        <section>
          <span className="hq-eyebrow">Live plan</span>
          <h2>
            {totalMinutes}
            <small>min</small>
          </h2>
          <p>
            {groups.length} moments · {blocks.length} blocks
          </p>
        </section>
        <div className="training-practice-summary__signals">
          <article>
            <Gauge aria-hidden size={17} />
            <span>Planned load</span>
            <strong>{plannedLoad}</strong>
            <i>
              <b style={variableStyle("--training-value", `${plannedLoad}%`)} />
            </i>
          </article>
          <article>
            <Target aria-hidden size={17} />
            <span>Typical opportunity</span>
            <strong>~{totalTouches}</strong>
            <small>contacts · ~{totalJumps} jumps</small>
          </article>
          <article>
            <UsersRound aria-hidden size={17} />
            <span>Structure</span>
            <strong>
              {groups.some((group) => group.blocks.length > 1)
                ? "Parallel courts"
                : "All together"}
            </strong>
          </article>
        </div>
        <section className="training-practice-summary__focus">
          <span>Focus balance</span>
          {[...focusMinutes.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([focus, minutes]) => (
              <div key={focus}>
                <span>{focus}</span>
                <i>
                  <b
                    style={variableStyle(
                      "--training-value",
                      `${Math.round((minutes / Math.max(1, totalMinutes)) * 100)}%`,
                    )}
                  />
                </i>
                <strong>{minutes}m</strong>
              </div>
            ))}
        </section>
        <section className="training-practice-summary__visibility">
          <span>Template visibility</span>
          <button
            className={visibility === "organization" ? "active" : undefined}
            onClick={() => setVisibility("organization")}
            type="button"
          >
            Private to organization
          </button>
          <button
            className={visibility === "public" ? "active" : undefined}
            onClick={() => setVisibility("public")}
            type="button"
          >
            Submit as public template
          </button>
        </section>
        <div className="training-practice-summary__actions">
          <button className="hq-button hq-button--secondary" type="button">
            <FileDown aria-hidden size={16} /> Preview sheet
          </button>
          <button
            className="hq-button hq-button--primary"
            disabled={saving || blocks.length === 0}
            onClick={save}
            type="button"
          >
            <Save aria-hidden size={16} />{" "}
            {saving
              ? "Saving…"
              : editingPlanId
                ? "Save new version"
                : "Save practice"}
          </button>
        </div>
        {notice && (
          <p
            className={`training-studio-notice training-studio-notice--${notice.status}`}
            role={notice.status === "error" ? "alert" : "status"}
          >
            {notice.status === "success" ? (
              <Check aria-hidden size={15} />
            ) : (
              <CircleAlert aria-hidden size={15} />
            )}
            {notice.message}
          </p>
        )}
        <aside>
          <Sparkles aria-hidden size={16} />
          <p>
            Duna keeps this version intact when it is assigned. Future edits
            create a new version.
          </p>
        </aside>
      </aside>
    </div>
  );
}
