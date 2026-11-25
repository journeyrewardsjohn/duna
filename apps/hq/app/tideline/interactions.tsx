"use client";

import {
  AddPlayers,
  Button,
  CommandPalette,
  FilterChip,
  filterPlayers,
  Icon,
  Input,
  LoadingBoundary,
  type PlayerSummary,
  SearchField,
  Segmented,
  Select,
  Skeleton,
  Switch,
  toast,
  TopProgress,
  useAsyncSearch,
  useDebouncedValue,
  useDelayedLoading,
  useOptimisticAction,
} from "@duna/ui/tideline";
import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { me, people } from "./examples";
import styles from "./gallery.module.css";

/** The gallery connects to nothing: this stands in for a slow, flaky API. */
interface Lab {
  latency: number;
  request: <Value>(value: () => Value, signal?: AbortSignal) => Promise<Value>;
}

const LabContext = createContext<Lab | null>(null);

function useLab(): Lab {
  const lab = useContext(LabContext);
  if (!lab) throw new Error("Render inside InteractionsLab");
  return lab;
}

/** Latency and failure controls shared by every demo below. */
export function InteractionsLab({ children }: { children: ReactNode }) {
  const [latency, setLatency] = useState("600");
  const [failNext, setFailNext] = useState(false);
  const fail = useRef(false);
  fail.current = failNext;

  const lab = useMemo<Lab>(
    () => ({
      latency: Number(latency),
      request: (value, signal) =>
        new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            if (fail.current) {
              setFailNext(false);
              reject(new Error("Simulated failure"));
              return;
            }
            resolve(value());
          }, Number(latency));
          signal?.addEventListener("abort", () => {
            clearTimeout(timer);
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    }),
    [latency],
  );

  return (
    <LabContext value={lab}>
      <div className={styles.lab}>
        <div className={styles.labControl}>
          <span className="td-meta" id="lab-latency">
            Simulated latency
          </span>
          <Segmented
            aria-labelledby="lab-latency"
            onValueChange={(value) => setLatency(value ?? "0")}
            options={[
              { value: "0", label: "0ms" },
              { value: "150", label: "150ms" },
              { value: "600", label: "600ms" },
              { value: "2000", label: "2s" },
            ]}
            value={latency}
          />
        </div>
        <Switch
          checked={failNext}
          label="Fail next request"
          onCheckedChange={setFailNext}
        />
      </div>
      {children}
    </LabContext>
  );
}

