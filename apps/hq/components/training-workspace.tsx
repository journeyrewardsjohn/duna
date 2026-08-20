"use client";

import type {
  TrainingDrill,
  TrainingEvent,
  TrainingPracticePlan,
  TrainingProgram,
  TrainingWorkspace as TrainingWorkspaceData,
} from "@duna/api/training-contracts";
import {
  Activity,
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  Eye,
  FileDown,
  Gauge,
  Layers3,
  LibraryBig,
  ListPlus,
  Lock,
  Play,
  Plus,
  Search,
  Sparkles,
  Target,
  Trophy,
  UsersRound,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { TrainingCourtAnimation } from "./training-court-animation";

type TrainingView =
  "today" | "programs" | "calendar" | "plans" | "drills" | "insights";

const tabs: readonly {
  readonly id: TrainingView;
  readonly label: string;
  readonly icon: typeof Activity;
}[] = [
  { id: "today", label: "Today", icon: Play },
  { id: "programs", label: "Programs", icon: Layers3 },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "plans", label: "Practice plans", icon: ClipboardList },
  { id: "drills", label: "Drill library", icon: LibraryBig },
  { id: "insights", label: "Insights", icon: Activity },
];

function variableStyle(name: string, value: string): CSSProperties {
  return { [name]: value } as CSSProperties;
}

