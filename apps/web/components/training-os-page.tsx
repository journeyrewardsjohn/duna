"use client";

import { Numeric } from "@duna/ui";
import { ArrowRight, Columns2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import styles from "./training-os-page.module.css";

interface TrainingOSPageProps {
  readonly hqHref: string;
}

// One club, one Tuesday. The drill below is the drill in the session, and the
// session is a week in the build.
const drill = {
  brief:
    "Three pairs. Serve the seam, side out, then solve one transition ball. Rotate after four starts.",
  title: "Seam Serve to Transition",
  meta: ["Ball control", "14 minutes", "6 to 12 players"],
  steps: [
    "Server targets the seam between the two receivers.",
    "Receivers call it early and side out.",
    "Coach enters one transition ball straight after the sideout.",
  ],
  cues: [
    "Call the seam before the serve crosses the net.",
    "Read the transition early. Hittable beats perfect.",
  ],
};

const session = {
  day: "Tuesday",
  minutes: 90,
  blocks: [
    { at: 0, title: "Move, see, connect", minutes: 10 },
    { at: 12, title: "Seam Serve to Transition", minutes: 14 },
    {
      at: 28,
      title: "Sideout games",
      minutes: 20,
      lanes: "Court 1 + Court 2",
    },
    { at: 50, title: "Serve under fatigue", minutes: 12 },
    { at: 64, title: "Play it out", minutes: 18 },
    { at: 84, title: "Downshift", minutes: 6 },
  ],
};

const program = {
  title: "Fall build",
  weeks: 8,
  phases: [
    { name: "Foundation", weeks: "1–2" },
    { name: "System", weeks: "3–4" },
    { name: "Compete", weeks: "5–6" },
    { name: "Taper", weeks: "7–8" },
  ],
  milestones: [
    { date: "Oct 4", title: "Regional qualifier" },
    { date: "Oct 25", title: "State championship" },
  ],
};

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

    // Opt into the hidden start state only once we know we can undo it, so the
    // page is never blank for its own reasons.
    page.dataset.motion = "ready";
    page
      .querySelectorAll<HTMLElement>("[data-reveal]")
      .forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, []);

  return pageRef;
}

function DrillArtifact() {
  return (
    <figure className={styles.artifact}>
      <blockquote className={styles.brief}>{drill.brief}</blockquote>
      <div className={styles.artifactBody}>
        <strong className={styles.artifactTitle}>{drill.title}</strong>
        <p className={styles.artifactMeta}>{drill.meta.join(" · ")}</p>
        <ol className={styles.steps}>
          {drill.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <ul className={styles.cues}>
          {drill.cues.map((cue) => (
            <li key={cue}>{cue}</li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

function SessionArtifact() {
  return (
    <figure className={styles.artifact}>
      <div className={styles.artifactHead}>
        <strong className={styles.artifactTitle}>{session.day}</strong>
        <span className={styles.artifactMeta}>
          <Numeric tier="chip">{session.minutes}</Numeric> minutes
        </span>
      </div>
      <ol className={styles.blocks}>
        {session.blocks.map((block) => (
          <li key={block.title}>
            <span className={styles.blockAt}>
              <Numeric tier="chip">{block.at}</Numeric>
            </span>
            <span className={styles.blockTitle}>
              {block.title}
              {block.lanes && (
                <em className={styles.blockLanes}>
                  <Columns2 aria-hidden size={13} />
                  {block.lanes}
                </em>
              )}
            </span>
            <span className={styles.blockMinutes}>
              <Numeric tier="chip">{block.minutes}</Numeric> min
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

function ProgramArtifact() {
  return (
    <figure className={styles.artifact}>
      <div className={styles.artifactHead}>
        <strong className={styles.artifactTitle}>{program.title}</strong>
        <span className={styles.artifactMeta}>
          <Numeric tier="chip">{program.weeks}</Numeric> weeks
        </span>
      </div>
      <ol className={styles.phases}>
        {program.phases.map((phase) => (
          <li key={phase.name}>
            <span className={styles.phaseName}>{phase.name}</span>
            <span className={styles.phaseWeeks}>{phase.weeks}</span>
          </li>
        ))}
      </ol>
      <ul className={styles.milestones}>
        {program.milestones.map((milestone) => (
          <li key={milestone.title}>
            <span className={styles.milestoneDate}>{milestone.date}</span>
            {milestone.title}
          </li>
        ))}
      </ul>
    </figure>
  );
}

export function TrainingOSPage({ hqHref }: TrainingOSPageProps) {
  const pageRef = useRevealOnScroll();

  return (
    <main className={styles.page} data-zone="editorial" ref={pageRef}>
      <SiteHeader />

      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <span className={styles.eyebrow}>Training</span>
          <h1>Write the week. Run the court.</h1>
          <p>Drill, practice, program. The plan is ready before the whistle.</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryButton} href={hqHref}>
              Start free in Duna HQ <ArrowRight />
            </a>
          </div>
        </div>
      </section>

      <section className={styles.plate}>
        <div className={styles.plateInner} data-reveal>
          <div className={styles.plateCopy}>
            <span className={styles.eyebrow}>Drill</span>
            <h2>Say it once. Get a drill back.</h2>
            <p>
              Describe the drill the way you would explain it to an assistant
              coach. Duna returns the steps, the cues, and the scoring for you
              to correct before anything is saved.
            </p>
          </div>
          <DrillArtifact />
        </div>
      </section>

      <section className={`${styles.plate} ${styles.plateRaised}`}>
        <div className={styles.plateInner} data-reveal>
          <div className={styles.plateCopy}>
            <span className={styles.eyebrow}>Practice</span>
            <h2>Tuesday is ninety minutes.</h2>
            <p>
              You build the session. The drill you just wrote takes the middle
              block, and two courts run at once when you have them. Contact and
              load figures are planning estimates, not a measurement of anyone.
            </p>
          </div>
          <SessionArtifact />
        </div>
      </section>

      <section className={styles.plate}>
        <div className={styles.plateInner} data-reveal>
          <div className={styles.plateCopy}>
            <span className={styles.eyebrow}>Program</span>
            <h2>Tuesday belongs to a season.</h2>
            <p>
              Set the dates and the tournaments that matter. Duna drafts the
              phases and the load that lead to them, and you edit any week
              before the program is saved.
            </p>
          </div>
          <ProgramArtifact />
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
