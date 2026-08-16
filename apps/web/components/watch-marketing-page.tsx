"use client";

import { Numeric } from "@duna/ui";
import {
  ArrowLeftRight,
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Flag,
  Radio,
  Send,
  Star,
  Undo2,
  Vibrate,
  Video,
  WifiOff,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { DunaWatchDevice } from "./duna-watch-device";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import styles from "./watch-marketing-page.module.css";

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function useWatchPageMotion() {
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const reveals = page.querySelectorAll<HTMLElement>("[data-reveal]");
    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).dataset.visible = "true";
            revealObserver.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10%", threshold: 0.08 },
    );
    reveals.forEach((element) => revealObserver.observe(element));

    if (reducedMotion) {
      page.dataset.scrolled = "false";
      return () => revealObserver.disconnect();
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const viewport = window.innerHeight;
      const hero = page.querySelector<HTMLElement>("[data-hero]");
      if (hero) {
        const rect = hero.getBoundingClientRect();
        const available = Math.max(1, rect.height - viewport);
        page.style.setProperty(
          "--hero-progress",
          clamp(-rect.top / available).toFixed(4),
        );
      }

      const progressTargets = [
        ["[data-score-story]", "--score-progress"],
        ["[data-sync-story]", "--sync-progress"],
        ["[data-checkin-story]", "--checkin-progress"],
      ] as const;

      for (const [selector, property] of progressTargets) {
        const element = page.querySelector<HTMLElement>(selector);
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        const progress = clamp(
          (viewport - rect.top) / Math.max(1, viewport + rect.height),
        );
        page.style.setProperty(property, progress.toFixed(4));
      }

      page.dataset.scrolled = window.scrollY > 48 ? "true" : "false";
    };

    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);

    return () => {
      revealObserver.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return pageRef;
}

