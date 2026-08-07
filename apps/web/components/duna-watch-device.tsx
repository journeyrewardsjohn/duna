import { Camera, Check, Settings, Star, Undo2 } from "lucide-react";
import styles from "./duna-watch-device.module.css";

type WatchScreen = "camera" | "highlight" | "score";

interface DunaWatchDeviceProps {
  readonly className?: string;
  readonly label?: string;
  readonly motion?: boolean;
  readonly screen?: WatchScreen;
}

function ScoreScreen({ motion }: { readonly motion: boolean }) {
  return (
    <div className={styles.scoreScreen}>
      <div className={styles.scoreTopbar}>
        <span className={styles.watchIconButton}>
          <Camera aria-hidden />
        </span>
        <span className={styles.matchClock}>
          <i />
          18:42
        </span>
        <span className={styles.watchIconButton}>
          <Settings aria-hidden />
        </span>
      </div>

      <div className={`${styles.team} ${styles.teamA}`}>
        <span>SA</span>
        <strong>Side A</strong>
        <i />
      </div>

      <div className={styles.scoreboard}>
        <span className={styles.sideCue}>A ↑</span>
        <div className={styles.scoreRows}>
          <div>
            <small>0</small>
            <span className={motion ? styles.animatedScore : undefined}>
              <b>16</b>
              {motion && <b>17</b>}
            </span>
          </div>
          <div>
            <small>0</small>
            <span>14</span>
          </div>
        </div>
        <span className={`${styles.sideCue} ${styles.sideCueB}`}>↓ B</span>
      </div>

      <div className={`${styles.team} ${styles.teamB}`}>
        <span>SB</span>
        <strong>Side B</strong>
        <i />
      </div>

      <div className={styles.scoreActions}>
        <span>
          <Star aria-hidden />
        </span>
        <div>
          <strong>SET 1</strong>
          <small>DUNA VISION</small>
        </div>
        <span>
          <Undo2 aria-hidden />
        </span>
      </div>
    </div>
  );
}

function CameraScreen() {
  return (
    <div className={styles.cameraScreen}>
      <div className={styles.cameraHeader}>
        <span>Done</span>
        <strong>LIVE CHECK-IN</strong>
      </div>
      <div className={styles.cameraPreview}>
        <div className={styles.cameraPhoto} />
        <svg aria-hidden viewBox="0 0 100 100">
          <polygon points="17,74 37,36 65,36 87,74" />
          <line x1="51" x2="51" y1="36" y2="74" />
        </svg>
        <div className={styles.cameraQuality}>
          <strong>94/100</strong>
          <Check aria-hidden />
        </div>
      </div>
      <div className={styles.cameraResult}>
        <Check aria-hidden />
        Court is in frame
      </div>
    </div>
  );
}

function HighlightScreen() {
  return (
    <div className={styles.highlightScreen}>
      <span className={styles.highlightClock}>18:42</span>
      <div className={styles.highlightStar}>
        <Star aria-hidden />
        <i />
      </div>
      <strong>MOMENT SAVED</strong>
      <span>00:12:48</span>
      <div className={styles.highlightScore}>
        <span>17</span>
        <i />
        <span>14</span>
      </div>
      <small>DUNA VISION</small>
    </div>
  );
}

export function DunaWatchDevice({
  className,
  label = "Duna scorekeeping app on Apple Watch",
  motion = false,
  screen = "score",
}: DunaWatchDeviceProps) {
  return (
    <div
      aria-label={label}
      className={`${styles.device}${className ? ` ${className}` : ""}`}
      role="img"
    >
      <div className={`${styles.band} ${styles.bandTop}`} />
      <div className={`${styles.band} ${styles.bandBottom}`} />
      <div className={styles.actionButton} />
      <div className={styles.crownGuard}>
        <span className={styles.crown} />
        <span className={styles.sideButton} />
      </div>
      <div className={styles.case}>
        <div className={styles.caseHighlight} />
        <div className={styles.display}>
          {screen === "score" && <ScoreScreen motion={motion} />}
          {screen === "camera" && <CameraScreen />}
          {screen === "highlight" && <HighlightScreen />}
        </div>
      </div>
    </div>
  );
}
