import type {
  TrainingEvent,
  TrainingPracticePlan,
  TrainingProgram,
  TrainingVersionHistoryEntry,
  TrainingWorkspace,
} from "@duna/api/training-contracts";
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  FileDown,
  Layers3,
  Lock,
  Sparkles,
  Target,
  Trophy,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { TrainingContentLifecycle } from "./training-content-lifecycle";
import { TrainingProgramScheduleEditor } from "./training-program-schedule-editor";

function variableStyle(name: string, value: string): CSSProperties {
  return { [name]: value } as CSSProperties;
}

function formatDate(value: string, timezone = "UTC"): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00.000Z`)
    : new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: timezone,
  }).format(date);
}

export function TrainingPracticePlanDetail({
  plan,
  versions,
}: {
  readonly plan: TrainingPracticePlan;
  readonly versions: readonly TrainingVersionHistoryEntry[];
}) {
  const groups = [...new Set(plan.blocks.map((block) => block.startsAtMinute))]
    .sort((first, second) => first - second)
    .map((minute) => ({
      minute,
      blocks: plan.blocks.filter((block) => block.startsAtMinute === minute),
    }));
  return (
    <main className="hq-page training-detail" data-zone="editorial">
      <header className="training-detail__hero">
        <Link aria-label="Back to Training" href="/training">
          <ArrowLeft aria-hidden size={20} />
        </Link>
        <div>
          <span className="hq-eyebrow">
            Practice plan ·{" "}
            {plan.status === "archived" ? "Archived" : `v${plan.version}`}
          </span>
          <h1>{plan.title}</h1>
          <p>{plan.purpose}</p>
          <div>
            <span>
              <Target aria-hidden size={15} /> {plan.focusArea}
            </span>
            <span>
              <UsersRound aria-hidden size={15} /> {plan.targetAudience}
            </span>
            <span>
              <Lock aria-hidden size={15} />{" "}
              {plan.visibility === "organization"
                ? "Organization private"
                : plan.visibility}
            </span>
          </div>
        </div>
        <div className="training-detail__actions">
          <Link
            className="hq-button hq-button--secondary"
            href={`/training/practice-plans/${plan.id}/print`}
          >
            <FileDown aria-hidden size={16} /> Run sheet
          </Link>
          {plan.status === "archived" ? (
            <span className="hq-button hq-button--secondary" aria-disabled>
              <Lock aria-hidden size={16} /> Restore to edit
            </span>
          ) : (
            <Link
              className="hq-button hq-button--primary"
              href={`/training/practice-plans/create?from=${plan.id}`}
            >
              <Sparkles aria-hidden size={16} /> Edit plan
            </Link>
          )}
        </div>
      </header>

      <section className="training-detail__signals">
        <div>
          <span>Time</span>
          <strong>{plan.durationMinutes}</strong>
          <small>minutes</small>
        </div>
        <div>
          <span>Planned load</span>
          <strong>{plan.plannedLoad}</strong>
          <small>out of 100</small>
        </div>
        <div>
          <span>Typical contacts</span>
          <strong>~{plan.totalTouchesTypical}</strong>
          <small>opportunities</small>
        </div>
        <div>
          <span>Typical jumps</span>
          <strong>~{plan.totalJumpsTypical}</strong>
          <small>opportunities</small>
        </div>
      </section>

      <div className="training-detail__layout">
        <section className="training-detail__timeline">
          <header>
            <span className="hq-eyebrow">Run of practice</span>
            <h2>Every segment, lane, and transition.</h2>
          </header>
          {groups.map((group, index) => (
            <article key={group.minute}>
              <aside>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>+{group.minute}m</strong>
                <i />
              </aside>
              <div className={group.blocks.length > 1 ? "parallel" : undefined}>
                {group.blocks.map((block) => (
                  <section key={block.id}>
                    <header>
                      <span>{block.lane}</span>
                      <small>{block.durationMinutes} min</small>
                    </header>
                    <h3>{block.title}</h3>
                    <p>
                      {block.instructions ||
                        `${block.focusArea ?? block.kind} segment.`}
                    </p>
                    <footer>
                      <span>{block.focusArea ?? block.kind}</span>
                      <span>{block.intensity}/10 intensity</span>
                      {block.touchesTypical > 0 && (
                        <span>~{block.touchesTypical} touches</span>
                      )}
                    </footer>
                  </section>
                ))}
              </div>
            </article>
          ))}
        </section>
        <aside className="training-detail__rail">
          <section>
            <span className="hq-eyebrow">Version truth</span>
            <h3>Plan v{plan.version}</h3>
            <p>
              Assigned events retain this exact snapshot. Future edits create a
              new version.
            </p>
            <small>Updated {formatDate(plan.updatedAt)}</small>
          </section>
          <section>
            <span className="hq-eyebrow">Player handoff</span>
            <h3>Intent without coach-only noise.</h3>
            <p>
              Athletes see focus, order, time, load, and opportunity estimates.
              Delivery notes stay with authorized coaches.
            </p>
          </section>
          <section>
            <span className="hq-eyebrow">Tags</span>
            <div className="training-detail__tags">
              {plan.tags.map((tag) => (
                <span key={tag.id}>{tag.label}</span>
              ))}
            </div>
          </section>
          <TrainingContentLifecycle
            contentId={plan.id}
            kind="practice-plan"
            status={plan.status}
            versions={versions}
          />
        </aside>
      </div>
    </main>
  );
}

export function TrainingProgramDetail({
  events,
  program,
  versions,
  workspace,
}: {
  readonly events: readonly TrainingEvent[];
  readonly program: TrainingProgram;
  readonly versions: readonly TrainingVersionHistoryEntry[];
  readonly workspace: TrainingWorkspace;
}) {
  const progress = program.scheduledSessionCount
    ? Math.round(
        (program.completedSessionCount / program.scheduledSessionCount) * 100,
      )
    : 0;
  const planCount = new Set(
    events.map((event) => event.practicePlanId).filter(Boolean),
  ).size;
  return (
    <main
      className="hq-page training-detail training-program-detail"
      data-zone="editorial"
    >
      <header className="training-detail__hero training-program-detail__hero">
        <Link aria-label="Back to Training" href="/training">
          <ArrowLeft aria-hidden size={20} />
        </Link>
        <div>
          <span className="hq-eyebrow">
            Training program · {program.currentPhase}
          </span>
          <h1>{program.title}</h1>
          <p>{program.purpose}</p>
          <div>
            <span>
              <CalendarDays aria-hidden size={15} />{" "}
              {formatDate(program.startDate)}–{formatDate(program.endDate)}
            </span>
            <span>
              <UsersRound aria-hidden size={15} /> {program.athleteCount}{" "}
              athletes
            </span>
            <span>
              <CheckCircle2 aria-hidden size={15} />{" "}
              {program.readiness.replace("-", " ")}
            </span>
          </div>
        </div>
        <div className="training-detail__actions">
          {program.linkedOffer ? (
            <Link className="hq-button hq-button--secondary" href="/products">
              <Layers3 aria-hidden size={16} /> View linked offer
            </Link>
          ) : (
            <Link
              className="hq-button hq-button--secondary"
              href="/products/create?type=service&subtype=program"
            >
              <Layers3 aria-hidden size={16} /> Create offer
            </Link>
          )}
          <Link
            className="hq-button hq-button--primary"
            href="/training/practice-plans/create"
          >
            <ClipboardList aria-hidden size={16} /> Build next practice
          </Link>
        </div>
      </header>

      <section className="training-program-detail__progress">
        <div>
          <span>Program progress</span>
          <strong>{progress}%</strong>
          <small>
            {program.completedSessionCount} complete ·{" "}
            {Math.max(
              0,
              program.scheduledSessionCount - program.completedSessionCount,
            )}{" "}
            ahead
          </small>
        </div>
        <i>
          <b style={variableStyle("--training-value", `${progress}%`)} />
        </i>
        <dl>
          <div>
            <dt>Practices</dt>
            <dd>{program.scheduledSessionCount}</dd>
          </div>
          <div>
            <dt>Planned hours</dt>
            <dd>{(program.plannedMinutes / 60).toFixed(1)}</dd>
          </div>
          <div>
            <dt>Plan versions in use</dt>
            <dd>{planCount}</dd>
          </div>
        </dl>
      </section>

      <div className="training-detail__layout">
        <TrainingProgramScheduleEditor
          events={events}
          programEndDate={program.endDate}
          programStartDate={program.startDate}
          readOnly={program.status === "archived"}
        />
        <aside className="training-detail__rail">
          <section className="training-program-detail__objective">
            <span className="hq-eyebrow">Objectives</span>
            <ol>
              {program.objectives.map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ol>
          </section>
          <section>
            <span className="hq-eyebrow">Approach</span>
            <p>{program.approach}</p>
          </section>
          {program.linkedOffer && (
            <section className="training-program-detail__offer">
              <span className="hq-eyebrow">Commercial promise</span>
              <h3>{program.linkedOffer.title}</h3>
              <p>{program.linkedOffer.inclusions.join(" · ")}</p>
              <strong>
                {new Intl.NumberFormat("en-US", {
                  style: "currency",
                  currency: program.linkedOffer.currency,
                }).format(program.linkedOffer.priceMinor / 100)}
              </strong>
            </section>
          )}
          <section>
            <span className="hq-eyebrow">Separation by design</span>
            <p>
              The offer preserves what was sold and its total price. This
              calendar can evolve as coaches adapt to weather, travel, athletes,
              and competition.
            </p>
          </section>
          <TrainingContentLifecycle
            contentId={program.id}
            kind="program"
            status={program.status}
            versions={versions}
          />
        </aside>
      </div>

      <section className="training-program-detail__load">
        <header>
          <Activity aria-hidden size={20} />
          <div>
            <span className="hq-eyebrow">Six-week view</span>
            <h2>Load is context, not a verdict.</h2>
          </div>
        </header>
        <div>
          {workspace.insights.weeklyLoad.map((week) => (
            <article key={week.week}>
              <div>
                <i
                  style={variableStyle("--training-value", `${week.planned}%`)}
                />
                {week.actual !== undefined && (
                  <b
                    style={variableStyle("--training-value", `${week.actual}%`)}
                  />
                )}
              </div>
              <strong>{week.planned}</strong>
              <span>{week.week}</span>
              {week.tournament && (
                <small>
                  <Trophy aria-hidden size={12} /> event
                </small>
              )}
            </article>
          ))}
        </div>
        <footer>
          <span>Planned</span>
          <span>Coach reported</span>
          <small>
            Observed load appears only when consented capture exists.
          </small>
        </footer>
      </section>
    </main>
  );
}