export function AsyncSearchDemo() {
  const lab = useLab();
  const [sent, setSent] = useState(0);
  const [aborted, setAborted] = useState(0);
  const search = useAsyncSearch<PlayerSummary>({
    items: people.slice(0, 2),
    filter: (player, query) => filterPlayers([player], query).length > 0,
    getKey: (player) => player.id,
    search: (query, signal) => {
      setSent((count) => count + 1);
      signal.addEventListener("abort", () => setAborted((count) => count + 1));
      return lab.request(() => filterPlayers(people, query), signal);
    },
  });
  return (
    <div className={styles.stack}>
      <SearchField
        label="Search players"
        onRetry={search.submit}
        onSubmit={search.submit}
        onValueChange={search.setQuery}
        placeholder="Try “sa”, then keep typing"
        resultCount={search.results.length}
        stale={search.stale}
        status={search.status}
        value={search.query}
      >
        {search.results.length > 0 ? (
          <ul className="td-list">
            {search.results.map((player) => (
              <li className="td-listrow" key={player.id}>
                <span className="td-listrow__main">
                  <span className="td-listrow__title">{player.name}</span>
                  <span className="td-listrow__meta">{player.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </SearchField>
      <p className="td-meta td-num" data-testid="search-count">
        Requests sent: {sent} · cancelled: {aborted}
      </p>
      <p className="td-meta">
        Loaded players match at once; the request waits 220ms, is cancelled when
        you type again, and old results stay (dimmed) until new ones arrive.
        Enter searches immediately.
      </p>
    </div>
  );
}

export function DelayedLoadingDemo() {
  const lab = useLab();
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PlayerSummary[]>(people.slice(0, 3));
  const shown = useDelayedLoading(loading);
  const reload = async () => {
    setLoading(true);
    try {
      const next = await lab.request(() =>
        [...people].sort(() => Math.random() - 0.5).slice(0, 3),
      );
      setRows(next);
    } catch {
      toast.error("Could not refresh. The list is unchanged.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className={styles.stack}>
      <div className={styles.row}>
        <Button loading={loading} onClick={reload}>
          Refresh list
        </Button>
        <span className="td-meta" data-testid="loader-shown">
          Loader: {shown ? "showing" : "hidden"}
        </span>
      </div>
      <div className={styles.panel}>
        <TopProgress label="Refreshing" loading={loading} />
        <LoadingBoundary
          fallback={
            <div className={styles.stack}>
              <Skeleton kind="row" label="Loading players" />
              <Skeleton kind="row" />
              <Skeleton kind="row" />
            </div>
          }
          loading={loading}
        >
          <ul className="td-list">
            {rows.map((player) => (
              <li className="td-listrow" key={player.id}>
                <span className="td-listrow__main">
                  <span className="td-listrow__title">{player.name}</span>
                  <span className="td-listrow__meta">{player.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </LoadingBoundary>
      </div>
      <p className="td-meta">
        Under 250ms nothing changes. After that the skeleton and the top line
        appear and stay at least 400ms, so they never flash.
      </p>
    </div>
  );
}

export function OptimisticPlayersDemo() {
  const lab = useLab();
  const [selected, setSelected] = useState<PlayerSummary[]>([me, people[0]!]);
  const change = useOptimisticAction<
    [next: PlayerSummary[], type: "add" | "remove", player: PlayerSummary]
  >({
    apply: (next) => {
      const before = selected;
      setSelected(next);
      return () => setSelected(before);
    },
    commit: () => lab.request(() => true),
    undo: () => lab.request(() => true),
    messages: {
      success: (_next, type, player) =>
        type === "add" ? `${player.name} added` : `${player.name} removed`,
      error: (_next, type, player) =>
        type === "add"
          ? `Could not add ${player.name}. Nothing changed.`
          : `Could not remove ${player.name}. They are still in.`,
    },
  });
  return (
    <div className={styles.stack}>
      <AddPlayers
        capacity={4}
        contacts={people.slice(3)}
        lockedIds={[me.id]}
        onSelectedChange={(next, { type, player }) => {
          void change.run(next, type, player);
        }}
        searchPlayers={(query, signal) =>
          lab.request(() => filterPlayers(people, query), signal)
        }
        selected={selected}
        suggestions={people.slice(0, 4)}
      />
      <p className="td-meta td-num" data-testid="optimistic-pending">
        Saving: {change.pending}
      </p>
    </div>
  );
}

export function OptimisticSwitchDemo() {
  const lab = useLab();
  const [on, setOn] = useState(false);
  const toggle = useOptimisticAction<[boolean]>({
    apply: (next) => {
      const before = on;
      setOn(next);
      return () => setOn(before);
    },
    commit: () => lab.request(() => true),
    messages: {
      error: (next) =>
        `Could not turn reminders ${next ? "on" : "off"}. Put back.`,
    },
  });
  return (
    <div className={styles.stack}>
      <Switch
        checked={on}
        description="Flips at once; goes back, with a toast, if the save fails."
        label="Match reminders"
        onCheckedChange={(next) => {
          void toggle.run(next);
        }}
      />
      <p className="td-meta" data-testid="optimistic-switch">
        Reminders are {on ? "on" : "off"}.
      </p>
    </div>
  );
}

export function ButtonLoadingDemo() {
  const lab = useLab();
  const [saves, setSaves] = useState(0);
  const save = () =>
    lab
      .request(() => true)
      .then(
        () => setSaves((count) => count + 1),
        () => {
          toast.error("Could not save. Try again.");
        },
      );
  return (
    <div className={styles.stack}>
      <div className={styles.row}>
        <Button onClick={save} pendingAnnouncement="Saving" variant="primary">
          Save result
        </Button>
        <Button
          icon={<Icon name="plus" />}
          onClick={save}
          pendingAnnouncement="Creating"
        >
          Create match
        </Button>
      </div>
      <p className="td-meta td-num" data-testid="save-count">
        Saved {saves} {saves === 1 ? "time" : "times"}
      </p>
      <p className="td-meta">
        A second press while saving does nothing. The width and label hold; the
        spinner replaces the icon after 250ms.
      </p>
    </div>
  );
}

export function CommandPaletteDemo() {
  const lab = useLab();
  const [last, setLast] = useState("none");
  return (
    <div className={styles.stack}>
      <div className={styles.row}>
        <CommandPalette
          commands={[
            {
              value: "new-match",
              label: "Create match",
              group: "Actions",
              icon: "plus",
              shortcut: "mod+m",
            },
            {
              value: "add-player",
              label: "Add player",
              group: "Actions",
              icon: "user-plus",
            },
            {
              value: "book-court",
              label: "Book a court",
              group: "Actions",
              icon: "calendar",
              keywords: ["reserve"],
            },
            {
              value: "members",
              label: "Members",
              group: "Go to",
              icon: "users",
            },
            {
              value: "schedule",
              label: "Schedule",
              group: "Go to",
              icon: "clock",
            },
            {
              value: "billing",
              label: "Billing (owner only)",
              group: "Go to",
              disabled: true,
            },
          ]}
          onAction={(value) => lab.request(() => setLast(value))}
          triggerLabel="Search or run a command"
        />
      </div>
      <p className="td-meta" data-testid="command-output">
        Last command: {last}
      </p>
    </div>
  );
}

export function DebouncedValueDemo() {
  const [text, setText] = useState("");
  const settled = useDebouncedValue(text, 400);
  return (
    <div className={styles.stack}>
      <Input
        aria-label="Club name"
        onValueChange={setText}
        placeholder="Type a club name"
        value={text}
      />
      <p className="td-meta">Debounced value: {settled || "empty"}</p>
    </div>
  );
}

const sortOptions = [
  { value: "name", label: "Name" },
  { value: "level", label: "Level" },
];

/** The toolbar pattern above a table: search, filter chips and sort. */
export function ToolbarDemo() {
  const [query, setQuery] = useState("");
  const [rated, setRated] = useState(false);
  const [club, setClub] = useState(false);
  const [sort, setSort] = useState<string | null>("name");
  const settled = useDebouncedValue(query, 150);
  const rows = filterPlayers(people, settled)
    .filter((player) => (rated ? player.level : true))
    .filter((player) => (club ? player.detail === "Demo Beach Club" : true))
    .sort((a, b) =>
      sort === "level"
        ? (b.level ?? "").localeCompare(a.level ?? "")
        : a.name.localeCompare(b.name),
    );
  return (
    <div className={styles.stack}>
      <div className="td-toolbar">
        <div className="td-toolbar__grow">
          <Input
            aria-label="Filter players"
            clearable
            icon={<Icon name="search" />}
            onValueChange={setQuery}
            placeholder="Filter players"
            value={query}
          />
        </div>
        <FilterChip onPressedChange={setRated} pressed={rated}>
          Has level
        </FilterChip>
        <FilterChip onPressedChange={setClub} pressed={club}>
          Demo Beach Club
        </FilterChip>
        <Select
          aria-label="Sort by"
          onValueChange={setSort}
          options={sortOptions}
          value={sort}
        />
      </div>
      {rows.length > 0 ? (
        <ul className="td-list">
          {rows.map((player) => (
            <li className="td-listrow" key={player.id}>
              <span className="td-listrow__main">
                <span className="td-listrow__title">{player.name}</span>
                <span className="td-listrow__meta">{player.detail}</span>
              </span>
              <span className="td-meta td-num">
                {player.level ?? "Pending"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="td-meta">No players match these filters.</p>
      )}
    </div>
  );
}
