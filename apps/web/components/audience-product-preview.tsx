"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  CalendarDays,
  Check,
  ChevronRight,
  CreditCard,
  Play,
  RotateCcw,
  Video,
} from "lucide-react";
import styles from "./audience-product-preview.module.css";

const clubScenes = [
  {
    label: "Schedule",
    title: "A place for every session.",
    detail: "Courts, coaches, and programs. One clear calendar.",
    notice: "Booking confirmed",
    context: "Beach clinic · Court 02",
    icon: CalendarDays,
  },
  {
    label: "Get paid",
    title: "Memberships meet momentum.",
    detail: "Connect your plans, credit packs, and payments.",
    notice: "Membership active",
    context: "Monthly club membership",
    icon: CreditCard,
  },
  {
    label: "Coach",
    title: "Turn a moment into progress.",
    detail: "Bring practice plans and video review together.",
    notice: "Clip ready to share",
    context: "Serve receive · Practice review",
    icon: Video,
  },
];
const playerScenes = [
  {
    label: "Book",
    title: "Your next game is right here.",
    detail: "Find a session. Choose your spot. Get on court.",
    notice: "You’re on the list",
    context: "Beach clinic · Court 02",
    icon: CalendarDays,
  },
  {
    label: "Play",
    title: "Every match has a story.",
    detail: "Keep your results and your progress together.",
    notice: "Match saved",
    context: "Your game history, all together",
    icon: Check,
  },
  {
    label: "Improve",
    title: "See your game differently.",
    detail: "Revisit your footage and the moments that matter.",
    notice: "Clip saved",
    context: "Serve receive · Practice review",
    icon: Video,
  },
];

function CalendarPreview() {
  return (
    <div className={styles.calendar}>
      <div className={styles.panelHeading}>
        <span>Club calendar</span>
        <CalendarDays size={17} />
      </div>
      <div className={styles.calendarLabels}>
        <span>Today</span>
        <span>Court 01</span>
        <span>Court 02</span>
      </div>
      <div className={styles.calendarGrid}>
        <div className={styles.times}>
          <span>4:00</span>
          <span>5:00</span>
          <span>6:00</span>
        </div>
        <div className={styles.courtColumn}>
          <div className={styles.session}>
            <span>Private lesson</span>
            <small>4–5 pm</small>
          </div>
          <div className={styles.sessionSand}>
            <span>Open play</span>
            <small>5–6 pm</small>
          </div>
        </div>
        <div className={styles.courtColumn}>
          <div className={styles.sessionSand}>
            <span>Team practice</span>
            <small>4–5 pm</small>
          </div>
          <div className={styles.newSession}>
            <span>Beach clinic</span>
            <small>5–6 pm</small>
            <Check size={15} />
          </div>
        </div>
      </div>
      <div className={styles.panelFooter}>
        <span className={styles.avatarStack}>
          <i>MR</i>
          <i>JC</i>
          <i>DP</i>
        </span>
        <span>Your people. In the right place.</span>
      </div>
    </div>
  );
}

function BookingPreview() {
  return (
    <div>
      <div className={styles.panelHeading}>
        <span>Your next session</span>
        <CalendarDays size={17} />
      </div>
      <div className={styles.videoStill}>
        <Image
          src="/media/brand/duna-home-tournament-hero-v1.webp"
          alt=""
          fill
          sizes="(max-width: 760px) 80vw, 420px"
        />
        <span className={styles.clipLabel}>Beach volleyball</span>
      </div>
      <div className={styles.memberRow}>
        <span>
          Beach clinic<small>Court 02 · 5–6 pm</small>
        </span>
        <span className={styles.status}>
          <Check size={13} />
          Registered
        </span>
      </div>
      <div className={styles.panelFooter}>
        <span className={styles.avatarStack}>
          <i>MR</i>
          <i>JC</i>
          <i>DP</i>
        </span>
        <span>A game. A place. Your people.</span>
      </div>
    </div>
  );
}

function MembershipPreview({ player }: { player: boolean }) {
  return (
    <div className={styles.membership}>
      <div className={styles.panelHeading}>
        <span>{player ? "Your match history" : "Memberships"}</span>
        {player ? <Check size={17} /> : <CreditCard size={17} />}
      </div>
      <div className={styles.memberPass}>
        <span>DUNA {player ? "PLAYER" : "CLUB"}</span>
        <strong>
          {player
            ? "Your game.\nGoing places."
            : "More court time.\nOne membership."}
        </strong>
        <span>
          {player ? "Beach volleyball · Doubles" : "Monthly membership"}
          <Check size={18} />
        </span>
      </div>
      <div className={styles.memberRow}>
        <span>
          {player ? "Beach doubles" : "Club membership"}
          <small>{player ? "Match result recorded" : "Recurring plan"}</small>
        </span>
        <span className={styles.status}>
          <Check size={13} />
          {player ? "Saved" : "Active"}
        </span>
      </div>
      <div className={styles.memberRow}>
        <span>
          {player ? "Match details" : "Lesson credit pack"}
          <small>
            {player
              ? "Partners, opponents, and scores"
              : "Ready for the next session"}
          </small>
        </span>
        <ChevronRight size={16} />
      </div>
    </div>
  );
}

