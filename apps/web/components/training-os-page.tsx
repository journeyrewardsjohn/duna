"use client";

import { Numeric } from "@duna/ui";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CreditCard,
  Dumbbell,
  LayoutDashboard,
  Sparkles,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { marketingPeople, marketingPlayerGroup } from "@/lib/marketing-people";
import { ProfileAvatar, ProfileAvatarStack } from "./profile-avatar-stack";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import styles from "./training-os-page.module.css";

interface TrainingOSPageProps {
  readonly hqHref: string;
}

// Every name and number below is the demo content Duna HQ already ships, so
// the chrome on this page matches what a coach sees in the product.
const drillBrief =
  "Three pairs. A server targets the seam, the receiving pair must side out, then immediately solve a coach-entered transition ball. Win both to score a wash point. Rotate after four starts.";

const drillParameters = [
  ["Mode", "Hybrid"],
  ["Level", "Intermediate–Advanced"],
  ["Players", "4–8"],
  ["Minutes", "16"],
] as const;

const drillResult = {
  title: "First-Ball Sideout Lab",
  focusArea: "Ball Control",
  minutes: 16,
  steps: [
    "Server targets the seam between the receiving pair.",
    "Receivers call the seam early and side out.",
    "Coach enters one transition ball immediately after the sideout.",
    "Win both contacts to take the wash point. Rotate after four starts.",
  ],
  cues: [
    "Own the seam out loud before the serve crosses.",
    "Hittable beats perfect on the transition set.",
  ],
};

const practice = {
  title: "Sideout Under Pressure",
  focusArea: "Ball Control",
  minutes: 90,
  plannedLoad: 68,
  touches: 118,
  jumps: 22,
  blocks: [
    {
      at: 0,
      title: "Move, see, connect",
      kind: "Warm-up",
      lane: "Together",
      minutes: 10,
      focusArea: "Footwork",
    },
    {
      at: 10,
      title: "First-Ball Sideout Lab",
      kind: "Drill",
      lane: "Court 1",
      minutes: 16,
      focusArea: "Ball Control",
      parallel: true,
    },
    {
      at: 10,
      title: "High Hands, Deep Corners",
      kind: "Drill",
      lane: "Court 2",
      minutes: 16,
      focusArea: "Attack Location",
      parallel: true,
    },
    {
      at: 30,
      title: "Five-Point Wash",
      kind: "Drill",
      lane: "Together",
      minutes: 22,
      focusArea: "Offensive Systems",
    },
    {
      at: 56,
      title: "Serve under consequence",
      kind: "Drill",
      lane: "Together",
      minutes: 12,
      focusArea: "Serving",
    },
    {
      at: 72,
      title: "Downshift + reflect",
      kind: "Cool-down",
      lane: "Together",
      minutes: 8,
      focusArea: "Footwork",
    },
  ],
};

// Staff on the session, the way the parent's HQ chrome shows people with roles.
const practiceStaff = [
  { person: marketingPeople.jordan, role: "Lead coach", lane: "Court 1" },
  { person: marketingPeople.drew, role: "Assistant", lane: "Court 2" },
  { person: marketingPeople.alex, role: "Strength", lane: "Warm-up" },
] as const;

// The shipped demo program runs 56 days, Mondays and Wednesdays, 16 sessions,
// with 7 complete and the Atlantic Coast Open ahead of it. Phase names and
// their loads come from phaseForProgress() in training-service.ts, and the dip
// in week six is milestoneLoadAdjustment() reducing load into a key
// tournament. Nothing here is invented for the page.
interface ProgramWeek {
  readonly week: number;
  readonly load: number;
  readonly state: "done" | "current" | "ahead";
  readonly taper?: boolean;
}

const programStrip: readonly ProgramWeek[] = [
  { week: 1, load: 58, state: "done" },
  { week: 2, load: 58, state: "done" },
  { week: 3, load: 72, state: "done" },
  { week: 4, load: 72, state: "current" },
  { week: 5, load: 72, state: "ahead" },
  { week: 6, load: 52, state: "ahead", taper: true },
  { week: 7, load: 68, state: "ahead" },
  { week: 8, load: 46, state: "ahead" },
];

const program = {
  title: "Fall Competition Build",
  weeks: 8,
  sessions: 16,
  cadence: "Mondays + Wednesdays",
  milestone: { title: "Atlantic Coast Open", week: 6 },
} as const;

// Phase bands span the weeks they cover, so the strip reads as a season.
const programPhases = [
  { name: "Foundation", from: 1, to: 2 },
  { name: "Build", from: 3, to: 5 },
  { name: "Integrate", from: 6, to: 7 },
  { name: "Sharpen", from: 8, to: 8 },
] as const;

function useRevealOnScroll() {
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducedMotion || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.visible = "true";
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8%", threshold: 0.08 },
    );

    // Opt into the hidden start state only once we know we can undo it.
    page.dataset.motion = "ready";
    page
      .querySelectorAll<HTMLElement>("[data-reveal]")
      .forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, []);

  return pageRef;
}

