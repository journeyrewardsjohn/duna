"use client";

import type { AdminVisionOverview, VisionModelSummary } from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import {
  BadgeCheck,
  BrainCircuit,
  Check,
  CircleAlert,
  CloudCog,
  ExternalLink,
  FileCheck2,
  FlaskConical,
  Gauge,
  LockKeyhole,
  Play,
  RotateCcw,
  ShieldCheck,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import {
  registerVisionModelAction,
  requestVisionBenchmarkAction,
  requestVisionTrainingAction,
  reviewVisionModelAction,
  type VisionAdminActionState,
} from "@/app/admin/actions";

const initialState: VisionAdminActionState = { status: "idle", message: "" };

function ActionNotice({ state }: { readonly state: VisionAdminActionState }) {
  if (state.status === "idle") return null;
  return (
    <p
      className={`operator-action-notice operator-action-notice--${state.status}`}
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

function formatDate(value?: string): string {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusTone(
  status: string,
): "positive" | "warning" | "danger" | "neutral" {
  if (["production", "passed", "succeeded"].includes(status)) return "positive";
  if (["running", "shadow", "queued", "candidate"].includes(status)) {
    return "warning";
  }
  if (["failed", "rejected"].includes(status)) return "danger";
  return "neutral";
}

function RuntimeMetrics({
  overview,
}: {
  readonly overview: AdminVisionOverview;
}) {
  const analyzed = overview.uploadedVideos.filter((video) =>
    ["ready", "needs-review"].includes(video.analysis?.status ?? ""),
  ).length;
  const completedEvals = overview.benchmarkRuns.filter(
    (run) => run.status === "passed" || run.status === "failed",
  ).length;
  const metrics = [
    {
      label: "Uploaded videos",
      value: overview.uploadedVideos.length.toLocaleString(),
      detail: "Recent footage in the analysis queue",
      icon: Video,
    },
    {
      label: "Rendered analyses",
      value: analyzed.toLocaleString(),
      detail: "Ready or waiting on human review",
      icon: BadgeCheck,
    },
    {
      label: "Model evaluations",
      value: completedEvals.toLocaleString(),
      detail: "Held-out match validations completed",
      icon: FlaskConical,
    },
    {
      label: "Serving model",
      value: overview.runtime.productionModelVersion ?? "None",
      detail: overview.runtime.configured
        ? "Modal L4 is connected"
        : "Modal runtime needs configuration",
      icon: CloudCog,
    },
  ] as const;
  return (
    <section className="vision-runtime-grid" aria-label="Vision runtime status">
      {metrics.map(({ detail, icon: Icon, label, value }) => (
        <article key={label}>
          <span>
            <small>{label}</small>
            <Icon aria-hidden size={18} />
          </span>
          <Numeric>{value}</Numeric>
          <p>{detail}</p>
        </article>
      ))}
    </section>
  );
}

function UploadedVideoEvidence({
  overview,
}: {
  readonly overview: AdminVisionOverview;
}) {
  return (
    <section className="hq-card vision-evidence-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Uploaded footage</span>
          <h2>What the model is seeing</h2>
          <p>
            Recent uploads and the latest analysis attached to each one. Open a
            player view to inspect the same rendered result people receive.
          </p>
        </div>
        <Badge>{overview.uploadedVideos.length}</Badge>
      </header>
      <div className="vision-evidence-list">
        {overview.uploadedVideos.map((video) => (
          <article key={video.id}>
            <span className="vision-evidence-icon">
              <Video aria-hidden size={18} />
            </span>
            <div className="vision-evidence-copy">
              <strong>{video.title}</strong>
              <small>
                {video.ownerName} · {formatDate(video.createdAt)} ·{" "}
                {video.durationSeconds
                  ? `${Math.floor(video.durationSeconds / 60)}m ${video.durationSeconds % 60}s`
                  : "Duration processing"}
              </small>
              <span>
                <Badge tone={video.learningConsent ? "positive" : "neutral"}>
                  {video.learningConsent
                    ? "Training consent"
                    : "Private evidence"}
                </Badge>
                <Badge
                  tone={statusTone(video.analysis?.status ?? video.status)}
                >
                  {video.analysis?.status ?? video.status}
                </Badge>
              </span>
            </div>
            <div className="vision-output-summary">
              {video.analysis ? (
                <>
                  <strong>{video.analysis.eventCount} observed events</strong>
                  <small>
                    {video.analysis.modelVersion ??
                      video.analysis.pipelineVersion}
                    {video.analysis.calibrationQualityScore !== undefined
                      ? ` · calibration ${Math.round(video.analysis.calibrationQualityScore * 100)}%`
                      : ""}
                    {video.analysis.qualityDecision
                      ? ` · ${video.analysis.qualityDecision}`
                      : ""}
                  </small>
                </>
              ) : (
                <small>Analysis has not been requested yet.</small>
              )}
            </div>
            <Link
              className="hq-button hq-button--secondary"
              href={`https://duna.coach${video.playerViewPath}`}
              rel="noreferrer"
              target="_blank"
            >
              Player view <ExternalLink aria-hidden size={14} />
            </Link>
          </article>
        ))}
        {overview.uploadedVideos.length === 0 && (
          <p className="hq-empty">
            Upload a match video to see its calibration, events, and
            player-facing output here.
          </p>
        )}
      </div>
    </section>
  );
}

function EvaluationEvidence({
  overview,
}: {
  readonly overview: AdminVisionOverview;
}) {
  return (
    <section className="hq-card vision-evaluation-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Held-out evaluation</span>
          <h2>Does it pass real-match validation?</h2>
          <p>
            Each result is bound to an exact model and held-out match manifest;
            production still requires signed evidence and independent approval.
          </p>
        </div>
        <FileCheck2 aria-hidden size={22} />
      </header>
      <div className="vision-evaluation-list">
        {overview.benchmarkRuns.slice(0, 6).map((run) => (
          <article key={run.id}>
            <div>
              <span>
                <Badge tone={statusTone(run.status)}>{run.status}</Badge>
                <strong>{run.modelVersion}</strong>
              </span>
              <small>
                {run.benchmarkId} · {formatDate(run.updatedAt)}
              </small>
            </div>
            <div className="vision-evaluation-metrics">
              <span>
                <small>Contact F1</small>
                <strong>
                  {run.qualityGate?.metrics.contactF1 !== undefined
                    ? `${Math.round(run.qualityGate.metrics.contactF1 * 100)}%`
                    : "—"}
                </strong>
              </span>
              <span>
                <small>Rally F1</small>
                <strong>
                  {run.qualityGate?.metrics.rallyF1 !== undefined
                    ? `${Math.round(run.qualityGate.metrics.rallyF1 * 100)}%`
                    : "—"}
                </strong>
              </span>
              <span>
                <small>Gate</small>
                <strong>
                  {run.qualityGate?.productionEligible
                    ? "Eligible"
                    : "Not eligible"}
                </strong>
              </span>
            </div>
          </article>
        ))}
        {overview.benchmarkRuns.length === 0 && (
          <p className="hq-empty">
            No held-out evaluation has run yet. Candidate weights cannot serve
            production traffic.
          </p>
        )}
      </div>
    </section>
  );
}

function TrainingForm({
  overview,
}: {
  readonly overview: AdminVisionOverview;
}) {
  const [state, action, pending] = useActionState(
    requestVisionTrainingAction,
    initialState,
  );
  return (
    <section className="hq-card vision-operation-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Bounded L4 job</span>
          <h2>Train a candidate</h2>
          <p>
            The dataset must include its consent ledger and immutable manifest.
            A completed run registers a candidate; it never changes traffic.
          </p>
        </div>
        <BrainCircuit aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--two">
          <label>
            <span>New model version</span>
            <input
              disabled={!overview.canManage}
              name="requestedModelVersion"
              placeholder="duna-vb-2026.08.1"
              required
            />
          </label>
          <label>
            <span>Base model · optional</span>
            <input
              disabled={!overview.canManage}
              name="baseModelVersion"
              placeholder="Current candidate or production version"
            />
          </label>
          <label className="operator-field--full">
            <span>Approved dataset ZIP in private R2</span>
            <input
              disabled={!overview.canManage}
              name="datasetR2Key"
              placeholder="vision-training/datasets/august-consented-v1.zip"
              required
            />
          </label>
          <label>
            <span>Code commit SHA</span>
            <input
              disabled={!overview.canManage}
              name="codeCommitSha"
              pattern="[a-f0-9]{7,64}"
              required
            />
          </label>
          <label>
            <span>Maximum GPU budget · USD</span>
            <input
              defaultValue="25"
              disabled={!overview.canManage}
              max="1000"
              min="1"
              name="budgetDollars"
              required
              step="1"
              type="number"
            />
          </label>
          <label className="operator-field--full">
            <span>Audit reason</span>
            <input
              disabled={!overview.canManage}
              minLength={8}
              name="reason"
              placeholder="What this candidate is intended to improve"
              required
            />
          </label>
        </div>
        <label className="operator-confirmation">
          <input
            disabled={!overview.canManage}
            name="confirmed"
            required
            type="checkbox"
            value="true"
          />
          <span>
            <strong>
              I verified dataset rights, consent, provenance, and budget.
            </strong>
            Modal may process only the named immutable dataset for this run.
          </span>
        </label>
        <footer className="operator-form-footer">
          <ActionNotice state={state} />
          <button
            className="hq-button hq-button--primary"
            disabled={
              !overview.canManage || !overview.runtime.configured || pending
            }
            type="submit"
          >
            <Play aria-hidden size={16} />{" "}
            {pending ? "Starting…" : "Start L4 training"}
          </button>
        </footer>
      </form>
    </section>
  );
}

function BenchmarkForm({
  overview,
}: {
  readonly overview: AdminVisionOverview;
}) {
  const [state, action, pending] = useActionState(
    requestVisionBenchmarkAction,
    initialState,
  );
  return (
    <section className="hq-card vision-operation-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Signed match validation</span>
          <h2>Run the production gate</h2>
          <p>
            Benchmarks court geometry, event precision and recall, coverage,
            latency, and malformed-output rate against held-out match truth.
          </p>
        </div>
        <FlaskConical aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--two">
          <label>
            <span>Exact registered model</span>
            <select disabled={!overview.canManage} name="modelId" required>
              <option value="">Choose a model</option>
              {overview.models.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.version} · {model.status}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Benchmark ID</span>
            <input
              disabled={!overview.canManage}
              name="benchmarkId"
              placeholder="volleyball-heldout-v1"
              required
            />
          </label>
          <label className="operator-field--full">
            <span>Held-out manifest in private R2</span>
            <input
              disabled={!overview.canManage}
              name="datasetManifestR2Key"
              placeholder="vision-benchmarks/volleyball-heldout-v1.json"
              required
            />
          </label>
          <label className="operator-field--full">
            <span>Audit reason</span>
            <input
              disabled={!overview.canManage}
              minLength={8}
              name="reason"
              placeholder="Why this exact bundle is ready for validation"
              required
            />
          </label>
        </div>
        <label className="operator-confirmation">
          <input
            disabled={!overview.canManage}
            name="confirmed"
            required
            type="checkbox"
            value="true"
          />
          <span>
            <strong>
              I verified this held-out set was not used for training.
            </strong>
            Passing results are signed and bound to the exact bundle SHA.
          </span>
        </label>
        <footer className="operator-form-footer">
          <ActionNotice state={state} />
          <button
            className="hq-button hq-button--primary"
            disabled={
              !overview.canManage ||
              !overview.runtime.configured ||
              overview.models.length === 0 ||
              pending
            }
            type="submit"
          >
            <Gauge aria-hidden size={16} />{" "}
            {pending ? "Starting…" : "Run signed benchmark"}
          </button>
        </footer>
      </form>
    </section>
  );
}

function RegisterBundle({
  overview,
}: {
  readonly overview: AdminVisionOverview;
}) {
  const [state, action, pending] = useActionState(
    registerVisionModelAction,
    initialState,
  );
  return (
    <details className="hq-card vision-register-card">
      <summary>
        <span>
          <span className="hq-eyebrow">Advanced</span>
          <strong>Register an immutable model bundle</strong>
          <small>
            For externally trained, licensed weights already stored in private
            R2.
          </small>
        </span>
        <span>Open</span>
      </summary>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--two">
          <label>
            <span>Version</span>
            <input disabled={!overview.canManage} name="version" required />
          </label>
          <label>
            <span>Detector family</span>
            <input
              disabled={!overview.canManage}
              name="detectorFamily"
              required
            />
          </label>
          <label>
            <span>Source license</span>
            <input
              disabled={!overview.canManage}
              name="sourceLicense"
              required
            />
          </label>
          <label>
            <span>Bundle SHA-256</span>
            <input
              disabled={!overview.canManage}
              minLength={64}
              name="bundleSha256"
              required
            />
          </label>
          <label className="operator-field--full">
            <span>Private R2 prefix</span>
            <input
              disabled={!overview.canManage}
              name="bundleR2Prefix"
              placeholder="vision-models/version/hash/"
              required
            />
          </label>
          <label className="operator-field--full">
            <span>Manifest JSON</span>
            <textarea
              defaultValue="{}"
              disabled={!overview.canManage}
              name="manifest"
              required
              rows={6}
            />
          </label>
          <label className="operator-field--full">
            <span>Audit reason</span>
            <input
              disabled={!overview.canManage}
              minLength={8}
              name="reason"
              required
            />
          </label>
        </div>
        <label className="operator-confirmation">
          <input
            disabled={!overview.canManage}
            name="confirmed"
            required
            type="checkbox"
            value="true"
          />
          <span>
            <strong>
              I verified license, provenance, hash, and private storage.
            </strong>
            This registers a candidate only.
          </span>
        </label>
        <footer className="operator-form-footer">
          <ActionNotice state={state} />
          <button
            className="hq-button hq-button--secondary"
            disabled={!overview.canManage || pending}
            type="submit"
          >
            {pending ? "Registering…" : "Register candidate"}
          </button>
        </footer>
      </form>
    </details>
  );
}

function ModelReview({
  canManage,
  model,
}: {
  readonly canManage: boolean;
  readonly model: VisionModelSummary;
}) {
  const [state, action, pending] = useActionState(
    reviewVisionModelAction,
    initialState,
  );
  const productionApprovers = new Set(
    model.approvals
      .filter(
        (approval) =>
          approval.stage === "production" && approval.decision === "approved",
      )
      .map((approval) => approval.reviewerName),
  ).size;
  const productionUnlocked = Boolean(
    model.qualityGate?.productionEligible &&
    model.promotionAttestationAvailable,
  );
  return (
    <article className="vision-model-row">
      <header>
        <div>
          <span className="vision-model-status">
            <Badge tone={statusTone(model.status)}>{model.status}</Badge>
            <code>{model.bundleSha256.slice(0, 12)}</code>
          </span>
          <h3>{model.version}</h3>
          <p>
            {model.detectorFamily} · {model.sourceLicense} · registered{" "}
            {formatDate(model.createdAt)}
          </p>
        </div>
        <div
          className="vision-approval-count"
          aria-label={`${productionApprovers} of 2 production approvals`}
        >
          <ShieldCheck aria-hidden size={20} />
          <Numeric>{productionApprovers}/2</Numeric>
          <small>production approvals</small>
        </div>
      </header>
      <div className="vision-gate-grid">
        <span>
          <small>Signed benchmark</small>
          <strong>
            {model.promotionAttestationAvailable ? "Verified" : "Required"}
          </strong>
        </span>
        <span>
          <small>Court error P95</small>
          <strong>
            {model.qualityGate?.metrics.courtErrorP95Pixels !== undefined
              ? `${model.qualityGate.metrics.courtErrorP95Pixels.toFixed(1)} px`
              : "Not tested"}
          </strong>
        </span>
        <span>
          <small>Contact F1</small>
          <strong>
            {model.qualityGate?.metrics.contactF1 !== undefined
              ? `${Math.round(model.qualityGate.metrics.contactF1 * 100)}%`
              : "Not tested"}
          </strong>
        </span>
        <span>
          <small>Rally F1</small>
          <strong>
            {model.qualityGate?.metrics.rallyF1 !== undefined
              ? `${Math.round(model.qualityGate.metrics.rallyF1 * 100)}%`
              : "Not tested"}
          </strong>
        </span>
      </div>
      <form action={action} className="vision-review-form">
        <input name="modelId" type="hidden" value={model.id} />
        <label>
          <span>Stage</span>
          <select defaultValue="shadow" disabled={!canManage} name="stage">
            <option value="shadow">Shadow traffic</option>
            <option disabled={!productionUnlocked} value="production">
              Production · two reviewers
            </option>
            <option value="rollback">Rollback to this verified bundle</option>
          </select>
        </label>
        <label>
          <span>Decision</span>
          <select disabled={!canManage} name="decision">
            <option value="approved">Approve</option>
            <option value="rejected">Reject</option>
          </select>
        </label>
        <label className="vision-review-notes">
          <span>Review notes</span>
          <input
            disabled={!canManage}
            minLength={8}
            name="notes"
            placeholder="Evidence and reasoning for this decision"
            required
          />
        </label>
        <label className="operator-confirmation vision-review-confirmation">
          <input
            disabled={!canManage}
            name="confirmed"
            required
            type="checkbox"
            value="true"
          />
          <span>
            <strong>I reviewed this exact bundle SHA.</strong>Production needs a
            signed gate and two distinct Super Admins.
          </span>
        </label>
        <footer>
          {!productionUnlocked && (
            <span className="vision-gate-lock">
              <LockKeyhole aria-hidden size={14} /> Production locked pending
              signed benchmark
            </span>
          )}
          <ActionNotice state={state} />
          <button
            className="hq-button hq-button--secondary"
            disabled={!canManage || pending}
            type="submit"
          >
            {pending ? "Recording…" : "Record review"}
          </button>
        </footer>
      </form>
      {model.approvals.length > 0 && (
        <details className="vision-review-history">
          <summary>{model.approvals.length} recorded reviews</summary>
          {model.approvals.map((approval) => (
            <p key={approval.id}>
              <strong>{approval.reviewerName}</strong> {approval.decision}{" "}
              {approval.stage} · {formatDate(approval.createdAt)}
              <span>{approval.notes}</span>
            </p>
          ))}
        </details>
      )}
    </article>
  );
}

function Runs({ overview }: { readonly overview: AdminVisionOverview }) {
  const runs = [
    ...overview.trainingRuns.map((run) => ({
      id: run.id,
      title: run.requestedModelVersion,
      type: "Training",
      status: run.status,
      detail: `${run.gpuType} · $${(run.budgetCents / 100).toFixed(0)} ceiling`,
      at: run.updatedAt,
    })),
    ...overview.benchmarkRuns.map((run) => ({
      id: run.id,
      title: run.modelVersion,
      type: "Benchmark",
      status: run.status,
      detail: run.benchmarkId,
      at: run.updatedAt,
    })),
  ]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, 12);
  return (
    <section className="hq-card vision-runs-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Modal job ledger</span>
          <h2>Recent operations</h2>
        </div>
        <Badge>{runs.length}</Badge>
      </header>
      <div className="vision-run-list">
        {runs.map((run) => (
          <article key={`${run.type}:${run.id}`}>
            <span>
              <strong>{run.type}</strong>
              <small>{run.title}</small>
            </span>
            <span>
              <small>{run.detail}</small>
              <time>{formatDate(run.at)}</time>
            </span>
            <Badge tone={statusTone(run.status)}>{run.status}</Badge>
          </article>
        ))}
        {runs.length === 0 && (
          <p className="hq-empty">
            No training or benchmark jobs have run yet.
          </p>
        )}
      </div>
    </section>
  );
}

export function VisionModelAdmin({
  overview,
}: {
  readonly overview: AdminVisionOverview;
}) {
  return (
    <div className="vision-model-admin">
      <RuntimeMetrics overview={overview} />
      <section className="vision-safety-rail">
        <ShieldCheck aria-hidden size={21} />
        <div>
          <strong>Human-controlled release path</strong>
          <span>
            Upload → review rendered output → held-out match evaluation → shadow
            approval → two independent production approvals. Every step is
            immutable and audited.
          </span>
        </div>
        <Badge tone={overview.runtime.configured ? "positive" : "warning"}>
          {overview.runtime.configured
            ? "Modal L4 connected"
            : "Modal setup required"}
        </Badge>
      </section>
      <UploadedVideoEvidence overview={overview} />
      <EvaluationEvidence overview={overview} />
      <section className="hq-card vision-model-registry">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Model decisions</span>
            <h2>Weights and approvals</h2>
            <p>
              Approve exact weights here only after you have reviewed their
              video evidence and held-out evaluation above.
            </p>
          </div>
          <Badge>{overview.models.length}</Badge>
        </header>
        <div className="vision-model-list">
          {overview.models.map((model) => (
            <ModelReview
              canManage={overview.canManage}
              key={model.id}
              model={model}
            />
          ))}
          {overview.models.length === 0 && (
            <div className="hq-empty">
              <RotateCcw aria-hidden size={20} />
              <strong>No model bundles registered.</strong>
              <span>
                Register the licensed bootstrap bundle or complete an L4
                training run.
              </span>
            </div>
          )}
        </div>
      </section>
      <details className="hq-card vision-advanced-operations">
        <summary>
          <span>
            <span className="hq-eyebrow">Advanced operations</span>
            <strong>Train, benchmark, or register a bundle</strong>
            <small>
              Use immutable private R2 manifests only. Starting a job never
              promotes a model.
            </small>
          </span>
          <span>Open</span>
        </summary>
        <div className="vision-operation-grid">
          <TrainingForm overview={overview} />
          <BenchmarkForm overview={overview} />
        </div>
        <div className="vision-lower-grid">
          <Runs overview={overview} />
          <RegisterBundle overview={overview} />
        </div>
      </details>
    </div>
  );
}
