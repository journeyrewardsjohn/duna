"use client";

import type { AdminPredictionOverview } from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import {
  BadgeCheck,
  BookOpenCheck,
  ClipboardCheck,
  Check,
  CircleAlert,
  Clock3,
  Coins,
  ExternalLink,
  FileClock,
  LockKeyhole,
  Trophy,
  UsersRound,
} from "lucide-react";
import { useActionState } from "react";
import {
  determinePredictionMarketAction,
  recordPredictionMatchResultAction,
  settleVerifiedPredictionMarketsAction,
  setPredictionMarketTradingStatusAction,
  updatePredictionMarketRulesAction,
  type PredictionAdminActionState,
} from "@/app/admin/actions";

const initialState: PredictionAdminActionState = {
  status: "idle",
  message: "",
};

const consumerOrigin =
  process.env.NEXT_PUBLIC_DUNA_WEB_URL?.replace(/\/$/, "") ??
  process.env.NEXT_PUBLIC_WEB_URL?.replace(/\/$/, "") ??
  "https://duna.coach";

function ActionNotice({
  state,
}: {
  readonly state: PredictionAdminActionState;
}) {
  if (state.status === "idle") return null;
  return (
    <p
      className={[
        "operator-action-notice",
        "operator-action-notice--" + state.status,
      ].join(" ")}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.status === "success" ? (
        <Check aria-hidden size={15} />
      ) : (
        <CircleAlert aria-hidden size={15} />
      )}
      {state.message}
    </p>
  );
}

function dateTimeInput(value?: string) {
  return value ? new Date(value).toISOString().slice(0, 16) : "";
}