function VideoPreview() {
  return (
    <div className={styles.videoPreview}>
      <div className={styles.panelHeading}>
        <span>Practice review</span>
        <Video size={17} />
      </div>
      <div className={styles.videoStill}>
        <Image
          src="/media/brand/duna-home-rally-v3.webp"
          alt=""
          fill
          sizes="(max-width: 760px) 80vw, 420px"
        />
        <span className={styles.playGlyph}>
          <Play size={23} fill="currentColor" />
        </span>
        <span className={styles.clipLabel}>Serve receive</span>
      </div>
      <div className={styles.timeline}>
        <span />
        <span />
        <span />
        <span />
        <span />
        <i />
      </div>
      <div className={styles.memberRow}>
        <span>
          See the moment.<small>Save a clip. Start a conversation.</small>
        </span>
        <span className={styles.status}>
          <Check size={13} />
          Ready
        </span>
      </div>
    </div>
  );
}

export function AudienceProductPreview({
  audience,
}: {
  readonly audience: "clubs" | "players";
}) {
  const [selected, setSelected] = useState(0);
  const [replay, setReplay] = useState(0);
  const [motion, setMotion] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const scenes = audience === "clubs" ? clubScenes : playerScenes;
  const scene = scenes[selected]!;
  const Icon = scene.icon;
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & {
        connection?: EventTarget & { saveData?: boolean };
      }
    ).connection;
    let visible = false;
    const sync = () =>
      setMotion(visible && !preference.matches && !connection?.saveData);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          visible = true;
          sync();
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    if (container.current) observer.observe(container.current);
    preference.addEventListener("change", sync);
    connection?.addEventListener("change", sync);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", sync);
      connection?.removeEventListener("change", sync);
    };
  }, []);
  return (
    <div
      className={styles.productStory}
      ref={container}
      data-motion={motion ? "on" : "off"}
    >
      <div className={styles.stage}>
        <Image
          className={styles.backdrop}
          src={
            audience === "clubs"
              ? "/media/brand/duna-club-hero-v1.webp"
              : "/media/brand/duna-home-tournament-hero-v1.webp"
          }
          alt={
            audience === "clubs"
              ? "Volleyball courts ready for a day of club play"
              : "Beach volleyball on a tournament center court"
          }
          fill
          priority
          sizes="(max-width: 760px) 100vw, 60vw"
        />
        <span className={styles.brandStamp}>
          duna<span>{audience === "clubs" ? "HQ" : "PLAYER"}</span>
        </span>
        <div
          className={styles.composition}
          key={`${selected}-${replay}`}
          id={`product-${audience}-panel`}
          role="tabpanel"
          aria-labelledby={`product-${audience}-tab-${selected}`}
          tabIndex={0}
        >
          <div className={styles.notification}>
            <span className={styles.notificationIcon}>
              <Icon size={19} />
            </span>
            <div>
              <strong>{scene.notice}</strong>
              <span>{scene.context}</span>
            </div>
            <span className={styles.notificationCheck}>
              <Check size={15} />
            </span>
          </div>
          <div
            className={styles.productPanel}
            aria-label="Illustrative product preview"
          >
            <div className={styles.appBar}>
              <span>
                duna <small>{audience === "clubs" ? "HQ" : "PLAYER"}</small>
              </span>
              <span>Product preview</span>
            </div>
            {selected === 0 ? (
              audience === "clubs" ? (
                <CalendarPreview />
              ) : (
                <BookingPreview />
              )
            ) : selected === 1 ? (
              <MembershipPreview player={audience === "players"} />
            ) : (
              <VideoPreview />
            )}
          </div>
        </div>
      </div>
      <div className={styles.controls}>
        <div
          className={styles.tabs}
          role="tablist"
          aria-label={
            audience === "clubs"
              ? "Explore club capabilities"
              : "Explore player capabilities"
          }
        >
          {scenes.map((item, index) => (
            <button
              key={item.label}
              id={`product-${audience}-tab-${index}`}
              type="button"
              role="tab"
              aria-selected={selected === index}
              aria-controls={`product-${audience}-panel`}
              tabIndex={selected === index ? 0 : -1}
              onClick={() => setSelected(index)}
              onKeyDown={(event) => {
                const next =
                  event.key === "ArrowRight"
                    ? (index + 1) % scenes.length
                    : event.key === "ArrowLeft"
                      ? (index + scenes.length - 1) % scenes.length
                      : event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? scenes.length - 1
                          : null;
                if (next !== null) {
                  event.preventDefault();
                  setSelected(next);
                  document
                    .getElementById(`product-${audience}-tab-${next}`)
                    ?.focus();
                }
              }}
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        {motion && (
          <button
            className={styles.replay}
            type="button"
            aria-label="Replay product preview"
            onClick={() => setReplay((value) => value + 1)}
          >
            <RotateCcw size={17} />
          </button>
        )}
      </div>
      <div className={styles.sceneCaption} aria-live="polite">
        <strong>{scene.title}</strong>
        <span>{scene.detail}</span>
      </div>
    </div>
  );
}
