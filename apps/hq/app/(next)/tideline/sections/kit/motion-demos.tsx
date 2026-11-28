"use client";

import {
  AnimatedList,
  Button,
  Chip,
  crossViewTransition,
  FirstOpen,
  IconButton,
  Icon,
  NumberChange,
  PaneTransition,
  Rally,
  RallyOnChange,
  Rise,
  Segmented,
  Switch,
} from "@duna/ui/tideline";
import { useEffect, useState } from "react";
import { people } from "../../examples";
import styles from "./kit.module.css";

export function RiseDemo() {
  const [run, setRun] = useState(0);
  return (
    <div className={styles.stack}>
      <div className={styles.stage} key={run}>
        <Rise className={styles.tile}>from the bottom</Rise>
        <Rise className={styles.tile} from="top">
          from the top
        </Rise>
        <Rise className={styles.tile} from="start">
          from the start
        </Rise>
        <Rise className={styles.tile} from="end">
          from the end
        </Rise>
      </div>
      <div className={styles.row}>
        <Button onClick={() => setRun((count) => count + 1)} size="sm">
          Play Rise
        </Button>
        <span className={styles.meta}>
          600 ms on ease-rise. Grows out of the edge nearest its line; under
          reduced motion a 200 ms fade.
        </span>
      </div>
    </div>
  );
}

export function RallyDemo() {
  const [run, setRun] = useState(0);
  return (
    <div className={styles.stack}>
      <Rally className={styles.list} key={run}>
        {people.slice(0, 5).map((player) => (
          <div className={styles.item} key={player.id}>
            <span>{player.name}</span>
            <span className={styles.meta}>{player.detail}</span>
          </div>
        ))}
      </Rally>
      <div className={styles.row}>
        <Button onClick={() => setRun((count) => count + 1)} size="sm">
          Play Rally
        </Button>
        <span className={styles.meta}>
          The same Rise per row, 120 ms apart, on first load only.
        </span>
      </div>
    </div>
  );
}

export function RallyOnChangeDemo() {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className={styles.stack}>
      <div className={styles.row3}>
        <span>Saturday 10:30 AM · Court 2</span>
        <RallyOnChange data-testid="booking-status" value={confirmed}>
          <Chip kind="status" tone={confirmed ? "positive" : "attention"}>
            {confirmed ? "Confirmed" : "Awaiting payment"}
          </Chip>
        </RallyOnChange>
      </div>
      <div className={styles.row}>
        <Button onClick={() => setConfirmed((value) => !value)} size="sm">
          {confirmed ? "Mark awaiting" : "Confirm booking"}
        </Button>
      </div>
    </div>
  );
}

const tabs = ["Overview", "Players", "Results"] as const;

export function PaneTransitionDemo() {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const go = (next: number) => {
    setDirection(next > index ? "forward" : "back");
    setIndex(next);
  };
  return (
    <div className={styles.stack}>
      <Segmented
        aria-label="Pane"
        onValueChange={(value) =>
          go(tabs.indexOf(value as (typeof tabs)[number]))
        }
        options={tabs.map((tab) => ({ value: tab, label: tab }))}
        value={tabs[index]}
      />
      <div className={styles.pane}>
        <PaneTransition
          data-testid="pane"
          direction={direction}
          transitionKey={tabs[index]!}
        >
          <p className="td-label">{tabs[index]}</p>
          <p className={styles.meta}>
            {index === 0
              ? "Sunday open play, 9:00 AM. 6 of 8 spots filled."
              : index === 1
                ? "Sam Rivera, Noor Haddad, Jo Lindqvist and 3 more."
                : "Pending: results are entered after play."}
          </p>
        </PaneTransition>
      </div>
      <p className={styles.meta}>
        Cross, 320 ms: the next pane travels in over the line, from the side it
        comes from. CSS only, so the new pane takes input at once.
      </p>
    </div>
  );
}

