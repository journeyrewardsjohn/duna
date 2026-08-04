"use client";

import type { PlayerSettings } from "@duna/api";
import { Badge } from "@duna/ui";
import { ExternalLink, Link2, Save, ShieldCheck, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, useTransition } from "react";
import {
  connectPlayerSourceAction,
  createGuardianInvitationAction,
  reviewPlayerSourceAction,
  startIdentityVerificationAction,
  updatePlayingProfileAction,
} from "@/app/app/settings/actions";
import { HeightInput } from "@/components/height-input";

function splitName(value: string) {
  const parts = value.trim().split(/\s+/);
  return { given: parts[0] ?? "", family: parts.slice(1).join(" ") };
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

  useEffect(() => {
    if (
      !settings.sourceConnections.some((connection) =>
        ["queued", "syncing"].includes(connection.status),
      )
    ) {
      return;
    }
    const interval = window.setInterval(() => router.refresh(), 3_000);
    return () => window.clearInterval(interval);
  }, [router, settings.sourceConnections]);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setNotice(undefined);
    startTransition(async () => {
      const response = await updatePlayingProfileAction({
        legalGivenName: form.legalGivenName,
        legalMiddleName: form.legalMiddleName,
        legalFamilyName: form.legalFamilyName,
        heightMillimeters: form.heightMillimeters,
        playingExperience: form.playingExperience,
        playedIndoorPrior: form.playedIndoorPrior,
        yearsPlaying: form.yearsPlaying,
        collegeName: form.collegeName,
        experienceSummary: form.experienceSummary,
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      for (const connection of [
        {
          source: "volleyball-life" as const,
          profileUrl: form.volleyballLifeUrl.trim(),
        },
        {
          source: "bvbinfo" as const,
          profileUrl:
            form.playingExperience === "professional"
              ? form.bvbInfoUrl.trim()
              : "",
        },
      ]) {
        if (!connection.profileUrl) continue;
        const sourceResponse = await connectPlayerSourceAction(connection);
        if (!sourceResponse.ok) {
          setError(sourceResponse.error);
          return;
        }
      }
      setNotice("Private identity and playing history saved.");
      router.refresh();
    });
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
    setError(undefined);
    startTransition(async () => {
      const response = await reviewPlayerSourceAction({
        connectionId,
        decision,
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setNotice(
        decision === "confirmed"
          ? "Profile confirmed. Duna is now importing and rating the verified match history."
          : "Profile rejected. It was disconnected and will not affect this player.",
      );
      router.refresh();
    });
  }

  const connectionStatus = (source: "volleyball-life" | "bvbinfo") =>
    settings.sourceConnections.find(
      (connection) => connection.source === source,
    )?.status;

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

      <form className="settings-form" onSubmit={save}>
        <div className="settings-form__title">
          <ShieldCheck aria-hidden size={20} />
          <span>
            <strong>Legal identity + playing background</strong>
            <small>
              Legal name and birthday stay private. Height is optional.
            </small>
          </span>
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
        <label>
          Playing story
          <textarea
            maxLength={1_500}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                experienceSummary: event.target.value,
              }))
            }
            rows={4}
            value={form.experienceSummary}
          />
        </label>
        <div className="source-link-grid">
          <label>
            <span>
              <Link2 /> VolleyballLife profile
              {connectionStatus("volleyball-life") && (
                <Badge tone="neutral">
                  {sourceStatusLabel(connectionStatus("volleyball-life")!)}
                </Badge>
              )}
            </span>
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
          {form.playingExperience === "professional" && (
            <label>
              <span>
                <Link2 /> BVBInfo profile
                {connectionStatus("bvbinfo") && (
                  <Badge tone="neutral">
                    {sourceStatusLabel(connectionStatus("bvbinfo")!)}
                  </Badge>
                )}
              </span>
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
          )}
        </div>
        {settings.sourceConnections.map((connection) => {
          const snapshot = connection.profileSnapshot;
          const displayName =
            typeof snapshot.displayName === "string"
              ? snapshot.displayName
              : undefined;
          const avatarUrl =
            typeof snapshot.avatarUrl === "string"
              ? snapshot.avatarUrl
              : undefined;
          const profileFacts = [
            typeof snapshot.hometown === "string"
              ? snapshot.hometown
              : undefined,
            typeof snapshot.height === "string" ? snapshot.height : undefined,
            typeof snapshot.eventFinishes === "number"
              ? `${snapshot.eventFinishes} event finishes`
              : undefined,
            typeof snapshot.externalRating === "number"
              ? `TruVolley ${snapshot.externalRating.toFixed(3)}`
              : undefined,
          ].filter((fact): fact is string => Boolean(fact));
          return (
            <article className="source-import-status" key={connection.id}>
              {avatarUrl ? (
                <Image
                  alt=""
                  height={44}
                  src={avatarUrl}
                  unoptimized
                  width={44}
                />
              ) : (
                <span className="avatar">
                  {(displayName ?? connection.source).slice(0, 2).toUpperCase()}
                </span>
              )}
              <div>
                <strong>
                  {displayName ??
                    (connection.source === "volleyball-life"
                      ? "VolleyballLife"
                      : "BVBInfo")}
                </strong>
                <small>
                  {connection.status === "syncing" ||
                  connection.status === "queued"
                    ? `Importing · ${connection.progress.phase.replaceAll("-", " ")}`
                    : `${connection.progress.matchesFound} matches · ${connection.progress.profilesFound} connected players`}
                </small>
                {profileFacts.length > 0 && (
                  <small>{profileFacts.join(" · ")}</small>
                )}
                {connection.progress.total > 0 && (
                  <progress
                    max={connection.progress.total}
                    value={connection.progress.current}
                  />
                )}
                {connection.status === "failed" && connection.lastError && (
                  <small className="source-import-status__error" role="alert">
                    {connection.lastError} Review the profile link, then save
                    again to retry.
                  </small>
                )}
                {connection.status === "review-required" &&
                  connection.verificationStatus === "pending" && (
                    <span className="source-import-status__actions">
                      <button
                        disabled={isPending}
                        onClick={() => reviewSource(connection.id, "confirmed")}
                        type="button"
                      >
                        This is me
                      </button>
                      <button
                        disabled={isPending}
                        onClick={() => reviewSource(connection.id, "rejected")}
                        type="button"
                      >
                        Not my profile
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
                {sourceStatusLabel(connection.status)}
              </Badge>
            </article>
          );
        })}
        <button className="primary-action" disabled={isPending} type="submit">
          <Save />
          {isPending ? "Saving…" : "Save player details"}
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
