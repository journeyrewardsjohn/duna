import type { Metadata } from "next";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Check,
  ClipboardList,
  CreditCard,
  Dumbbell,
  Gauge,
  Play,
  Sparkles,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { DUNA_HQ_URL } from "@/lib/site-urls";
import styles from "./training-os.module.css";

export const metadata: Metadata = {
  title: "Training OS for volleyball clubs and coaches",
  description:
    "Design season-long volleyball programs, build practice plans, animate drills, manage athlete load, and sell programs with Duna Training OS.",
  alternates: {
    canonical: "/run-your-club/training-os",
    types: { "text/markdown": "/run-your-club/training-os.md" },
  },
  openGraph: {
    title: "Duna Training OS",
    description:
      "From season objective to tonight's drill—and from product pricing to player delivery—in one coaching system.",
    type: "website",
  },
};

const weeks = [
  { week: "01", focus: "Ball control", load: 58, tone: "build" },
  { week: "02", focus: "Sideout", load: 68, tone: "build" },
  { week: "03", focus: "Transition", load: 76, tone: "peak" },
  { week: "04", focus: "Tournament taper", load: 42, tone: "taper" },
] as const;

const drills = [
  ["First Ball Sideout", "Serve receive", "72–96 touches", "7/10"],
  ["Recover, Poke, Attack", "Attacking", "62–104 touches", "7/10"],
  ["Two-Ball Transition", "Team defense", "48–80 touches", "8/10"],
] as const;

