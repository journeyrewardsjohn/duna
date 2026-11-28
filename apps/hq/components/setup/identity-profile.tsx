"use client";

import { hqHref } from "@duna/core/hq-routes";
import {
  Button,
  Checkbox,
  Chip,
  Input,
  Select,
  Textarea,
  useAction,
  useLeaveGuard,
} from "@duna/ui/tideline";
import { report } from "@duna/observability";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { type ProfileUpdate, saveProfileAction } from "./actions";
import { HoursEditor, RemoveButton } from "./fact-editor";
import type { SetupProfileView } from "./setup-data";
import { hoursSummary, provenance } from "./setup-model";
import { unwrap } from "./setup-result";

interface Draft {
  name: string;
  sports: ("beach" | "indoor")[];
  tagline: string;
  about: string;
  phoneE164: string;
  email: string;
  websiteUrl: string;
  weekly: { weekday: number; opens: string; closes: string }[];
  socials: { network: string; url: string }[];
}

const networks = [
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "x",
  "linkedin",
  "other",
].map((value) => ({
  value,
  label: value === "x" ? "X" : `${value[0]!.toUpperCase()}${value.slice(1)}`,
}));

function draftOf(profile: SetupProfileView): Draft {
  return {
    name: profile.name,
    sports: [...profile.sports],
    tagline: profile.tagline ?? "",
    about: profile.about ?? "",
    phoneE164: profile.phoneE164 ?? "",
    email: profile.email ?? "",
    websiteUrl: profile.websiteUrl ?? "",
    weekly: profile.hours.weekly.map((w) => ({ ...w })),
    socials: Object.entries(profile.socials).map(([network, url]) => ({
      network,
      url,
    })),
  };
}

/** What changed between the saved profile and the draft, as the update to send. */
function changes(saved: Draft, draft: Draft): ProfileUpdate {
  const update: Record<string, unknown> = {};
  const text = (key: keyof Draft) => {
    if (saved[key] !== draft[key]) update[key] = String(draft[key]).trim();
  };
  if (saved.name !== draft.name) update.name = draft.name.trim();
  if (saved.sports.join() !== draft.sports.join()) update.sports = draft.sports;
  text("tagline");
  text("about");
  text("phoneE164");
  text("email");
  text("websiteUrl");
  if (JSON.stringify(saved.weekly) !== JSON.stringify(draft.weekly)) {
    update.hours = { weekly: draft.weekly };
  }
  if (JSON.stringify(saved.socials) !== JSON.stringify(draft.socials)) {
    update.socials = Object.fromEntries(
      draft.socials
        .filter((s) => s.url.trim())
        .map((s) => [s.network, s.url.trim()]),
    );
  }
  return update as ProfileUpdate;
}

