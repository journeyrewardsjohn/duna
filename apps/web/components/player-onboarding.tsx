"use client";

import type { PlayerSettings } from "@duna/api";
import { Badge } from "@duna/ui";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ExternalLink,
  Link2,
  Mic,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState, useTransition } from "react";
import {
  connectPlayerSourceAction,
  createGuardianInvitationAction,
  inferPlayingExperienceAction,
  recordBirthDateAction,
  startIdentityVerificationAction,
  updatePlayingProfileAction,
} from "@/app/app/settings/actions";
import { VoiceExperienceGuide } from "@/components/voice-experience-guide";

type Experience = "amateur" | "high-school" | "collegiate" | "professional";

const experienceOptions: readonly {
  value: Experience;
  title: string;
  detail: string;
}[] = [
  {
    value: "amateur",
    title: "Amateur",
    detail: "Pickup, club, recreational, or tournament play.",
  },
  {
    value: "high-school",
    title: "Played in HS",
    detail: "Freshman, JV, varsity, or high-school club.",
  },
  {
    value: "collegiate",
    title: "Collegiate",
    detail: "College club, NAIA, junior college, or NCAA.",
  },
  {
    value: "professional",
    title: "Professional",
    detail: "Paid, ranked, federation, AVP, FIVB, or world-tour play.",
  },
];

function splitDisplayName(displayName: string) {
  const parts = displayName.trim().split(/\s+/);
  return {
    given: parts[0] ?? "",
    family: parts.slice(1).join(" "),
  };
}

