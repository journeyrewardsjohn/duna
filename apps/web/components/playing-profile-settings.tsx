"use client";

import type { PlayerSettings } from "@duna/api";
import { Badge } from "@duna/ui";
import { ExternalLink, Link2, Save, ShieldCheck, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import {
  connectPlayerSourceAction,
  createGuardianInvitationAction,
  reviewPlayerSourceAction,
  retryPlayerSourceAction,
  startIdentityVerificationAction,
  updatePlayingProfileAction,
} from "@/app/app/settings/actions";
import { HeightInput } from "@/components/height-input";

type PlayerSourceConnection = PlayerSettings["sourceConnections"][number];
type SourceAction = "confirming" | "queued" | "rejecting" | "retrying";

function splitName(value: string) {
  const parts = value.trim().split(/\s+/);
  return { given: parts[0] ?? "", family: parts.slice(1).join(" ") };
}

function sourceName(source: PlayerSourceConnection["source"]) {
  return source === "volleyball-life" ? "VolleyballLife" : "BVBInfo";
}

function sourceStatusLabel(
  status: PlayerSettings["sourceConnections"][number]["status"],
) {
  switch (status) {
    case "review-required":
      return "Confirm profile";
    case "queued":
      return "Import queued";
    case "syncing":
      return "Importing";
    case "linked":
      return "Linked";
    case "failed":
      return "Import needs attention";
    case "disconnected":
      return "Disconnected";
    default:
      return "Unknown";
  }
}

function sourceImportStage(connection: PlayerSourceConnection) {
  const { current, matchesFound, profilesFound, total } = connection.progress;
  const source = sourceName(connection.source);
  const eventProgress =
    total > 0
      ? `${Math.min(current, total)} of ${total} public events`
      : undefined;

  if (connection.status === "queued") {
    return "Queued — Duna is starting the public-history import.";
  }
  if (connection.status === "review-required") {
    return "Profile found — confirm that it is yours before anything is linked.";
  }
  if (connection.status === "linked") {
    const results = [
      matchesFound > 0
        ? `${matchesFound} imported ${matchesFound === 1 ? "match" : "matches"}`
        : undefined,
      profilesFound > 1 ? `${profilesFound} connected players` : undefined,
    ].filter((value): value is string => Boolean(value));
    return results.length > 0
      ? `Linked — ${results.join(" · ")}.`
      : "Linked — Duna will refresh new public results automatically.";
  }
  if (connection.status === "failed") {
    return "The saved link needs a fresh import attempt.";
  }
  if (connection.status === "disconnected") {
    return "This public profile is no longer linked.";
  }

  switch (connection.progress.phase) {
    case "fetching-profile":
      return `Step 1 of 3 — checking the ${source} profile.`;
    case "fetching-finishes":
      return "Step 1 of 3 — finding published event results.";
    case "checking-rating":
      return "Step 1 of 3 — reading the public profile details.";
    case "profile-found":
      return total > 0
        ? `Step 2 of 3 — ${total} public ${total === 1 ? "event" : "events"} found. Collecting history.`
        : "Step 2 of 3 — profile found. Checking public history.";
    case "fetching-career-pages":
    case "fetching-match-history":
      return eventProgress
        ? `Step 2 of 3 — collecting ${eventProgress}.`
        : "Step 2 of 3 — collecting public match history.";
    case "reading-match-history":
      return eventProgress
        ? `Step 2 of 3 — reading ${eventProgress}${matchesFound > 0 ? ` · ${matchesFound} matches found` : ""}.`
        : "Step 2 of 3 — reading public match history.";
    case "matching-history":
      return `Step 3 of 3 — linking verified history${matchesFound > 0 ? ` · ${matchesFound} matches found` : ""}.`;
    case "confirm-profile":
      return "Profile found — waiting for your confirmation.";
    default:
      return "Duna is importing and linking the available public history.";
  }
}

function SourceImportStatus({
  action,
  connection,
  disabled,
  onReview,
  onRetry,
}: {
  readonly action?: SourceAction;
  readonly connection: PlayerSourceConnection;
  readonly disabled: boolean;
  readonly onReview: (
    connectionId: string,
    decision: "confirmed" | "rejected",
  ) => void;
  readonly onRetry: (connectionId: string) => void;
}) {
  const snapshot = connection.profileSnapshot;
  const displayName =
    typeof snapshot.displayName === "string" ? snapshot.displayName : undefined;
  const avatarUrl =
    typeof snapshot.avatarUrl === "string" ? snapshot.avatarUrl : undefined;
  const profileFacts = [
    typeof snapshot.hometown === "string" ? snapshot.hometown : undefined,
    typeof snapshot.height === "string" ? snapshot.height : undefined,
    typeof snapshot.eventFinishes === "number"
      ? `${snapshot.eventFinishes} event finishes`
      : undefined,
    typeof snapshot.externalRating === "number"
      ? `TruVolley ${snapshot.externalRating.toFixed(3)}`
      : undefined,
  ].filter((fact): fact is string => Boolean(fact));
  const isImporting = ["queued", "syncing"].includes(connection.status);
  const actionPending = Boolean(action);
  const actionLabel =
    action === "confirming"
      ? "Confirming…"
      : action === "queued"
        ? "Import queued"
        : action === "rejecting"
          ? "Removing…"
          : action === "retrying"
            ? "Retrying…"
            : undefined;

  return (
    <article
      aria-busy={actionPending || isImporting}
      className="source-import-status"
    >
      {avatarUrl ? (
        <Image alt="" height={44} src={avatarUrl} unoptimized width={44} />
      ) : (
        <span className="avatar">
          {(displayName ?? connection.source).slice(0, 2).toUpperCase()}
        </span>
      )}
      <div>
        <strong>{displayName ?? sourceName(connection.source)}</strong>
        <small aria-live={isImporting || actionPending ? "polite" : undefined}>
          {actionLabel ?? sourceImportStage(connection)}
        </small>
        {profileFacts.length > 0 && (
          <small className="source-import-status__facts">
            {profileFacts.join(" · ")}
          </small>
        )}
        {isImporting && connection.progress.total > 0 && (
          <span className="source-import-status__progress">
            <progress
              aria-label={`${sourceName(connection.source)} import progress`}
              max={connection.progress.total}
              value={connection.progress.current}
            />
            <small>
              {connection.progress.current > 0
                ? `${Math.min(connection.progress.current, connection.progress.total)} of ${connection.progress.total} complete`
                : "Starting now"}
            </small>
          </span>
        )}
        {connection.status === "failed" && connection.lastError && (
          <small className="source-import-status__error" role="alert">
            We could not import this public history yet. Your source link is
            saved, and no player details were lost.
          </small>
        )}
        {connection.status === "review-required" &&
          connection.verificationStatus === "pending" && (
            <span className="source-import-status__actions">
              <button
                disabled={disabled || actionPending}
                onClick={() => onReview(connection.id, "confirmed")}
                type="button"
              >
                {action === "confirming" || action === "queued"
                  ? actionLabel
                  : "This is me"}
              </button>
              <button
                disabled={disabled || actionPending}
                onClick={() => onReview(connection.id, "rejected")}
                type="button"
              >
                {action === "rejecting" ? "Removing…" : "Not my profile"}
              </button>
            </span>
          )}
        {connection.status === "failed" && (
          <span className="source-import-status__actions">
            <button
              disabled={disabled || actionPending}
              onClick={() => onRetry(connection.id)}
              type="button"
            >
              {action === "retrying" || action === "queued"
                ? actionLabel
                : "Retry import"}
            </button>
          </span>
        )}
      </div>
      <Badge
        tone={
          connection.status === "linked"
            ? "positive"
            : connection.status === "failed"
              ? "warning"
              : "neutral"
        }
      >
        {action === "queued"
          ? "Starting"
          : sourceStatusLabel(connection.status)}
      </Badge>
    </article>
  );
}

export function PlayingProfileSettings({
  settings,
}: {
  readonly settings: PlayerSettings;
}) {
  const profile = settings.profile;
  const router = useRouter();
  const fallbackName = splitName(profile.person.displayName);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [guardianInviteUrl, setGuardianInviteUrl] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<
    "ready" | "saving" | "linking" | "saved"
  >("ready");
  const [sourceActions, setSourceActions] = useState<
    Readonly<Record<string, SourceAction | undefined>>
  >({});
  const [form, setForm] = useState({
    legalGivenName: profile.legalGivenName ?? fallbackName.given,
    legalMiddleName: profile.legalMiddleName ?? "",
    legalFamilyName: profile.legalFamilyName ?? fallbackName.family,
    heightMillimeters: profile.heightMillimeters,
    playingExperience:
      profile.playingExperience === "not-set"
        ? ("amateur" as const)
        : profile.playingExperience,
    playedIndoorPrior: profile.playedIndoorPrior ?? false,
    yearsPlaying: profile.yearsPlaying ?? 0,
    collegeName: profile.collegeName ?? "",
    experienceSummary: profile.experienceSummary ?? "",
    volleyballLifeUrl:
      settings.sourceConnections.find(
        (connection) => connection.source === "volleyball-life",
      )?.profileUrl ?? "",
    bvbInfoUrl:
      settings.sourceConnections.find(
        (connection) => connection.source === "bvbinfo",
      )?.profileUrl ?? "",
  });
  const formRef = useRef(form);
  formRef.current = form;
  const savedProfileFingerprint = useRef(
    JSON.stringify({
      legalGivenName: profile.legalGivenName ?? fallbackName.given,
      legalMiddleName: profile.legalMiddleName ?? "",
      legalFamilyName: profile.legalFamilyName ?? fallbackName.family,
      heightMillimeters: profile.heightMillimeters,
      playingExperience:
        profile.playingExperience === "not-set"
          ? ("amateur" as const)
          : profile.playingExperience,
      playedIndoorPrior: profile.playedIndoorPrior ?? false,
      yearsPlaying: profile.yearsPlaying ?? 0,
      collegeName: profile.collegeName ?? "",
      experienceSummary: profile.experienceSummary ?? "",
    }),
  );
  const savedSourceUrls = useRef({
    "volleyball-life": form.volleyballLifeUrl.trim(),
    bvbinfo: form.bvbInfoUrl.trim(),
  });
  const saveInFlight = useRef(false);
  const saveQueued = useRef(false);
  const sourceActionInFlight = useRef(new Set<string>());
  const sourceActionTimeouts = useRef(new Map<string, number>());

  useEffect(() => {
    const hasActiveImport = settings.sourceConnections.some((connection) =>
      ["queued", "syncing"].includes(connection.status),
    );
    if (!hasActiveImport && Object.keys(sourceActions).length === 0) {
      return;
    }
    const interval = window.setInterval(() => router.refresh(), 3_000);
    return () => window.clearInterval(interval);
  }, [router, settings.sourceConnections, sourceActions]);

  useEffect(() => {
    setSourceActions((current) => {
      const next = { ...current };
      let changed = false;
      for (const connection of settings.sourceConnections) {
        if (
          next[connection.id] &&
          !["review-required", "failed"].includes(connection.status)
        ) {
          delete next[connection.id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [settings.sourceConnections]);

  useEffect(
    () => () => {
      for (const timeout of sourceActionTimeouts.current.values()) {
        window.clearTimeout(timeout);
      }
      sourceActionTimeouts.current.clear();
    },
    [],
  );

  function clearSourceAction(connectionId: string) {
    const timeout = sourceActionTimeouts.current.get(connectionId);
    if (timeout !== undefined) {
      window.clearTimeout(timeout);
      sourceActionTimeouts.current.delete(connectionId);
    }
    setSourceActions((current) => {
      if (!current[connectionId]) return current;
      const next = { ...current };
      delete next[connectionId];
      return next;
    });
  }

  function keepSourceActionVisible(connectionId: string) {
    const timeout = sourceActionTimeouts.current.get(connectionId);
    if (timeout !== undefined) window.clearTimeout(timeout);
    sourceActionTimeouts.current.set(
      connectionId,
      window.setTimeout(() => clearSourceAction(connectionId), 6_000),
    );
  }

  async function persistPlayerDetails({
    automatic = false,
  }: { readonly automatic?: boolean } = {}) {
    if (saveInFlight.current) {
      saveQueued.current = true;
      return;
    }
    setError(undefined);
    setNotice(undefined);
    const currentForm = formRef.current;
    const profileInput = {
      legalGivenName: currentForm.legalGivenName,
      legalMiddleName: currentForm.legalMiddleName,
      legalFamilyName: currentForm.legalFamilyName,
      heightMillimeters: currentForm.heightMillimeters,
      playingExperience: currentForm.playingExperience,
      playedIndoorPrior: currentForm.playedIndoorPrior,
      yearsPlaying: currentForm.yearsPlaying,
      collegeName: currentForm.collegeName,
      experienceSummary: currentForm.experienceSummary,
    };
    const profileFingerprint = JSON.stringify(profileInput);
    const sourceCandidates = [
      {
        source: "volleyball-life" as const,
        profileUrl: currentForm.volleyballLifeUrl.trim(),
      },
      {
        source: "bvbinfo" as const,
        profileUrl:
          currentForm.playingExperience === "professional"
            ? currentForm.bvbInfoUrl.trim()
            : "",
      },
    ];
    const changedConnections = sourceCandidates.filter(
      (connection) =>
        connection.profileUrl.length > 0 &&
        connection.profileUrl !== savedSourceUrls.current[connection.source],
    );
    const profileChanged =
      profileFingerprint !== savedProfileFingerprint.current;
    if (!profileChanged && changedConnections.length === 0) {
      if (!automatic) setNotice("Everything is already saved.");
      return;
    }

    saveInFlight.current = true;
    setIsSaving(true);
    setSaveState(changedConnections.length > 0 ? "linking" : "saving");
    try {
      if (profileChanged) {
        const response = await updatePlayingProfileAction(profileInput);
        if (!response.ok) {
          setError(response.error);
          return;
        }
        savedProfileFingerprint.current = profileFingerprint;
      }
      for (const connection of changedConnections) {
        const sourceResponse = await connectPlayerSourceAction(connection);
        if (!sourceResponse.ok) {
          setError(sourceResponse.error);
          return;
        }
        savedSourceUrls.current[connection.source] = connection.profileUrl;
      }
      setSaveState("saved");
      setNotice(
        changedConnections.length > 0
          ? "Profile auto-saved. Importing and linking the public match history now."
          : automatic
            ? "Profile auto-saved."
            : "Player details saved.",
      );
      router.refresh();
    } finally {
      saveInFlight.current = false;
      setIsSaving(false);
      if (saveQueued.current) {
        saveQueued.current = false;
        void persistPlayerDetails({ automatic: true });
      }
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void persistPlayerDetails();
  }

  function startIdentity() {
    setError(undefined);
    startTransition(async () => {
      const response = await startIdentityVerificationAction();
      if (!response.ok) {
        setError(response.error);
        return;
      }
      if (response.result.url) {
        window.location.assign(response.result.url);
      } else {
        setNotice("This identity is already verified.");
      }
    });
  }

  function createGuardianLink() {
    setError(undefined);
    startTransition(async () => {
      const response = await createGuardianInvitationAction({
        relationship: "Parent or legal guardian",
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setGuardianInviteUrl(response.result.inviteUrl);
      setNotice("Guardian link created. Share it with a parent or guardian.");
    });
  }

  function reviewSource(
    connectionId: string,
    decision: "confirmed" | "rejected",
  ) {
    if (sourceActionInFlight.current.has(connectionId)) return;
    sourceActionInFlight.current.add(connectionId);
    setError(undefined);
    setSourceActions((current) => ({
      ...current,
      [connectionId]: decision === "confirmed" ? "confirming" : "rejecting",
    }));
    if (decision === "confirmed") {
      setNotice(
        "Confirming this profile and starting the public-history import…",
      );
    }
    startTransition(async () => {
      try {
        const response = await reviewPlayerSourceAction({
          connectionId,
          decision,
        });
        if (!response.ok) {
          setError(response.error);
          clearSourceAction(connectionId);
          return;
        }
        setSourceActions((current) => ({
          ...current,
          [connectionId]: "queued",
        }));
        keepSourceActionVisible(connectionId);
        setNotice(
          decision === "confirmed"
            ? "Profile confirmed. Duna is importing and linking the public history now."
            : "Profile rejected. It was disconnected and will not affect this player.",
        );
        router.refresh();
      } catch {
        clearSourceAction(connectionId);
        setError("The profile choice could not be saved. Please try again.");
      } finally {
        sourceActionInFlight.current.delete(connectionId);
      }
    });
  }

  function retrySource(connectionId: string) {
    if (sourceActionInFlight.current.has(connectionId)) return;
    sourceActionInFlight.current.add(connectionId);
    setError(undefined);
    setSourceActions((current) => ({ ...current, [connectionId]: "retrying" }));
    setNotice(
      "Retrying the public-history import and linking it in the background…",
    );
    startTransition(async () => {
      try {
        const response = await retryPlayerSourceAction({ connectionId });
        if (!response.ok) {
          setError(response.error);
          clearSourceAction(connectionId);
          return;
        }
        setSourceActions((current) => ({
          ...current,
          [connectionId]: "queued",
        }));
        keepSourceActionVisible(connectionId);
        setNotice(
          "The import error was cleared. Duna is importing and linking this public history now.",
        );
        router.refresh();
      } catch {
        clearSourceAction(connectionId);
        setError("The source import could not be retried. Please try again.");
      } finally {
        sourceActionInFlight.current.delete(connectionId);
      }
    });
  }

  const sourceConnection = (source: PlayerSourceConnection["source"]) =>
    settings.sourceConnections.find(
      (connection) => connection.source === source,
    );
  const volleyballLifeConnection = sourceConnection("volleyball-life");
  const bvbInfoConnection = sourceConnection("bvbinfo");
  const showBvbInfo =
    form.playingExperience === "professional" || Boolean(bvbInfoConnection);

  return (
    <section id="playing-profile">
      <div className="settings-section__heading">
        <div>
          <span className="page-eyebrow">Private + competition</span>
          <h2>Player details</h2>
        </div>
        <Badge
          tone={
            profile.onboardingStatus === "complete" ? "positive" : "warning"
          }
        >
          {profile.onboardingStatus.replaceAll("-", " ")}
        </Badge>
      </div>

      {(notice || error) && (
        <p className={error ? "form-error" : "form-notice"} aria-live="polite">
          {error ?? notice}
        </p>
      )}

      <Link className="profile-onboarding-prompt" href="/app/onboarding">
        <span>
          <Sparkles />
          <span>
            <strong>Use guided setup or tell Duna your story</strong>
            <small>
              Voice turns a natural conversation into editable player details.
            </small>
          </span>
        </span>
        <span>Open onboarding</span>
      </Link>

      <form
        className="settings-form"
        onBlur={() => void persistPlayerDetails({ automatic: true })}
        onSubmit={save}
      >
        <div className="settings-form__title">
          <ShieldCheck aria-hidden size={20} />
          <span>
            <strong>Legal identity + playing background</strong>
            <small>
              Legal name and birthday stay private. Height is optional.
            </small>
          </span>
          <Badge tone={saveState === "saved" ? "positive" : "neutral"}>
            {isSaving
              ? saveState === "linking"
                ? "Importing and linking"
                : "Saving profile"
              : saveState === "saved"
                ? "Profile auto-saved"
                : "Changes save automatically"}
          </Badge>
        </div>
        <div className="form-grid form-grid--3">
          <label>
            Legal first name
            <input
              autoComplete="given-name"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  legalGivenName: event.target.value,
                }))
              }
              required
              value={form.legalGivenName}
            />
          </label>
          <label>
            Middle name <small>Optional</small>
            <input
              autoComplete="additional-name"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  legalMiddleName: event.target.value,
                }))
              }
              value={form.legalMiddleName}
            />
          </label>
          <label>
            Legal last name
            <input
              autoComplete="family-name"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  legalFamilyName: event.target.value,
                }))
              }
              required
              value={form.legalFamilyName}
            />
          </label>
          <HeightInput
            initialUnit={profile.measurementSystem}
            onChange={(heightMillimeters) =>
              setForm((current) => ({ ...current, heightMillimeters }))
            }
            value={form.heightMillimeters}
          />
          <label>
            Experience
            <select
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  playingExperience: event.target
                    .value as typeof current.playingExperience,
                }))
              }
              value={form.playingExperience}
            >
              <option value="amateur">Amateur</option>
              <option value="high-school">Played in high school</option>
              <option value="collegiate">Collegiate</option>
              <option value="professional">Professional</option>
            </select>
          </label>
          <label>
            Years playing
            <input
              max={100}
              min={0}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  yearsPlaying: Number(event.target.value),
                }))
              }
              required
              type="number"
              value={form.yearsPlaying}
            />
          </label>
          {form.playingExperience === "collegiate" && (
            <label>
              College or university
              <input
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    collegeName: event.target.value,
                  }))
                }
                placeholder="School name"
                value={form.collegeName}
              />
            </label>
          )}
        </div>
        <label className="settings-switch-row">
          <span>
            <strong>Played indoor before</strong>
            <small>
              School, club, collegiate, or professional indoor play.
            </small>
          </span>
          <span className="settings-switch">
            <input
              checked={form.playedIndoorPrior}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  playedIndoorPrior: event.target.checked,
                }))
              }
              type="checkbox"
            />
            <span aria-hidden="true" />
          </span>
        </label>
        <label className="playing-story-field">
          Playing story
          <small>
            Share the experience, roles, and goals you want Duna to understand.
          </small>
          <textarea
            maxLength={1_500}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                experienceSummary: event.target.value,
              }))
            }
            rows={7}
            value={form.experienceSummary}
          />
        </label>
        <div className="source-link-grid">
          <div className="source-history-source">
            <label className="source-link-card">
              <span>
                <Link2 /> VolleyballLife profile
              </span>
              <small>
                Paste or update the public profile link. Duna saves it
                automatically and shows the live import status here.
              </small>
              <input
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    volleyballLifeUrl: event.target.value,
                  }))
                }
                placeholder="volleyballlife.com/player/5520"
                value={form.volleyballLifeUrl}
              />
            </label>
            {volleyballLifeConnection && (
              <SourceImportStatus
                action={sourceActions[volleyballLifeConnection.id]}
                connection={volleyballLifeConnection}
                disabled={isPending || isSaving}
                onRetry={retrySource}
                onReview={reviewSource}
              />
            )}
          </div>
          {showBvbInfo && (
            <div className="source-history-source">
              <label className="source-link-card">
                <span>
                  <Link2 /> BVBInfo profile
                </span>
                <small>
                  Paste or update the public profile link. Duna saves it
                  automatically and shows the live import status here.
                </small>
                <input
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      bvbInfoUrl: event.target.value,
                    }))
                  }
                  placeholder="bvbinfo.com/player.asp?ID=…"
                  value={form.bvbInfoUrl}
                />
              </label>
              {bvbInfoConnection && (
                <SourceImportStatus
                  action={sourceActions[bvbInfoConnection.id]}
                  connection={bvbInfoConnection}
                  disabled={isPending || isSaving}
                  onRetry={retrySource}
                  onReview={reviewSource}
                />
              )}
            </div>
          )}
        </div>
        <button className="primary-action" disabled={isSaving} type="submit">
          <Save />
          {isSaving ? "Saving profile…" : "Save now"}
        </button>
      </form>

      {profile.ageBand === "adult" && (
        <article className="settings-identity-card">
          <ShieldCheck />
          <span>
            <strong>Identity verification for payouts</strong>
            <small>
              Document and selfie verification is securely hosted. Duna stores
              only status, timestamps, and provider references.
            </small>
          </span>
          <Badge
            tone={
              settings.identityVerification.status === "verified"
                ? "positive"
                : "warning"
            }
          >
            {settings.identityVerification.status.replaceAll("-", " ")}
          </Badge>
          <button
            disabled={
              isPending ||
              settings.identityVerification.status === "verified" ||
              !settings.identityVerification.configured
            }
            onClick={startIdentity}
            type="button"
          >
            Verify identity <ExternalLink />
          </button>
        </article>
      )}

      {profile.person.isMinor &&
        !settings.household.some((member) => member.role === "guardian") && (
          <article className="settings-guardian-link">
            <ShieldCheck />
            <span>
              <strong>A parent or guardian is required</strong>
              <small>
                Protected features remain locked until an adult accepts the link
                and Duna reviews the relationship.
              </small>
            </span>
            {guardianInviteUrl ? (
              <div className="guardian-link-box">
                <input readOnly value={guardianInviteUrl} />
                <button
                  onClick={() =>
                    void navigator.clipboard.writeText(guardianInviteUrl)
                  }
                  type="button"
                >
                  Copy link
                </button>
              </div>
            ) : (
              <button
                disabled={isPending}
                onClick={createGuardianLink}
                type="button"
              >
                Create guardian link
              </button>
            )}
          </article>
        )}
    </section>
  );
}