function HqChrome({
  children,
  context,
  label,
}: {
  readonly children: ReactNode;
  readonly context: string;
  readonly label: string;
}) {
  return (
    <div aria-label={label} className={styles.hqWindow} role="img">
      <div className={styles.hqTopbar}>
        <span className={styles.hqWordmark}>DUNA HQ</span>
        <span className={styles.hqContext}>{context}</span>
        <span className={styles.hqAvatar}>BH</span>
      </div>
      <div className={styles.hqBody}>
        <aside className={styles.hqSidebar}>
          <span>
            <LayoutDashboard /> Overview
          </span>
          <span>
            <CalendarDays /> Calendar
          </span>
          <span className={styles.hqNavActive}>
            <Dumbbell /> Training
          </span>
          <span>
            <UsersRound /> People
          </span>
          <span>
            <CreditCard /> Money
          </span>
          <span>
            <BarChart3 /> Reports
          </span>
        </aside>
        <div className={styles.hqScreen}>{children}</div>
      </div>
    </div>
  );
}

function BlockBoard({
  compact,
  showFocus,
}: {
  readonly compact?: boolean;
  readonly showFocus?: boolean;
}) {
  return (
    <div className={styles.blockBoard}>
      {practice.blocks.map((block) => (
        <article
          className={block.parallel ? styles.blockParallel : undefined}
          key={`${block.at}-${block.title}`}
        >
          <Numeric tier="table">{block.at}</Numeric>
          <span className={styles.blockMain}>
            <strong>{block.title}</strong>
            {!compact && <small>{block.kind}</small>}
          </span>
          {showFocus && (
            <span className={styles.blockFocus}>{block.focusArea}</span>
          )}
          <span className={styles.blockLane}>{block.lane}</span>
          <em>
            <Numeric tier="chip">{block.minutes}</Numeric> min
          </em>
        </article>
      ))}
    </div>
  );
}