function formatClock(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatDate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatDateRange(start: string, end: string): string {
  const format = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${format.format(new Date(`${start}T12:00:00Z`))} – ${format.format(new Date(`${end}T12:00:00Z`))}`;
}

function duration(event: TrainingEvent): number {
  return Math.max(
    0,
    Math.round(
      (new Date(event.endsAt).getTime() - new Date(event.startsAt).getTime()) /
        60_000,
    ),
  );
}

function sentenceCase(value: string): string {
  return value
    .replaceAll("-", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function LoadSignal({
  value,
  compact = false,
}: {
  readonly value: number;
  readonly compact?: boolean;
}) {
  const tone = value >= 78 ? "high" : value >= 52 ? "build" : "low";
  return (
    <span
      aria-label={`Planned load ${value} out of 100`}
      className={`training-load training-load--${tone}${compact ? " training-load--compact" : ""}`}
    >
      <i style={variableStyle("--training-value", `${value}%`)} />
      {!compact && <b>{value}</b>}
    </span>
  );
}

function EmptyTrainingState({
  action,
  detail,
  href,
  title,
}: {
  readonly action: string;
  readonly detail: string;
  readonly href: string;
  readonly title: string;
}) {
  return (
    <section className="training-empty">
      <div>
        <Sparkles aria-hidden size={24} />
      </div>
      <h2>{title}</h2>
      <p>{detail}</p>
      <Link className="hq-button hq-button--primary" href={href}>
        <Plus aria-hidden size={17} /> {action}
      </Link>
    </section>
  );
}

function PracticeTimeline({ plan }: { readonly plan: TrainingPracticePlan }) {
  const grouped = useMemo(() => {
    const values = new Map<number, TrainingPracticePlan["blocks"]>();
    for (const block of plan.blocks) {
      values.set(block.startsAtMinute, [
        ...(values.get(block.startsAtMinute) ?? []),
        block,
      ]);
    }
    return [...values.entries()].sort(([left], [right]) => left - right);
  }, [plan]);
  return (
    <div className="training-practice-timeline">
      {grouped.map(([startsAtMinute, blocks]) => (
        <div className="training-practice-row" key={startsAtMinute}>
          <span className="training-practice-row__time">
            +{startsAtMinute}
            <small>min</small>
          </span>
          <div
            className={`training-practice-row__lanes${blocks.length > 1 ? " training-practice-row__lanes--parallel" : ""}`}
          >
            {blocks.map((block) => (
              <article key={block.id}>
                <header>
                  <span>{block.lane === "all" ? "Everyone" : block.lane}</span>
                  {block.locked && (
                    <Lock aria-label="Locked in plan" size={13} />
                  )}
                </header>
                <strong>{block.title}</strong>
                <p>
                  {block.durationMinutes} min ·{" "}
                  {block.focusArea ?? sentenceCase(block.kind)}
                </p>
                <footer>
                  <LoadSignal compact value={block.plannedLoad} />
                  <span>
                    {block.touchesTypical
                      ? `~${block.touchesTypical} touches`
                      : "Recovery"}
                  </span>
                  {block.jumpsTypical > 0 && (
                    <span>~{block.jumpsTypical} jumps</span>
                  )}
                </footer>
              </article>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function TodayView({
  workspace,
}: {
  readonly workspace: TrainingWorkspaceData;
}) {
  const plan = workspace.today?.practicePlanId
    ? workspace.practicePlans.find(
        (candidate) => candidate.id === workspace.today?.practicePlanId,
      )
    : workspace.practicePlans[0];
  const tournament = workspace.upcomingEvents.find(
    (event) => event.kind === "tournament",
  );
  if (!workspace.today || !plan) {
    return (
      <EmptyTrainingState
        action="Build a practice"
        detail="Create a practice plan or schedule a program. Duna will turn the next session into a coach-ready run sheet."
        href="/training/practice-plans/create"
        title="Nothing is on the board today."
      />
    );
  }
  const practice = workspace.today;
  return (
    <div className="training-today">
      <section className="training-run-card">
        <header>
          <div>
            <span className="training-status-pill">
              <i /> Ready to run
            </span>
            <h2>{practice.title}</h2>
            <p>
              {formatClock(practice.startsAt, practice.timezone)}–
              {formatClock(practice.endsAt, practice.timezone)} ·{" "}
              {practice.venueName}
            </p>
          </div>
          <div className="training-run-card__actions">
            <Link
              className="hq-button hq-button--secondary"
              href={`/training/practice-plans/${plan.id}/print`}
            >
              <FileDown aria-hidden size={16} /> Run sheet
            </Link>
            <Link
              className="hq-button hq-button--primary"
              href={`/training/practices/${practice.id}`}
            >
              <Play aria-hidden size={16} /> Start coach mode
            </Link>
          </div>
        </header>
        <div className="training-run-card__brief">
          <div>
            <span>Primary focus</span>
            <strong>
              <Target aria-hidden size={16} /> {practice.focusArea}
            </strong>
          </div>
          <div>
            <span>Athletes</span>
            <strong>
              <UsersRound aria-hidden size={16} /> {practice.athleteCount}{" "}
              expected
            </strong>
          </div>
          <div>
            <span>Planned load</span>
            <strong>
              <Gauge aria-hidden size={16} /> {practice.plannedLoad} / 100
            </strong>
          </div>
          <div>
            <span>Plan version</span>
            <strong>
              <CheckCircle2 aria-hidden size={16} /> v{plan.version}
            </strong>
          </div>
        </div>
        <PracticeTimeline plan={plan} />
        <footer className="training-run-card__footer">
          <div>
            <span>Practice total</span>
            <strong>{plan.durationMinutes} minutes</strong>
          </div>
          <div>
            <span>Typical opportunity</span>
            <strong>
              ~{plan.totalTouchesTypical} contacts · ~{plan.totalJumpsTypical}{" "}
              jumps
            </strong>
          </div>
          <small>
            Estimates explain their assumptions and become observed data only
            when captured by a coach or Duna Vision.
          </small>
        </footer>
      </section>

      <aside className="training-today__rail">
        <section className="training-rail-card training-rail-card--program">
          <span className="hq-eyebrow">Program pulse</span>
          <h3>{workspace.programs[0]?.title ?? "Current program"}</h3>
          <p>
            {workspace.programs[0]?.currentPhase} phase ·{" "}
            {workspace.programs[0]?.completedSessionCount} of{" "}
            {workspace.programs[0]?.scheduledSessionCount} practices complete
          </p>
          <div
            className="training-progress-ring"
            style={variableStyle(
              "--training-value",
              `${workspace.programs[0] ? Math.round((workspace.programs[0].completedSessionCount / workspace.programs[0].scheduledSessionCount) * 100) : 0}%`,
            )}
          >
            <strong>
              {workspace.programs[0]
                ? Math.round(
                    (workspace.programs[0].completedSessionCount /
                      workspace.programs[0].scheduledSessionCount) *
                      100,
                  )
                : 0}
              %
            </strong>
            <small>complete</small>
          </div>
          <Link href={`/training/programs/${workspace.programs[0]?.id}`}>
            View program <ArrowRight aria-hidden size={15} />
          </Link>
        </section>
        {tournament && (
          <section className="training-rail-card training-rail-card--milestone">
            <span>
              <Trophy aria-hidden size={16} /> Key milestone
            </span>
            <h3>{tournament.title}</h3>
            <p>
              {formatDate(tournament.startsAt, tournament.timezone)} ·{" "}
              {tournament.venueName}
            </p>
            <div>
              <strong>12 days</strong>
              <small>Build → sharpen → taper</small>
            </div>
          </section>
        )}
        <section className="training-rail-card">
          <span className="hq-eyebrow">Athlete handoff</span>
          <h3>What players see</h3>
          <ul>
            <li>
              <Check aria-hidden size={14} /> Arrival time and court
            </li>
            <li>
              <Check aria-hidden size={14} /> Session purpose and focus
            </li>
            <li>
              <Check aria-hidden size={14} /> Private post-practice RPE
            </li>
          </ul>
          <button className="training-text-button" type="button">
            <Eye aria-hidden size={15} /> Preview player view
          </button>
        </section>
      </aside>
    </div>
  );
}

function ProgramCard({ program }: { readonly program: TrainingProgram }) {
  const progress = program.scheduledSessionCount
    ? Math.round(
        (program.completedSessionCount / program.scheduledSessionCount) * 100,
      )
    : 0;
  return (
    <article className="training-program-card">
      <header>
        <span
          className={`training-program-state training-program-state--${program.status}`}
        >
          {sentenceCase(program.status)}
        </span>
        <button aria-label={`More options for ${program.title}`} type="button">
          •••
        </button>
      </header>
      <span className="hq-eyebrow">{program.currentPhase}</span>
      <h3>{program.title}</h3>
      <p>{program.purpose}</p>
      <dl>
        <div>
          <dt>Window</dt>
          <dd>{formatDateRange(program.startDate, program.endDate)}</dd>
        </div>
        <div>
          <dt>Practices</dt>
          <dd>{program.scheduledSessionCount}</dd>
        </div>
        <div>
          <dt>Athletes</dt>
          <dd>{program.athleteCount}</dd>
        </div>
      </dl>
      {program.status !== "draft" ? (
        <div className="training-program-card__progress">
          <span>
            <b>{program.completedSessionCount}</b> complete
          </span>
          <span>
            {program.scheduledSessionCount - program.completedSessionCount}{" "}
            ahead
          </span>
          <i>
            <b style={variableStyle("--training-value", `${progress}%`)} />
          </i>
        </div>
      ) : (
        <div className="training-program-card__draft">
          <Sparkles aria-hidden size={16} /> Calendar ready for coach review
        </div>
      )}
      {program.linkedOffer && (
        <div className="training-program-card__offer">
          <span>Linked offer</span>
          <strong>{program.linkedOffer.title}</strong>
          <small>{program.linkedOffer.inclusions[0]}</small>
        </div>
      )}
      <footer>
        <Link href={`/training/programs/${program.id}`}>
          Open program <ChevronRight aria-hidden size={16} />
        </Link>
      </footer>
    </article>
  );
}

function ProgramsView({
  workspace,
}: {
  readonly workspace: TrainingWorkspaceData;
}) {
  return (
    <div className="training-section-stack">
      <section className="training-section-heading">
        <div>
          <span className="hq-eyebrow">From objective to every practice</span>
          <h2>Programs</h2>
          <p>
            Plan a finite training window around competition, travel, recovery,
            staff, and the exact dates athletes will train.
          </p>
        </div>
        <Link
          className="hq-button hq-button--primary"
          href="/training/programs/create"
        >
          <WandSparkles aria-hidden size={17} /> Design a program
        </Link>
      </section>
      <div className="training-program-grid">
        {workspace.programs.map((program) => (
          <ProgramCard key={program.id} program={program} />
        ))}
      </div>
      <section className="training-program-explainer">
        <div>
          <BookOpenCheck aria-hidden size={23} />
        </div>
        <div>
          <span className="hq-eyebrow">One name, two clear jobs</span>
          <h3>The offer sells the program. Training runs it.</h3>
          <p>
            A Program service owns dates, session count, inclusions, and price.
            The Training program owns evolving practice content, tournaments,
            travel, staffing, and athlete outcomes. They stay linked without
            forcing coaches to edit commerce.
          </p>
        </div>
        <Link href="/products/create?type=service&subtype=program">
          Create a Program offer <ArrowRight aria-hidden size={16} />
        </Link>
      </section>
    </div>
  );
}

function CalendarView({
  workspace,
}: {
  readonly workspace: TrainingWorkspaceData;
}) {
  const eventsByDate = workspace.upcomingEvents.reduce<
    Map<string, TrainingEvent[]>
  >((grouped, event) => {
    const key = event.startsAt.slice(0, 10);
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
    return grouped;
  }, new Map());
  return (
    <div className="training-section-stack">
      <section className="training-section-heading">
        <div>
          <span className="hq-eyebrow">Load-aware schedule</span>
          <h2>Training calendar</h2>
          <p>
            Practices, competition, travel, strength, recovery, and planning
            days appear together before a coach changes the week.
          </p>
        </div>
        <div className="training-calendar-legend">
          <span>
            <i className="practice" /> Practice
          </span>
          <span>
            <i className="tournament" /> Competition
          </span>
          <span>
            <i className="recovery" /> Recovery + travel
          </span>
        </div>
      </section>
      <section className="training-calendar-board">
        <header>
          <div>
            <CalendarDays aria-hidden size={18} />
            <strong>Next 30 days</strong>
          </div>
          <div>
            <button type="button">Today</button>
            <button type="button">‹</button>
            <button type="button">›</button>
          </div>
        </header>
        <div className="training-calendar-days">
          {[...eventsByDate.entries()].map(([date, events]) => (
            <article key={date}>
              <time dateTime={date}>
                <span>
                  {new Intl.DateTimeFormat("en-US", {
                    weekday: "short",
                    timeZone: "UTC",
                  }).format(new Date(`${date}T12:00:00Z`))}
                </span>
                <strong>{Number(date.slice(-2))}</strong>
                <small>
                  {new Intl.DateTimeFormat("en-US", {
                    month: "short",
                    timeZone: "UTC",
                  }).format(new Date(`${date}T12:00:00Z`))}
                </small>
              </time>
              <div>
                {events.map((event) => (
                  <button
                    className={`training-calendar-event training-calendar-event--${event.kind}`}
                    key={event.id}
                    type="button"
                  >
                    <span>
                      {formatClock(event.startsAt, event.timezone)} ·{" "}
                      {duration(event)} min
                    </span>
                    <strong>{event.title}</strong>
                    <small>
                      {event.focusArea ?? sentenceCase(event.kind)} · Load{" "}
                      {event.plannedLoad}
                    </small>
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function PlanCard({ plan }: { readonly plan: TrainingPracticePlan }) {
  const lanes = new Set(plan.blocks.map((block) => block.lane));
  return (
    <article className="training-plan-card">
      <header>
        <span>{plan.focusArea}</span>
        <small>v{plan.version}</small>
      </header>
      <h3>{plan.title}</h3>
      <p>{plan.purpose}</p>
      <div className="training-plan-card__sequence">
        {plan.blocks.slice(0, 7).map((block) => (
          <i
            aria-label={`${block.title}, ${block.durationMinutes} minutes`}
            key={block.id}
            style={variableStyle(
              "--training-value",
              `${Math.max(8, (block.durationMinutes / plan.durationMinutes) * 100)}%`,
            )}
            title={block.title}
          />
        ))}
      </div>
      <dl>
        <div>
          <dt>Time</dt>
          <dd>{plan.durationMinutes} min</dd>
        </div>
        <div>
          <dt>Load</dt>
          <dd>{plan.plannedLoad}</dd>
        </div>
        <div>
          <dt>Structure</dt>
          <dd>
            {lanes.size > 1 ? `${lanes.size - 1} court lanes` : "Together"}
          </dd>
        </div>
        <div>
          <dt>Typical</dt>
          <dd>~{plan.totalTouchesTypical} touches</dd>
        </div>
      </dl>
      <footer>
        <Link href={`/training/practice-plans/${plan.id}`}>
          Open plan <ChevronRight aria-hidden size={16} />
        </Link>
        <Link
          aria-label={`Download ${plan.title}`}
          href={`/training/practice-plans/${plan.id}/print`}
        >
          <FileDown aria-hidden size={16} />
        </Link>
      </footer>
    </article>
  );
}

function PlansView({
  workspace,
}: {
  readonly workspace: TrainingWorkspaceData;
}) {
  return (
    <div className="training-section-stack">
      <section className="training-section-heading">
        <div>
          <span className="hq-eyebrow">Reusable, versioned, coach-ready</span>
          <h2>Practice plans</h2>
          <p>
            Build the timeline once, adjust it for a team, and keep the exact
            version that was assigned and delivered.
          </p>
        </div>
        <div className="training-section-heading__actions">
          <a
            className="hq-button hq-button--secondary"
            download
            href="/api/training/practice-plans/blank/pdf"
          >
            <FileDown aria-hidden size={17} /> Blank Duna sheet
          </a>
          <Link
            className="hq-button hq-button--primary"
            href="/training/practice-plans/create"
          >
            <ListPlus aria-hidden size={17} /> Build a practice
          </Link>
        </div>
      </section>
      <div className="training-plan-grid">
        {workspace.practicePlans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} />
        ))}
      </div>
    </div>
  );
}

function DrillDetail({ drill }: { readonly drill: TrainingDrill }) {
  return (
    <aside className="training-drill-detail">
      <TrainingCourtAnimation drill={drill} />
      <header>
        <div>
          <span>{drill.focusArea}</span>
          <small>
            {drill.visibility === "public"
              ? "Shared library"
              : "Your organization"}
          </small>
        </div>
        <h3>{drill.title}</h3>
        <p>{drill.summary}</p>
      </header>
      <div className="training-drill-detail__metrics">
        <div>
          <span>Time</span>
          <strong>{drill.durationMinutes}m</strong>
        </div>
        <div>
          <span>Players</span>
          <strong>
            {drill.minPlayers}–{drill.maxPlayers}
          </strong>
        </div>
        <div>
          <span>Intensity</span>
          <strong>{drill.intensity}/10</strong>
        </div>
        <div>
          <span>Typical</span>
          <strong>~{drill.estimate.touchesTypical}</strong>
          <small>touches / athlete</small>
        </div>
      </div>
      <section>
        <span className="hq-eyebrow">How it runs</span>
        <ol>
          {drill.steps.slice(0, 4).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>
      <section className="training-drill-detail__estimate">
        <header>
          <span>Estimated opportunity</span>
          <b>{drill.estimate.confidence} confidence</b>
        </header>
        <strong>
          {drill.estimate.touchesLow}–{drill.estimate.touchesHigh} touches{" "}
          <small>per athlete</small>
        </strong>
        <p>{drill.estimate.basis.join(" · ")}</p>
      </section>
      <footer>
        <Link
          className="hq-button hq-button--primary"
          href={`/training/practice-plans/create?drill=${drill.id}`}
        >
          <Plus aria-hidden size={16} /> Add to practice
        </Link>
        <button className="hq-button hq-button--secondary" type="button">
          Edit a copy
        </button>
      </footer>
    </aside>
  );
}

function DrillsView({
  workspace,
}: {
  readonly workspace: TrainingWorkspaceData;
}) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | "organization" | "public">("all");
  const [selectedId, setSelectedId] = useState(workspace.drills[0]?.id);
  const drills = workspace.drills.filter((drill) => {
    const matchesQuery =
      `${drill.title} ${drill.focusArea} ${drill.tags.map((tag) => tag.label).join(" ")}`
        .toLowerCase()
        .includes(query.toLowerCase());
    const matchesScope = scope === "all" || drill.visibility === scope;
    return matchesQuery && matchesScope;
  });
  const selected =
    workspace.drills.find((drill) => drill.id === selectedId) ?? drills[0];
  return (
    <div className="training-section-stack">
      <section className="training-section-heading">
        <div>
          <span className="hq-eyebrow">
            Original coaching content + your system
          </span>
          <h2>Drill library</h2>
          <p>
            Find a drill by purpose, understand its expected opportunity, or
            describe your own in plain language and let Duna structure it.
          </p>
        </div>
        <Link
          className="hq-button hq-button--primary"
          href="/training/drills/create"
        >
          <WandSparkles aria-hidden size={17} /> Create with AI
        </Link>
      </section>
      <div className="training-drill-tools">
        <label>
          <Search aria-hidden size={17} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by skill, purpose, or tag"
            type="search"
            value={query}
          />
        </label>
        <div role="group" aria-label="Drill library scope">
          {(["all", "organization", "public"] as const).map((value) => (
            <button
              className={scope === value ? "active" : undefined}
              key={value}
              onClick={() => setScope(value)}
              type="button"
            >
              {value === "all"
                ? "All drills"
                : value === "organization"
                  ? "My organization"
                  : "Shared library"}
            </button>
          ))}
        </div>
      </div>
      <div className="training-drill-workspace">
        <section className="training-drill-list">
          {drills.map((drill) => (
            <button
              className={selected?.id === drill.id ? "active" : undefined}
              key={drill.id}
              onClick={() => setSelectedId(drill.id)}
              type="button"
            >
              <TrainingCourtAnimation compact drill={drill} />
              <div>
                <span>
                  {drill.focusArea}
                  <i>·</i>
                  {drill.mode}
                </span>
                <strong>{drill.title}</strong>
                <small>
                  {drill.durationMinutes} min · {drill.minPlayers}–
                  {drill.maxPlayers} players · ~{drill.estimate.touchesTypical}{" "}
                  touches
                </small>
                <em>{drill.visibility === "public" ? "Public" : "Private"}</em>
              </div>
              <ChevronRight aria-hidden size={18} />
            </button>
          ))}
          {drills.length === 0 && (
            <p className="training-drill-list__empty">
              No drills match those filters.
            </p>
          )}
        </section>
        {selected && <DrillDetail drill={selected} />}
      </div>
    </div>
  );
}

function InsightsView({
  workspace,
}: {
  readonly workspace: TrainingWorkspaceData;
}) {
  const maxMinutes = Math.max(
    1,
    ...workspace.insights.focusDistribution.map((item) => item.minutes),
  );
  return (
    <div className="training-section-stack">
      <section className="training-section-heading">
        <div>
          <span className="hq-eyebrow">
            Planned work, delivered work, athlete voice
          </span>
          <h2>Training insights</h2>
          <p>
            See what the organization has trained, how workload is changing, and
            where planned opportunity differs from what coaches and athletes
            report.
          </p>
        </div>
        <button className="hq-button hq-button--secondary" type="button">
          <FileDown aria-hidden size={16} /> Export report
        </button>
      </section>
      <div className="training-insight-metrics">
        {workspace.insights.headline.map((metric) => (
          <article key={metric.id}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </div>
      <div className="training-insight-grid">
        <section className="training-insight-card">
          <header>
            <div>
              <span className="hq-eyebrow">Last 28 days</span>
              <h3>Where practice time went</h3>
            </div>
            <small>{workspace.insights.totalMinutes} total minutes</small>
          </header>
          <div className="training-focus-bars">
            {workspace.insights.focusDistribution.map((item) => (
              <div key={item.focusArea}>
                <span>{item.focusArea}</span>
                <i>
                  <b
                    style={variableStyle(
                      "--training-value",
                      `${(item.minutes / maxMinutes) * 100}%`,
                    )}
                  />
                </i>
                <strong>{item.minutes}m</strong>
                <small>{item.percent}%</small>
              </div>
            ))}
          </div>
        </section>
        <section className="training-insight-card">
          <header>
            <div>
              <span className="hq-eyebrow">Six-week view</span>
              <h3>Planned vs. delivered load</h3>
            </div>
            <small>Coach planning scale</small>
          </header>
          <div className="training-load-chart">
            {workspace.insights.weeklyLoad.map((week) => (
              <div key={week.week}>
                <span className="training-load-chart__plot">
                  <i
                    className="planned"
                    style={variableStyle(
                      "--training-value",
                      `${week.planned}%`,
                    )}
                  />
                  {week.actual !== undefined && (
                    <i
                      className="actual"
                      style={variableStyle(
                        "--training-value",
                        `${week.actual}%`,
                      )}
                    />
                  )}
                  {week.tournament && (
                    <Trophy aria-label="Tournament week" size={13} />
                  )}
                </span>
                <small>{week.week}</small>
              </div>
            ))}
          </div>
          <footer>
            <span>
              <i className="planned" /> Planned
            </span>
            <span>
              <i className="actual" /> Delivered
            </span>
            <small>
              Load is descriptive coaching context—not an injury prediction.
            </small>
          </footer>
        </section>
      </div>
      <section className="training-truth-model">
        <div>
          <span>1</span>
          <strong>Planned</strong>
          <small>Coach-assigned duration, intensity, touches, and jumps</small>
        </div>
        <ArrowRight aria-hidden size={18} />
        <div>
          <span>2</span>
          <strong>Reported</strong>
          <small>Coach completion, modifications, athlete session RPE</small>
        </div>
        <ArrowRight aria-hidden size={18} />
        <div>
          <span>3</span>
          <strong>Observed</strong>
          <small>
            Duna Vision contacts and movement when consented and available
          </small>
        </div>
      </section>
    </div>
  );
}

export function TrainingWorkspace({
  organizationName,
  workspace,
}: {
  readonly organizationName: string;
  readonly workspace: TrainingWorkspaceData;
}) {
  const [view, setView] = useState<TrainingView>("today");
  return (
    <main className="hq-page training-workspace" data-zone="editorial">
      <header className="training-workspace__hero">
        <div>
          <span className="hq-eyebrow">
            {organizationName} · Coaching intelligence
          </span>
          <h1>
            Build the work.
            <br />
            <em>See the progress.</em>
          </h1>
          <p>
            Plan around what matters, give every coach a beautiful run sheet,
            and connect each practice to the athlete experience.
          </p>
        </div>
        <div className="training-workspace__actions">
          <Link
            className="hq-button hq-button--secondary"
            href="/training/drills/create"
          >
            <Dumbbell aria-hidden size={17} /> New drill
          </Link>
          <Link
            className="hq-button hq-button--secondary"
            href="/training/practice-plans/create"
          >
            <ClipboardList aria-hidden size={17} /> Build practice
          </Link>
          <Link
            className="hq-button hq-button--primary"
            href="/training/programs/create"
          >
            <WandSparkles aria-hidden size={17} /> Program Designer
          </Link>
        </div>
      </header>
      <nav
        aria-label="Training workspace"
        className="training-workspace__tabs"
        role="tablist"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              aria-selected={view === tab.id}
              className={view === tab.id ? "active" : undefined}
              key={tab.id}
              onClick={() => setView(tab.id)}
              role="tab"
              type="button"
            >
              <Icon aria-hidden size={16} /> {tab.label}
              {tab.id === "today" && workspace.today && <i />}
            </button>
          );
        })}
      </nav>
      <div className="training-workspace__body" role="tabpanel">
        {view === "today" ? <TodayView workspace={workspace} /> : null}
        {view === "programs" ? <ProgramsView workspace={workspace} /> : null}
        {view === "calendar" ? <CalendarView workspace={workspace} /> : null}
        {view === "plans" ? <PlansView workspace={workspace} /> : null}
        {view === "drills" ? <DrillsView workspace={workspace} /> : null}
        {view === "insights" ? <InsightsView workspace={workspace} /> : null}
      </div>
    </main>
  );
}
