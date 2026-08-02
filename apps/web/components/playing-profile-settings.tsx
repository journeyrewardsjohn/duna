"use client";

import type { PlayerSettings } from "@duna/api";
import { Badge } from "@duna/ui";
import { ExternalLink, Link2, Save, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import {
  connectPlayerSourceAction,
  createGuardianInvitationAction,
  startIdentityVerificationAction,
  updatePlayingProfileAction,
} from "@/app/app/settings/actions";

function splitName(value: string) {
  const parts = value.trim().split(/\s+/);
  return { given: parts[0] ?? "", family: parts.slice(1).join(" ") };
}

export function PlayingProfileSettings({
  settings,
}: {
  readonly settings: PlayerSettings;
}) {
  const profile = settings.profile;
  const fallbackName = splitName(profile.person.displayName);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [guardianInviteUrl, setGuardianInviteUrl] = useState<string>();
  const [form, setForm] = useState({
    legalGivenName: profile.legalGivenName ?? fallbackName.given,
    legalMiddleName: profile.legalMiddleName ?? "",
    legalFamilyName: profile.legalFamilyName ?? fallbackName.family,
    heightCentimeters: profile.heightMillimeters
      ? Math.round(profile.heightMillimeters / 10).toString()
      : "",
    playingExperience:
      profile.playingExperience === "not-set"
        ? ("amateur" as const)
        : profile.playingExperience,
    playedIndoorPrior: profile.playedIndoorPrior ?? false,
    yearsPlaying: profile.yearsPlaying ?? 0,
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

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setNotice(undefined);
    startTransition(async () => {
      const response = await updatePlayingProfileAction({
        legalGivenName: form.legalGivenName,
        legalMiddleName: form.legalMiddleName,
        legalFamilyName: form.legalFamilyName,
        heightMillimeters: form.heightCentimeters
          ? Math.round(Number(form.heightCentimeters) * 10)
          : undefined,
        playingExperience: form.playingExperience,
        playedIndoorPrior: form.playedIndoorPrior,
        yearsPlaying: form.yearsPlaying,
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
        setNotice("Stripe has already verified this identity.");
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
          <label>
            Height (cm) <small>Optional</small>
            <input
              max={260}
              min={60}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  heightCentimeters: event.target.value,
                }))
              }
              type="number"
              value={form.heightCentimeters}
            />
          </label>
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
                  {connectionStatus("volleyball-life")}
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
              placeholder="volleyballlife.com/playerprofile/…"
              value={form.volleyballLifeUrl}
            />
          </label>
          {form.playingExperience === "professional" && (
            <label>
              <span>
                <Link2 /> BVBInfo profile
                {connectionStatus("bvbinfo") && (
                  <Badge tone="neutral">{connectionStatus("bvbinfo")}</Badge>
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
        <button className="primary-action" disabled={isPending} type="submit">
          <Save />
          {isPending ? "Saving…" : "Save player details"}
        </button>
      </form>

      {profile.ageBand === "adult" && (
        <article className="settings-identity-card">
          <ShieldCheck />
          <span>
            <strong>Stripe Identity for payouts</strong>
            <small>
              Stripe hosts document and selfie verification. Duna stores only
              status, timestamps, and provider references.
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
            Verify with Stripe <ExternalLink />
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
