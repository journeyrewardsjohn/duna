import Image from "next/image";
import {
  CalendarDays,
  Check,
  ChevronRight,
  Play,
  Send,
  Trophy,
} from "lucide-react";
import styles from "./audience-feature-visual.module.css";

export function AudienceFeatureVisual({
  index,
  players,
}: {
  readonly index: number;
  readonly players: boolean;
}) {
  const kind = players ? [0, 1, 2, 3, 5, 4][index] : index;
  return (
    <div
      className={`${styles.scene} ${styles[`scene${kind}`]}`}
      aria-hidden="true"
    >
      {kind === 0 && (
        <>
          <div className={styles.court}>
            <i />
            <i />
            <span />
          </div>
          <div className={styles.floating}>
            <CalendarDays size={18} />
            <span>
              {players ? "Find your next court" : "Court 02 · Beach clinic"}
              <small>
                {players
                  ? "Courts, clinics, and open play"
                  : "5:00–6:00 · Confirmed"}
              </small>
            </span>
            <Check size={14} />
          </div>
        </>
      )}
      {kind === 1 && (
        <>
          <Image
            className={styles.photo}
            src="/media/brand/duna-home-tournament-hero-v1.webp"
            fill
            alt=""
            sizes="(max-width: 760px) 90vw, 380px"
          />
          <div className={styles.event}>
            <span className={styles.date}>
              SAT<big>14</big>
            </span>
            <span>
              {players ? "You’re in." : "Beach doubles"}
              <small>
                {players
                  ? "Your next session, booked."
                  : "Tournament · Registration open"}
              </small>
            </span>
            <ChevronRight size={16} />
          </div>
        </>
      )}
      {kind === 2 && (
        <>
          <div className={styles.pass}>
            <span>DUNA {players ? "PLAYER" : "CLUB"}</span>
            <strong>{players ? "Sand Rating" : "Club membership"}</strong>
            <span>
              {players
                ? "Your progress travels with you."
                : "More time for the game."}
            </span>
          </div>
          <div className={styles.pill}>
            <Check size={14} />
            {players ? "Verified match history" : "Membership active"}
          </div>
        </>
      )}
      {kind === 3 && (
        <div className={styles.roster}>
          <span>
            {players ? "Your recent matches" : "Your people, together"}
          </span>
          {["maya-rivera", "jordan-cruz", "drew-park"].map((person, i) => (
            <div key={person}>
              <Image
                src={`/media/brand/people/duna-avatar-${person}-v1.webp`}
                alt=""
                width={30}
                height={30}
              />
              <span>
                {players
                  ? ["Beach doubles", "Club practice", "Weekend open play"][i]
                  : ["Maya Rivera", "Jordan Cruz", "Drew Park"][i]}
                <small>
                  {players
                    ? "Match recorded"
                    : ["Player", "Coach", "Player"][i]}
                </small>
              </span>
              <Check size={13} />
            </div>
          ))}
        </div>
      )}
      {kind === 4 && (
        <>
          <div className={styles.message}>
            <span>
              {players ? <Trophy size={17} /> : <Send size={17} />}
              {players ? "Stay close to the sport" : "Team update"}
            </span>
            <strong>
              {players
                ? "From first serve\nto the final point."
                : "See you on court."}
            </strong>
            <small>
              {players
                ? "Events · Scores · Rankings"
                : "Beach clinic · Tomorrow at 5:00"}
            </small>
          </div>
          <div className={styles.messageReply}>
            <Check size={14} />
            {players ? "Follow the pro tour" : "Shared with your team"}
          </div>
        </>
      )}
      {kind === 5 && (
        <>
          <Image
            className={styles.photo}
            src="/media/brand/duna-home-rally-v3.webp"
            fill
            alt=""
            sizes="(max-width: 760px) 90vw, 380px"
          />
          <span className={styles.play}>
            <Play size={20} fill="currentColor" />
          </span>
          <div className={styles.videoNote}>
            <span>Practice review</span>
            <span>
              Serve receive <Check size={13} />
            </span>
          </div>
        </>
      )}
    </div>
  );
}
