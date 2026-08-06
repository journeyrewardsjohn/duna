"use client";

import type {
  AdminVideoOverview,
  DunaPlusGrant,
  VisionCalibrationReviewSample,
} from "@duna/api";
import { Badge, Numeric } from "@duna/ui";
import {
  Check,
  BrainCircuit,
  CircleAlert,
  Clock3,
  Cloud,
  Database,
  Gift,
  HardDrive,
  ScanLine,
  ThumbsDown,
  ThumbsUp,
  Radio,
  ShieldCheck,
  Trash2,
  UsersRound,
} from "lucide-react";
import { useActionState } from "react";
import {
  grantComplimentaryDunaPlusAction,
  reviewVisionCalibrationSampleAction,
  revokeComplimentaryDunaPlusAction,
  updateVideoQuotaPolicyAction,
  type VideoAdminActionState,
} from "@/app/admin/actions";

const initialState: VideoAdminActionState = {
  status: "idle",
  message: "",
};

function formatHours(seconds: number): string {
  const hours = seconds / 60 / 60;
  return hours >= 10 || Number.isInteger(hours)
    ? `${hours.toLocaleString("en-US", { maximumFractionDigits: 0 })}h`
    : `${hours.toLocaleString("en-US", { maximumFractionDigits: 1 })}h`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 GB";
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** exponent).toLocaleString("en-US", {
    maximumFractionDigits: exponent > 2 ? 1 : 0,
  })} ${units[exponent]}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