function MarketControl({
  canManage,
  market,
}: {
  readonly canManage: boolean;
  readonly market: AdminPredictionOverview["markets"][number];
}) {
  const [rulesState, rulesAction, rulesPending] = useActionState(
    updatePredictionMarketRulesAction,
    initialState,
  );
  const [statusState, statusAction, statusPending] = useActionState(
    setPredictionMarketTradingStatusAction,
    initialState,
  );
  const [determineState, determineAction, determinePending] = useActionState(
    determinePredictionMarketAction,
    initialState,
  );
  const determined = market.status === "settled";

  return (
    <details className="prediction-admin-market">
      <summary>
        <span
          className="prediction-admin-market__status"
          data-status={market.status}
        >
          {determined ? (
            <BadgeCheck aria-hidden size={17} />
          ) : market.status === "open" ? (
            <BookOpenCheck aria-hidden size={17} />
          ) : (
            <LockKeyhole aria-hidden size={17} />
          )}
          {determined ? "Determined" : market.status}
        </span>
        <span>
          <strong>{market.title}</strong>
          <small>
            {market.yesLabel} · {market.noLabel}
          </small>
        </span>
        <span>
          <Numeric>{market.volumeCredits.toLocaleString("en-US")}</Numeric>
          <small>credit volume</small>
        </span>
        <span>
          <UsersRound aria-hidden size={15} /> {market.participantCount}
        </span>
      </summary>

      <div className="prediction-admin-market__body">
        <section className="prediction-admin-market__context">
          <div>
            <span>
              <strong>Subject</strong>
              {market.subjectType} · {market.subjectId}
            </span>
            <span>
              <strong>Orders</strong>
              {market.openOrderCount} open
            </span>
            <span>
              <strong>Close</strong>
              {market.locksAt
                ? new Intl.DateTimeFormat("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(market.locksAt))
                : "No fixed close"}
            </span>
          </div>
          <a
            href={consumerOrigin + market.marketPath}
            rel="noreferrer"
            target="_blank"
          >
            Public market <ExternalLink aria-hidden size={14} />
          </a>
        </section>

        <div className="prediction-admin-workspace">
          <form
            action={rulesAction}
            className="operator-form prediction-admin-rules"
          >
            <input name="marketId" type="hidden" value={market.id} />
            <header>
              <div>
                <span className="hq-eyebrow">
                  Rule version {market.rules.version}
                </span>
                <h3>Resolution + timing</h3>
              </div>
              <FileClock aria-hidden size={21} />
            </header>
            <label>
              <span>Resolution criteria</span>
              <textarea
                defaultValue={market.rules.resolutionCriteria}
                disabled={!canManage || determined}
                minLength={12}
                name="resolutionCriteria"
                required
                rows={4}
              />
            </label>
            <label>
              <span>Verification source</span>
              <textarea
                defaultValue={market.rules.resolutionSource}
                disabled={!canManage || determined}
                minLength={5}
                name="resolutionSource"
                required
                rows={2}
              />
            </label>
            <label>
              <span>Close policy</span>
              <textarea
                defaultValue={market.rules.closePolicy}
                disabled={!canManage || determined}
                minLength={12}
                name="closePolicy"
                required
                rows={3}
              />
            </label>
            <div className="operator-form-grid operator-form-grid--two">
              <label>
                <span>Posted close</span>
                <input
                  defaultValue={dateTimeInput(market.locksAt)}
                  disabled={!canManage || determined}
                  name="locksAt"
                  type="datetime-local"
                />
              </label>
              <label>
                <span>Public note</span>
                <input
                  defaultValue={market.rules.publicNote}
                  disabled={!canManage || determined}
                  name="publicNote"
                />
              </label>
            </div>
            <label>
              <span>Change reason</span>
              <input
                disabled={!canManage || determined}
                minLength={5}
                name="reason"
                placeholder="Why these market rules are changing"
                required
              />
            </label>
            <label className="operator-confirmation">
              <input
                disabled={!canManage || determined}
                name="confirmed"
                required
                type="checkbox"
                value="true"
              />
              <span>
                <strong>
                  I reviewed the player-facing resolution language.
                </strong>
                A new immutable rule version and audit event will be created.
              </span>
            </label>
            <footer className="operator-form-footer">
              <ActionNotice state={rulesState} />
              <button
                className="hq-button hq-button--primary"
                disabled={!canManage || determined || rulesPending}
                type="submit"
              >
                {rulesPending ? "Saving…" : "Publish rule version"}
              </button>
            </footer>
          </form>

          <aside className="prediction-admin-operations">
            <section>
              <span className="hq-eyebrow">Trading state</span>
              <h3>
                {market.status === "open" ? "Market open" : "Orders closed"}
              </h3>
              <p>
                Locking pauses new orders. Reopening clears an elapsed close
                time; set a new one in rules before publishing.
              </p>
              {!determined && market.status !== "void" && (
                <form action={statusAction} className="operator-form">
                  <input name="marketId" type="hidden" value={market.id} />
                  <input
                    name="action"
                    type="hidden"
                    value={market.status === "open" ? "lock" : "reopen"}
                  />
                  <label>
                    <span>Operator reason</span>
                    <input
                      disabled={!canManage}
                      minLength={5}
                      name="reason"
                      required
                    />
                  </label>
                  <label className="operator-confirmation">
                    <input
                      disabled={!canManage}
                      name="confirmed"
                      required
                      type="checkbox"
                      value="true"
                    />
                    <span>
                      <strong>
                        {market.status === "open"
                          ? "Close new orders."
                          : "Reopen this market."}
                      </strong>
                      This state change is audit-recorded.
                    </span>
                  </label>
                  <ActionNotice state={statusState} />
                  <button
                    className="hq-button hq-button--secondary"
                    disabled={!canManage || statusPending}
                    type="submit"
                  >
                    <Clock3 aria-hidden size={15} />
                    {statusPending
                      ? "Updating…"
                      : market.status === "open"
                        ? "Lock market"
                        : "Reopen market"}
                  </button>
                </form>
              )}
            </section>

            {!determined && market.status !== "void" && (
              <section className="prediction-admin-determine">
                <span className="hq-eyebrow">Final result</span>
                <h3>Mark Determined</h3>
                <p>
                  This closes every open order, returns unmatched credits, and
                  settles every matched position. It cannot be reversed here.
                </p>
                <form action={determineAction} className="operator-form">
                  <input name="marketId" type="hidden" value={market.id} />
                  <label>
                    <span>Verified outcome</span>
                    <select
                      defaultValue=""
                      disabled={!canManage}
                      name="resolvedSide"
                      required
                    >
                      <option disabled value="">
                        Choose final outcome
                      </option>
                      <option value="yes">{market.yesLabel}</option>
                      <option value="no">{market.noLabel}</option>
                    </select>
                  </label>
                  <label>
                    <span>Source + reason</span>
                    <textarea
                      disabled={!canManage}
                      minLength={5}
                      name="reason"
                      placeholder="Document the final verified source"
                      required
                      rows={3}
                    />
                  </label>
                  <label className="operator-confirmation">
                    <input
                      disabled={!canManage}
                      name="confirmed"
                      required
                      type="checkbox"
                      value="true"
                    />
                    <span>
                      <strong>I verified the final result.</strong>
                      Settle all positions and close every open order.
                    </span>
                  </label>
                  <ActionNotice state={determineState} />
                  <button
                    className="hq-button hq-button--primary"
                    disabled={!canManage || determinePending}
                    type="submit"
                  >
                    <BadgeCheck aria-hidden size={15} />
                    {determinePending ? "Settling…" : "Mark Determined"}
                  </button>
                </form>
              </section>
            )}
          </aside>
        </div>

        <section className="prediction-admin-public">
          <header>
            <div>
              <span className="hq-eyebrow">Public by handle</span>
              <h3>Predictors</h3>
            </div>
            <Badge>{market.predictors.length}</Badge>
          </header>
          {market.predictors.length ? (
            <div>
              {market.predictors.map((predictor, index) => (
                <span key={[predictor.handle, predictor.side, index].join(":")}>
                  <strong>@{predictor.handle}</strong>
                  {predictor.side === "yes" ? market.yesLabel : market.noLabel}
                  <small>
                    {predictor.shares.toLocaleString("en-US", {
                      maximumFractionDigits: 2,
                    })}{" "}
                    shares · {predictor.status}
                  </small>
                </span>
              ))}
            </div>
          ) : (
            <p>No matched positions.</p>
          )}
        </section>

        <details className="prediction-admin-history">
          <summary>
            Rule history · {market.ruleHistory.length} version
            {market.ruleHistory.length === 1 ? "" : "s"}
          </summary>
          <div>
            {market.ruleHistory.map((rule) => (
              <article key={rule.version}>
                <span>v{rule.version}</span>
                <div>
                  <strong>{rule.changeReason}</strong>
                  <p>{rule.resolutionCriteria}</p>
                  <small>
                    {new Intl.DateTimeFormat("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(rule.effectiveAt))}
                    {rule.createdByHandle ? " · @" + rule.createdByHandle : ""}
                  </small>
                </div>
              </article>
            ))}
          </div>
        </details>
      </div>
    </details>
  );
}

function ManualResultControl({
  canManage,
  match,
}: {
  readonly canManage: boolean;
  readonly match: AdminPredictionOverview["manualResultMatches"][number];
}) {
  const [state, action, pending] = useActionState(
    recordPredictionMatchResultAction,
    initialState,
  );
  return (
    <details className="prediction-admin-result">
      <summary>
        <span className="prediction-admin-result__status">
          <ClipboardCheck aria-hidden size={17} /> Needs final score
        </span>
        <span>
          <strong>{match.title}</strong>
          <small>
            {match.yesLabel} vs {match.noLabel}
            {match.playedAt
              ? ` · ${new Intl.DateTimeFormat("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                }).format(new Date(match.playedAt))}`
              : ""}
          </small>
        </span>
        <span>
          {match.marketCount} linked market{match.marketCount === 1 ? "" : "s"}
        </span>
      </summary>
      <form
        action={action}
        className="operator-form prediction-admin-result__form"
      >
        <input name="matchId" type="hidden" value={match.id} />
        <header>
          <div>
            <span className="hq-eyebrow">Scraper fallback</span>
            <h3>Record the verified final</h3>
            <p>
              This preserves the source-backed result, stops this match from
              appearing unresolved, and determines every linked market.
            </p>
          </div>
          <Trophy aria-hidden size={21} />
        </header>
        <fieldset disabled={!canManage || pending}>
          <legend>Winning team</legend>
          <label className="prediction-admin-result__winner">
            <input name="winnerSide" required type="radio" value="A" />
            <span>{match.yesLabel}</span>
          </label>
          <label className="prediction-admin-result__winner">
            <input name="winnerSide" required type="radio" value="B" />
            <span>{match.noLabel}</span>
          </label>
        </fieldset>
        <div
          className="prediction-admin-result__sets"
          role="group"
          aria-label="Final set scores"
        >
          {[1, 2, 3].map((setNo) => (
            <label key={setNo}>
              <span>Set {setNo}</span>
              <input
                aria-label={`Set ${setNo}, ${match.yesLabel}`}
                min="0"
                name={`set${setNo}A`}
                type="number"
              />
              <b>–</b>
              <input
                aria-label={`Set ${setNo}, ${match.noLabel}`}
                min="0"
                name={`set${setNo}B`}
                type="number"
              />
            </label>
          ))}
        </div>
        <div className="operator-form-grid operator-form-grid--two">
          <label>
            <span>Official result link (optional)</span>
            <input
              disabled={!canManage || pending}
              name="sourceUrl"
              placeholder="https://…"
              type="url"
            />
          </label>
          <label>
            <span>Verification note</span>
            <input
              disabled={!canManage || pending}
              minLength={10}
              name="reason"
              placeholder="Official result confirmed at…"
              required
            />
          </label>
        </div>
        <label className="operator-confirmation">
          <input
            disabled={!canManage || pending}
            name="confirmed"
            required
            type="checkbox"
            value="true"
          />
          <span>
            <strong>I verified this final score and winning team.</strong>
            This is audit-recorded and settles all linked positions.
          </span>
        </label>
        <footer className="operator-form-footer">
          <ActionNotice state={state} />
          <button
            className="hq-button hq-button--primary"
            disabled={!canManage || pending}
            type="submit"
          >
            <Trophy aria-hidden size={15} />
            {pending ? "Saving final…" : "Save score + determine markets"}
          </button>
        </footer>
      </form>
    </details>
  );
}

function VerifiedSettlementRun({ canManage }: { readonly canManage: boolean }) {
  const [state, action, pending] = useActionState(
    settleVerifiedPredictionMarketsAction,
    initialState,
  );
  return (
    <section className="prediction-admin-settle">
      <div>
        <span className="hq-eyebrow">Verified result sweep</span>
        <h2>Determine every market with a reported final</h2>
        <p>
          Rechecks all open and closed match markets against their stored
          verified results. It never guesses a winner or touches markets still
          waiting on a result.
        </p>
      </div>
      <form action={action} className="operator-form">
        <label>
          <span>Operator reason</span>
          <input
            disabled={!canManage || pending}
            minLength={10}
            name="reason"
            placeholder="Verified results reviewed after source refresh"
            required
          />
        </label>
        <label className="operator-confirmation">
          <input
            disabled={!canManage || pending}
            name="confirmed"
            required
            type="checkbox"
            value="true"
          />
          <span>
            <strong>I reviewed the available final results.</strong>
            Every eligible market will settle immediately and be audit-recorded.
          </span>
        </label>
        <ActionNotice state={state} />
        <button
          className="hq-button hq-button--secondary"
          disabled={!canManage || pending}
          type="submit"
        >
          <BadgeCheck aria-hidden size={15} />
          {pending ? "Checking results…" : "Determine verified markets"}
        </button>
      </form>
    </section>
  );
}

export function PredictionAdminControls({
  overview,
}: {
  readonly overview: AdminPredictionOverview;
}) {
  const metrics = [
    ["Markets", overview.metrics.totalMarkets],
    ["Open", overview.metrics.openMarkets],
    ["Closed", overview.metrics.lockedMarkets],
    ["Determined", overview.metrics.determinedMarkets],
    ["Predictors", overview.metrics.predictorCount],
    [
      "Credit volume",
      overview.metrics.volumeCredits.toLocaleString("en-US", {
        maximumFractionDigits: 1,
      }),
    ],
  ] as const;
  return (
    <div className="prediction-admin">
      <section className="prediction-admin-metrics">
        {metrics.map(([label, value]) => (
          <article key={label}>
            <span>{label}</span>
            <Numeric>{value}</Numeric>
          </article>
        ))}
      </section>
      <VerifiedSettlementRun canManage={overview.canManage} />
      {overview.manualResultMatches.length > 0 && (
        <section className="prediction-admin-list prediction-admin-results">
          <header>
            <div>
              <span className="hq-eyebrow">Result recovery</span>
              <h2>Markets waiting on a score</h2>
              <p>
                Use a verified final when a professional scraper has not
                reported one. The score becomes the protected fallback for the
                public match result and settles linked markets together.
              </p>
            </div>
            <Badge tone="warning">
              {overview.manualResultMatches.length} waiting
            </Badge>
          </header>
          <div>
            {overview.manualResultMatches.map((match) => (
              <ManualResultControl
                canManage={overview.canManage}
                key={match.id}
                match={match}
              />
            ))}
          </div>
        </section>
      )}
      <section className="prediction-admin-list">
        <header>
          <div>
            <span className="hq-eyebrow">Market operations</span>
            <h2>Rules, orders + settlement</h2>
            <p>
              Inspect public participation, version player-facing rules, pause
              trading, and determine only from a verified result.
            </p>
          </div>
          <Badge tone={overview.canManage ? "positive" : "neutral"}>
            <Coins aria-hidden size={13} />
            {overview.canManage ? "SuperAdmin controls" : "Read only"}
          </Badge>
        </header>
        <div>
          {overview.markets.map((market) => (
            <MarketControl
              canManage={overview.canManage}
              key={market.id}
              market={market}
            />
          ))}
          {!overview.markets.length && (
            <p className="hq-empty">No prediction markets have been created.</p>
          )}
        </div>
      </section>
    </div>
  );
}
