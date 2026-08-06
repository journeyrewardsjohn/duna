"use client";

import type { PlayerSettings } from "@duna/api";
import { Badge, playerAccents, type PlayerAccentId } from "@duna/ui";
import {
  CalendarDays,
  Palette,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type CSSProperties,
  FormEvent,
  useEffect,
  useState,
  useTransition,
} from "react";
import {
  checkHandleAvailabilityAction,
  recordBirthDateAction,
  updateProfileAccentAction,
  updateProfileAction,
} from "@/app/app/settings/actions";

type Profile = PlayerSettings["profile"];

export function ProfileSettings({
  profile,
  publicIdentity,
}: {
  readonly profile: Profile;
  readonly publicIdentity: PlayerSettings["publicIdentity"];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [birthDate, setBirthDate] = useState("");
  const [accentId, setAccentId] = useState<PlayerAccentId>(
    publicIdentity.accentId,
  );
  const [handleStatus, setHandleStatus] = useState<{
    tone: "checking" | "available" | "unavailable" | "invalid";
    message: string;
  }>({
    tone: "available",
    message: "This is your current Duna handle.",
  });
  const [form, setForm] = useState({
    displayName: profile.person.displayName,
    handle: profile.person.handle,
    email: profile.email ?? "",
    phoneE164: profile.phoneE164 ?? "",
    homeMarket: profile.person.homeMarket ?? "",
    visibility: profile.visibility,
    locale: profile.locale,
    measurementSystem: profile.measurementSystem,
  });

  useEffect(() => {
    const handle = form.handle.trim();
    if (
      handle.length < 3 ||
      handle.length > 48 ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle)
    ) {
      setHandleStatus({
        tone: "invalid",
        message:
          "Use 3–48 lowercase letters or numbers, with single hyphens between words.",
      });
      return;
    }
    let cancelled = false;
    setHandleStatus({ tone: "checking", message: "Checking availability…" });
    const timeout = window.setTimeout(async () => {
      const response = await checkHandleAvailabilityAction(handle);
      if (cancelled) return;
      if (!response.ok) {
        setHandleStatus({
          tone: "invalid",
          message: response.error,
        });
        return;
      }
      setHandleStatus({
        tone: response.result.available ? "available" : "unavailable",
        message: response.result.message,
      });
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [form.handle]);

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    setNotice(undefined);
    startTransition(async () => {
      const response = await updateProfileAction(form);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setNotice("Profile and display preferences saved.");
      router.refresh();
    });
  };

  const recordBirthDate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(undefined);
    setNotice(undefined);
    startTransition(async () => {
      const response = await recordBirthDateAction(birthDate);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setNotice(
        response.result.requiresGuardian
          ? "Birth date recorded. A verified guardian must manage registrations, payments, and consent for this account."
          : "Birth date recorded. Adult account controls are now available.",
      );
      router.refresh();
    });
  };

  const updateAccent = (nextAccent: PlayerAccentId) => {
    setError(undefined);
    setNotice(undefined);
    setAccentId(nextAccent);
    startTransition(async () => {
      const response = await updateProfileAccentAction(nextAccent);
      if (!response.ok) {
        setAccentId(publicIdentity.accentId);
        setError(response.error);
        return;
      }
      setNotice("Profile accent saved to your public identity.");
      router.refresh();
    });
  };

  return (
    <section id="profile">
      <div className="settings-section__heading">
        <div>
          <span className="page-eyebrow">Identity</span>
          <h2>Profile</h2>
        </div>
        <Badge tone={profile.birthDate ? "positive" : "warning"}>
          {profile.birthDate
            ? `${profile.ageBand.replace("-", " ")} · recorded`
            : "Age setup needed"}
        </Badge>
      </div>

      {(notice || error) && (
        <p className={error ? "form-error" : "form-notice"} aria-live="polite">
          {error ?? notice}
        </p>
      )}

      <form className="settings-form" onSubmit={saveProfile}>
        <div className="settings-form__title">
          <UserRound aria-hidden size={20} />
          <span>
            <strong>Public identity</strong>
            <small>
              Your display name and handle are shared wherever your profile is
              visible.
            </small>
          </span>
        </div>
        <div className="form-grid form-grid--2">
          <label>
            Display name
            <input
              autoComplete="name"
              maxLength={80}
              minLength={2}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  displayName: event.target.value,
                }))
              }
              required
              value={form.displayName}
            />
          </label>
          <label>
            Duna handle
            <span className="input-prefix">
              <span>@</span>
              <input
                autoCapitalize="none"
                autoComplete="username"
                maxLength={48}
                minLength={3}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    handle: event.target.value
                      .toLowerCase()
                      .replaceAll(/[^a-z0-9-]/g, ""),
                  }))
                }
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                required
                value={form.handle}
              />
            </span>
            <small
              aria-live="polite"
              className={`handle-availability handle-availability--${handleStatus.tone}`}
            >
              {handleStatus.message}
            </small>
          </label>
          <label>
            Email
            <input
              autoComplete="email"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              type="email"
              value={form.email}
            />
          </label>
          <label>
            Phone
            <input
              autoComplete="tel"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  phoneE164: event.target.value,
                }))
              }
              placeholder="+15551234567"
              type="tel"
              value={form.phoneE164}
            />
          </label>
          <label>
            Home market
            <input
              maxLength={120}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  homeMarket: event.target.value,
                }))
              }
              placeholder="Manhattan Beach, CA"
              value={form.homeMarket}
            />
          </label>
          <label>
            Profile visibility
            <select
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  visibility: event.target.value as Profile["visibility"],
                }))
              }
              value={form.visibility}
            >
              {!profile.person.isMinor && (
                <option value="public">Public</option>
              )}
              {!profile.person.isMinor && (
                <option value="members">Duna members</option>
              )}
              <option value="private">Private</option>
            </select>
          </label>
          <label>
            Language + region
            <select
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  locale: event.target.value,
                }))
              }
              value={form.locale}
            >
              <option value="en-US">English (United States)</option>
              <option value="es-US">Español (Estados Unidos)</option>
              <option value="pt-BR">Português (Brasil)</option>
            </select>
          </label>
          <label>
            Measurement
            <select
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  measurementSystem: event.target
                    .value as Profile["measurementSystem"],
                }))
              }
              value={form.measurementSystem}
            >
              <option value="imperial">Imperial</option>
              <option value="metric">Metric</option>
            </select>
          </label>
        </div>
        <button
          className="primary-action"
          disabled={
            isPending ||
            handleStatus.tone === "checking" ||
            handleStatus.tone === "unavailable" ||
            handleStatus.tone === "invalid"
          }
          type="submit"
        >
          <Save aria-hidden size={17} />
          {isPending ? "Saving…" : "Save profile"}
        </button>
      </form>

      <article className="settings-identity-style">
        <div className="settings-form__title">
          <Palette aria-hidden size={20} />
          <span>
            <strong>Public identity accent</strong>
            <small>
              Personality without changing ratings, records, layout, or
              evidence.
            </small>
          </span>
          <Badge
            tone={
              publicIdentity.tier === "verified-pro" ? "positive" : "neutral"
            }
          >
            {publicIdentity.tier === "verified-pro"
              ? "Verified pro"
              : "Claimed"}
          </Badge>
        </div>
        <div
          aria-label="Curated player accents"
          className="settings-player-accents"
          role="group"
        >
          {playerAccents.map((accent) => (
            <button
              aria-label={accent.label}
              aria-pressed={accentId === accent.id}
              disabled={isPending || publicIdentity.tier !== "verified-pro"}
              key={accent.id}
              onClick={() => updateAccent(accent.id)}
              style={{ "--player-accent": accent.color } as CSSProperties}
              type="button"
            >
              <i />
              <span>{accent.label}</span>
            </button>
          ))}
        </div>
        {publicIdentity.tier !== "verified-pro" && (
          <p>
            <ShieldCheck aria-hidden size={16} />
            Verified professionals unlock the curated accent set. Sponsor marks
            and custom cutouts remain review-gated before publication.
          </p>
        )}
      </article>

      {profile.birthDate ? (
        <article className="settings-row">
          <CalendarDays aria-hidden size={20} />
          <span>
            <strong>Date of birth recorded</strong>
            <small>
              {new Intl.DateTimeFormat("en-US", {
                dateStyle: "long",
                timeZone: "UTC",
              }).format(new Date(`${profile.birthDate}T00:00:00.000Z`))}
              . Contact support if this needs correction.
            </small>
          </span>
          <Badge tone={profile.ageVerified ? "positive" : "warning"}>
            {profile.ageVerified ? "Recorded" : "Review"}
          </Badge>
        </article>
      ) : (
        <form
          className="settings-form settings-form--compact"
          onSubmit={recordBirthDate}
        >
          <div className="settings-form__title">
            <CalendarDays aria-hidden size={20} />
            <span>
              <strong>Complete age setup</strong>
              <small>
                Duna uses this once for age divisions and structural minor
                safeguards. It is not shown publicly.
              </small>
            </span>
          </div>
          <label>
            Date of birth
            <input
              max={new Date().toISOString().slice(0, 10)}
              onChange={(event) => setBirthDate(event.target.value)}
              required
              type="date"
              value={birthDate}
            />
          </label>
          <p>
            This becomes locked after saving. Accounts under 18 remain private
            and require a verified guardian for payments and consent.
          </p>
          <button className="primary-action" disabled={isPending} type="submit">
            {isPending ? "Recording…" : "Record birth date"}
          </button>
        </form>
      )}
    </section>
  );
}
