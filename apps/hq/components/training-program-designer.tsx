"use client";

import type {
  DraftTrainingProgramInput,
  TrainingProgramDraft,
  TrainingWeekday,
} from "@duna/api/training-contracts";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Lock,
  MapPin,
  Plane,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Target,
  Trash2,
  Trophy,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition, type CSSProperties } from "react";
import {
  generateTrainingProgramAction,
  saveTrainingProgramAction,
} from "@/app/training/actions";

type ProgramMilestone = {
  readonly id: string;
  readonly kind: "tournament" | "travel" | "assessment" | "break";
  readonly title: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly priority: "low" | "standard" | "key";
  readonly notes?: string;
};

const weekdayChoices: readonly {
  readonly value: TrainingWeekday;
  readonly short: string;
  readonly label: string;
}[] = [
  { value: "monday", short: "M", label: "Monday" },
  { value: "tuesday", short: "T", label: "Tuesday" },
  { value: "wednesday", short: "W", label: "Wednesday" },
  { value: "thursday", short: "T", label: "Thursday" },
  { value: "friday", short: "F", label: "Friday" },
  { value: "saturday", short: "S", label: "Saturday" },
  { value: "sunday", short: "S", label: "Sunday" },
];

const dayIndex: Readonly<Record<TrainingWeekday, number>> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function addDays(value: string, days: number): string {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Choose a date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function recurrenceDates(
  startDate: string,
  endDate: string,
  days: readonly TrainingWeekday[],
  exclusions: readonly string[] = [],
): readonly string[] {
  if (!startDate || !endDate || endDate < startDate) return [];
  const excluded = new Set(exclusions);
  const desired = new Set(days.map((day) => dayIndex[day]));
  const dates: string[] = [];
  let cursor = new Date(`${startDate}T12:00:00.000Z`);
  const end = new Date(`${endDate}T12:00:00.000Z`);
  while (cursor <= end && dates.length < 500) {
    const key = cursor.toISOString().slice(0, 10);
    if (desired.has(cursor.getUTCDay()) && !excluded.has(key)) dates.push(key);
    cursor = new Date(cursor.getTime() + 86_400_000);
  }
  return dates;
}

function variableStyle(name: string, value: string): CSSProperties {
  return { [name]: value } as CSSProperties;
}

export function TrainingProgramDesigner({
  offers,
  timezone,
  today,
}: {
  readonly offers: readonly {
    readonly id: string;
    readonly title: string;
    readonly status: string;
  }[];
  readonly timezone: string;
  readonly today: string;
}) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("Fall Competition Build");
  const [purpose, setPurpose] = useState(
    "Prepare the group to side out reliably and defend with a shared system through the fall tournament block.",
  );
  const [audience, setAudience] = useState(
    "16U–18U national and open-division beach athletes",
  );
  const [objectivesText, setObjectivesText] = useState(
    "Reach target-quality on 65% of serve-receive contacts\nCreate a shared block-defense call system\nPreserve serving intent late in high-load practices",
  );
  const [approach, setApproach] = useState(
    "Constraints-led learning, high contacts per hour, competitive wash scoring, and deliberate tapering before key events.",
  );
  const [athleteCount, setAthleteCount] = useState(12);
  const [startDate, setStartDate] = useState(addDays(today, 5));
  const [endDate, setEndDate] = useState(addDays(today, 61));
  const [days, setDays] = useState<readonly TrainingWeekday[]>([
    "monday",
    "wednesday",
  ]);
  const [startTime, setStartTime] = useState("17:00");
  const [practiceMinutes, setPracticeMinutes] = useState(90);
  const [milestones, setMilestones] = useState<ProgramMilestone[]>([]);
  const [milestoneDraft, setMilestoneDraft] = useState({
    kind: "tournament" as ProgramMilestone["kind"],
    title: "",
    startsOn: "",
    endsOn: "",
    priority: "key" as ProgramMilestone["priority"],
  });
  const [catalogItemId, setCatalogItemId] = useState("");
  const [draft, setDraft] = useState<TrainingProgramDraft>();
  const [notice, setNotice] = useState<{
    readonly status: "success" | "error";
    readonly message: string;
  }>();
  const [generating, startGenerating] = useTransition();
  const [saving, startSaving] = useTransition();
  const objectives = objectivesText
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean);
  const dates = useMemo(
    () => recurrenceDates(startDate, endDate, days),
    [startDate, endDate, days],
  );
  const brief: DraftTrainingProgramInput = {
    title,
    purpose,
    targetAudience: audience,
    objectives,
    approach,
    startDate,
    endDate,
    timezone,
    recurrence: {
      intervalWeeks: 1,
      days: days.map((day) => ({
        day,
        startsAt: startTime,
        durationMinutes: practiceMinutes,
      })),
      excludedDates: [],
    },
    milestones,
    athleteCount,
    preferredPracticeMinutes: practiceMinutes,
  };
  const stepReady = [
    title.trim().length > 1 &&
      purpose.trim().length >= 10 &&
      audience.trim().length >= 3 &&
      objectives.length > 0 &&
      approach.trim().length >= 3,
    Boolean(
      startDate &&
      endDate &&
      endDate >= startDate &&
      days.length &&
      dates.length,
    ),
    true,
    Boolean(draft),
  ];

  const addMilestone = () => {
    if (!milestoneDraft.title.trim() || !milestoneDraft.startsOn) return;
    const endsOn = milestoneDraft.endsOn || milestoneDraft.startsOn;
    setMilestones((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        kind: milestoneDraft.kind,
        title: milestoneDraft.title.trim(),
        startsOn: milestoneDraft.startsOn,
        endsOn,
        priority: milestoneDraft.priority,
      },
    ]);
    setMilestoneDraft((current) => ({
      ...current,
      title: "",
      startsOn: "",
      endsOn: "",
    }));
  };

  const generate = () => {
    setNotice(undefined);
    startGenerating(async () => {
      const result = await generateTrainingProgramAction(brief);
      setNotice(result);
      if (result.status === "success") setDraft(result.value);
    });
  };

  const save = () => {
    if (!draft) return;
    setNotice(undefined);
    startSaving(async () => {
      const result = await saveTrainingProgramAction({
        brief,
        draft,
        catalogItemId: catalogItemId || undefined,
      });
      setNotice(result);
    });
  };

  return (
    <div className="training-program-designer">
      <aside className="training-program-guide">
        <div className="training-program-guide__progress">
          <span>Program readiness</span>
          <strong>{Math.round(((step + (draft ? 1 : 0)) / 4) * 100)}%</strong>
          <i>
            <b
              style={variableStyle(
                "--training-value",
                `${Math.round(((step + (draft ? 1 : 0)) / 4) * 100)}%`,
              )}
            />
          </i>
        </div>
        {[
          ["Direction", "Purpose, athletes, objectives, approach"],
          ["Rhythm", "Window, weekdays, time, duration"],
          ["Reality", "Tournaments, travel, breaks, assessments"],
          ["Design", "Phases, load, focus, every practice"],
        ].map(([label, detail], index) => (
          <button
            className={
              step === index ? "active" : step > index ? "complete" : undefined
            }
            key={label}
            onClick={() => index <= step && setStep(index)}
            type="button"
          >
            <span>
              {step > index ? <Check aria-hidden size={14} /> : index + 1}
            </span>
            <strong>{label}</strong>
            <small>{detail}</small>
          </button>
        ))}
        <div className="training-program-guide__principle">
          <Lock aria-hidden size={16} />
          <p>
            <strong>Nothing moves without review.</strong> Duna proposes a
            private program draft. Coaches can lock dates, focus areas, or
            sessions before regenerating.
          </p>
        </div>
      </aside>

      <section className="training-program-stage">
        {step === 0 && (
          <div className="training-program-step">
            <span className="hq-eyebrow">01 · Direction</span>
            <h2>What should be true at the end?</h2>
            <p>
              Describe the coaching outcome, not the product being sold. The
              sellable Program offer can be linked after the training design is
              clear.
            </p>
            <div className="training-program-form-grid">
              <label className="wide">
                <span>Program name</span>
                <input
                  onChange={(event) => setTitle(event.target.value)}
                  value={title}
                />
              </label>
              <label className="wide">
                <span>Purpose</span>
                <textarea
                  onChange={(event) => setPurpose(event.target.value)}
                  rows={3}
                  value={purpose}
                />
              </label>
              <label>
                <span>Who is this for?</span>
                <input
                  onChange={(event) => setAudience(event.target.value)}
                  value={audience}
                />
              </label>
              <label>
                <span>Expected athletes</span>
                <input
                  min="1"
                  onChange={(event) =>
                    setAthleteCount(Number(event.target.value))
                  }
                  type="number"
                  value={athleteCount}
                />
              </label>
              <label className="wide">
                <span>Objectives · one per line</span>
                <textarea
                  onChange={(event) => setObjectivesText(event.target.value)}
                  rows={4}
                  value={objectivesText}
                />
              </label>
              <label className="wide">
                <span>Your coaching approach</span>
                <textarea
                  onChange={(event) => setApproach(event.target.value)}
                  rows={3}
                  value={approach}
                />
              </label>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="training-program-step">
            <span className="hq-eyebrow">02 · Rhythm</span>
            <h2>Put every real practice on the board.</h2>
            <p>
              Duna counts the dates exactly. The customer price for a linked
              Program service covers this complete session set—not a single
              occurrence.
            </p>
            <div className="training-date-window">
              <label>
                <span>Starts</span>
                <input
                  min={today}
                  onChange={(event) => setStartDate(event.target.value)}
                  type="date"
                  value={startDate}
                />
              </label>
              <ArrowRight aria-hidden size={18} />
              <label>
                <span>Ends</span>
                <input
                  min={startDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  type="date"
                  value={endDate}
                />
              </label>
            </div>
            <fieldset className="training-program-days">
              <legend>Practices happen on</legend>
              <div>
                {weekdayChoices.map((day) => {
                  const active = days.includes(day.value);
                  return (
                    <button
                      aria-label={day.label}
                      aria-pressed={active}
                      className={active ? "active" : undefined}
                      key={day.value}
                      onClick={() =>
                        setDays((current) =>
                          active
                            ? current.filter((value) => value !== day.value)
                            : [...current, day.value],
                        )
                      }
                      type="button"
                    >
                      <strong>{day.short}</strong>
                      <small>{day.label.slice(0, 3)}</small>
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <div className="training-program-form-grid training-program-form-grid--rhythm">
              <label>
                <span>Practice starts</span>
                <input
                  onChange={(event) => setStartTime(event.target.value)}
                  type="time"
                  value={startTime}
                />
              </label>
              <label>
                <span>Practice length</span>
                <select
                  onChange={(event) =>
                    setPracticeMinutes(Number(event.target.value))
                  }
                  value={practiceMinutes}
                >
                  {[60, 75, 90, 105, 120, 150].map((minutes) => (
                    <option key={minutes} value={minutes}>
                      {minutes} minutes
                    </option>
                  ))}
                </select>
              </label>
              <div>
                <Clock3 aria-hidden size={17} />
                <span>
                  <strong>{timezone}</strong>
                  <small>Local organization time</small>
                </span>
              </div>
            </div>
            <section className="training-session-count">
              <div>
                <CalendarDays aria-hidden size={24} />
              </div>
              <span>
                <small>This program contains</small>
                <strong>{dates.length} practices</strong>
                <p>
                  {days.length} per week · {practiceMinutes} minutes each ·{" "}
                  {((dates.length * practiceMinutes) / 60).toFixed(1)} coached
                  hours
                </p>
              </span>
              <ol>
                {dates.slice(0, 5).map((date) => (
                  <li key={date}>
                    {formatDate(date)} · {startTime}
                  </li>
                ))}
                {dates.length > 5 && (
                  <li>+ {dates.length - 5} more exact dates</li>
                )}
              </ol>
            </section>
          </div>
        )}
        {step === 2 && (
          <div className="training-program-step">
            <span className="hq-eyebrow">03 · Reality</span>
            <h2>Design around what changes the week.</h2>
            <p>
              Add tournaments, travel, assessments, or deliberate breaks. Duna
              will lower nearby volume, surface overlaps, and preserve every
              decision for coach review.
            </p>
            <div className="training-milestone-picker">
              <div role="group" aria-label="Milestone kind">
                {(["tournament", "travel", "assessment", "break"] as const).map(
                  (kind) => (
                    <button
                      className={
                        milestoneDraft.kind === kind ? "active" : undefined
                      }
                      key={kind}
                      onClick={() =>
                        setMilestoneDraft((current) => ({ ...current, kind }))
                      }
                      type="button"
                    >
                      {kind === "tournament" ? (
                        <Trophy aria-hidden size={16} />
                      ) : kind === "travel" ? (
                        <Plane aria-hidden size={16} />
                      ) : kind === "assessment" ? (
                        <Target aria-hidden size={16} />
                      ) : (
                        <CalendarDays aria-hidden size={16} />
                      )}
                      {kind.replace(/^./, (letter) => letter.toUpperCase())}
                    </button>
                  ),
                )}
              </div>
              <label className="wide">
                <span>Name</span>
                <input
                  onChange={(event) =>
                    setMilestoneDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Atlantic Coast Open"
                  value={milestoneDraft.title}
                />
              </label>
              <label>
                <span>Starts</span>
                <input
                  min={startDate}
                  onChange={(event) =>
                    setMilestoneDraft((current) => ({
                      ...current,
                      startsOn: event.target.value,
                      endsOn: current.endsOn || event.target.value,
                    }))
                  }
                  type="date"
                  value={milestoneDraft.startsOn}
                />
              </label>
              <label>
                <span>Ends</span>
                <input
                  min={milestoneDraft.startsOn || startDate}
                  onChange={(event) =>
                    setMilestoneDraft((current) => ({
                      ...current,
                      endsOn: event.target.value,
                    }))
                  }
                  type="date"
                  value={milestoneDraft.endsOn}
                />
              </label>
              <label>
                <span>Priority</span>
                <select
                  onChange={(event) =>
                    setMilestoneDraft((current) => ({
                      ...current,
                      priority: event.target
                        .value as ProgramMilestone["priority"],
                    }))
                  }
                  value={milestoneDraft.priority}
                >
                  <option value="key">Key milestone</option>
                  <option value="standard">Standard</option>
                  <option value="low">Context only</option>
                </select>
              </label>
              <button
                className="hq-button hq-button--primary"
                disabled={
                  !milestoneDraft.title.trim() || !milestoneDraft.startsOn
                }
                onClick={addMilestone}
                type="button"
              >
                <Plus aria-hidden size={16} /> Add milestone
              </button>
            </div>
            <div className="training-milestone-list">
              {milestones.map((milestone) => (
                <article key={milestone.id}>
                  <div>
                    {milestone.kind === "tournament" ? (
                      <Trophy aria-hidden size={18} />
                    ) : milestone.kind === "travel" ? (
                      <Plane aria-hidden size={18} />
                    ) : (
                      <MapPin aria-hidden size={18} />
                    )}
                  </div>
                  <span>
                    <small>
                      {milestone.kind} · {milestone.priority}
                    </small>
                    <strong>{milestone.title}</strong>
                    <p>
                      {formatDate(milestone.startsOn)}
                      {milestone.endsOn !== milestone.startsOn
                        ? ` – ${formatDate(milestone.endsOn)}`
                        : ""}
                    </p>
                  </span>
                  <button
                    aria-label={`Remove ${milestone.title}`}
                    onClick={() =>
                      setMilestones((current) =>
                        current.filter(
                          (candidate) => candidate.id !== milestone.id,
                        ),
                      )
                    }
                    type="button"
                  >
                    <Trash2 aria-hidden size={16} />
                  </button>
                </article>
              ))}
              {milestones.length === 0 && (
                <div className="training-milestone-list__empty">
                  <Sparkles aria-hidden size={19} />
                  <span>
                    <strong>No milestones yet.</strong>
                    <small>
                      That is okay—Duna can design from the practice window
                      alone.
                    </small>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="training-program-step training-program-step--design">
            <span className="hq-eyebrow">04 · Design</span>
            {!draft ? (
              <section className="training-program-generate">
                <div>
                  <WandSparkles aria-hidden size={29} />
                </div>
                <h2>Ready to design {dates.length} practices.</h2>
                <p>
                  Duna will create phases, place focus areas, taper around key
                  dates, explain load choices, and keep every session editable.
                </p>
                <dl>
                  <div>
                    <dt>Window</dt>
                    <dd>
                      {formatDate(startDate)} – {formatDate(endDate)}
                    </dd>
                  </div>
                  <div>
                    <dt>Rhythm</dt>
                    <dd>
                      {days.map((day) => day.slice(0, 3)).join(" + ")} ·{" "}
                      {startTime}
                    </dd>
                  </div>
                  <div>
                    <dt>Milestones</dt>
                    <dd>{milestones.length || "None"}</dd>
                  </div>
                  <div>
                    <dt>Athletes</dt>
                    <dd>{athleteCount}</dd>
                  </div>
                </dl>
                <button
                  className="training-ai-generate"
                  disabled={generating}
                  onClick={generate}
                  type="button"
                >
                  {generating ? (
                    <>
                      <RotateCcw
                        aria-hidden
                        className="training-spin"
                        size={19}
                      />{" "}
                      Designing the program…
                    </>
                  ) : (
                    <>
                      <WandSparkles aria-hidden size={19} /> Design this program
                    </>
                  )}
                </button>
              </section>
            ) : (
              <div className="training-program-result">
                <header>
                  <div>
                    <span className="hq-eyebrow">Duna proposal</span>
                    <h2>{title}</h2>
                    <p>{draft.summary}</p>
                  </div>
                  <button
                    className="hq-button hq-button--secondary"
                    disabled={generating}
                    onClick={generate}
                    type="button"
                  >
                    <RotateCcw aria-hidden size={16} /> Regenerate unlocked work
                  </button>
                </header>
                <div className="training-phase-grid">
                  {draft.phaseStrategy.map((phase, index) => (
                    <article key={`${phase.name}-${index}`}>
                      <header>
                        <span>0{index + 1}</span>
                        <Lock aria-label="Phase can be locked" size={14} />
                      </header>
                      <small>
                        {formatDate(phase.startsOn)} –{" "}
                        {formatDate(phase.endsOn)}
                      </small>
                      <strong>{phase.name}</strong>
                      <p>{phase.objective}</p>
                      <div>
                        {phase.focusAreas.map((focus) => (
                          <span key={focus}>{focus}</span>
                        ))}
                      </div>
                      <footer>{phase.loadIntent}</footer>
                    </article>
                  ))}
                </div>
                <section className="training-program-calendar-preview">
                  <header>
                    <div>
                      <span className="hq-eyebrow">Every practice</span>
                      <h3>
                        {draft.scheduledSessionCount} sessions ·{" "}
                        {draft.plannedMinutes / 60} hours
                      </h3>
                    </div>
                    <small>Exact recurrence confirmed</small>
                  </header>
                  <div>
                    {draft.occurrences.map((occurrence, index) => (
                      <article
                        key={`${occurrence.localDate}-${occurrence.startsAt}`}
                      >
                        <time>
                          <span>{formatDate(occurrence.localDate)}</span>
                          <small>{occurrence.startsAt}</small>
                        </time>
                        <div>
                          <span>{occurrence.phase}</span>
                          <strong>{occurrence.title}</strong>
                          <p>{occurrence.rationale}</p>
                        </div>
                        <aside>
                          <small>Load</small>
                          <strong>{occurrence.plannedLoad}</strong>
                          <i>
                            <b
                              style={variableStyle(
                                "--training-value",
                                `${occurrence.plannedLoad}%`,
                              )}
                            />
                          </i>
                        </aside>
                        <button
                          aria-label={`Lock ${occurrence.title}`}
                          type="button"
                        >
                          <Lock aria-hidden size={14} />
                        </button>
                        {index < draft.occurrences.length - 1 && <em />}
                      </article>
                    ))}
                  </div>
                </section>
                {draft.warnings.length > 0 && (
                  <section className="training-program-warnings">
                    <CircleAlert aria-hidden size={18} />
                    <div>
                      <strong>Coach review needed</strong>
                      {draft.warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  </section>
                )}
                <section className="training-program-link">
                  <div>
                    <span className="hq-eyebrow">
                      Commercial handoff · optional
                    </span>
                    <h3>Link the Program service players buy.</h3>
                    <p>
                      The offer keeps its total price and inclusions. Coaches
                      can evolve this training calendar without changing
                      checkout.
                    </p>
                  </div>
                  {offers.length ? (
                    <label>
                      <span>Program offer</span>
                      <select
                        onChange={(event) =>
                          setCatalogItemId(event.target.value)
                        }
                        value={catalogItemId}
                      >
                        <option value="">No link yet</option>
                        {offers.map((offer) => (
                          <option key={offer.id} value={offer.id}>
                            {offer.title} · {offer.status}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <Link
                      className="hq-button hq-button--secondary"
                      href="/products/create?type=service&subtype=program"
                    >
                      Create Program offer
                    </Link>
                  )}
                </section>
                <footer className="training-program-save">
                  <div>
                    <Check aria-hidden size={17} />
                    <span>
                      <strong>Private draft</strong>
                      <small>
                        {draft.scheduledSessionCount} practices will be saved.
                        Nothing is published.
                      </small>
                    </span>
                  </div>
                  <button
                    className="hq-button hq-button--primary"
                    disabled={saving}
                    onClick={save}
                    type="button"
                  >
                    <Save aria-hidden size={17} />{" "}
                    {saving ? "Saving…" : "Save program draft"}
                  </button>
                </footer>
              </div>
            )}
          </div>
        )}
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
        <footer className="training-program-stage__footer">
          <button
            className="hq-button hq-button--secondary"
            disabled={step === 0}
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            type="button"
          >
            <ChevronLeft aria-hidden size={16} /> Back
          </button>
          {step < 3 && (
            <button
              className="hq-button hq-button--primary"
              disabled={!stepReady[step]}
              onClick={() => setStep((current) => Math.min(3, current + 1))}
              type="button"
            >
              Continue <ChevronRight aria-hidden size={16} />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
