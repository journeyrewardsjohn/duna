"use client";

import { Button } from "@duna/ui/tideline";
import { useState } from "react";
import styles from "./gallery.module.css";

/**
 * The three motion verbs, played once and replayed on request. Under reduced
 * motion each shows its end state with a short fade (the token layer turns
 * Rise, Rally and Cross into a 200ms fade and the stagger into 0).
 */
export function MotionVerbs() {
  const [run, setRun] = useState(0);
  return (
    <div className={styles.motion}>
      <div className={styles.motionStage} key={run}>
        <figure className={styles.motionVerb}>
          <div className={styles.motionTrack}>
            <span className={styles.rise} />
          </div>
          <figcaption>
            <span className={styles.swatchName}>Rise</span>
            <span className="td-meta">Grows from a line · 600ms</span>
          </figcaption>
        </figure>
        <figure className={styles.motionVerb}>
          <div className={styles.motionTrack}>
            {[0, 1, 2].map((item) => (
              <span
                className={styles.rally}
                key={item}
                style={{
                  animationDelay: `calc(var(--td-stagger-rally) * ${item})`,
                }}
              />
            ))}
          </div>
          <figcaption>
            <span className={styles.swatchName}>Rally</span>
            <span className="td-meta">Same move, 120ms apart</span>
          </figcaption>
        </figure>
        <figure className={styles.motionVerb}>
          <div className={`${styles.motionTrack} ${styles.crossTrack}`}>
            <span className={styles.cross} />
          </div>
          <figcaption>
            <span className={styles.swatchName}>Cross</span>
            <span className="td-meta">Travels over a line · 320ms</span>
          </figcaption>
        </figure>
      </div>
      <Button onClick={() => setRun((value) => value + 1)} size="sm">
        Play again
      </Button>
    </div>
  );
}