export function WatchMarketingPage() {
  const pageRef = useWatchPageMotion();

  return (
    <main className={styles.page} data-zone="athletic" ref={pageRef}>
      <SiteHeader />

      <nav aria-label="Duna for Apple Watch" className={styles.productNav}>
        <Link className={styles.productIdentity} href="#top">
          <span>Duna</span>
          <strong>Apple Watch</strong>
        </Link>
        <div>
          <Link href="#score">Scorekeeping</Link>
          <Link href="#vision">Duna Vision</Link>
          <Link href="#highlights">Review cues</Link>
          <Link href="#check-in">Live Check-In</Link>
        </div>
        <Link className={styles.productCta} href="/sign-up">
          Join Duna
        </Link>
      </nav>

      <section className={styles.hero} data-hero data-zone="live" id="top">
        <div className={styles.heroSticky}>
          <div aria-hidden className={styles.heroGlow} />
          <div aria-hidden className={styles.heroGrid} />

          <div className={styles.shell}>
            <div className={styles.heroCopy}>
              <span className={styles.eyebrow}>Duna for Apple Watch</span>
              <h1>
                Your match.
                <br />
                <em>On your wrist.</em>
              </h1>
              <p>
                Keep score in motion. Sync every rally to Duna Vision. Flag the
                moment worth seeing again—without stepping off the sand.
              </p>
              <div className={styles.heroActions}>
                <Link className={styles.primaryButton} href="#score">
                  See what it can do <ArrowRight aria-hidden />
                </Link>
                <Link className={styles.secondaryButton} href="/app">
                  Explore Duna
                </Link>
              </div>
              <small>Designed for Apple Watch with a paired iPhone.</small>
            </div>

            <div className={styles.heroDeviceStage}>
              <div className={styles.heroDeviceIntro}>
                <DunaWatchDevice
                  className={styles.heroWatch}
                  label="Duna live scorekeeping screen on Apple Watch"
                  motion
                />
              </div>
              <div
                aria-hidden
                className={`${styles.floatingPill} ${styles.floatingPillScore}`}
              >
                <span>↑</span>
                Swipe to score
              </div>
              <div
                aria-hidden
                className={`${styles.floatingPill} ${styles.floatingPillVision}`}
              >
                <i />
                Vision synced
              </div>
            </div>
          </div>

          <a className={styles.scrollCue} href="#opening">
            <span>Scroll to explore</span>
            <ChevronDown aria-hidden />
          </a>
        </div>
      </section>

      <section className={styles.opening} data-zone="editorial" id="opening">
        <div className={styles.openingInner} data-reveal>
          <span className={styles.eyebrow}>
            Made for the point in front of you
          </span>
          <h2>
            Scorekeeping was
            <br />
            <em>only the start.</em>
          </h2>
          <p>
            Duna turns the Watch into a live control surface for the match—then
            carries every tap into the video, score, and review waiting on your
            iPhone.
          </p>
        </div>
      </section>

      <section
        className={styles.scoreStory}
        data-score-story
        data-zone="athletic"
        id="score"
      >
        <div className={styles.sectionHeading} data-reveal>
          <span className={styles.eyebrow}>Score in motion</span>
          <h2>One gesture. Every rally.</h2>
          <p>
            The whole scoring surface is designed around moves you can make
            between points—not menus you have to study.
          </p>
        </div>

        <div className={`${styles.shell} ${styles.scoreLayout}`}>
          <div className={styles.scoreDeviceCard} data-reveal data-zone="live">
            <div aria-hidden className={styles.gestureOrbit}>
              <span>↑ Side A</span>
              <span>Side B ↓</span>
              <span>← Undo</span>
              <span>Save →</span>
            </div>
            <DunaWatchDevice
              className={styles.scoreWatch}
              label="Duna gesture scorekeeping interface"
              motion
            />
            <div className={styles.scoreConfirmation}>
              <Check aria-hidden />
              <span>
                <small>Point recorded</small>
                Side A · 17–14
              </span>
            </div>
          </div>

          <div className={styles.scoreFeatures}>
            <article data-reveal>
              <span>Gesture</span>
              <div>
                <h3>Up for A. Down for B.</h3>
                <p>
                  Swipe in the direction of the team, feel the confirmation, and
                  get ready for the next serve.
                </p>
              </div>
            </article>
            <article data-reveal>
              <span>Rules</span>
              <div>
                <h3>The rules travel with the match.</h3>
                <p>
                  Set targets, win-by rules, hard caps, and side-switch timing
                  arrive from Duna and stay visible at the right moment.
                </p>
              </div>
            </article>
            <article data-reveal>
              <span>Undo</span>
              <div>
                <h3>A mistake takes one swipe.</h3>
                <p>
                  Swipe left to undo the last point. Finish the match and send
                  the complete score back to your iPhone for review.
                </p>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section
        className={styles.syncStory}
        data-sync-story
        data-zone="live"
        id="vision"
      >
        <div className={`${styles.shell} ${styles.syncHeading}`} data-reveal>
          <span className={styles.eyebrow}>Duna Vision</span>
          <h2>
            The score and the video
            <br />
            already know each other.
          </h2>
          <p>
            While Duna records or broadcasts live, Watch gestures become
            source-linked events. The scoreboard, playhead, score, and review
            history stay in one evidence-backed timeline.
          </p>
        </div>

        <div className={`${styles.shell} ${styles.visionStage}`} data-reveal>
          <video
            autoPlay
            loop
            muted
            playsInline
            poster="/media/duna-hero-poster.webp"
            preload="metadata"
          >
            <source src="/media/duna-hero.mp4" type="video/mp4" />
          </video>
          <div aria-hidden className={styles.visionWash} />
          <div className={styles.liveBadge}>
            <i />
            Live · Court 02
          </div>
          <div className={styles.liveScore}>
            <span>
              <small>Side A</small>
              <Numeric tier="block">17</Numeric>
            </span>
            <i />
            <span>
              <small>Side B</small>
              <Numeric tier="block">14</Numeric>
            </span>
          </div>
          <DunaWatchDevice
            className={styles.visionWatch}
            label="Duna Watch score synchronized to a live Duna Vision recording"
            motion
          />
          <div className={styles.visionTimeline}>
            <div className={styles.timelineLabels}>
              <span>00:00</span>
              <strong>Live timeline</strong>
              <span>18:42</span>
            </div>
            <div className={styles.timelineTrack}>
              <i className={styles.timelineFill} />
              <span style={{ left: "18%" }}>15–12</span>
              <span style={{ left: "43%" }}>16–13</span>
              <span className={styles.timelineFavorite} style={{ left: "67%" }}>
                <Star aria-hidden />
              </span>
              <span style={{ left: "84%" }}>17–14</span>
              <b />
            </div>
          </div>
        </div>

        <div className={`${styles.shell} ${styles.syncProof}`}>
          <article data-reveal>
            <Video aria-hidden />
            <h3>Source-linked context</h3>
            <p>
              Each scoring event carries its place in the recording, so the
              paired iPhone opens the relevant rally instead of a blank reel.
            </p>
          </article>
          <article data-reveal>
            <Radio aria-hidden />
            <h3>One cue, not a tiny editor</h3>
            <p>
              Flag the last rally for coaching review from Watch; full playback,
              analysis, and trimming stay comfortably on the paired iPhone.
            </p>
          </article>
          <article data-reveal>
            <Undo2 aria-hidden />
            <h3>Corrections stay connected</h3>
            <p>
              Undo is an event too, keeping the timeline honest without losing
              what happened before it.
            </p>
          </article>
        </div>
      </section>

      <section
        className={styles.highlights}
        data-zone="editorial"
        id="highlights"
      >
        <div className={styles.sectionHeading} data-reveal>
          <span className={styles.eyebrow}>Review cues</span>
          <h2>Save the point. Not the thought.</h2>
          <p>
            When a rally deserves another look, flag it from Watch. Duna keeps
            the timestamp, score, and source video together for the review
            waiting after the match.
          </p>
        </div>

        <div className={`${styles.shell} ${styles.highlightGrid}`}>
          <article className={styles.highlightHeroCard} data-reveal>
            <div>
              <span className={styles.cardKicker}>Last-rally review cue</span>
              <h3>A tiny decision with full context.</h3>
              <p>
                Watch confirms the cue, then the paired iPhone opens the
                source-linked rally with the score and Duna Vision analysis.
              </p>
            </div>
            <DunaWatchDevice
              className={styles.highlightWatch}
              label="Source-linked last-rally review cue on Duna for Apple Watch"
              screen="review"
            />
          </article>

          <article className={styles.editCard} data-reveal>
            <div className={styles.editPreview}>
              <div className={styles.editPreviewImage} />
              <span>
                <Star aria-hidden />
              </span>
              <small>Moment 03 · 00:12:48</small>
            </div>
            <div>
              <span className={styles.cardKicker}>Ready to analyze</span>
              <h3>The cut—and the coaching—starts here.</h3>
              <p>
                Open the saved rally, see its verified context, trim the clip,
                and share it from Duna.
              </p>
            </div>
          </article>

          <article className={styles.gestureCard} data-reveal>
            <span className={styles.cardKicker}>
              Four directions. No clutter.
            </span>
            <div className={styles.gestureMap}>
              <span>Side A</span>
              <span>Undo</span>
              <i>D</i>
              <span>Highlight</span>
              <span>Side B</span>
            </div>
            <p>
              The gestures stay consistent, so muscle memory can take over when
              the match speeds up.
            </p>
          </article>
        </div>
      </section>

      <section
        className={styles.checkin}
        data-checkin-story
        data-zone="athletic"
        id="check-in"
      >
        <div aria-hidden className={styles.checkinGlow} />
        <div className={`${styles.shell} ${styles.checkinLayout}`}>
          <div className={styles.checkinDevice} data-reveal>
            <div className={styles.checkinRings} />
            <DunaWatchDevice
              className={styles.checkinWatch}
              label="Live Check-In camera framing preview on Duna for Apple Watch"
              screen="camera"
            />
            <span className={styles.checkinStatus}>
              <Check aria-hidden /> 94 · Excellent framing
            </span>
          </div>

          <div className={styles.checkinCopy} data-reveal>
            <span className={styles.eyebrow}>Live Check-In</span>
            <h2>Know the camera sees the court.</h2>
            <p>
              Pull the Duna Vision view onto your wrist before the first serve.
              Confirm the court is framed, see the latest setup score, and make
              the adjustment without walking back to the phone.
            </p>
            <ul>
              <li>
                <Camera aria-hidden />
                <span>
                  <strong>A fresh camera preview</strong>
                  Check the real Duna Vision view from the court.
                </span>
              </li>
              <li>
                <Zap aria-hidden />
                <span>
                  <strong>Simple setup guidance</strong>
                  See whether framing is ready or needs one more adjustment.
                </span>
              </li>
              <li>
                <Check aria-hidden />
                <span>
                  <strong>Confidence before record</strong>
                  Start play knowing the full court is where it belongs.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className={styles.details} data-zone="editorial">
        <div className={`${styles.shell} ${styles.detailsHeading}`} data-reveal>
          <span className={styles.eyebrow}>And the details that disappear</span>
          <h2>Quietly brilliant between points.</h2>
        </div>
        <div className={`${styles.shell} ${styles.detailGrid}`}>
          <article data-reveal>
            <Vibrate aria-hidden />
            <h3>Haptics, not distractions.</h3>
            <p>
              Distinct feedback confirms a point, undo, saved moment, or finish.
            </p>
          </article>
          <article data-reveal>
            <ArrowLeftRight aria-hidden />
            <h3>Side-switch checkpoints.</h3>
            <p>Duna prompts the switch when the configured interval arrives.</p>
          </article>
          <article data-reveal>
            <Flag aria-hidden />
            <h3>Set logic built in.</h3>
            <p>
              Targets, win-by, hard caps, and deciding sets travel to the wrist.
            </p>
          </article>
          <article data-reveal>
            <WifiOff aria-hidden />
            <h3>Ready when the phone isn’t.</h3>
            <p>
              Completed scores can queue safely and deliver when the iPhone
              reconnects.
            </p>
          </article>
          <article data-reveal>
            <Send aria-hidden />
            <h3>Review before it’s official.</h3>
            <p>End the match on Watch, then confirm the score in Duna.</p>
          </article>
          <article data-reveal>
            <Star aria-hidden />
            <h3>Every moment has context.</h3>
            <p>
              Highlights and review cues keep score, elapsed time, and source
              video attached.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.closing} data-zone="live">
        <div aria-hidden className={styles.closingLight} />
        <DunaWatchDevice
          className={styles.closingWatch}
          label="Duna for Apple Watch"
          motion
        />
        <div className={styles.closingCopy} data-reveal>
          <span className={styles.eyebrow}>Duna for Apple Watch</span>
          <h2>
            Leave the phone.
            <br />
            Keep the match.
          </h2>
          <p>
            The fastest way from first serve to final score—and every moment in
            between.
          </p>
          <div>
            <Link className={styles.primaryButton} href="/sign-up">
              Join Duna <ArrowRight aria-hidden />
            </Link>
            <Link className={styles.secondaryButton} href="/app">
              Explore the player app
            </Link>
          </div>
          <small>
            Apple Watch is a trademark of Apple Inc. Duna is not affiliated with
            Apple Inc.
          </small>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
