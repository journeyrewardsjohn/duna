"use client";

import { Button, PullToRefresh, SetBySet } from "@duna/ui/tideline";
import { useState } from "react";
import { people } from "../../examples";
import { useLab } from "../../interactions";
import styles from "./kit.module.css";

const steps = ["Reading the file", "Matching emails", "Adding members"];

export function SetBySetDemo() {
  const [done, setDone] = useState(1);
  return (
    <div className={styles.stack}>
      <SetBySet
        caption={
          done < 3
            ? `Step ${done + 1} of 3: ${steps[done]!.toLowerCase()}`
            : "Done"
        }
        done={done}
        label="Importing your members"
        steps={3}
      />
      <div className={styles.row}>
        <Button onClick={() => setDone((value) => (value + 1) % 4)} size="sm">
          {done < 3 ? "Complete a step" : "Start again"}
        </Button>
      </div>
    </div>
  );
}

export function PullToRefreshDemo() {
  const lab = useLab();
  const [refreshed, setRefreshed] = useState(0);
  return (
    <div className={styles.stack}>
      <div className={styles.scroller}>
        <PullToRefresh
          onRefresh={() =>
            lab.request(() => setRefreshed((count) => count + 1))
          }
        >
          <ul className="td-list">
            {people.map((player) => (
              <li className="td-listrow" key={player.id}>
                {player.name}
              </li>
            ))}
          </ul>
        </PullToRefresh>
      </div>
      <p className="td-meta td-num" data-testid="pull-count">
        Refreshed {refreshed} {refreshed === 1 ? "time" : "times"}
      </p>
      <p className={styles.meta}>
        On a touch screen, pull the list down from its top. With a keyboard, Tab
        to the list: a Refresh button appears.
      </p>
    </div>
  );
}
