"use client";

import { Button, NetScore, type NetScoreProps } from "@duna/ui/tideline";
import { useState } from "react";
import styles from "./kit.module.css";

type Pair = readonly [number, number];

/** Beach volleyball: sets to 21, a decider to 15, win by two. */
const rules: NetScoreProps["rules"] = {
  pointsToWin: 21,
  decidingSetPointsToWin: 15,
  winBy: 2,
};

/**
 * A live match you can score: the changed digit Rallies in place and a
 * screen reader hears the change politely, at most once every two seconds.
 */
export function LiveScoreDemo() {
  const [sets, setSets] = useState<Pair[]>([
    [21, 18],
    [19, 21],
    [9, 11],
  ]);
  const [serving, setServing] = useState<0 | 1>(1);
  const point = (side: 0 | 1) => {
    setSets((current) => {
      const next = current.map((set) => [...set] as [number, number]);
      const last = next[next.length - 1]!;
      last[side] += 1;
      return next;
    });
    setServing(side);
  };
  const undo = () =>
    setSets((current) => {
      const next = current.map((set) => [...set] as [number, number]);
      const last = next[next.length - 1]!;
      const side = serving;
      if (last[side] > 0) last[side] -= 1;
      return next;
    });
  return (
    <div className={styles.stack}>
      <NetScore
        bestOf={3}
        layout="net"
        rules={rules}
        serving={serving}
        sets={sets}
        status="live"
        teams={["Williams / Lewis", "Park / Stone"]}
      />
      <div className={styles.row}>
        <Button onClick={() => point(0)} size="sm" variant="secondary">
          Point Williams / Lewis
        </Button>
        <Button onClick={() => point(1)} size="sm" variant="secondary">
          Point Park / Stone
        </Button>
        <Button onClick={undo} size="sm" variant="ghost">
          Undo last point
        </Button>
      </div>
    </div>
  );
}