export function ViewTransitionDemo() {
  const [view, setView] = useState<"week" | "day">("week");
  // Read after hydration, so the server and the first client render agree.
  const [supported, setSupported] = useState<boolean | null>(null);
  useEffect(() => {
    setSupported("startViewTransition" in document);
  }, []);
  return (
    <div className={styles.stack}>
      <div className={styles.pane}>
        <p className="td-label">{view === "week" ? "This week" : "Saturday"}</p>
        <p className={styles.meta}>
          {view === "week"
            ? "4 sessions, 2 open play, 1 clinic."
            : "Clinic 9:00 AM, open play 11:00 AM."}
        </p>
      </div>
      <div className={styles.row}>
        <Button
          onClick={() =>
            void crossViewTransition(
              () => setView((current) => (current === "week" ? "day" : "week")),
              { direction: view === "week" ? "forward" : "back" },
            )
          }
          size="sm"
        >
          {view === "week" ? "Open Saturday" : "Back to the week"}
        </Button>
        <span className={styles.meta}>
          View Transitions API:{" "}
          {supported === null
            ? "checking"
            : supported
              ? "available here"
              : "not here, so it just swaps"}
          .
        </span>
      </div>
    </div>
  );
}

let nextId = 100;

export function AnimatedListDemo() {
  const [items, setItems] = useState(() => people.slice(0, 4));
  const add = () => {
    nextId += 1;
    const source = people[nextId % people.length]!;
    setItems((current) => [
      ...current.slice(0, 1),
      { ...source, id: `n${nextId}`, detail: "Just joined" },
      ...current.slice(1),
    ]);
  };
  return (
    <div className={styles.stack}>
      <AnimatedList
        aria-label="Roster"
        className={styles.list}
        getKey={(player) => player.id}
        itemClassName={styles.item}
        items={items}
        renderItem={(player) => (
          <>
            <span>
              {player.name}
              <span className={styles.meta}> · {player.detail}</span>
            </span>
            <IconButton
              label={`Remove ${player.name}`}
              onClick={() =>
                setItems((current) =>
                  current.filter((item) => item.id !== player.id),
                )
              }
              size="sm"
            >
              <Icon name="close" />
            </IconButton>
          </>
        )}
      />
      <div className={styles.row}>
        <Button onClick={add} size="sm">
          Add player
        </Button>
        <Button
          onClick={() => setItems((current) => [...current].reverse())}
          size="sm"
          variant="ghost"
        >
          Reverse order
        </Button>
        <span className={styles.meta} data-testid="roster-count">
          {items.length} players
        </span>
      </div>
    </div>
  );
}

export function NumberChangeDemo() {
  const [home, setHome] = useState(14);
  const [away, setAway] = useState(12);
  const [rating, setRating] = useState(342);
  return (
    <div className={styles.stack}>
      <div className={styles.row3}>
        <span className={styles.score} data-testid="score">
          <NumberChange value={home} /> – <NumberChange value={away} />
        </span>
        <span className="td-num">
          Sand Rating{" "}
          <NumberChange
            format={(value) => (Number(value) / 100).toFixed(2)}
            value={rating}
          />
        </span>
      </div>
      <div className={styles.row}>
        <Button onClick={() => setHome((value) => value + 1)} size="sm">
          Point to us
        </Button>
        <Button onClick={() => setAway((value) => value + 1)} size="sm">
          Point to them
        </Button>
        <Button
          onClick={() => setRating((value) => value + 8)}
          size="sm"
          variant="ghost"
        >
          Rating after a confirmed match
        </Button>
      </div>
      <p className={styles.meta}>
        Only the digits that changed Rally up from the baseline, in fixed cells:
        nothing beside them moves.
      </p>
    </div>
  );
}

export function FirstOpenDemo() {
  const [run, setRun] = useState(0);
  const [late, setLate] = useState(false);
  const [ready, setReady] = useState(!late);
  return (
    <div className={styles.stack}>
      <div className={styles.preview}>
        <FirstOpen
          contained
          key={run}
          once="always"
          ready={late ? ready : undefined}
        >
          <div className={styles.home}>
            <p className="td-title">Home</p>
            <p className={styles.meta}>
              Loaded underneath while the mark plays.
            </p>
          </div>
        </FirstOpen>
      </div>
      <div className={styles.row}>
        <Button
          onClick={() => {
            setReady(false);
            setRun((count) => count + 1);
          }}
          size="sm"
        >
          Replay first open
        </Button>
        <Switch checked={late} label="Home is late" onCheckedChange={setLate} />
        {late ? (
          <Button onClick={() => setReady(true)} size="sm" variant="ghost">
            Home is ready
          </Button>
        ) : null}
      </div>
      <p className={styles.meta}>
        Night Court, the line stands up, crests rise inner to outer, the
        wordmark draws on, and the layer turns like a page. Skip or Escape ends
        it; it plays once per session in an app.
      </p>
    </div>
  );
}
