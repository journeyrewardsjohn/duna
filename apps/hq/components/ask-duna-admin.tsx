"use client";

import { useEffect, useState } from "react";
import { MessageCircle, Search, ShieldCheck } from "lucide-react";
import {
  askDunaFetch,
  type AskAction,
  type AskConversation,
} from "./ask-duna-client";

type Overview = {
  usage: {
    modelCalls: number;
    costReportedCalls: number;
    costUsd: number;
    inputTokens: number;
    outputTokens: number;
  };
  conversations: {
    conversation: AskConversation;
    operator: string;
    organization: string;
  }[];
  actions: AskAction[];
  controls: { enabled: boolean; mutationsEnabled: boolean };
  runtime: {
    gatewayConfigured: boolean;
    sessionSecretConfigured: boolean;
    model: string;
    engine: string;
    channels: string[];
  };
};
type Inspection = {
  conversation: AskConversation;
  actions: AskAction[];
  events: {
    id: string;
    type: string;
    data: Record<string, unknown>;
    createdAt: string;
  }[];
};

export function AskDunaAdmin() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const load = () =>
    askDunaFetch<Overview>("admin")
      .then(setOverview)
      .catch((failure: Error) => setError(failure.message));
  useEffect(() => {
    void load();
  }, []);
  async function controls(input: Overview["controls"]) {
    setSaving(true);
    setError("");
    try {
      await askDunaFetch("admin/controls", {
        method: "PATCH",
        body: JSON.stringify({
          enabled: input.enabled,
          mutationsEnabled: input.mutationsEnabled,
        }),
      });
      await load();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="ask-duna-admin" data-zone="editorial">
      <header>
        <p className="ask-duna-eyebrow">
          <ShieldCheck size={16} aria-hidden /> Super Admin
        </p>
        <h1>Ask Duna</h1>
        <p>Understand what the agent is doing and keep operators in control.</p>
      </header>
      {error && (
        <p role="alert" className="ask-duna-error">
          {error}
          <button
            type="button"
            onClick={() => {
              setError("");
              void load();
            }}
          >
            Try again
          </button>
        </p>
      )}
      {!overview && !error && <p role="status">Loading agent operations…</p>}
      {overview && (
        <>
          <div className="ask-duna-admin-controls">
            <article>
              <h2>Agent availability</h2>
              <p>
                {overview.controls.enabled
                  ? "Operators can start and continue conversations."
                  : "New agent work is paused. Saved conversations remain readable."}
              </p>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void controls({
                    ...overview.controls,
                    enabled: !overview.controls.enabled,
                  })
                }
              >
                {overview.controls.enabled ? "Pause agent" : "Resume agent"}
              </button>
            </article>
            <article>
              <h2>Changes through Duna</h2>
              <p>
                {overview.controls.mutationsEnabled
                  ? "Changes require an operator’s explicit review."
                  : "New proposals and approved executions are paused."}
              </p>
              <button
                type="button"
                disabled={saving}
                onClick={() =>
                  void controls({
                    ...overview.controls,
                    mutationsEnabled: !overview.controls.mutationsEnabled,
                  })
                }
              >
                {overview.controls.mutationsEnabled
                  ? "Pause changes"
                  : "Enable reviewed changes"}
              </button>
            </article>
            <article>
              <h2>Runtime connection</h2>
              <dl>
                <div>
                  <dt>AI Gateway</dt>
                  <dd>
                    {overview.runtime.gatewayConfigured
                      ? "Credential configured"
                      : "Needs configuration"}
                  </dd>
                </div>
                <div>
                  <dt>Session signing</dt>
                  <dd>
                    {overview.runtime.sessionSecretConfigured
                      ? "Configured"
                      : "Needs configuration"}
                  </dd>
                </div>
                <div>
                  <dt>Agent</dt>
                  <dd>Eve · {overview.runtime.model}</dd>
                </div>
                <div>
                  <dt>Action cards</dt>
                  <dd>Vercel Chat SDK</dd>
                </div>
              </dl>
              <small>
                Configuration status does not confirm a live request.
              </small>
            </article>
          </div>
          <div className="ask-duna-admin-statistics">
            <span>
              <strong>{overview.usage.modelCalls.toLocaleString()}</strong>{" "}
              model calls in the last 24 hours
            </span>
            <span>
              <strong>
                {overview.usage.costReportedCalls
                  ? new Intl.NumberFormat(undefined, {
                      style: "currency",
                      currency: "USD",
                      maximumFractionDigits: 4,
                    }).format(overview.usage.costUsd)
                  : "—"}
              </strong>{" "}
              reported model cost · {overview.usage.costReportedCalls} calls
            </span>
            <span>
              <strong>
                {(
                  overview.usage.inputTokens + overview.usage.outputTokens
                ).toLocaleString()}
              </strong>{" "}
              reported tokens in the last 24 hours
            </span>
          </div>
          <div className="ask-duna-admin-statistics">
            <span>
              <strong>{overview.conversations.length}</strong> recent
              conversations
            </span>
            <span>
              <strong>
                {
                  overview.actions.filter(
                    (action) => action.status === "pending",
                  ).length
                }
              </strong>{" "}
              recent proposals awaiting review
            </span>
            <span>
              <strong>
                {
                  overview.actions.filter((action) =>
                    ["failed", "uncertain", "executing"].includes(
                      action.status,
                    ),
                  ).length
                }
              </strong>{" "}
              recent actions to inspect
            </span>
          </div>
          <div className="ask-duna-admin-columns">
            <section>
              <header>
                <h2>Conversations</h2>
                <small>Latest 100 across organizations</small>
              </header>
              <label className="ask-duna-search">
                <Search size={18} aria-hidden />
                <input
                  aria-label="Search operator conversations"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search operator, organization, or title…"
                />
              </label>
              <div className="ask-duna-admin-list">
                {overview.conversations
                  .filter((row) =>
                    `${row.operator} ${row.organization} ${row.conversation.title}`
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((row) => (
                    <button
                      type="button"
                      key={row.conversation.id}
                      aria-pressed={
                        inspection?.conversation.id === row.conversation.id
                      }
                      onClick={() => {
                        void askDunaFetch<Inspection>(
                          `admin/${row.conversation.id}`,
                        )
                          .then(setInspection)
                          .catch((failure: Error) => setError(failure.message));
                      }}
                    >
                      <MessageCircle size={17} aria-hidden />
                      <span>
                        <strong>{row.conversation.title}</strong>
                        <small>
                          {row.operator} · {row.organization}
                        </small>
                      </span>
                      <small>{row.conversation.status}</small>
                    </button>
                  ))}
              </div>
            </section>
            <section className="ask-duna-admin-inspection">
              <h2>
                {inspection?.conversation.title ?? "Conversation inspector"}
              </h2>
              <p>
                Read-only oversight. Operators retain ownership of their
                conversations and approvals.
              </p>
              {inspection ? (
                <>
                  <dl>
                    <div>
                      <dt>Session</dt>
                      <dd>
                        {inspection.conversation.sessionId ?? "Not started"}
                      </dd>
                    </div>
                    <div>
                      <dt>Effort</dt>
                      <dd>{inspection.conversation.effort}</dd>
                    </div>
                  </dl>
                  {inspection.events
                    .filter((event) => typeof event.data.text === "string")
                    .map((event) => (
                      <article key={event.id}>
                        <strong>
                          {event.data.role === "user" ? "Operator" : "Duna"}
                        </strong>
                        <p>{String(event.data.text)}</p>
                      </article>
                    ))}
                  <h3>Action receipts</h3>
                  {inspection.actions.length === 0 && (
                    <p>No actions in this conversation.</p>
                  )}
                  {inspection.actions.map((action) => (
                    <details key={action.id}>
                      <summary>
                        {action.status} · {action.summary}
                      </summary>
                      <pre>
                        {JSON.stringify(
                          {
                            operation: action.operation,
                            input: action.input,
                            result: action.result,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  ))}
                  <h3>Runtime events</h3>
                  <details>
                    <summary>Model usage, status, and timing</summary>
                    <pre>
                      {JSON.stringify(
                        inspection.events.filter((event) => !event.data.text),
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </>
              ) : (
                <p className="ask-duna-empty">
                  Choose a conversation to inspect its saved messages and action
                  receipts.
                </p>
              )}
            </section>
          </div>
        </>
      )}
    </section>
  );
}