export default function TrainingOsPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Duna Training OS",
    applicationCategory: "SportsApplication",
    operatingSystem: "Web, iOS, Android",
    url: "https://duna.coach/run-your-club/training-os",
  };
  return (
    <main className={styles.page} data-zone="editorial">
      <SiteHeader />
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c"),
        }}
        type="application/ld+json"
      />

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <span>
            <Sparkles aria-hidden size={16} /> Duna Training OS
          </span>
          <h1>Build the season. Run the practice. Teach every contact.</h1>
          <p>
            Turn your coaching philosophy into a living program—planned around
            tournaments, travel, athlete load, facilities, and the reality of
            who is on court tonight.
          </p>
          <div>
            <a href={DUNA_HQ_URL}>
              Build a program <ArrowRight aria-hidden size={17} />
            </a>
            <Link href="#how-it-works">See how it works</Link>
          </div>
        </div>
        <div
          className={styles.heroConsole}
          aria-label="Example four-week training program"
        >
          <header>
            <span>
              <i>BE</i>
              <span>
                <strong>Beach Elite · 18U</strong>
                <small>Four-week competition block</small>
              </span>
            </span>
            <b>Live plan</b>
          </header>
          <div className={styles.consoleMetrics}>
            <span>
              <CalendarDays aria-hidden size={17} />
              <strong>8</strong>
              <small>practices</small>
            </span>
            <span>
              <Gauge aria-hidden size={17} />
              <strong>63</strong>
              <small>avg load</small>
            </span>
            <span>
              <UsersRound aria-hidden size={17} />
              <strong>12</strong>
              <small>athletes</small>
            </span>
          </div>
          <div className={styles.weekGrid}>
            {weeks.map((item) => (
              <article data-tone={item.tone} key={item.week}>
                <small>Week {item.week}</small>
                <strong>{item.focus}</strong>
                <span>
                  <i style={{ width: `${item.load}%` }} />
                </span>
                <b>{item.load} load</b>
              </article>
            ))}
          </div>
          <footer>
            <span>
              <i /> Aug 29 · End of Season Tournament
            </span>
            <strong>Load protected</strong>
          </footer>
        </div>
      </section>

      <section className={styles.problem}>
        <div>
          <span>The old way</span>
          <h2>
            A season split across spreadsheets, screenshots, PDFs, and memory.
          </h2>
        </div>
        <ol>
          <li>
            <b>01</b>
            <span>
              <strong>The calendar changes.</strong> The plan does not.
            </span>
          </li>
          <li>
            <b>02</b>
            <span>
              <strong>Drills have names.</strong> Their load and repetitions are
              guesses.
            </span>
          </li>
          <li>
            <b>03</b>
            <span>
              <strong>Players receive a time.</strong> They miss the purpose and
              progression.
            </span>
          </li>
        </ol>
      </section>

      <section className={styles.system} id="how-it-works">
        <header>
          <span>One connected coaching system</span>
          <h2>From “what are we building?” to “what happens next?”</h2>
          <p>
            Programs hold the arc. Practices hold the work. Drills hold the
            movement, contacts, coaching cues, and measurable intent.
          </p>
        </header>
        <div className={styles.systemFlow}>
          <article>
            <span>1</span>
            <CalendarDays />
            <strong>Program</strong>
            <small>
              Dates, objectives, tournaments, travel, frequency, load
            </small>
          </article>
          <i>
            <ArrowRight />
          </i>
          <article>
            <span>2</span>
            <ClipboardList />
            <strong>Practice</strong>
            <small>Timed blocks, focus areas, intensity, touches, jumps</small>
          </article>
          <i>
            <ArrowRight />
          </i>
          <article>
            <span>3</span>
            <Play />
            <strong>Drill</strong>
            <small>
              Players, ball paths, movement, phases, scoring, coaching
            </small>
          </article>
        </div>
      </section>

      <section className={styles.featureSplit}>
        <div className={styles.featureCopy}>
          <span>Program Designer</span>
          <h2>Plan toward competition—not just the next open court.</h2>
          <p>
            Give Sol your dates, practice rhythm, tournaments, travel, roster,
            objectives, approach, and style. Duna proposes the phases and every
            practice, then leaves the coach in control.
          </p>
          <ul>
            <li>
              <Check /> Load-aware build, peak, recovery, and taper phases
            </li>
            <li>
              <Check /> Conflicts and tournament overlaps stay visible
            </li>
            <li>
              <Check /> Edit or remove a future session without changing
              checkout
            </li>
            <li>
              <Check /> Five-version history with restore
            </li>
          </ul>
        </div>
        <div className={styles.calendarUi}>
          <header>
            <span>August · Competition block</span>
            <b>8 practices</b>
          </header>
          <div className={styles.calendarDays}>
            {Array.from({ length: 14 }, (_, index) => (
              <span
                data-event={
                  [1, 3, 6, 8, 10, 12].includes(index)
                    ? "practice"
                    : index === 13
                      ? "tournament"
                      : undefined
                }
                key={index}
              >
                <small>{index + 17}</small>
                {[1, 3, 6, 8, 10, 12].includes(index) ? (
                  <i>Practice</i>
                ) : index === 13 ? (
                  <i>Tournament</i>
                ) : null}
              </span>
            ))}
          </div>
          <footer>
            <Sparkles size={16} /> Sol reduced load 38% before tournament
            weekend.
          </footer>
        </div>
      </section>

      <section className={`${styles.featureSplit} ${styles.reverse}`}>
        <div className={styles.practiceUi}>
          <header>
            <span>
              <strong>Tuesday · First Ball Sideout</strong>
              <small>105 minutes · Load 67</small>
            </span>
            <b>Practice ready</b>
          </header>
          {[
            ["00", "Movement prep", "12 min", "3/10"],
            ["12", "First contact lanes", "24 min", "6/10"],
            ["36", "Sideout constraints", "32 min", "7/10"],
            ["68", "Wash to seven", "28 min", "9/10"],
            ["96", "Reset + review", "9 min", "2/10"],
          ].map(([time, title, length, intensity]) => (
            <article key={time}>
              <b>{time}</b>
              <span>
                <strong>{title}</strong>
                <small>{length}</small>
              </span>
              <i>{intensity}</i>
            </article>
          ))}
          <footer>
            <BarChart3 size={16} /> 62% game-like · 38% technical
          </footer>
        </div>
        <div className={styles.featureCopy}>
          <span>Practice Planner</span>
          <h2>Make the purpose visible in every minute.</h2>
          <p>
            Build warmups, lifting, plyometrics, technical work, game-like play,
            recovery, and review on one timeline. Duna adds time, load, touches,
            jumps, and focus-area reporting as the plan takes shape.
          </p>
          <ul>
            <li>
              <Check /> Reusable practice-plan templates
            </li>
            <li>
              <Check /> One primary focus plus normalized skill tags
            </li>
            <li>
              <Check /> Coach run sheets and player-ready delivery
            </li>
          </ul>
        </div>
      </section>

      <section className={styles.librarySection}>
        <header>
          <span>Drill Library + Studio</span>
          <h2>A shared volleyball language that can still sound like you.</h2>
          <p>
            Create privately, share publicly, or publish a paid drill to the
            marketplace.
          </p>
        </header>
        <div className={styles.drillLibrary}>
          <aside>
            <label>Search drills</label>
            <div>sideout, transition…</div>
            {[
              "Attacking",
              "Ball control",
              "Team defense",
              "Setting",
              "Serving",
            ].map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </aside>
          <div>
            {drills.map(([title, focus, touches, intensity], index) => (
              <article key={title}>
                <div className={styles.courtMini}>
                  <i data-player="1" />
                  <i data-player="2" />
                  <i data-player="B" />
                  <svg viewBox="0 0 100 70">
                    <path
                      d={
                        index === 1
                          ? "M20 54 Q52 8 82 24"
                          : "M18 51 Q48 22 78 44"
                      }
                    />
                  </svg>
                </div>
                <span>
                  <small>{focus}</small>
                  <strong>{title}</strong>
                </span>
                <footer>
                  <b>{touches}</b>
                  <i>{intensity}</i>
                </footer>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.aiSection}>
        <div>
          <span>
            <Sparkles /> Sol coaching interpretation
          </span>
          <h2>Draw the truth of the drill. Let AI make it teachable.</h2>
          <p>
            Model player movement, ball contacts, self-passes, sets, attack
            targets, and multiple phases. Sol interprets how to run it, coach
            it, simplify it, progress it, and direct a court-accurate animation.
          </p>
        </div>
        <div className={styles.sequenceUi}>
          <header>
            Ball 1 · Sideout sequence <b>4 actions</b>
          </header>
          {[
            ["01", "Serve", "Coach → Player 1"],
            ["02", "Pass", "Player 1 → target"],
            ["03", "Set", "Player 2 → pin"],
            ["04", "Attack", "Player 1 → deep seam"],
          ].map(([order, action, path]) => (
            <article key={order}>
              <b>{order}</b>
              <span>
                <strong>{action}</strong>
                <small>{path}</small>
              </span>
              <i />
            </article>
          ))}
        </div>
      </section>

      <section className={styles.commerceSection}>
        <div className={styles.featureCopy}>
          <span>Built to sell and deliver</span>
          <h2>Your coaching program can be the product.</h2>
          <p>
            Publish a program with every included session, take payment, offer
            fixed monthly installments, and keep the commercial promise separate
            from the calendar coaches adapt over time.
          </p>
          <ul>
            <li>
              <Check /> One price includes every scheduled session
            </li>
            <li>
              <Check /> Upfront savings shown beside pay-over-time total
            </li>
            <li>
              <Check /> Automatic fixed payment schedule through Stripe
            </li>
          </ul>
        </div>
        <div className={styles.checkoutUi}>
          <header>
            <CreditCard size={18} />
            <span>
              <strong>18U Competition Program</strong>
              <small>8 practices · Aug 4–29</small>
            </span>
          </header>
          <button className={styles.checkoutActive}>
            <span>
              <strong>Pay upfront</strong>
              <small>$480.00</small>
            </span>
            <b>Save 10%</b>
          </button>
          <button>
            <span>
              <strong>4 monthly payments</strong>
              <small>$132.00 each</small>
            </span>
            <b>$528.00 total</b>
          </button>
          <footer>
            <span>Total today</span>
            <strong>$480.00</strong>
          </footer>
        </div>
      </section>

      <section className={styles.finalCta}>
        <Dumbbell aria-hidden size={30} />
        <span>Training OS</span>
        <h2>Give every practice a place in the bigger plan.</h2>
        <p>
          Build the program, teach the drill, and show players why the work
          matters.
        </p>
        <a href={DUNA_HQ_URL}>
          Open Duna HQ <ArrowRight size={17} />
        </a>
      </section>
      <SiteFooter />
    </main>
  );
}