function StudioWindow() {
  return (
    <HqChrome
      context="Training · Drill Studio"
      label="Duna HQ Drill Studio turning a coach's description into a structured drill"
    >
      <div className={styles.mockHeading}>
        <span>Drill Studio</span>
        <strong>Describe the drill</strong>
      </div>
      <div className={styles.studioField}>
        <label>What happens on the court</label>
        <p>{drillBrief}</p>
      </div>
      <div className={styles.studioParams}>
        {drillParameters.map(([label, value]) => (
          <span key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </span>
        ))}
      </div>
      <div className={styles.studioResult}>
        <header>
          <Sparkles />
          <span>Draft for review</span>
        </header>
        <strong className={styles.studioResultTitle}>
          {drillResult.title}
        </strong>
        <span className={styles.studioResultMeta}>
          {drillResult.focusArea} · {drillResult.minutes} min
        </span>
        <ol>
          {drillResult.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <ul>
          {drillResult.cues.map((cue) => (
            <li key={cue}>{cue}</li>
          ))}
        </ul>
      </div>
    </HqChrome>
  );
}

function PracticeWindow() {
  return (
    <HqChrome
      context="Training · Practice Builder"
      label="Duna HQ Practice Builder showing a ninety minute session across two courts"
    >
      <div className={styles.mockHeading}>
        <span>Practice Builder</span>
        <strong>{practice.title}</strong>
      </div>
      <div className={styles.hqMetrics}>
        <article>
          <small>Duration</small>
          <Numeric tier="block">{practice.minutes}</Numeric>
          <span>minutes</span>
        </article>
        <article>
          <small>Planned load</small>
          <Numeric tier="block">{practice.plannedLoad}</Numeric>
          <span>estimate</span>
        </article>
        <article>
          <small>Typical contacts</small>
          <Numeric tier="block">{practice.touches}</Numeric>
          <span>estimate</span>
        </article>
      </div>
      <BlockBoard showFocus />
      <div className={styles.staffBoard}>
        {practiceStaff.map(({ person, role, lane }) => (
          <article key={person.displayName}>
            <ProfileAvatar person={person} size="sm" />
            <span>
              <strong>{person.displayName}</strong>
              <small>{role}</small>
            </span>
            <em>{lane}</em>
          </article>
        ))}
      </div>
      <div className={styles.hqFooterRow}>
        <ProfileAvatarStack
          label="Squad attending Sideout Under Pressure"
          max={4}
          people={marketingPlayerGroup}
          size="xs"
        />
        <em>8 to 12 players · two courts</em>
      </div>
    </HqChrome>
  );
}

function ProgramWindow() {
  return (
    <HqChrome
      context="Training · Program Designer"
      label="Duna HQ Program Designer showing an eight week build and its next tournament"
    >
      <div className={styles.mockHeading}>
        <span>Program Designer</span>
        <strong>{program.title}</strong>
      </div>
      <p className={styles.programChromeLine}>
        <Numeric tier="chip">{program.weeks}</Numeric> weeks · {program.cadence}{" "}
        · <Numeric tier="chip">{program.sessions}</Numeric> sessions
      </p>

      <div className={styles.seasonStrip}>
        <div className={styles.phaseBands}>
          {programPhases.map((phase) => (
            <span
              key={phase.name}
              style={
                {
                  "--from": phase.from,
                  "--to": phase.to + 1,
                } as CSSProperties
              }
            >
              {phase.name}
              <i>
                {phase.from === phase.to
                  ? `wk ${phase.from}`
                  : `wks ${phase.from}–${phase.to}`}
              </i>
            </span>
          ))}
        </div>

        <div className={styles.weekBars}>
          {programStrip.map((week) => (
            <span
              className={styles.weekBar}
              data-state={week.state}
              key={week.week}
            >
              <i style={{ blockSize: `${week.load}%` }} />
            </span>
          ))}
        </div>

        <div className={styles.weekLabels}>
          {programStrip.map((week) => (
            <span data-state={week.state} key={week.week}>
              <Numeric tier="chip">{week.week}</Numeric>
              {week.state === "current" && <em>This week</em>}
              {week.taper && <em className={styles.taperNote}>Taper</em>}
            </span>
          ))}
        </div>

        <div className={styles.milestoneTicks}>
          <i style={{ gridColumn: `${program.milestone.week} / span 1` }} />
        </div>
        <p className={styles.milestoneLabel}>
          Week <Numeric tier="chip">{program.milestone.week}</Numeric> ·{" "}
          {program.milestone.title}
        </p>
      </div>
    </HqChrome>
  );
}

function HeroWindow() {
  return (
    <HqChrome
      context="South Bay · Training"
      label="Duna HQ training view for today, showing a drafted drill and today's practice"
    >
      <header className={styles.heroScreenHead}>
        <span>Today · Training</span>
        <h2>{practice.title}</h2>
      </header>
      <div className={styles.heroStudioStrip}>
        <Sparkles />
        <p>{drillBrief}</p>
        <span>
          <small>Drafted</small>
          <strong>{drillResult.title}</strong>
        </span>
      </div>
      <BlockBoard compact />
    </HqChrome>
  );
}

export function TrainingOSPage({ hqHref }: TrainingOSPageProps) {
  const pageRef = useRevealOnScroll();

  return (
    <main className={styles.page} data-zone="editorial" ref={pageRef}>
      <SiteHeader />

      <section className={styles.hero}>
        <div aria-hidden className={styles.heroMedia}>
          <Image
            alt=""
            fill
            priority
            sizes="100vw"
            src="/media/brand/duna-club-hero-v1.webp"
          />
        </div>
        <div aria-hidden className={styles.heroTexture} />
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Duna HQ · training</span>
            <h1>Write the week. Run the court.</h1>
            <p>
              Drill, practice, program. The plan is ready before the whistle.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href={hqHref}>
                Start free in Duna HQ <ArrowRight />
              </a>
              <Link className={styles.secondaryButton} href="/run-your-club">
                See all Duna HQ features
              </Link>
            </div>
            <small>
              Describe a drill in your own words. Duna drafts it for you to
              correct, never to publish on your behalf.
            </small>
          </div>
          <div className={styles.heroStage}>
            <HeroWindow />
          </div>
        </div>
      </section>

      <section className={styles.plate}>
        <div className={styles.plateIntro} data-reveal>
          <span className={styles.eyebrow}>Drill Studio</span>
          <h2>Say it once. Get a drill back.</h2>
          <p>
            Describe the drill the way you would explain it to an assistant
            coach. Duna returns the steps, the cues, and the scoring, and
            nothing is saved until you have corrected it.
          </p>
        </div>
        <div className={styles.plateProof} data-reveal>
          <StudioWindow />
        </div>
      </section>

      <section className={`${styles.plate} ${styles.plateRaised}`}>
        <div className={styles.plateIntro} data-reveal>
          <span className={styles.eyebrow}>Practice Builder</span>
          <h2>Ninety minutes, two courts, one plan.</h2>
          <p>
            You assemble the session from your own drills, and two courts can
            run different work at the same time. Load and contact figures are
            planning estimates, not a measurement of any athlete.
          </p>
        </div>
        <div className={styles.plateProof} data-reveal>
          <PracticeWindow />
        </div>
      </section>

      <section className={styles.plate}>
        <div className={styles.plateIntro} data-reveal>
          <span className={styles.eyebrow}>Program Designer</span>
          <h2>The season that practice belongs to.</h2>
          <p>
            Set the window, the weekly pattern, and the tournaments that matter.
            Duna drafts the phases and the load that lead to them, and you can
            edit any week before the program is saved.
          </p>
        </div>
        <div className={styles.plateProof} data-reveal>
          <ProgramWindow />
        </div>
      </section>

      <section className={styles.closing}>
        <div className={styles.closingInner} data-reveal>
          <span className={styles.eyebrow}>Start where you are</span>
          <h2>One drill is enough to begin.</h2>
          <p>
            Write tomorrow&rsquo;s drill tonight. The practice and the season
            can wait until you need them.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href={hqHref}>
              Start free in Duna HQ <ArrowRight />
            </a>
            <Link className={styles.secondaryButton} href="/run-your-club">
              See all Duna HQ features
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