function ActionNotice({ state }: { readonly state: VideoAdminActionState }) {
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

function QuotaPolicy({ overview }: { readonly overview: AdminVideoOverview }) {
  const [state, action, pending] = useActionState(
    updateVideoQuotaPolicyAction,
    initialState,
  );
  return (
    <section className="hq-card video-policy-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Platform safety ceilings</span>
          <h2>Streaming + upload guardrails</h2>
          <p>
            Membership plans set each player&apos;s allowance. These ceilings
            can cap every plan during launch; person-specific overrides still
            take precedence.
          </p>
        </div>
        <Clock3 aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--two">
          <label>
            <span>Live stream hours</span>
            <input
              defaultValue={overview.settings.monthlyLiveSeconds / 3600}
              disabled={!overview.canManage}
              max={744}
              min={0}
              name="liveHours"
              required
              step={0.25}
              type="number"
            />
          </label>
          <label>
            <span>Uploaded video hours</span>
            <input
              defaultValue={overview.settings.monthlyUploadSeconds / 3600}
              disabled={!overview.canManage}
              max={744}
              min={0}
              name="uploadHours"
              required
              step={0.25}
              type="number"
            />
          </label>
        </div>
        <div className="video-policy-switches">
          <label className="operator-switch">
            <input
              defaultChecked={overview.settings.enforceLiveLimit}
              disabled={!overview.canManage}
              name="enforceLiveLimit"
              type="checkbox"
              value="true"
            />
            <span>
              <strong>Apply global live ceiling</strong>
              Cap plan allowances at this live-broadcast maximum.
            </span>
          </label>
          <label className="operator-switch">
            <input
              defaultChecked={overview.settings.enforceUploadLimit}
              disabled={!overview.canManage}
              name="enforceUploadLimit"
              type="checkbox"
              value="true"
            />
            <span>
              <strong>Apply global upload ceiling</strong>
              Cap plan allowances at this uploaded-video maximum.
            </span>
          </label>
        </div>
        <label>
          <span>Audit reason</span>
          <input
            disabled={!overview.canManage}
            minLength={8}
            name="reason"
            placeholder="Why the global video policy is changing"
            required
          />
        </label>
        <label className="operator-confirmation">
          <input
            disabled={!overview.canManage}
            name="confirmed"
            required
            type="checkbox"
            value="true"
          />
          <span>
            <strong>I reviewed both allowances and enforcement states.</strong>
            This changes the platform ceiling for every player without a
            person-specific override; plan limits remain enforced.
          </span>
        </label>
        <footer className="operator-form-footer">
          <ActionNotice state={state} />
          <button
            className="hq-button hq-button--primary"
            disabled={!overview.canManage || pending}
            type="submit"
          >
            {pending ? "Saving…" : "Save video policy"}
          </button>
        </footer>
      </form>
    </section>
  );
}

function GrantComplimentary({ canManage }: { readonly canManage: boolean }) {
  const [state, action, pending] = useActionState(
    grantComplimentaryDunaPlusAction,
    initialState,
  );
  return (
    <section className="hq-card video-grant-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Super Admin entitlement</span>
          <h2>Grant Complimentary Premium+</h2>
          <p>
            Grant by email before or after the person creates an account. Leave
            the end date empty for an indefinite entitlement.
          </p>
        </div>
        <Gift aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--two">
          <label>
            <span>Player email</span>
            <input
              disabled={!canManage}
              name="email"
              placeholder="player@example.com"
              required
              type="email"
            />
          </label>
          <label>
            <span>End date · optional</span>
            <input disabled={!canManage} name="endDate" type="date" />
          </label>
          <label className="operator-field--full">
            <span>Audit reason</span>
            <input
              disabled={!canManage}
              minLength={8}
              name="reason"
              placeholder="Why this person receives Complimentary Premium+"
              required
            />
          </label>
        </div>
        <label className="operator-confirmation">
          <input
            disabled={!canManage}
            name="confirmed"
            required
            type="checkbox"
            value="true"
          />
          <span>
            <strong>I reviewed the person, duration, and reason.</strong>
            This creates a local Premium+ entitlement; it does not create or
            alter a Stripe subscription.
          </span>
        </label>
        <footer className="operator-form-footer">
          <ActionNotice state={state} />
          <button
            className="hq-button hq-button--primary"
            disabled={!canManage || pending}
            type="submit"
          >
            {pending ? "Granting…" : "Grant Complimentary Premium+"}
          </button>
        </footer>
      </form>
    </section>
  );
}

function GrantRow({
  canManage,
  grant,
}: {
  readonly canManage: boolean;
  readonly grant: DunaPlusGrant;
}) {
  const [state, action, pending] = useActionState(
    revokeComplimentaryDunaPlusAction,
    initialState,
  );
  const expired = Boolean(
    grant.endsAt && new Date(grant.endsAt).getTime() < Date.now(),
  );
  const active = grant.status === "active" && !expired;
  return (
    <article className="video-grant-row">
      <div className="video-grant-identity">
        <span>
          <Gift aria-hidden size={17} />
        </span>
        <div>
          <strong>{grant.displayName ?? grant.email}</strong>
          {grant.displayName && <small>{grant.email}</small>}
          <small>
            {grant.endsAt
              ? `Through ${formatDate(grant.endsAt)}`
              : "Indefinite"}{" "}
            · {grant.reason}
          </small>
        </div>
      </div>
      <Badge tone={active ? "positive" : "neutral"}>
        {active ? "Complimentary Premium+" : expired ? "expired" : grant.status}
      </Badge>
      {active && canManage ? (
        <form action={action} className="video-grant-revoke">
          <input name="grantId" type="hidden" value={grant.id} />
          <input
            aria-label={`Reason to revoke ${grant.email}`}
            minLength={8}
            name="reason"
            placeholder="Revocation reason"
            required
          />
          <label>
            <input name="confirmed" required type="checkbox" value="true" />
            Confirm
          </label>
          <button
            aria-label={`Revoke Complimentary Premium+ for ${grant.email}`}
            className="hq-button hq-button--secondary"
            disabled={pending}
            type="submit"
          >
            <Trash2 aria-hidden size={15} />
            {pending ? "Revoking…" : "Revoke"}
          </button>
          <ActionNotice state={state} />
        </form>
      ) : null}
    </article>
  );
}

function EntitlementList({
  overview,
}: {
  readonly overview: AdminVideoOverview;
}) {
  return (
    <section className="hq-card video-entitlement-list">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Entitlement register</span>
          <h2>Complimentary Premium+ grants</h2>
        </div>
        <Badge>{overview.grants.length}</Badge>
      </header>
      <div>
        {overview.grants.map((grant) => (
          <GrantRow
            canManage={overview.canManage}
            grant={grant}
            key={grant.id}
          />
        ))}
        {overview.grants.length === 0 && (
          <div className="hq-empty">
            <strong>No complimentary grants yet.</strong>
            <span>New grants will appear here with their audit reason.</span>
          </div>
        )}
      </div>
    </section>
  );
}

function calibrationStatusTone(
  status: VisionCalibrationReviewSample["status"],
): "neutral" | "positive" | "warning" | "danger" {
  if (status === "approved" || status === "trained") return "positive";
  if (status === "rejected") return "danger";
  if (status === "pending") return "warning";
  return "neutral";
}

function CalibrationSampleRow({
  canManage,
  sample,
}: {
  readonly canManage: boolean;
  readonly sample: VisionCalibrationReviewSample;
}) {
  const [state, action, pending] = useActionState(
    reviewVisionCalibrationSampleAction,
    initialState,
  );
  return (
    <article className="video-calibration-sample">
      <div
        aria-label={
          sample.previewDataUrl
            ? `Court setup preview for ${sample.videoTitle}`
            : "Court setup preview unavailable"
        }
        className={`video-calibration-preview${sample.previewDataUrl ? " video-calibration-preview--available" : ""}`}
        role="img"
        style={
          sample.previewDataUrl
            ? { backgroundImage: `url(${sample.previewDataUrl})` }
            : undefined
        }
      >
        <ScanLine aria-hidden size={28} />
        <span>{sample.qualityScore ?? "—"}/100</span>
      </div>
      <div className="video-calibration-copy">
        <div>
          <span>
            <strong>{sample.videoTitle}</strong>
            <small>{sample.owner.displayName}</small>
          </span>
          <Badge tone={calibrationStatusTone(sample.status)}>
            {sample.status}
          </Badge>
        </div>
        <small>
          {sample.sourceModelVersion ?? "Unversioned detector"} · queued{" "}
          {formatDate(sample.createdAt)}
        </small>
        {sample.reviewedAt && (
          <p>
            Reviewed {formatDate(sample.reviewedAt)}
            {sample.reviewedByName ? ` by ${sample.reviewedByName}` : ""}.{" "}
            {sample.reviewNotes}
          </p>
        )}
      </div>
      {sample.status === "pending" ? (
        <form action={action} className="video-calibration-review">
          <input name="sampleId" type="hidden" value={sample.id} />
          <label>
            <span>Reviewer notes</span>
            <textarea
              disabled={!canManage}
              maxLength={1_000}
              minLength={8}
              name="notes"
              placeholder="Are court, net, and visible/off-screen landmarks accurate?"
              required
              rows={3}
            />
          </label>
          <label className="video-calibration-confirm">
            <input
              disabled={!canManage}
              name="confirmed"
              required
              type="checkbox"
              value="true"
            />
            <span>I reviewed the image and geometry.</span>
          </label>
          <div>
            <button
              className="hq-button hq-button--secondary"
              disabled={!canManage || pending}
              name="decision"
              type="submit"
              value="rejected"
            >
              Reject
            </button>
            <button
              className="hq-button hq-button--primary"
              disabled={!canManage || pending}
              name="decision"
              type="submit"
              value="approved"
            >
              Approve sample
            </button>
          </div>
          <ActionNotice state={state} />
        </form>
      ) : null}
    </article>
  );
}

function VisionLearningReview({
  overview,
}: {
  readonly overview: AdminVideoOverview;
}) {
  const learning = overview.visionLearning;
  return (
    <section className="hq-card video-learning-review">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Duna Vision learning lab</span>
          <h2>Consent-based calibration review</h2>
          <p>
            Players explicitly opt in. Reviewers see only the setup preview and
            court geometry; approval adds a sample to a controlled future
            training set and never starts training automatically.
          </p>
        </div>
        <div className="video-learning-policy">
          <BrainCircuit aria-hidden size={24} />
          <Badge tone="positive">Human review required</Badge>
        </div>
      </header>
      <div className="video-learning-summary">
        <article>
          <strong>{learning.counts.pending}</strong>
          <span>Awaiting review</span>
        </article>
        <article>
          <strong>{learning.counts.approved}</strong>
          <span>Approved samples</span>
        </article>
        <article>
          <strong>{learning.counts.rejected}</strong>
          <span>Rejected samples</span>
        </article>
        <article>
          <span>
            <ThumbsUp aria-hidden size={16} />
            {learning.insightFeedback.helpful}
          </span>
          <span>
            <ThumbsDown aria-hidden size={16} />
            {learning.insightFeedback.notHelpful}
          </span>
          <small>Player insight feedback</small>
        </article>
      </div>
      <div className="video-calibration-queue">
        {learning.calibrationSamples.map((sample) => (
          <CalibrationSampleRow
            canManage={overview.canManage}
            key={sample.id}
            sample={sample}
          />
        ))}
        {learning.calibrationSamples.length === 0 && (
          <div className="hq-empty">
            <strong>No consented calibration samples yet.</strong>
            <span>
              New samples appear only after a player opts in and attaches a Duna
              Vision session to their recording.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function UsageTables({ overview }: { readonly overview: AdminVideoOverview }) {
  return (
    <div className="video-admin-lower">
      <section className="hq-card video-live-list">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Mux ingest</span>
            <h2>Live now</h2>
          </div>
          <Badge tone={overview.activeStreams.length ? "live" : "neutral"}>
            {overview.activeStreams.length}
          </Badge>
        </header>
        {overview.activeStreams.map((stream) => (
          <article key={stream.id}>
            <Radio aria-hidden size={17} />
            <div>
              <strong>{stream.title}</strong>
              <small>
                {stream.owner.displayName} ·{" "}
                {stream.match?.label ?? stream.event?.title ?? stream.category}
              </small>
            </div>
            <Badge tone="live">{stream.liveVisibility}</Badge>
          </article>
        ))}
        {overview.activeStreams.length === 0 && (
          <div className="hq-empty">
            <strong>No one is live right now.</strong>
            <span>Active Mux streams will appear here.</span>
          </div>
        )}
      </section>

      <section className="hq-card video-usage-list">
        <header className="hq-card-heading">
          <div>
            <span className="hq-eyebrow">Current billing month</span>
            <h2>Highest video usage</h2>
          </div>
          <UsersRound aria-hidden size={22} />
        </header>
        {overview.topUsage.map(({ person, usage, videoCount }) => (
          <article key={person.id}>
            <div>
              <strong>{person.displayName}</strong>
              <small>
                {videoCount} videos · {formatHours(usage.live.usedSeconds)} live
                · {formatHours(usage.uploads.usedSeconds)} uploaded
              </small>
            </div>
            <div className="video-usage-bars" aria-hidden>
              <i
                style={{
                  width: `${Math.min(
                    100,
                    usage.live.limitSeconds
                      ? (usage.live.usedSeconds / usage.live.limitSeconds) * 100
                      : 0,
                  )}%`,
                }}
              />
              <i
                style={{
                  width: `${Math.min(
                    100,
                    usage.uploads.limitSeconds
                      ? (usage.uploads.usedSeconds /
                          usage.uploads.limitSeconds) *
                          100
                      : 0,
                  )}%`,
                }}
              />
            </div>
          </article>
        ))}
        {overview.topUsage.length === 0 && (
          <div className="hq-empty">
            <strong>No monthly usage yet.</strong>
            <span>
              Player usage will appear after the first stream or upload.
            </span>
          </div>
        )}
      </section>
    </div>
  );
}

export function VideoAdminControls({
  overview,
}: {
  readonly overview: AdminVideoOverview;
}) {
  const metrics = [
    { label: "Videos", value: overview.totals.videos, icon: Database },
    { label: "Live now", value: overview.totals.liveNow, icon: Radio },
    {
      label: "R2 storage",
      value: formatBytes(overview.totals.storageBytes),
      icon: HardDrive,
    },
    {
      label: "Watched",
      value: formatHours(overview.totals.watchedSeconds),
      icon: Clock3,
    },
    {
      label: "Complimentary",
      value: overview.totals.complimentarySubscribers,
      icon: Gift,
    },
  ] as const;

  return (
    <div className="video-admin-controls">
      {!overview.canManage && (
        <section className="hq-card feature-flag-readonly">
          <ShieldCheck aria-hidden size={22} />
          <div>
            <strong>Read-only platform access</strong>
            <p>
              Video operations are visible to administrators. Complimentary
              grants and quota policy changes require Super Admin access.
            </p>
          </div>
        </section>
      )}

      <section className="video-admin-metrics">
        {metrics.map(({ label, value, icon: Icon }) => (
          <article className="hq-card" key={label}>
            <span>
              <small>{label}</small>
              <Icon aria-hidden size={17} />
            </span>
            <Numeric>{value}</Numeric>
          </article>
        ))}
      </section>

      <section className="video-provider-grid">
        <article className="hq-card">
          <Cloud aria-hidden size={22} />
          <div>
            <strong>Mux live + playback</strong>
            <small>RTMPS ingest, secure playback, recordings, and Data</small>
          </div>
          <Badge tone={overview.muxConfigured ? "positive" : "warning"}>
            {overview.muxConfigured ? "configured" : "needs environment"}
          </Badge>
        </article>
        <article className="hq-card">
          <HardDrive aria-hidden size={22} />
          <div>
            <strong>Cloudflare R2 uploads</strong>
            <small>Private multipart originals with signed playback</small>
          </div>
          <Badge tone={overview.r2Configured ? "positive" : "warning"}>
            {overview.r2Configured ? "configured" : "needs environment"}
          </Badge>
        </article>
      </section>

      <div className="video-admin-grid">
        <QuotaPolicy overview={overview} />
        <GrantComplimentary canManage={overview.canManage} />
      </div>
      <VisionLearningReview overview={overview} />
      <EntitlementList overview={overview} />
      <UsageTables overview={overview} />
    </div>
  );
}
