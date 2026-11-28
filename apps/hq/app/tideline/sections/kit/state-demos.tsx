"use client";

import {
  AsyncBoundary,
  Button,
  EmptyResults,
  ErrorState,
  FeatureOff,
  LoadingState,
  NotConfigured,
  PartialData,
  PermissionDenied,
  Segmented,
  buttonClassName,
} from "@duna/ui/tideline";
import { useState } from "react";
import { people } from "../../examples";
import { useLab } from "../../interactions";
import styles from "./kit.module.css";

/** Stands in for an API error: a plain message and the request id. */
const apiError = () =>
  Object.assign(
    new Error(
      "Something went wrong on our side. Reference: req_6f1c2a9e0b7d4c3a51e8f2d0",
    ),
    {
      data: { requestId: "req_6f1c2a9e0b7d4c3a51e8f2d0" },
    },
  );

export function AsyncBoundaryDemo() {
  const lab = useLab();
  const [rows, setRows] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [emptyNext, setEmptyNext] = useState(false);
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await lab.request(() =>
        emptyNext ? [] : people.slice(0, 4).map((player) => player.name),
      );
      setRows(next);
    } catch {
      setError(apiError());
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className={styles.stack}>
      <div className={styles.row}>
        <Button onClick={() => void load()} size="sm" variant="secondary">
          {rows ? "Reload members" : "Load members"}
        </Button>
        <Button
          onClick={() => {
            setRows(null);
            setError(null);
          }}
          size="sm"
          variant="ghost"
        >
          Clear
        </Button>
        <Button
          onClick={() => setEmptyNext((value) => !value)}
          size="sm"
          variant="ghost"
        >
          {emptyNext ? "Next load has members" : "Next load is empty"}
        </Button>
      </div>
      <AsyncBoundary
        empty={rows !== null && rows.length === 0}
        emptyState={{
          title: "No members yet",
          description: "Invite your first members to see them here.",
          action: (
            <Button size="sm" variant="primary">
              Invite members
            </Button>
          ),
        }}
        error={error}
        errorTitle="Could not load members"
        hasData={rows !== null && rows.length > 0}
        loading={loading}
        loadingLabel="Loading members"
        onRetry={load}
        skeleton="list"
      >
        {rows ? (
          <ul className="td-list" data-testid="boundary-rows">
            {rows.map((row) => (
              <li className="td-listrow" key={row}>
                {row}
              </li>
            ))}
          </ul>
        ) : (
          <p className={styles.meta}>Press Load members.</p>
        )}
      </AsyncBoundary>
      <p className={styles.meta}>
        Use the latency and “Fail next request” switches: the skeleton holds its
        space unseen for 250 ms; a reload keeps the list, dimmed; an error keeps
        it too, under a compact error.
      </p>
    </div>
  );
}

export function ErrorStateDemo() {
  const lab = useLab();
  const [reported, setReported] = useState(0);
  return (
    <div className={styles.stack}>
      <ErrorState
        error={apiError()}
        onRetry={() => lab.request(() => true)}
        report={() => {
          setReported((count) => count + 1);
        }}
        title="Could not load the schedule"
      />
      <p className="td-meta td-num" data-testid="reported">
        Reported: {reported}
      </p>
    </div>
  );
}

export function LoadingLayoutsDemo() {
  const [layout, setLayout] = useState<"list" | "cards" | "table" | "detail">(
    "list",
  );
  return (
    <div className={styles.stack}>
      <Segmented
        aria-label="Layout"
        onValueChange={(value) => setLayout(value as typeof layout)}
        options={[
          { value: "list", label: "List" },
          { value: "cards", label: "Cards" },
          { value: "table", label: "Table" },
          { value: "detail", label: "Detail" },
        ]}
        value={layout}
      />
      <LoadingState count={3} label={`Loading the ${layout}`} layout={layout} />
    </div>
  );
}

export function HonestStatesDemo() {
  const [cleared, setCleared] = useState(false);
  return (
    <div className={styles.stack}>
      <NotConfigured
        canSetUp
        feature="Online payments"
        needs="a Duna Pay account"
        setup={
          <a
            className={buttonClassName({ size: "sm", variant: "primary" })}
            href="#setup"
          >
            Set up Duna Pay
          </a>
        }
      />
      <NotConfigured
        compact
        feature="WhatsApp messages"
        needs="a connected WhatsApp number"
      />
      <FeatureOff
        compact
        feature="Court booking"
        reason="An owner turned it off for the holidays."
      />
      <PermissionDenied
        compact
        area="Money"
        grantedBy="an owner of this club"
      />
      <PartialData missing={["court surface", "opening hours"]} />
      {cleared ? (
        <p className={styles.meta}>Search cleared.</p>
      ) : (
        <EmptyResults onClear={() => setCleared(true)} query="sunset clinic" />
      )}
    </div>
  );
}
