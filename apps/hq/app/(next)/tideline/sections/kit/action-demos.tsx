"use client";

import {
  AutosaveStatus,
  Button,
  Field,
  Input,
  OfflineBanner,
  Skeleton,
  Switch,
  Textarea,
  TopProgress,
  useAction,
  useAutosave,
  useDebouncedCallback,
  useLatest,
  usePendingNavigation,
  useThrottledCallback,
} from "@duna/ui/tideline";
import { Suspense, use, useRef, useState } from "react";
import { people } from "../../examples";
import { useLab } from "../../interactions";
import styles from "./kit.module.css";

export function SingleSubmitDemo() {
  const lab = useLab();
  const [calls, setCalls] = useState(0);
  const [keys, setKeys] = useState<string[]>([]);
  const book = useAction(
    ({ idempotencyKey }) => {
      setCalls((count) => count + 1);
      setKeys((current) => [...current, idempotencyKey.slice(0, 8)]);
      return lab.request(() => "BK-2041");
    },
    {
      messages: {
        success: () => "Court 2 booked for Sat 10:30 AM",
        error: "Could not book the court. Nothing was charged.",
      },
    },
  );
  return (
    <div className={styles.stack}>
      <div className={styles.row}>
        <Button {...book.buttonProps} variant="primary">
          Book court 2
        </Button>
        <Button onClick={book.reset} size="sm" variant="ghost">
          New booking
        </Button>
      </div>
      <p className="td-meta td-num" data-testid="book-calls">
        Action calls: {calls}
      </p>
      <p className="td-meta td-num" data-testid="book-keys">
        Keys: {keys.join(", ") || "none yet"}
      </p>
      <p className={styles.meta}>
        Double click, double tap or hold Enter: one call. A retry after a
        failure reuses the key; a new booking gets a new one.
      </p>
    </div>
  );
}

interface Found {
  query: string;
  names: string[];
}

export function LatestSearchDemo() {
  const lab = useLab();
  const latest = useLatest();
  const [text, setText] = useState("");
  const [sent, setSent] = useState(0);
  const [ignored, setIgnored] = useState(0);
  const [found, setFound] = useState<Found | null>(null);
  const search = useDebouncedCallback(async (query: string) => {
    if (!query.trim()) {
      latest.abort();
      setFound(null);
      return;
    }
    setSent((count) => count + 1);
    // A server that ignores the abort: short queries answer slowly, so an
    // early answer arrives after a later one. useLatest drops it.
    const slow = query.trim().length < 3;
    const result = await latest.run(
      () =>
        new Promise<Found>((resolve) =>
          setTimeout(
            () =>
              resolve({
                query,
                names: people
                  .filter((player) =>
                    player.name.toLowerCase().includes(query.toLowerCase()),
                  )
                  .map((player) => player.name),
              }),
            slow ? lab.latency + 1200 : lab.latency,
          ),
        ),
    );
    if (result.status === "stale") setIgnored((count) => count + 1);
    if (result.status === "ok") setFound(result.value);
  });
  return (
    <div className={styles.stack}>
      <Field label="Find a player">
        <Input
          onValueChange={(value) => {
            const next = String(value ?? "");
            setText(next);
            search(next);
          }}
          placeholder="Type “sa”, pause, then “m rivera”"
          value={text}
        />
      </Field>
      <p className="td-meta td-num" data-testid="latest-counts">
        Requests: {sent} · stale answers ignored: {ignored}
      </p>
      <p className="td-meta" data-testid="latest-results">
        {found
          ? `Results for “${found.query}”: ${found.names.join(", ") || "none"}`
          : "No search yet"}
      </p>
      <p className={styles.meta}>
        A burst of typing is one request (220 ms debounce). An older answer that
        arrives late is ignored, so results never go back in time.
      </p>
    </div>
  );
}