export function PlayerOnboarding({
  settings,
}: {
  readonly settings: PlayerSettings;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const subjects = useMemo(
    () => [
      {
        person: settings.profile.person,
        role: "self" as const,
        onboardingStatus: settings.profile.onboardingStatus,
      },
      ...settings.household
        .filter((member) => member.role === "dependent")
        .map((member) => ({
          person: member.person,
          role: "dependent" as const,
          onboardingStatus: member.onboardingStatus,
        })),
    ],
    [settings],
  );
  const [subjectId, setSubjectId] = useState(settings.profile.person.id);
  const subject =
    subjects.find((candidate) => candidate.person.id === subjectId) ??
    subjects[0]!;
  const isSelf = subject.person.id === settings.profile.person.id;
  const ownName = splitDisplayName(settings.profile.person.displayName);
  const subjectName = splitDisplayName(subject.person.displayName);
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [birthDate, setBirthDate] = useState(
    isSelf ? (settings.profile.birthDate ?? "") : "",
  );
  const [legalGivenName, setLegalGivenName] = useState(
    isSelf
      ? (settings.profile.legalGivenName ?? ownName.given)
      : subjectName.given,
  );
  const [legalMiddleName, setLegalMiddleName] = useState(
    isSelf ? (settings.profile.legalMiddleName ?? "") : "",
  );
  const [legalFamilyName, setLegalFamilyName] = useState(
    isSelf
      ? (settings.profile.legalFamilyName ?? ownName.family)
      : subjectName.family,
  );
  const [experience, setExperience] = useState<Experience>(
    isSelf && settings.profile.playingExperience !== "not-set"
      ? settings.profile.playingExperience
      : "amateur",
  );
  const [playedIndoorPrior, setPlayedIndoorPrior] = useState(
    isSelf ? (settings.profile.playedIndoorPrior ?? false) : false,
  );
  const [yearsPlaying, setYearsPlaying] = useState(
    isSelf ? (settings.profile.yearsPlaying ?? 0) : 0,
  );
  const [heightCentimeters, setHeightCentimeters] = useState(
    isSelf && settings.profile.heightMillimeters
      ? Math.round(settings.profile.heightMillimeters / 10).toString()
      : "",
  );
  const [experienceSummary, setExperienceSummary] = useState(
    isSelf ? (settings.profile.experienceSummary ?? "") : "",
  );
  const [volleyballLifeUrl, setVolleyballLifeUrl] = useState(
    isSelf
      ? (settings.sourceConnections.find(
          (connection) => connection.source === "volleyball-life",
        )?.profileUrl ?? "")
      : "",
  );
  const [bvbInfoUrl, setBvbInfoUrl] = useState(
    isSelf
      ? (settings.sourceConnections.find(
          (connection) => connection.source === "bvbinfo",
        )?.profileUrl ?? "")
      : "",
  );
  const [guardianInviteUrl, setGuardianInviteUrl] = useState<string>();

  function selectSubject(nextSubjectId: string) {
    const next = subjects.find(
      (candidate) => candidate.person.id === nextSubjectId,
    );
    if (!next) return;
    const names = splitDisplayName(next.person.displayName);
    setSubjectId(nextSubjectId);
    setLegalGivenName(
      nextSubjectId === settings.profile.person.id
        ? (settings.profile.legalGivenName ?? names.given)
        : names.given,
    );
    setLegalMiddleName(
      nextSubjectId === settings.profile.person.id
        ? (settings.profile.legalMiddleName ?? "")
        : "",
    );
    setLegalFamilyName(
      nextSubjectId === settings.profile.person.id
        ? (settings.profile.legalFamilyName ?? names.family)
        : names.family,
    );
    setExperience(
      nextSubjectId === settings.profile.person.id &&
        settings.profile.playingExperience !== "not-set"
        ? settings.profile.playingExperience
        : "amateur",
    );
    setPlayedIndoorPrior(
      nextSubjectId === settings.profile.person.id
        ? (settings.profile.playedIndoorPrior ?? false)
        : false,
    );
    setYearsPlaying(
      nextSubjectId === settings.profile.person.id
        ? (settings.profile.yearsPlaying ?? 0)
        : 0,
    );
    setHeightCentimeters(
      nextSubjectId === settings.profile.person.id &&
        settings.profile.heightMillimeters
        ? Math.round(settings.profile.heightMillimeters / 10).toString()
        : "",
    );
    setExperienceSummary(
      nextSubjectId === settings.profile.person.id
        ? (settings.profile.experienceSummary ?? "")
        : "",
    );
    setVolleyballLifeUrl("");
    setBvbInfoUrl("");
    setError(undefined);
    setNotice(undefined);
  }

  function applyNarrative(narrative: string) {
    if (!narrative.trim()) return;
    setExperienceSummary(narrative);
    setError(undefined);
    startTransition(async () => {
      const response = await inferPlayingExperienceAction(narrative);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      if (response.result.playingExperience) {
        setExperience(response.result.playingExperience);
      }
      if (response.result.playedIndoorPrior !== undefined) {
        setPlayedIndoorPrior(response.result.playedIndoorPrior);
      }
      if (response.result.yearsPlaying !== undefined) {
        setYearsPlaying(response.result.yearsPlaying);
      }
      if (response.result.heightMillimeters !== undefined) {
        setHeightCentimeters(
          Math.round(response.result.heightMillimeters / 10).toString(),
        );
      }
      setNotice(
        "Duna structured the conversation. Review each answer before saving.",
      );
    });
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setNotice(undefined);
    startTransition(async () => {
      if (isSelf && !settings.profile.birthDate) {
        const birthdayResponse = await recordBirthDateAction(birthDate);
        if (!birthdayResponse.ok) {
          setError(birthdayResponse.error);
          return;
        }
      }
      const profileResponse = await updatePlayingProfileAction({
        subjectPersonId: isSelf ? undefined : subject.person.id,
        legalGivenName,
        legalMiddleName,
        legalFamilyName,
        heightMillimeters: heightCentimeters
          ? Math.round(Number(heightCentimeters) * 10)
          : undefined,
        playingExperience: experience,
        playedIndoorPrior,
        yearsPlaying,
        experienceSummary,
      });
      if (!profileResponse.ok) {
        setError(profileResponse.error);
        return;
      }
      for (const connection of [
        {
          source: "volleyball-life" as const,
          profileUrl: volleyballLifeUrl.trim(),
        },
        {
          source: "bvbinfo" as const,
          profileUrl: experience === "professional" ? bvbInfoUrl.trim() : "",
        },
      ]) {
        if (!connection.profileUrl) continue;
        const sourceResponse = await connectPlayerSourceAction({
          subjectPersonId: isSelf ? undefined : subject.person.id,
          ...connection,
        });
        if (!sourceResponse.ok) {
          setError(sourceResponse.error);
          return;
        }
      }
      setStep(4);
      setNotice(
        profileResponse.result.guardianRequired
          ? "Playing profile saved. Connect a parent or guardian to unlock protected features."
          : "Playing profile saved. Any linked match history is now queued for import.",
      );
      router.refresh();
    });
  }

  function createGuardianLink() {
    setError(undefined);
    startTransition(async () => {
      const response = await createGuardianInvitationAction({
        subjectPersonId: isSelf ? undefined : subject.person.id,
        relationship: "Parent or legal guardian",
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setGuardianInviteUrl(response.result.inviteUrl);
      setNotice("Guardian link created. It expires in 14 days.");
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
        setNotice("Identity verification is already complete.");
      }
    });
  }

  const guardianConnected = isSelf
    ? settings.household.some((member) => member.role === "guardian")
    : settings.household.some(
        (member) =>
          member.role === "dependent" && member.person.id === subject.person.id,
      );

  return (
    <main className="onboarding-shell">
      <header className="onboarding-header">
        <Link href="/app" aria-label="Leave onboarding">
          <ArrowLeft />
        </Link>
        <div className="onboarding-progress" aria-label={`Step ${step} of 4`}>
          {Array.from({ length: 4 }, (_, index) => (
            <span
              className={index + 1 <= step ? "is-active" : undefined}
              key={index}
            />
          ))}
        </div>
        <span>
          {step}
          <small>/4</small>
        </span>
      </header>

      <section className="onboarding-intro">
        <span className="page-eyebrow">Your game, connected</span>
        <h1>
          {step === 1
            ? "Who are we building this for?"
            : step === 2
              ? `Tell us about ${subject.person.displayName}.`
              : step === 3
                ? "Review the player profile."
                : "A stronger profile starts here."}
        </h1>
        <p>
          {step === 1
            ? "Parents can manage multiple children from one Duna account."
            : step === 2
              ? "Talk naturally or answer the same curated questions yourself."
              : step === 3
                ? "These details help match the right competition and import real history."
                : "The next safeguards depend on who this profile belongs to."}
        </p>
      </section>

      {(error || notice) && (
        <p className={error ? "form-error" : "form-notice"} aria-live="polite">
          {error ?? notice}
        </p>
      )}

      {step === 1 && (
        <section className="onboarding-subjects">
          {subjects.map((candidate) => (
            <button
              className={
                candidate.person.id === subject.person.id ? "is-selected" : ""
              }
              key={candidate.person.id}
              onClick={() => selectSubject(candidate.person.id)}
              type="button"
            >
              <span className="avatar">{candidate.person.initials}</span>
              <span>
                <strong>
                  {candidate.role === "self"
                    ? "My profile"
                    : candidate.person.displayName}
                </strong>
                <small>
                  {candidate.role === "self"
                    ? candidate.person.displayName
                    : "Child profile"}
                </small>
              </span>
              {candidate.person.id === subject.person.id && <Check />}
            </button>
          ))}
          {subjects.length === 1 && settings.profile.ageBand === "adult" && (
            <Link
              className="onboarding-add-child"
              href="/app/settings#household"
            >
              <Users />
              <span>
                <strong>Add a child first</strong>
                <small>Create a protected profile in Household settings.</small>
              </span>
              <ArrowRight />
            </Link>
          )}
          <button
            className="onboarding-primary"
            onClick={() => setStep(2)}
            type="button"
          >
            Continue <ArrowRight />
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="onboarding-voice-step">
          <div className="onboarding-topic-row">
            <span>
              <Sparkles /> Playing level
            </span>
            <span>
              <Mic /> Indoor + beach
            </span>
            <span>
              <UserRound /> Years + height
            </span>
          </div>
          <VoiceExperienceGuide
            configured={settings.voiceOnboarding.configured}
            initialNarrative={experienceSummary}
            onComplete={applyNarrative}
            subjectName={subject.person.displayName}
            subjectPersonId={subject.person.id}
          />
          <div className="onboarding-step-actions">
            <button onClick={() => setStep(1)} type="button">
              Back
            </button>
            <button
              className="onboarding-primary"
              onClick={() => setStep(3)}
              type="button"
            >
              Review answers <ArrowRight />
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <form className="onboarding-profile-form" onSubmit={save}>
          <section>
            <div className="onboarding-section-title">
              <span>01</span>
              <div>
                <h2>Private identity</h2>
                <p>Legal details are never shown on the public profile.</p>
              </div>
            </div>
            <div className="form-grid form-grid--3">
              <label>
                Legal first name
                <input
                  autoComplete="given-name"
                  onChange={(event) => setLegalGivenName(event.target.value)}
                  required
                  value={legalGivenName}
                />
              </label>
              <label>
                Middle name <small>Optional</small>
                <input
                  autoComplete="additional-name"
                  onChange={(event) => setLegalMiddleName(event.target.value)}
                  value={legalMiddleName}
                />
              </label>
              <label>
                Legal last name
                <input
                  autoComplete="family-name"
                  onChange={(event) => setLegalFamilyName(event.target.value)}
                  required
                  value={legalFamilyName}
                />
              </label>
              {isSelf && !settings.profile.birthDate && (
                <label>
                  Birthday
                  <input
                    max={new Date().toISOString().slice(0, 10)}
                    onChange={(event) => setBirthDate(event.target.value)}
                    required
                    type="date"
                    value={birthDate}
                  />
                </label>
              )}
              <label>
                Height (cm) <small>Optional</small>
                <input
                  max={260}
                  min={60}
                  onChange={(event) => setHeightCentimeters(event.target.value)}
                  type="number"
                  value={heightCentimeters}
                />
              </label>
            </div>
          </section>

          <section>
            <div className="onboarding-section-title">
              <span>02</span>
              <div>
                <h2>Playing experience</h2>
                <p>Choose the highest meaningful level reached.</p>
              </div>
            </div>
            <div className="experience-choice-grid">
              {experienceOptions.map((option) => (
                <button
                  className={experience === option.value ? "is-selected" : ""}
                  key={option.value}
                  onClick={() => setExperience(option.value)}
                  type="button"
                >
                  <span className="choice-radio" />
                  <strong>{option.title}</strong>
                  <small>{option.detail}</small>
                </button>
              ))}
            </div>
            <div className="form-grid form-grid--2 onboarding-inline-fields">
              <label>
                Years playing
                <input
                  max={100}
                  min={0}
                  onChange={(event) =>
                    setYearsPlaying(Number(event.target.value))
                  }
                  required
                  type="number"
                  value={yearsPlaying}
                />
              </label>
              <label className="onboarding-toggle-row">
                <span>
                  <strong>Played indoor before</strong>
                  <small>School, club, collegiate, or professional.</small>
                </span>
                <input
                  checked={playedIndoorPrior}
                  onChange={(event) =>
                    setPlayedIndoorPrior(event.target.checked)
                  }
                  type="checkbox"
                />
              </label>
            </div>
            <label>
              Playing story <small>Editable</small>
              <textarea
                maxLength={1_500}
                onChange={(event) => setExperienceSummary(event.target.value)}
                rows={4}
                value={experienceSummary}
              />
            </label>
          </section>

          <section>
            <div className="onboarding-section-title">
              <span>03</span>
              <div>
                <h2>Bring the history</h2>
                <p>Duna imports matches, opponents, and rating history.</p>
              </div>
            </div>
            <div className="source-link-grid">
              <label>
                <span>
                  <Link2 /> VolleyballLife profile
                </span>
                <input
                  onChange={(event) => setVolleyballLifeUrl(event.target.value)}
                  placeholder="volleyballlife.com/playerprofile/…"
                  value={volleyballLifeUrl}
                />
              </label>
              {experience === "professional" && (
                <label>
                  <span>
                    <Link2 /> BVBInfo profile
                  </span>
                  <input
                    onChange={(event) => setBvbInfoUrl(event.target.value)}
                    placeholder="bvbinfo.com/player.asp?ID=…"
                    value={bvbInfoUrl}
                  />
                </label>
              )}
            </div>
          </section>

          <div className="onboarding-step-actions">
            <button onClick={() => setStep(2)} type="button">
              Back
            </button>
            <button
              className="onboarding-primary"
              disabled={isPending}
              type="submit"
            >
              {isPending ? "Saving…" : "Save profile"} <ArrowRight />
            </button>
          </div>
        </form>
      )}

      {step === 4 && (
        <section className="onboarding-finish">
          <div className="onboarding-finish__mark">
            <Check />
          </div>
          <Badge tone="positive">Profile saved</Badge>
          <h2>{subject.person.displayName} is ready for what comes next.</h2>
          <p>
            Match imports run in the background. Duna keeps source history and
            rating changes reviewable.
          </p>

          {subject.person.isMinor && !guardianConnected && (
            <article className="onboarding-safety-card">
              <ShieldCheck />
              <div>
                <h3>Connect a parent or guardian</h3>
                <p>
                  Bookings, wallet spending, waivers, and direct coach contact
                  stay locked until an adult accepts and Duna reviews the
                  relationship.
                </p>
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
              </div>
            </article>
          )}

          {isSelf && settings.profile.ageBand === "adult" && (
            <article className="onboarding-identity-card">
              <div>
                <ShieldCheck />
                <span>
                  <strong>Identity for future payouts</strong>
                  <small>
                    Stripe securely hosts document verification. Duna stores
                    only the verification status.
                  </small>
                </span>
              </div>
              <button
                disabled={
                  isPending ||
                  settings.identityVerification.status === "verified"
                }
                onClick={startIdentity}
                type="button"
              >
                {settings.identityVerification.status === "verified"
                  ? "Verified"
                  : "Verify with Stripe"}
                <ExternalLink />
              </button>
            </article>
          )}

          <Link className="onboarding-primary" href="/app/profile">
            View profile <ArrowRight />
          </Link>
          <Link className="onboarding-secondary-link" href="/app">
            Go to Duna home
          </Link>
        </section>
      )}
    </main>
  );
}
