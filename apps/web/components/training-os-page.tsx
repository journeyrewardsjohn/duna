"use client";

import { Numeric } from "@duna/ui";
import {
  ArrowRight,
  BookOpen,
  CalendarRange,
  Check,
  ChevronDown,
  Clock3,
  Dumbbell,
  Gauge,
  Layers3,
  Play,
  Sparkles,
  Target,
  Trophy,
  UsersRound,
  Wand2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { useEffect, useRef } from "react";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import styles from "./training-os-page.module.css";

interface TrainingOSPageProps {
  readonly hqHref: string;
}

const drillExamples = [
  {
    id: "serve-receive",
    prompt:
      "Three pairs. A server targets the seam, the receiving pair must side out, then immediately solve a coach-entered transition ball. Win both to score a wash point. Rotate after four starts.",
    title: "Seam-to-Transition Wash",
    focus: "Ball Control",
    level: "Intermediate–Advanced",
    duration: 14,
    players: "6–12",
    mode: "Build, then compete",
    steps: [
      "Server at 1 targets the seam between receivers. Receivers call and side out.",
      "On the sideout, coach immediately enters a transition ball to the receiving side.",
      "Receivers must convert the transition to score a wash point.",
      "Rotate after four serving starts. Serving team tracks defensive digs.",
    ],
    cues: [
      "Seam ownership call must happen before the serve crosses the net.",
      "First-tempo attack read on transition—don't wait for a perfect set.",
      "Serving team: treat the dig as your point. Reward intent, not just outcome.",
    ],
    scoring:
      "Receiving team scores 1 for a wash (both converted). Serving team scores 1 for any broken rally. First to 12.",
    touches: { low: 32, typical: 44, high: 58 },
    intensity: 7,
    tags: ["serve-receive", "transition", "wash-scoring", "beach-2s"],
  },
  {
    id: "block-transition",
    prompt:
      "Blocker calls line or angle from the hitter's approach while the defender adjusts. Play one transition after a dig. Defense scores two for converting the rally.",
    title: "Call-and-Adjust Defense",
    focus: "Team Defense",
    level: "Advanced",
    duration: 12,
    players: "4–8",
    mode: "Competitive",
    steps: [
      "Blocker watches the attacker's approach angle and calls 'line' or 'angle' before contact.",
      "Defender shifts to cover the open zone based on the call.",
      "After a successful dig, play out one transition rally.",
      "Rotate after three defensive reps.",
    ],
    cues: [
      "Call timing: before the set peaks, not after the arm swing.",
      "Defender trusts the call—stay committed to your zone.",
      "Transition: push tempo on offense to reward good defense.",
    ],
    scoring:
      "Defense scores 2 for converting after a dig, 1 for a dig only. Offense scores 1 for any kill.",
    touches: { low: 24, typical: 36, high: 48 },
    intensity: 8,
    tags: ["blocking", "defense", "communication", "beach-2s"],
  },
  {
    id: "setter-release",
    prompt:
      "Setters begin in four defensive positions, release when the passer contacts the ball, and deliver a hittable set to a target. Cooperative streak, then finish with a pressure round.",
    title: "Release-and-Deliver Setter Reps",
    focus: "Setting",
    level: "Intermediate",
    duration: 10,
    players: "4–6",
    mode: "Cooperative",
    steps: [
      "Setter starts in one of four defensive positions (left back, right back, left up, right up).",
      "Coach serves or tosses to a passer. Setter releases on passer contact.",
      "Setter delivers a hittable set to a stationary target (cone or standing hitter).",
      "Cooperative phase: reach 8 hittable sets in a row. Pressure phase: 5 sets in 60 seconds.",
    ],
    cues: [
      "Release timing: watch the pass, not the ball off the serve.",
      "Footwork to the ball, not under it—create angle early.",
      "Hittable = shoulder height, off the net, on tempo. Not perfect, just hittable.",
    ],
    scoring:
      "Cooperative: count the streak. Pressure: count makes in the time limit. Record personal best.",
    touches: { low: 18, typical: 28, high: 38 },
    intensity: 5,
    tags: ["setting", "footwork", "release", "beach-2s"],
  },
] as const;

const practiceExample = {
  title: "Sideout Under Pressure",
  purpose:
    "Carry first-contact quality through attack choice, transition, and late-practice serving pressure.",
  audience: "Competitive 16U–18U beach athletes; 8–12 players on two courts.",
  focus: "Offensive Systems",
  duration: 90,
  load: 72,
  touches: 118,
  jumps: 24,
  blocks: [
    {
      time: "+0",
      title: "Move, see, connect",
      kind: "Warmup",
      duration: 10,
      intensity: 3,
      focus: "Footwork",
    },
    {
      time: "+12",
      title: "Seam-to-Transition Wash",
      kind: "Drill",
      duration: 14,
      intensity: 7,
      focus: "Ball Control",
    },
    {
      time: "+28",
      title: "Call-and-Adjust Defense",
      kind: "Drill",
      duration: 12,
      intensity: 8,
      focus: "Team Defense",
    },
    {
      time: "+42",
      title: "Parallel court games",
      kind: "Drill",
      duration: 20,
      intensity: 7,
      focus: "Offensive Systems",
      parallel: true,
    },
    {
      time: "+64",
      title: "Pressure serving",
      kind: "Drill",
      duration: 12,
      intensity: 6,
      focus: "Serving",
    },
    {
      time: "+78",
      title: "Controlled scrimmage",
      kind: "Drill",
      duration: 8,
      intensity: 5,
      focus: "Offensive Systems",
    },
    {
      time: "+88",
      title: "Downshift + reflect",
      kind: "Cool-down",
      duration: 6,
      intensity: 1,
      focus: undefined,
    },
  ],
};

const programExample = {
  title: "Fall Competition Build",
  purpose:
    "Prepare the group to side out reliably and defend with a shared system through the fall tournament block.",
  audience: "16U–18U national and open-division beach athletes",
  duration: "8 weeks",
  sessions: 16,
  phases: [
    {
      name: "Foundation",
      weeks: "1–2",
      focus: ["Ball Control", "Footwork"],
      load: "Build",
    },
    {
      name: "System Install",
      weeks: "3–4",
      focus: ["Offensive Systems", "Team Defense"],
      load: "Maintain",
    },
    {
      name: "Competition Prep",
      weeks: "5–6",
      focus: ["Serving", "Out-of-System"],
      load: "Build",
    },
    {
      name: "Taper",
      weeks: "7–8",
      focus: ["Offensive Systems", "Free-Ball Play"],
      load: "Recover",
    },
  ],
  milestones: [
    { title: "Regional qualifier", date: "Week 4", priority: "key" },
    { title: "Team assessment", date: "Week 6", priority: "standard" },
    { title: "State championship", date: "Week 8", priority: "key" },
  ],
};

const marketplaceOptions = [
  {
    id: "private",
    title: "Private to organization",
    description:
      "Keep drills, practices, and programs within your coaching staff. Build your library without sharing outside.",
  },
  {
    id: "free",
    title: "Publish free",
    description:
      "Share your work with the coaching community. Other organizations can license and adapt your drill.",
  },
  {
    id: "paid",
    title: "Publish paid",
    description:
      "Set a price for an organization license. Coaches pay once and can adapt the drill to their programs.",
  },
] as const;

const capabilities: readonly [LucideIcon, string, string][] = [
  [
    Wand2,
    "Natural-language drills",
    "Describe the drill in your own words—Duna builds the structure, steps, and cues.",
  ],
  [
    CalendarRange,
    "Season programs",
    "Set your start, end, and key tournaments. Duna phases load and focus across weeks.",
  ],
  [
    Layers3,
    "Practice builder",
    "Drag drills into a timeline with warmup, blocks, and cooldown. Run courts in parallel.",
  ],
  [
    Target,
    "Contact estimates",
    "See expected touches and jumps per drill, per practice, per week. Plan load, not just time.",
  ],
  [
    Play,
    "Court animation",
    "Review movement, rotation, and ball flow before running it on sand.",
  ],
  [
    BookOpen,
    "Drill marketplace",
    "Keep drills private, share free, or sell organization licenses.",
  ],
];

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function useTrainingPageMotion() {
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    page.dataset.reducedMotion = reducedMotion ? "true" : "false";

    const reveals = page.querySelectorAll<HTMLElement>("[data-reveal]");
    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.visible = "true";
          revealObserver.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8%", threshold: 0.08 },
    );
    reveals.forEach((element) => revealObserver.observe(element));

    const storyObservers: IntersectionObserver[] = [];
    page.querySelectorAll<HTMLElement>("[data-story]").forEach((story) => {
      const steps = story.querySelectorAll<HTMLElement>("[data-story-step]");
      const observer = new IntersectionObserver(
        (entries) => {
          const visible = entries
            .filter((entry) => entry.isIntersecting)
            .sort(
              (left, right) => right.intersectionRatio - left.intersectionRatio,
            )[0];
          const screen = (visible?.target as HTMLElement | undefined)?.dataset
            .storyStep;
          if (screen) story.dataset.activeScreen = screen;
        },
        { rootMargin: "-28% 0px -48% 0px", threshold: [0.05, 0.2, 0.5] },
      );
      steps.forEach((step) => observer.observe(step));
      storyObservers.push(observer);
    });

    let frame = 0;
    const update = () => {
      frame = 0;
      if (reducedMotion) return;
      const hero = page.querySelector<HTMLElement>("[data-training-hero]");
      if (!hero) return;
      const rect = hero.getBoundingClientRect();
      const progress = clamp(
        -rect.top / Math.max(1, rect.height - innerHeight),
      );
      page.style.setProperty("--hero-progress", progress.toFixed(4));
      page.dataset.scrolled = scrollY > 48 ? "true" : "false";
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    addEventListener("scroll", schedule, { passive: true });
    addEventListener("resize", schedule);

    return () => {
      revealObserver.disconnect();
      storyObservers.forEach((observer) => observer.disconnect());
      removeEventListener("scroll", schedule);
      removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return pageRef;
}

function DrillCard({
  drill,
  expanded,
}: {
  readonly drill: (typeof drillExamples)[number];
  readonly expanded?: boolean;
}) {
  return (
    <article
      className={`${styles.drillCard}${expanded ? ` ${styles.drillCardExpanded}` : ""}`}
    >
      <header>
        <span>{drill.focus}</span>
        <small>
          {drill.mode} · {drill.level}
        </small>
      </header>
      <h3>{drill.title}</h3>
      <p className={styles.drillCardPrompt}>
        <Sparkles aria-hidden size={14} />
        <span>"{drill.prompt}"</span>
      </p>
      <div className={styles.drillCardMeta}>
        <span>
          <Clock3 aria-hidden size={14} />
          <Numeric tier="chip">{drill.duration}</Numeric> min
        </span>
        <span>
          <UsersRound aria-hidden size={14} />
          {drill.players}
        </span>
        <span>
          <Gauge aria-hidden size={14} />
          <Numeric tier="chip">{drill.intensity}</Numeric>/10
        </span>
        <span>
          <Target aria-hidden size={14} />~
          <Numeric tier="chip">{drill.touches.typical}</Numeric> touches
        </span>
      </div>
      {expanded && (
        <>
          <section className={styles.drillCardSection}>
            <strong>Run it</strong>
            <ol>
              {drill.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
          <section className={styles.drillCardSection}>
            <strong>Coach it</strong>
            <ul>
              {drill.cues.map((cue) => (
                <li key={cue}>{cue}</li>
              ))}
            </ul>
          </section>
          <section className={styles.drillCardSection}>
            <strong>Scoring</strong>
            <p>{drill.scoring}</p>
          </section>
          <footer>
            {drill.tags.map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </footer>
        </>
      )}
    </article>
  );
}

function PracticeTimeline() {
  return (
    <div className={styles.practiceTimeline}>
      <header>
        <div>
          <span className={styles.eyebrow}>Example practice</span>
          <h3>{practiceExample.title}</h3>
          <p>{practiceExample.purpose}</p>
        </div>
        <div className={styles.practiceMeta}>
          <article>
            <small>Duration</small>
            <Numeric tier="block">{practiceExample.duration}</Numeric>
            <span>minutes</span>
          </article>
          <article>
            <small>Planned load</small>
            <Numeric tier="block">{practiceExample.load}</Numeric>
            <span>/ 100</span>
          </article>
          <article>
            <small>Typical opportunity</small>
            <Numeric tier="block">~{practiceExample.touches}</Numeric>
            <span>contacts</span>
          </article>
        </div>
      </header>
      <div className={styles.practiceBlocks}>
        {practiceExample.blocks.map((block, index) => (
          <article
            key={block.title}
            className={block.parallel ? styles.parallelBlock : undefined}
            style={{ "--block-index": index } as CSSProperties}
          >
            <span className={styles.blockTime}>{block.time}</span>
            <div>
              <small>{block.kind}</small>
              <strong>{block.title}</strong>
              {block.focus && <em>{block.focus}</em>}
            </div>
            <div className={styles.blockMeta}>
              <span>{block.duration}m</span>
              <i
                style={
                  { "--intensity": `${block.intensity * 10}%` } as CSSProperties
                }
              />
            </div>
          </article>
        ))}
      </div>
      <footer>
        <span>{practiceExample.audience}</span>
        <span>Primary focus: {practiceExample.focus}</span>
      </footer>
    </div>
  );
}

function ProgramOverview() {
  return (
    <div className={styles.programOverview}>
      <header>
        <div>
          <span className={styles.eyebrow}>Example program</span>
          <h3>{programExample.title}</h3>
          <p>{programExample.purpose}</p>
        </div>
        <div className={styles.programMeta}>
          <article>
            <small>Duration</small>
            <strong>{programExample.duration}</strong>
          </article>
          <article>
            <small>Sessions</small>
            <Numeric tier="block">{programExample.sessions}</Numeric>
          </article>
          <article>
            <small>Audience</small>
            <span>{programExample.audience}</span>
          </article>
        </div>
      </header>
      <section className={styles.programPhases}>
        <strong>Training phases</strong>
        <div>
          {programExample.phases.map((phase) => (
            <article key={phase.name}>
              <header>
                <span>{phase.name}</span>
                <small>Weeks {phase.weeks}</small>
              </header>
              <div>
                {phase.focus.map((area) => (
                  <em key={area}>{area}</em>
                ))}
              </div>
              <span className={styles.phaseLoad}>{phase.load}</span>
            </article>
          ))}
        </div>
      </section>
      <section className={styles.programMilestones}>
        <strong>Key milestones</strong>
        <div>
          {programExample.milestones.map((milestone) => (
            <article
              key={milestone.title}
              className={
                milestone.priority === "key" ? styles.keyMilestone : undefined
              }
            >
              <Trophy aria-hidden size={16} />
              <span>
                <strong>{milestone.title}</strong>
                <small>{milestone.date}</small>
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

export function TrainingOSPage({ hqHref }: TrainingOSPageProps) {
  const pageRef = useTrainingPageMotion();

  return (
    <main className={styles.page} data-zone="editorial" ref={pageRef}>
      <SiteHeader />

      <nav
        aria-label="Training OS navigation"
        className={styles.productNav}
      >
        <Link className={styles.productIdentity} href="/run-your-club">
          <span>Duna</span>
          <strong>HQ</strong>
        </Link>
        <div>
          <a href="#drills">Drills</a>
          <a href="#practices">Practices</a>
          <a href="#programs">Programs</a>
          <a href="#marketplace">Marketplace</a>
        </div>
        <a className={styles.productCta} href={hqHref}>
          Open Duna HQ
        </a>
      </nav>

      <section className={styles.hero} data-training-hero id="top">
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>Duna HQ · Training OS</span>
            <h1>
              Describe the drill.
              <br />
              Duna builds the plan.
            </h1>
            <p>
              Turn a coaching brief into structured programs, daily practices,
              and animated drills. See expected contacts and load before anyone
              touches a ball. Keep your work private, share it free, or sell
              organization licenses.
            </p>
            <div className={styles.heroActions}>
              <a className={styles.primaryButton} href={hqHref}>
                Start in Duna HQ <ArrowRight />
              </a>
              <a className={styles.secondaryButton} href="#drills">
                See examples
              </a>
            </div>
          </div>
          <div className={styles.heroVisual}>
            <div className={styles.heroPrompt}>
              <Sparkles aria-hidden size={18} />
              <span>Coach brief</span>
              <p>
                "Three pairs. A server targets the seam, the receiving pair must
                side out, then immediately solve a coach-entered transition
                ball. Win both to score a wash point."
              </p>
            </div>
            <div className={styles.heroResult}>
              <header>
                <span>Ball Control</span>
                <small>Build, then compete</small>
              </header>
              <h3>Seam-to-Transition Wash</h3>
              <div className={styles.heroResultMeta}>
                <span>14 min</span>
                <span>6–12 players</span>
                <span>~44 touches</span>
                <span>Intensity 7/10</span>
              </div>
            </div>
          </div>
        </div>
        <a className={styles.scrollCue} href="#drills">
          <span>How it works</span>
          <ChevronDown />
        </a>
      </section>

      <section className={styles.drills} id="drills">
        <div className={styles.sectionIntro} data-reveal>
          <span className={styles.eyebrow}>Drill Studio</span>
          <h2>Tell Duna what you want. Review what it builds.</h2>
          <p>
            Describe the motion, rotation, scoring, and what good looks like.
            Duna interprets your words into a structured drill with steps,
            coaching cues, contact estimates, and court animation. You stay the
            coach—edit anything before you save.
          </p>
        </div>

        <div className={styles.drillExamples} data-reveal>
          {drillExamples.map((drill, index) => (
            <DrillCard
              drill={drill}
              expanded={index === 0}
              key={drill.id}
            />
          ))}
        </div>

        <div className={styles.drillFeatures} data-reveal>
          <article>
            <Wand2 aria-hidden size={20} />
            <h3>Natural language in</h3>
            <p>
              Write the drill the way you'd explain it to another coach. Mention
              player positions, ball entries, scoring rules, rotation patterns,
              and success signals.
            </p>
          </article>
          <article>
            <Target aria-hidden size={20} />
            <h3>Structured plan out</h3>
            <p>
              Duna generates a title, focus area, numbered steps, coaching cues,
              variations, safety notes, tags, and an estimate of touches, jumps,
              and intensity.
            </p>
          </article>
          <article>
            <Play aria-hidden size={20} />
            <h3>Court animation</h3>
            <p>
              See player movement, ball flow, and rotation on a court diagram
              before you run it on sand. Review the visual and edit if the
              interpretation missed something.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.practices} id="practices">
        <div className={styles.sectionIntro} data-reveal>
          <span className={styles.eyebrow}>Practice Builder</span>
          <h2>Stack drills into a session. See the load before you start.</h2>
          <p>
            Drag drills into a timeline with warmup, work blocks, and cooldown.
            Run courts in parallel when you have the space. Watch planned load,
            focus balance, and contact estimates update as you build.
          </p>
        </div>

        <div className={styles.practiceExample} data-reveal>
          <PracticeTimeline />
        </div>

        <div className={styles.practiceFeatures} data-reveal>
          <article>
            <Layers3 aria-hidden size={20} />
            <h3>Timeline builder</h3>
            <p>
              Add blocks from your drill library or create new ones inline. Set
              duration, intensity, and transition time for each segment.
            </p>
          </article>
          <article>
            <Dumbbell aria-hidden size={20} />
            <h3>Parallel courts</h3>
            <p>
              Run two or more drills at the same time when you have multiple
              courts. The builder tracks load and contacts across all lanes.
            </p>
          </article>
          <article>
            <Gauge aria-hidden size={20} />
            <h3>Load planning</h3>
            <p>
              See planned load, focus distribution, and estimated contacts
              before practice starts. Adjust intensity to fit your weekly plan.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.programs} id="programs">
        <div className={styles.sectionIntro} data-reveal>
          <span className={styles.eyebrow}>Program Designer</span>
          <h2>Plan the season. Duna phases the work.</h2>
          <p>
            Set your start date, end date, weekly schedule, and key tournaments.
            Duna drafts a periodized program with phases, load curves, and focus
            progressions. Assign practice plans to each session as you go.
          </p>
        </div>

        <div className={styles.programExample} data-reveal>
          <ProgramOverview />
        </div>

        <div className={styles.programFeatures} data-reveal>
          <article>
            <CalendarRange aria-hidden size={20} />
            <h3>Season calendar</h3>
            <p>
              Define your training window, recurring days, and excluded dates.
              Add tournaments, assessments, travel days, and rest periods.
            </p>
          </article>
          <article>
            <Trophy aria-hidden size={20} />
            <h3>Milestone planning</h3>
            <p>
              Mark key competitions and Duna tapers load automatically. Standard
              events maintain intensity; key events get deliberate recovery.
            </p>
          </article>
          <article>
            <Target aria-hidden size={20} />
            <h3>Focus progression</h3>
            <p>
              Duna distributes focus areas across phases so athletes build
              skills in sequence. Review and adjust the balance before you
              start.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.marketplace} id="marketplace">
        <div className={styles.sectionIntro} data-reveal>
          <span className={styles.eyebrow}>Drill Marketplace</span>
          <h2>Keep it private, share it free, or sell it.</h2>
          <p>
            Every drill, practice, and program starts private to your
            organization. When you're ready, publish to the marketplace—free for
            the community or paid with an organization license.
          </p>
        </div>

        <div className={styles.marketplaceOptions} data-reveal>
          {marketplaceOptions.map((option) => (
            <article key={option.id}>
              <h3>{option.title}</h3>
              <p>{option.description}</p>
              <Check aria-hidden size={16} />
            </article>
          ))}
        </div>

        <div className={styles.marketplaceNote} data-reveal>
          <p>
            <strong>Organization licenses.</strong> When a coach purchases a
            paid drill, their entire organization can use and adapt it. One
            purchase, unlimited staff access, no per-seat fees.
          </p>
        </div>
      </section>

      <section className={styles.capabilities}>
        <div className={styles.sectionIntro} data-reveal>
          <span className={styles.eyebrow}>Training OS capabilities</span>
          <h2>Everything connects.</h2>
          <p>
            Drills feed practices. Practices fill programs. Programs link to
            catalog products and player responses. The same training content
            works across planning, execution, and reporting.
          </p>
        </div>
        <div className={styles.capabilityGrid}>
          {capabilities.map(([Icon, title, description]) => (
            <article data-reveal key={title}>
              <Icon aria-hidden size={20} />
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.closing}>
        <div data-reveal>
          <span className={styles.eyebrow}>Start with one drill</span>
          <h2>The plan grows from the practice.</h2>
          <p>
            Create a drill, build a practice, or draft a program. Duna keeps
            everything connected so you can coach the way you think.
          </p>
          <div>
            <a className={styles.primaryButton} href={hqHref}>
              Open Training OS <ArrowRight />
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