export function ThrottleDemo() {
  const [events, setEvents] = useState(0);
  const [calls, setCalls] = useState(0);
  const onMove = useThrottledCallback(() => setCalls((count) => count + 1));
  return (
    <div className={styles.stack}>
      <div
        className={styles.pad}
        onPointerMove={() => {
          setEvents((count) => count + 1);
          onMove();
        }}
      >
        Move the pointer here, like panning a map
      </div>
      <p className="td-meta td-num" data-testid="throttle-counts">
        Pointer events: {events} · bounds requests: {calls}
      </p>
      <p className={styles.meta}>
        Throttled to one call per 300 ms while moving, plus one when it settles.
      </p>
    </div>
  );
}

export function AutosaveDemo() {
  const lab = useLab();
  const [notes, setNotes] = useState("Serve receive, then side-out drills.");
  const [saves, setSaves] = useState(0);
  const draft = useAutosave(notes, {
    save: () => {
      setSaves((count) => count + 1);
      return lab.request(() => true);
    },
  });
  return (
    <div className={styles.stack}>
      <Field
        label="Practice notes"
        hint="Saved as you type, and when you leave the field."
      >
        <Textarea
          onBlur={() => void draft.flush()}
          onValueChange={(value) => setNotes(String(value ?? ""))}
          value={notes}
        />
      </Field>
      <div className={styles.row3}>
        <AutosaveStatus
          onRetry={() => void draft.retry()}
          savedAt={draft.savedAt}
          status={draft.status}
        />
        <span className="td-meta td-num" data-testid="autosave-saves">
          Saves: {saves}
        </span>
      </div>
      <p className={styles.meta}>
        One save 2 s after typing stops, never two at once. While anything is
        unsaved, leaving the page asks first.
      </p>
    </div>
  );
}

const pages = new Map<string, Promise<string[]>>();

function loadPage(
  page: string,
  latency: number,
  visit: number,
): Promise<string[]> {
  const key = `${page}:${latency}:${visit}`;
  let promise = pages.get(key);
  if (!promise) {
    promise = new Promise((resolve) =>
      setTimeout(
        () =>
          resolve(
            page === "members"
              ? people.slice(0, 4).map((player) => player.name)
              : ["Sunday open play", "Tuesday clinic", "Juniors"],
          ),
        latency,
      ),
    );
    pages.set(key, promise);
  }
  return promise;
}

function PageBody({
  page,
  latency,
  visit,
}: {
  page: string;
  latency: number;
  visit: number;
}) {
  const rows = use(loadPage(page, latency, visit));
  return (
    <ul className="td-list">
      {rows.map((row) => (
        <li className="td-listrow" key={row}>
          {row}
        </li>
      ))}
    </ul>
  );
}

export function PendingNavigationDemo() {
  const lab = useLab();
  const [page, setPage] = useState("programs");
  const [visits, setVisits] = useState(0);
  const nav = usePendingNavigation((href) => {
    setVisits((count) => count + 1);
    setPage(href);
  });
  return (
    <div className={styles.stack}>
      <div className={styles.row}>
        {(["programs", "members"] as const).map((target) => (
          <Button
            aria-current={page === target ? "page" : undefined}
            key={target}
            onClick={() => nav.navigate(target)}
            size="sm"
            variant={page === target ? "secondary" : "ghost"}
          >
            {target === "programs" ? "Programs" : "Members"}
          </Button>
        ))}
        <span className="td-meta" data-testid="nav-pending">
          {nav.pending ? "Loading the next page" : "Idle"}
        </span>
      </div>
      <div className={styles.pane} style={{ position: "relative" }}>
        <TopProgress label="Loading the page" loading={nav.pending} />
        <Suspense fallback={<Skeleton kind="row" label="Loading" />}>
          <PageBody latency={lab.latency + 400} page={page} visit={visits} />
        </Suspense>
      </div>
      <p className={styles.meta}>
        The current page stays usable while the next one loads; the top line
        appears only for slow changes.
      </p>
    </div>
  );
}

export function OfflineDemo() {
  const [offline, setOffline] = useState(false);
  const loadedAt = useRef(Date.now());
  return (
    <div className={styles.stack}>
      <Switch
        checked={offline}
        label="Simulate offline"
        onCheckedChange={setOffline}
      />
      <OfflineBanner
        lastFresh={loadedAt.current}
        online={offline ? false : undefined}
      />
      <p className={styles.meta}>
        Follows the browser by default; offline is never Solar.
      </p>
    </div>
  );
}
