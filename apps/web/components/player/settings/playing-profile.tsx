"use client";

/**
 * The playing profile (Settings and onboarding): legal name, level, years,
 * indoor, height, college and the playing story; drafting it from the story
 * (`inferPlayingExperience`); linking public match history (VolleyballLife,
 * BVBInfo) and answering "This is me"; claiming an existing profile;
 * identity verification for payouts; a guardian link for a junior.
 */
import { report } from "@duna/observability";
import {
  Button,
  Card,
  Chip,
  Field,
  Input,
  Notice,
  NumberInput,
  Progress,
  Segmented,
  Select,
  Switch,
  Textarea,
  useAction,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  connectPlayerSourceAction,
  createGuardianInvitationAction,
  inferPlayingExperienceAction,
  requestProfileClaimAction,
  retryPlayerSourceAction,
  reviewPlayerSourceAction,
  startIdentityVerificationAction,
  updatePlayingProfileAction,
} from "@/app/(next)/(app)/app/settings/actions";
import type { PlayerSettingsData } from "../api-types";
import { settled } from "./sections-a";

type Experience = "amateur" | "high-school" | "collegiate" | "professional";

const LEVELS = [
  { value: "amateur", label: "Recreational or amateur" },
  { value: "high-school", label: "High school" },
  { value: "collegiate", label: "College" },
  { value: "professional", label: "Professional" },
] as const;

type Source = PlayerSettingsData["sourceConnections"][number];

const SOURCE_NAME: Readonly<Record<Source["source"], string>> = {
  "volleyball-life": "VolleyballLife",
  bvbinfo: "BVBInfo",
};

function sourceLine(source: Source): string {
  switch (source.status) {
    case "queued":
      return "Queued: Duna is starting the import.";
    case "syncing":
      return "Importing and linking the public history.";
    case "linked":
      return "Linked. Results from it count once they are confirmed.";
    case "review-required":
      return "Profile found: confirm it is yours before anything is linked.";
    case "failed":
      return "We couldn’t import this yet. The link is saved and nothing was lost.";
    case "disconnected":
      return "This public profile is no longer linked.";
  }
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/);
  return {
    given: parts[0] ?? "",
    family: parts.length > 1 ? parts.slice(1).join(" ") : "",
  };
}

function SourceRow({ source }: { readonly source: Source }) {
  const router = useRouter();
  const confirmIt = useAction(
    async () =>
      settled(
        await reviewPlayerSourceAction({
          connectionId: source.id,
          decision: "confirmed",
        }),
      ),
    {
      messages: { success: "Linked. The import is starting." },
      onSuccess: () => router.refresh(),
    },
  );
  const rejectIt = useAction(
    async () =>
      settled(
        await reviewPlayerSourceAction({
          connectionId: source.id,
          decision: "rejected",
        }),
      ),
    { messages: { success: "Removed" }, onSuccess: () => router.refresh() },
  );
  const retry = useAction(
    async () =>
      settled(await retryPlayerSourceAction({ connectionId: source.id })),
    {
      messages: { success: "Import queued" },
      onSuccess: () => router.refresh(),
    },
  );
  const name =
    typeof source.profileSnapshot.displayName === "string"
      ? source.profileSnapshot.displayName
      : SOURCE_NAME[source.source];
  const importing = source.status === "queued" || source.status === "syncing";
  return (
    <li className="pp-team__row pp-source">
      <span className="pp-stack">
        <span>
          {name} <span className="td-meta">· {SOURCE_NAME[source.source]}</span>
        </span>
        <span aria-live={importing ? "polite" : undefined} className="td-meta">
          {sourceLine(source)}
        </span>
        {importing && source.progress.total > 0 ? (
          <Progress
            aria-label={`${SOURCE_NAME[source.source]} import`}
            max={source.progress.total}
            value={Math.min(source.progress.current, source.progress.total)}
          />
        ) : null}
        {source.status === "review-required" &&
        source.verificationStatus === "pending" ? (
          <span className="pp-row-actions">
            <Button
              loading={confirmIt.showPending}
              onClick={() => void confirmIt.run()}
              size="sm"
              variant="secondary"
            >
              This is me
            </Button>
            <Button
              loading={rejectIt.showPending}
              onClick={() => void rejectIt.run()}
              size="sm"
              variant="ghost"
            >
              Not my profile
            </Button>
          </span>
        ) : null}
        {source.status === "failed" ? (
          <span className="pp-row-actions">
            <Button
              loading={retry.showPending}
              onClick={() => void retry.run()}
              size="sm"
              variant="secondary"
            >
              Retry import
            </Button>
          </span>
        ) : null}
      </span>
      <Chip
        kind="status"
        tone={
          source.status === "linked"
            ? "positive"
            : source.status === "failed"
              ? "warning"
              : "neutral"
        }
      >
        {source.status === "review-required"
          ? "Needs you"
          : source.status === "linked"
            ? "Linked"
            : source.status === "failed"
              ? "Not imported"
              : source.status === "disconnected"
                ? "Unlinked"
                : "Importing"}
      </Chip>
    </li>
  );
}

