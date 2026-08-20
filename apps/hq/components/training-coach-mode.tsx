"use client";

import type {
  TrainingDrill,
  TrainingEvent,
  TrainingPracticePlan,
} from "@duna/api/training-contracts";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Gauge,
  RotateCcw,
  SkipForward,
  Sparkles,
  TimerReset,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { recordTrainingOutcomeAction } from "@/app/training/actions";
import { TrainingCourtAnimation } from "./training-court-animation";

type BlockStatus = "completed" | "modified" | "skipped";

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function TrainingCoachMode({
  drills,
  event,
  plan,
}: {
  readonly drills: readonly TrainingDrill[];
  readonly event: TrainingEvent;
  readonly plan: TrainingPracticePlan;
}) {
  const groups = useMemo(() => {
    const grouped = new Map<number, TrainingPracticePlan["blocks"]>();
    for (const block of plan.blocks) {
      grouped.set(block.startsAtMinute, [
        ...(grouped.get(block.startsAtMinute) ?? []),
        block,
      ]);
    }
    return [...grouped.entries()].sort(([first], [second]) => first - second);
  }, [plan.blocks]);
  const [groupIndex, setGroupIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [startedAt, setStartedAt] = useState<string>();
  const [statuses, setStatuses] = useState<Record<string, BlockStatus>>({});
  const [debriefOpen, setDebriefOpen] = useState(false);
  const [actualLoad, setActualLoad] = useState(event.plannedLoad);
  const [coachRpe, setCoachRpe] = useState(event.plannedIntensity);
  const [attendance, setAttendance] = useState(event.athleteCount);
  const [notes, setNotes] = useState("");
  const [notice, setNotice] = useState<{
    readonly status: "success" | "error";
    readonly message: string;
  }>();
  const [saving, startSaving] = useTransition();
  const current = groups[groupIndex];
  const currentBlocks = current?.[1] ?? [];
  const next = groups[groupIndex + 1];
  const plannedSeconds =
    Math.max(...currentBlocks.map((block) => block.durationMinutes), 0) * 60;
  const progress = plannedSeconds
    ? Math.min(100, Math.round((elapsed / plannedSeconds) * 100))
    : 0;

  useEffect(() => {
    if (!running) return;
    const interval = window.setInterval(
      () => setElapsed((value) => value + 1),
      1_000,
    );
    return () => window.clearInterval(interval);
  }, [running]);

  const markCurrentComplete = () => {
    setStatuses((value) => ({
      ...value,
      ...Object.fromEntries(
        currentBlocks.map((block) => [
          block.id,
          value[block.id] ?? "completed",
        ]),
      ),
    }));
  };

  const goForward = () => {
    markCurrentComplete();
    setRunning(false);
    setElapsed(0);
    if (groupIndex >= groups.length - 1) {
      setDebriefOpen(true);
      return;
    }
    setGroupIndex((value) => value + 1);
  };

  const submit = () => {
    markCurrentComplete();
    startSaving(async () => {
      const finalStatuses = Object.fromEntries(
        plan.blocks.map((block) => [
          block.id,
          statuses[block.id] ??
            (block.startsAtMinute <= (current?.[0] ?? 0)
              ? "completed"
              : "skipped"),
        ]),
      ) as Record<string, BlockStatus>;
      const completedBlockCount = Object.values(finalStatuses).filter(
        (status) => status !== "skipped",
      ).length;
      const result = await recordTrainingOutcomeAction({
        trainingEventId: event.id,
        ...(startedAt ? { actualStartsAt: startedAt } : {}),
        actualEndsAt: new Date().toISOString(),
        actualLoad,
        coachRpe,
        attendanceCount: attendance,
        plannedBlockCount: plan.blocks.length,
        completedBlockCount,
        blockOutcomes: plan.blocks.map((block) => ({
          blockId: block.id,
          status: finalStatuses[block.id]!,
          actualMinutes:
            finalStatuses[block.id] === "skipped" ? 0 : block.durationMinutes,
        })),
        ...(notes.trim() ? { notesMarkdown: notes.trim() } : {}),
      });
      setNotice(result);
      if (result.status === "success") setDebriefOpen(false);
    });
  };

  const toggleRunning = () => {
    if (!startedAt) setStartedAt(new Date().toISOString());
    setRunning((value) => !value);
  };

  return (
    <main className="training-coach-mode" data-zone="editorial">
      <header className="training-coach-mode__topbar">
        <Link aria-label="Exit coach mode" href="/training">
          <ArrowLeft aria-hidden size={20} />
        </Link>
        <div>
          <span>Live practice · {plan.title}</span>
          <strong>
            Segment {groupIndex + 1} of {groups.length}
          </strong>
        </div>
        <div>
          <UsersRound aria-hidden size={16} /> {attendance} athletes
        </div>
      </header>

      <section className="training-coach-stage">
        <div className="training-coach-stage__main">
          <header>
            <div>
              <span className="hq-eyebrow">
                +{current?.[0] ?? 0} minutes ·{" "}
                {currentBlocks.length > 1
                  ? "Parallel courts"
                  : currentBlocks[0]?.lane}
              </span>
              <h1>
                {currentBlocks.length > 1
                  ? "Run the courts together."
                  : currentBlocks[0]?.title}
              </h1>
            </div>
            <div className="training-coach-clock">
              <span>{progress}%</span>
              <strong>{clock(elapsed)}</strong>
              <small>{Math.round(plannedSeconds / 60)} min planned</small>
            </div>
          </header>
          <div className="training-coach-progress">
            <i style={{ width: `${progress}%` }} />
          </div>

          <div
            className={`training-coach-courts${currentBlocks.length > 1 ? " parallel" : ""}`}
          >
            {currentBlocks.map((block) => {
              const drill = block.drillId
                ? drills.find((candidate) => candidate.id === block.drillId)
                : undefined;
              return (
                <article key={block.id}>
                  {drill ? (
                    <TrainingCourtAnimation compact drill={drill} />
                  ) : (
                    <div className="training-coach-courts__activity">
                      <Sparkles aria-hidden size={24} />
                      <span>{block.kind.replace("-", " ")}</span>
                    </div>
                  )}
                  <div>
                    <span>{block.lane}</span>
                    <h2>{block.title}</h2>
                    <p>
                      {block.instructions ||
                        `${block.focusArea ?? block.kind} · coach the response you see.`}
                    </p>
                    <dl>
                      <div>
                        <dt>Focus</dt>
                        <dd>{block.focusArea ?? block.kind}</dd>
                      </div>
                      <div>
                        <dt>Intensity</dt>
                        <dd>{block.intensity}/10</dd>
                      </div>
                      <div>
                        <dt>Typical</dt>
                        <dd>~{block.touchesTypical} touches</dd>
                      </div>
                    </dl>
                    <div className="training-coach-block-actions">
                      {(["completed", "modified", "skipped"] as const).map(
                        (status) => (
                          <button
                            className={
                              statuses[block.id] === status
                                ? "active"
                                : undefined
                            }
                            key={status}
                            onClick={() =>
                              setStatuses((value) => ({
                                ...value,
                                [block.id]: status,
                              }))
                            }
                            type="button"
                          >
                            {status === "completed" ? (
                              <Check aria-hidden size={14} />
                            ) : status === "skipped" ? (
                              <SkipForward aria-hidden size={14} />
                            ) : (
                              <RotateCcw aria-hidden size={14} />
                            )}
                            {status}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <aside className="training-coach-stage__rail">
          <section>
            <span className="hq-eyebrow">Practice signal</span>
            <div>
              <Gauge aria-hidden size={20} />
              <strong>{event.plannedLoad}</strong>
              <small>planned load</small>
            </div>
            <p>
              {plan.focusArea} · ~{plan.totalTouchesTypical} touch opportunities
              in the full plan.
            </p>
          </section>
          <section>
            <span className="hq-eyebrow">Next up</span>
            {next ? (
              <>
                <strong>
                  {next[1].map((block) => block.title).join(" + ")}
                </strong>
                <p>
                  +{next[0]} min · {next[1][0]?.focusArea ?? next[1][0]?.kind}
                </p>
              </>
            ) : (
              <>
                <strong>Debrief the practice</strong>
                <p>
                  Record actual load, changes, attendance, and what comes next.
                </p>
              </>
            )}
          </section>
          <section className="training-coach-stage__truth">
            <span>Plan stays intact</span>
            <p>
              Modifications are recorded as today’s outcome. The assigned
              practice-plan version never silently changes.
            </p>
          </section>
        </aside>
      </section>

      <footer className="training-coach-controls">
        <button
          disabled={groupIndex === 0}
          onClick={() => {
            setRunning(false);
            setElapsed(0);
            setGroupIndex((value) => Math.max(0, value - 1));
          }}
          type="button"
        >
          <ChevronLeft aria-hidden size={20} /> Previous
        </button>
        <button className="primary" onClick={toggleRunning} type="button">
          {running ? (
            <CirclePause aria-hidden size={22} />
          ) : (
            <CirclePlay aria-hidden size={22} />
          )}
          {running ? "Pause" : elapsed ? "Resume" : "Start segment"}
        </button>
        <button onClick={goForward} type="button">
          {groupIndex === groups.length - 1 ? "Finish" : "Next"}
          <ChevronRight aria-hidden size={20} />
        </button>
      </footer>

      {debriefOpen && (
        <div className="training-coach-debrief" role="dialog">
          <section>
            <header>
              <div>
                <span className="hq-eyebrow">Close the loop</span>
                <h2>What actually happened?</h2>
                <p>
                  Keep the plan, the coach’s report, and athlete responses as
                  separate truths.
                </p>
              </div>
              <button onClick={() => setDebriefOpen(false)} type="button">
                ×
              </button>
            </header>
            <div className="training-coach-debrief__signals">
              <label>
                <span>Actual load · {actualLoad}</span>
                <input
                  max="100"
                  min="0"
                  onChange={(event) =>
                    setActualLoad(Number(event.target.value))
                  }
                  type="range"
                  value={actualLoad}
                />
              </label>
              <label>
                <span>Coach RPE · {coachRpe}/10</span>
                <input
                  max="10"
                  min="1"
                  onChange={(event) => setCoachRpe(Number(event.target.value))}
                  type="range"
                  value={coachRpe}
                />
              </label>
              <label>
                <span>Athletes present</span>
                <input
                  max={Math.max(event.athleteCount, 1)}
                  min="0"
                  onChange={(event) =>
                    setAttendance(Number(event.target.value))
                  }
                  type="number"
                  value={attendance}
                />
              </label>
            </div>
            <label className="training-coach-debrief__notes">
              <span>What changed, transferred, or should come next?</span>
              <textarea
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Shorten the cooperative round… left-side seam held under pressure… start Wednesday with…"
                rows={5}
                value={notes}
              />
            </label>
            {notice && (
              <p className={`training-studio-notice ${notice.status}`}>
                {notice.message}
              </p>
            )}
            <footer>
              <button
                className="hq-button hq-button--secondary"
                onClick={() => setDebriefOpen(false)}
                type="button"
              >
                Keep coaching
              </button>
              <button
                className="hq-button hq-button--primary"
                disabled={saving}
                onClick={submit}
                type="button"
              >
                {saving ? (
                  <TimerReset className="training-spin" aria-hidden size={17} />
                ) : (
                  <Check aria-hidden size={17} />
                )}
                Complete practice
              </button>
            </footer>
          </section>
        </div>
      )}
    </main>
  );
}