function Sentence({
  label,
  htmlFor,
  source,
  onConfirm,
  confirming,
  children,
}: {
  readonly label: ReactNode;
  readonly htmlFor?: string;
  readonly source?: string;
  readonly onConfirm?: () => void;
  readonly confirming?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className="setup-sentence">
      <label className="setup-sentence__label" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="setup-sentence__control">{children}</div>
      {source ? (
        <div className="setup-sentence__source">
          <Chip
            kind="status"
            tone={source.startsWith("From") ? "attention" : undefined}
          >
            {source}
          </Chip>
          {onConfirm ? (
            <Button
              loading={confirming}
              onClick={onConfirm}
              size="sm"
              variant="ghost"
            >
              It&apos;s right
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The club's profile as settings written as sentences, edited by hand.
 * Each value says where it came from ("From your website on 28 Nov", "You
 * edited this"); a value read from the website stays marked until a person
 * confirms it or changes it.
 */
export function IdentityProfile({
  profile,
  timeZone,
}: {
  readonly profile: SetupProfileView;
  readonly timeZone: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(() => draftOf(profile));
  const [draft, setDraft] = useState(() => draftOf(profile));
  const [sources, setSources] = useState(profile.fieldSources);
  const [problem, setProblem] = useState<{ field?: string; message: string }>();
  const update = useMemo(() => changes(saved, draft), [saved, draft]);
  const dirty = Object.keys(update).length > 0;
  useLeaveGuard(dirty);

  const source = (field: string) =>
    provenance(
      { fieldSources: sources, websiteLastReadAt: profile.websiteLastReadAt },
      field,
      timeZone,
    );
  const unconfirmed = (field: string) => {
    const entry = sources[field];
    return entry !== undefined && entry.source !== "person" && !entry.confirmed;
  };

  const save = useAction(
    async ({ idempotencyKey }) =>
      unwrap(await saveProfileAction(update, idempotencyKey)),
    {
      messages: { success: "Your club's identity is saved" },
      onSuccess: (next) => {
        setSaved(draft);
        setSources(next.fieldSources);
        setProblem(undefined);
        router.refresh();
      },
      onError: (error) =>
        setProblem({
          message:
            (error as { userMessage?: string }).userMessage ??
            "Nothing was saved. Try again.",
        }),
      report,
    },
  );

  const confirmField = useAction(
    async ({ idempotencyKey }, field: string) =>
      unwrap(
        await saveProfileAction({ confirmFields: [field] }, idempotencyKey),
      ),
    {
      messages: { success: "Marked as right" },
      onSuccess: (next) => setSources(next.fieldSources),
      report,
    },
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const confirmable = (field: string) =>
    unconfirmed(field) ? () => void confirmField.run(field) : undefined;

  return (
    <form
      className="setup-identity"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.name.trim().length < 2) {
          setProblem({
            field: "name",
            message: "Your club's name needs at least two characters.",
          });
          return;
        }
        if (draft.sports.length === 0) {
          setProblem({ field: "sports", message: "Pick at least one sport." });
          return;
        }
        if (draft.weekly.some((w) => w.opens >= w.closes)) {
          setProblem({
            field: "hours",
            message: "Closing time must be after opening time.",
          });
          return;
        }
        void save.run();
      }}
    >
      <fieldset className="setup-sentences">
        <legend className="setup-sentences__title">Who you are</legend>
        <Sentence htmlFor="identity-name" label="Your club is called">
          <Input
            aria-invalid={problem?.field === "name" || undefined}
            id="identity-name"
            onChange={(event) => set("name", event.currentTarget.value)}
            value={draft.name}
          />
        </Sentence>
        <Sentence label="You play">
          <span className="setup-checks setup-checks--row">
            <Checkbox
              checked={draft.sports.includes("beach")}
              label="Beach"
              onCheckedChange={(on) =>
                set(
                  "sports",
                  on
                    ? [...new Set([...draft.sports, "beach" as const])].sort()
                    : draft.sports.filter((s) => s !== "beach"),
                )
              }
            />
            <Checkbox
              checked={draft.sports.includes("indoor")}
              label="Indoor"
              onCheckedChange={(on) =>
                set(
                  "sports",
                  on
                    ? [...new Set([...draft.sports, "indoor" as const])].sort()
                    : draft.sports.filter((s) => s !== "indoor"),
                )
              }
            />
          </span>
        </Sentence>
        <Sentence
          confirming={confirmField.pending}
          htmlFor="identity-tagline"
          label="In one line"
          onConfirm={confirmable("tagline")}
          source={source("tagline")}
        >
          <Input
            id="identity-tagline"
            maxLength={160}
            onChange={(event) => set("tagline", event.currentTarget.value)}
            placeholder="Beach volleyball for every level"
            value={draft.tagline}
          />
        </Sentence>
        <Sentence
          confirming={confirmField.pending}
          htmlFor="identity-about"
          label="About the club"
          onConfirm={confirmable("about")}
          source={source("about")}
        >
          <Textarea
            id="identity-about"
            maxLength={4000}
            onChange={(event) => set("about", event.currentTarget.value)}
            rows={4}
            value={draft.about}
          />
        </Sentence>
      </fieldset>

      <fieldset className="setup-sentences" id="contact">
        <legend className="setup-sentences__title">How people reach you</legend>
        <Sentence
          confirming={confirmField.pending}
          htmlFor="identity-phone"
          label="Call or text on"
          onConfirm={confirmable("phoneE164")}
          source={source("phoneE164")}
        >
          <Input
            autoComplete="tel"
            id="identity-phone"
            inputMode="tel"
            onChange={(event) => set("phoneE164", event.currentTarget.value)}
            placeholder="+1 310 555 0142"
            value={draft.phoneE164}
          />
        </Sentence>
        <Sentence
          confirming={confirmField.pending}
          htmlFor="identity-email"
          label="Email"
          onConfirm={confirmable("email")}
          source={source("email")}
        >
          <Input
            autoComplete="email"
            id="identity-email"
            inputMode="email"
            onChange={(event) => set("email", event.currentTarget.value)}
            type="email"
            value={draft.email}
          />
        </Sentence>
        <Sentence
          htmlFor="identity-website"
          label="Your website is"
          source={source("websiteUrl")}
        >
          <Input
            autoComplete="url"
            id="identity-website"
            inputMode="url"
            onChange={(event) => set("websiteUrl", event.currentTarget.value)}
            placeholder="https://yourclub.com"
            value={draft.websiteUrl}
          />
        </Sentence>
      </fieldset>

      <fieldset className="setup-sentences" id="hours">
        <legend className="setup-sentences__title">
          When you&apos;re open
        </legend>
        <p className="setup-quiet">{hoursSummary(draft.weekly)}</p>
        <Sentence
          confirming={confirmField.pending}
          label="Opening hours"
          onConfirm={confirmable("hours")}
          source={source("hours")}
        >
          <HoursEditor
            idPrefix="identity-hours"
            onChange={(next) => set("weekly", next)}
            value={draft.weekly}
          />
        </Sentence>
      </fieldset>

      <fieldset className="setup-sentences">
        <legend className="setup-sentences__title">
          Where else to find you
        </legend>
        {draft.socials.length === 0 ? (
          <p className="setup-quiet">No links yet.</p>
        ) : null}
        {draft.socials.map((social, index) => (
          <div className="setup-social" key={index}>
            <Select
              aria-label="Network"
              onValueChange={(next) =>
                set(
                  "socials",
                  draft.socials.map((s, i) =>
                    i === index ? { ...s, network: next ?? s.network } : s,
                  ),
                )
              }
              options={networks}
              value={social.network}
            />
            <Input
              aria-label={`${social.network} link`}
              inputMode="url"
              onChange={(event) => {
                const url = event.currentTarget.value;
                set(
                  "socials",
                  draft.socials.map((s, i) =>
                    i === index ? { ...s, url } : s,
                  ),
                );
              }}
              value={social.url}
            />
            <RemoveButton
              label={`Remove the ${social.network} link`}
              onClick={() =>
                set(
                  "socials",
                  draft.socials.filter((_, i) => i !== index),
                )
              }
            />
          </div>
        ))}
        <Button
          onClick={() =>
            set("socials", [
              ...draft.socials,
              { network: "instagram", url: "" },
            ])
          }
          size="sm"
          type="button"
          variant="ghost"
        >
          Add a link
        </Button>
        {source("socials") ? (
          <p className="setup-quiet">{source("socials")}</p>
        ) : null}
      </fieldset>

      {problem ? (
        <p className="setup-editor__error" role="alert">
          {problem.message}
        </p>
      ) : null}
      <div className="setup-identity__bar">
        <span className="setup-quiet" aria-live="polite">
          {dirty
            ? "You have changes that aren't saved."
            : "Everything is saved."}
        </span>
        <Button
          disabled={!dirty}
          onClick={() => setDraft(saved)}
          type="button"
          variant="ghost"
        >
          Undo changes
        </Button>
        <Button
          disabled={!dirty}
          loading={save.pending}
          type="submit"
          variant="primary"
        >
          Save identity
        </Button>
      </div>
      <p className="setup-quiet">
        Your club page shows these once your website is published.{" "}
        <Link className="setup-link" href={hqHref("website")}>
          Open Website
        </Link>
      </p>
    </form>
  );
}