export function PlayingProfileForm({
  settings,
  subject,
  onSaved,
  saveLabel = "Save playing profile",
  initialStory,
  initialClaimHandle,
}: {
  readonly settings: PlayerSettingsData;
  /** A junior's person id when a guardian fills it in for them. */
  readonly subject?: {
    readonly personId: string;
    readonly displayName: string;
  };
  readonly onSaved?: () => void;
  readonly saveLabel?: string;
  /** A story told earlier (onboarding's voice or typed step). */
  readonly initialStory?: string;
  /** A profile to claim (`/app/onboarding?claimProfile=handle`). */
  readonly initialClaimHandle?: string;
}) {
  const router = useRouter();
  const profile = settings.profile;
  const self = !subject;
  const fallback = splitName(
    subject?.displayName ?? profile.person.displayName,
  );
  const [form, setForm] = useState({
    legalGivenName:
      (self ? profile.legalGivenName : undefined) ?? fallback.given,
    legalMiddleName: (self ? profile.legalMiddleName : undefined) ?? "",
    legalFamilyName:
      (self ? profile.legalFamilyName : undefined) ?? fallback.family,
    heightCm:
      self && profile.heightMillimeters
        ? Math.round(profile.heightMillimeters / 10)
        : null,
    playingExperience: (self && profile.playingExperience !== "not-set"
      ? profile.playingExperience
      : "amateur") as Experience,
    playedIndoorPrior: (self ? profile.playedIndoorPrior : undefined) ?? false,
    yearsPlaying: (self ? profile.yearsPlaying : undefined) ?? 0,
    collegeName: (self ? profile.collegeName : undefined) ?? "",
    experienceSummary:
      initialStory ?? (self ? profile.experienceSummary : undefined) ?? "",
  });
  const [link, setLink] = useState({
    source: "volleyball-life" as Source["source"],
    url: "",
  });
  const [claimHandle, setClaimHandle] = useState(initialClaimHandle ?? "");
  const [guardianUrl, setGuardianUrl] = useState<string>();
  const importing = settings.sourceConnections.some(
    (source) => source.status === "queued" || source.status === "syncing",
  );
  useEffect(() => {
    if (!importing) return;
    const timer = window.setInterval(() => router.refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [importing, router]);

  const draft = useAction(
    async () =>
      settled(await inferPlayingExperienceAction(form.experienceSummary)),
    {
      messages: { success: "Drafted from your story. Check it, then save." },
      onSuccess: (answer) => {
        const result = answer.result as {
          playingExperience?: Experience;
          yearsPlaying?: number;
          playedIndoorPrior?: boolean;
          collegeName?: string;
          heightMillimeters?: number;
          summary?: string;
        };
        setForm((current) => ({
          ...current,
          ...(result.playingExperience
            ? { playingExperience: result.playingExperience }
            : {}),
          ...(typeof result.yearsPlaying === "number"
            ? { yearsPlaying: result.yearsPlaying }
            : {}),
          ...(typeof result.playedIndoorPrior === "boolean"
            ? { playedIndoorPrior: result.playedIndoorPrior }
            : {}),
          ...(result.collegeName ? { collegeName: result.collegeName } : {}),
          ...(result.heightMillimeters
            ? { heightCm: Math.round(result.heightMillimeters / 10) }
            : {}),
          ...(result.summary ? { experienceSummary: result.summary } : {}),
        }));
      },
      report: (error) => report(error, { event: "web.settings.infer_failed" }),
    },
  );
  const save = useAction(
    async () => {
      const answer = settled(
        await updatePlayingProfileAction({
          ...(subject ? { subjectPersonId: subject.personId } : {}),
          legalGivenName: form.legalGivenName.trim(),
          ...(form.legalMiddleName.trim()
            ? { legalMiddleName: form.legalMiddleName.trim() }
            : {}),
          legalFamilyName: form.legalFamilyName.trim(),
          ...(form.heightCm ? { heightMillimeters: form.heightCm * 10 } : {}),
          playingExperience: form.playingExperience,
          playedIndoorPrior: form.playedIndoorPrior,
          yearsPlaying: form.yearsPlaying,
          ...(form.collegeName.trim()
            ? { collegeName: form.collegeName.trim() }
            : {}),
          ...(form.experienceSummary.trim()
            ? { experienceSummary: form.experienceSummary.trim() }
            : {}),
        }),
      );
      if (link.url.trim()) {
        settled(
          await connectPlayerSourceAction({
            ...(subject ? { subjectPersonId: subject.personId } : {}),
            source: link.source,
            profileUrl: link.url.trim(),
          }),
        );
      }
      if (claimHandle.trim()) {
        settled(
          await requestProfileClaimAction({
            ...(subject ? { subjectPersonId: subject.personId } : {}),
            targetHandle: claimHandle.trim().replace(/^@/, ""),
          }),
        );
      }
      return answer;
    },
    {
      messages: {
        success: claimHandle.trim()
          ? "Saved. Your claim is in review; the existing history is kept while Duna checks it."
          : link.url.trim()
            ? "Saved. The match history import is queued."
            : "Playing profile saved",
      },
      onSuccess: () => {
        setLink((current) => ({ ...current, url: "" }));
        setClaimHandle("");
        router.refresh();
        onSaved?.();
      },
      report: (error) =>
        report(error, { event: "web.settings.playing_failed" }),
    },
  );
  const identity = useAction(
    async () => {
      const answer = settled(await startIdentityVerificationAction());
      const url = (answer.result as { url?: string }).url;
      if (url) window.location.assign(url);
      return answer;
    },
    {
      report: (error) =>
        report(error, { event: "web.settings.identity_failed" }),
    },
  );
  const guardian = useAction(
    async () =>
      settled(
        await createGuardianInvitationAction({
          ...(subject ? { subjectPersonId: subject.personId } : {}),
          relationship: "Parent or legal guardian",
        }),
      ),
    {
      messages: { success: "Guardian link made. It works for 14 days." },
      onSuccess: (answer) =>
        setGuardianUrl(
          (answer.result as { url?: string; inviteUrl?: string }).inviteUrl ??
            (answer.result as { url?: string }).url,
        ),
    },
  );
  const set = (key: keyof typeof form) => (value: unknown) =>
    setForm((current) => ({ ...current, [key]: value }));
  const minor = subject ? true : Boolean(profile.person.isMinor);

  return (
    <form
      className="pp-stack"
      onSubmit={(event) => {
        event.preventDefault();
        void save.run();
      }}
    >
      <Field
        hint="In your own words: where you play, how long, the level you reached. Duna can fill in the answers below from it."
        label="Your playing story"
        optional
      >
        <Textarea
          maxLength={2000}
          onChange={(event) =>
            set("experienceSummary")(event.currentTarget.value)
          }
          rows={3}
          value={form.experienceSummary}
        />
      </Field>
      {settings.voiceOnboarding.aiConfigured ? (
        <div>
          <Button
            disabled={form.experienceSummary.trim().length < 20}
            loading={draft.showPending}
            onClick={() => void draft.run()}
            size="sm"
            variant="secondary"
          >
            Fill in from my story
          </Button>
        </div>
      ) : null}
      <div className="pp-fieldrow">
        <Field label="Legal first name">
          <Input
            onValueChange={set("legalGivenName")}
            required
            value={form.legalGivenName}
          />
        </Field>
        <Field label="Middle name" optional>
          <Input
            onValueChange={set("legalMiddleName")}
            value={form.legalMiddleName}
          />
        </Field>
        <Field label="Legal last name">
          <Input
            onValueChange={set("legalFamilyName")}
            required
            value={form.legalFamilyName}
          />
        </Field>
      </div>
      <div className="pp-fieldrow">
        <Field label="Highest level played">
          <Select
            onValueChange={(value) => value && set("playingExperience")(value)}
            options={LEVELS}
            value={form.playingExperience}
          />
        </Field>
        <Field label="Years playing">
          <NumberInput
            max={80}
            min={0}
            onValueChange={(value) => set("yearsPlaying")(Number(value ?? 0))}
            value={form.yearsPlaying}
          />
        </Field>
        <Field hint="Centimetres" label="Height" optional>
          <NumberInput
            max={260}
            min={60}
            onValueChange={(value) =>
              set("heightCm")(value === null ? null : Number(value))
            }
            value={form.heightCm}
          />
        </Field>
      </div>
      {form.playingExperience === "collegiate" ||
      form.playingExperience === "professional" ? (
        <Field label="College" optional>
          <Input onValueChange={set("collegeName")} value={form.collegeName} />
        </Field>
      ) : null}
      <Switch
        checked={form.playedIndoorPrior}
        label="Played indoor before"
        onCheckedChange={(checked) =>
          set("playedIndoorPrior")(checked === true)
        }
      />

      <Card className="pp-stack" variant="flat">
        <p className="pp-label">Match history from elsewhere</p>
        {settings.sourceConnections.length > 0 ? (
          <ul className="pp-team">
            {settings.sourceConnections.map((source) => (
              <SourceRow key={source.id} source={source} />
            ))}
          </ul>
        ) : null}
        <div className="pp-fieldrow">
          <Segmented
            aria-label="Where your results are"
            onValueChange={(value) =>
              value &&
              setLink((current) => ({
                ...current,
                source: value as Source["source"],
              }))
            }
            options={[
              { value: "volleyball-life", label: "VolleyballLife" },
              { value: "bvbinfo", label: "BVBInfo" },
            ]}
            value={link.source}
          />
          <Field label="Your public profile link" optional>
            <Input
              inputMode="url"
              onValueChange={(value) =>
                setLink((current) => ({ ...current, url: String(value ?? "") }))
              }
              placeholder={
                link.source === "bvbinfo"
                  ? "bvbinfo.com/player.asp?ID=…"
                  : "volleyballlife.com/player/5520"
              }
              value={link.url}
            />
          </Field>
        </div>
        <Field
          hint="If Duna already has a profile with your results, ask to make it yours."
          label="Claim an existing profile"
          optional
        >
          <Input
            onValueChange={(value) => setClaimHandle(String(value ?? ""))}
            placeholder="@handle"
            value={claimHandle}
          />
        </Field>
      </Card>

      <div className="pp-row-actions">
        <Button loading={save.showPending} type="submit" variant="primary">
          {saveLabel}
        </Button>
      </div>

      {self && profile.ageBand === "adult" ? (
        <Card className="pp-linkcard" variant="flat">
          <div>
            <p className="pp-label">Identity for payouts</p>
            <p className="td-meta">
              Needed before prize money or coaching pay is sent to you. The
              check is hosted securely; Duna keeps only whether you passed.
            </p>
          </div>
          <Button
            disabled={
              settings.identityVerification.status === "verified" ||
              !settings.identityVerification.configured
            }
            loading={identity.showPending}
            onClick={() => void identity.run()}
            size="sm"
            variant="secondary"
          >
            {settings.identityVerification.status === "verified"
              ? "Verified"
              : settings.identityVerification.configured
                ? "Verify identity"
                : "Not available yet"}
          </Button>
        </Card>
      ) : null}

      {minor &&
      (self
        ? !settings.household.some((member) => member.role === "guardian")
        : false) ? (
        <Notice tone="info" title="A parent or guardian is needed">
          Bookings, payments, waivers and direct messages from coaches stay off
          until an adult accepts the link and Duna checks the relationship.
          <div className="pp-row-actions">
            {guardianUrl ? (
              <>
                <Input
                  aria-label="Guardian link"
                  readOnly
                  value={guardianUrl}
                />
                <Button
                  onClick={() =>
                    void navigator.clipboard
                      ?.writeText(guardianUrl)
                      .catch(() => undefined)
                  }
                  size="sm"
                  variant="secondary"
                >
                  Copy link
                </Button>
              </>
            ) : (
              <Button
                loading={guardian.showPending}
                onClick={() => void guardian.run()}
                size="sm"
                variant="secondary"
              >
                Make a guardian link
              </Button>
            )}
          </div>
        </Notice>
      ) : null}
    </form>
  );
}
