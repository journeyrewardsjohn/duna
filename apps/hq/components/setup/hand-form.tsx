"use client";

import { hqHref } from "@duna/core/hq-routes";
import {
  Button,
  Checkbox,
  Chip,
  Field,
  Input,
  PaneTransition,
  Progress,
  riseClassName,
  rallyStyle,
  Textarea,
  useAction,
} from "@duna/ui/tideline";
import { report } from "@duna/observability";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveProfileAction } from "./actions";
import { HoursEditor } from "./fact-editor";
import { hoursSummary, type HoursWindow } from "./setup-model";
import { unwrap } from "./setup-result";

export interface HandFacts {
  name: string;
  sports: ("beach" | "indoor")[];
  tagline: string;
  about: string;
  phone: string;
  email: string;
  weekly: HoursWindow[];
  instagram: string;
  facebook: string;
}

type StepKey = "name" | "sports" | "story" | "contact" | "hours" | "socials";

const steps: readonly { key: StepKey; question: string; hint: string }[] = [
  {
    key: "name",
    question: "What is your club called?",
    hint: "As players say it.",
  },
  {
    key: "sports",
    question: "What do you play?",
    hint: "You can add the other one later.",
  },
  {
    key: "story",
    question: "How would you describe your club?",
    hint: "A line for the top of your page, and a few sentences about you.",
  },
  {
    key: "contact",
    question: "How do people reach you?",
    hint: "Shown on your club page.",
  },
  {
    key: "hours",
    question: "When are you open?",
    hint: "Untick the days you are closed.",
  },
  {
    key: "socials",
    question: "Where else can people find you?",
    hint: "Optional. Paste the links.",
  },
];

const checkLabels: Readonly<Record<StepKey, string>> = {
  name: "Club name",
  sports: "Sports",
  story: "Tagline and story",
  contact: "Contact",
  hours: "Opening hours",
  socials: "Social links",
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function problemFor(step: StepKey, facts: HandFacts): string | undefined {
  if (step === "name" && facts.name.trim().length < 2)
    return "Write your club's name.";
  if (step === "sports" && facts.sports.length === 0)
    return "Pick at least one.";
  if (
    step === "contact" &&
    facts.email &&
    !emailPattern.test(facts.email.trim())
  ) {
    return "Use an email address like name@yourclub.com.";
  }
  if (step === "hours" && facts.weekly.some((w) => w.opens >= w.closes)) {
    return "Closing time must be after opening time.";
  }
  return undefined;
}

function summary(step: StepKey, facts: HandFacts): string {
  switch (step) {
    case "name":
      return facts.name;
    case "sports":
      return facts.sports
        .map((s) => (s === "beach" ? "Beach volleyball" : "Indoor volleyball"))
        .join(" and ");
    case "story":
      return (
        [facts.tagline, facts.about].filter(Boolean).join(" · ") || "Not yet"
      );
    case "contact":
      return (
        [facts.phone, facts.email].filter(Boolean).join(" · ") || "Not yet"
      );
    case "hours":
      return hoursSummary(facts.weekly);
    case "socials":
      return (
        [facts.instagram, facts.facebook].filter(Boolean).join(" · ") || "None"
      );
  }
}

/**
 * No website: the same facts collected by hand, one question at a time,
 * then the same check before anything is saved. Nothing needs the website
 * reader or the model, so it always works.
 */
export function HandForm({ initial }: { readonly initial: HandFacts }) {
  const router = useRouter();
  const [facts, setFacts] = useState<HandFacts>(initial);
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [problem, setProblem] = useState<string>();
  const checking = index >= steps.length;
  const step = steps[Math.min(index, steps.length - 1)]!;

  const save = useAction(
    async ({ idempotencyKey }) =>
      unwrap(
        await saveProfileAction(
          {
            name: facts.name.trim(),
            sports: facts.sports,
            tagline: facts.tagline.trim() || undefined,
            about: facts.about.trim() || undefined,
            email: facts.email.trim() || undefined,
            phoneE164: facts.phone.trim() || undefined,
            hours: { weekly: facts.weekly },
            socials: Object.fromEntries(
              (
                [
                  ["instagram", facts.instagram],
                  ["facebook", facts.facebook],
                ] as const
              )
                .map(([network, url]) => [network, url.trim()] as const)
                .filter(([, url]) => url)
                .map(([network, url]) => [
                  network,
                  /^https?:\/\//.test(url) ? url : `https://${url}`,
                ]),
            ),
          },
          idempotencyKey,
        ),
      ),
    {
      messages: {
        success: "Saved to your club",
        error:
          "Nothing was saved. Check the highlighted answers and try again.",
      },
      onSuccess: () => router.push(`${hqHref("setup")}?welcome=identity`),
      report,
    },
  );

  const go = (next: number) => {
    if (next > index) {
      const found = problemFor(step.key, facts);
      if (found) {
        setProblem(found);
        return;
      }
    }
    setProblem(undefined);
    setDirection(next > index ? "forward" : "back");
    setIndex(next);
  };

  const set = <K extends keyof HandFacts>(key: K, value: HandFacts[K]) => {
    setFacts((current) => ({ ...current, [key]: value }));
    if (problem) setProblem(undefined);
  };

  if (checking) {
    return (
      <section aria-labelledby="hand-check" className="setup-hand">
        <h2 className="setup-hand__question" id="hand-check">
          Check what you wrote
        </h2>
        <p className="setup-quiet">
          Nothing is saved until you press Save. Edit any answer first.
        </p>
        <ul className="setup-hand__check">
          {steps.map((item, position) => (
            <li
              className={`setup-fact ${riseClassName()}`}
              key={item.key}
              style={rallyStyle(position)}
            >
              <div className="setup-fact__head">
                <h3 className="setup-fact__label">{checkLabels[item.key]}</h3>
                <Chip kind="status">You typed this</Chip>
              </div>
              <p className="setup-fact__value">{summary(item.key, facts)}</p>
              <Button
                onClick={() => {
                  setDirection("back");
                  setIndex(position);
                }}
                size="sm"
                variant="ghost"
              >
                Edit
              </Button>
            </li>
          ))}
        </ul>
        {save.error ? (
          <p className="setup-editor__error" role="alert">
            {(save.error as { userMessage?: string }).userMessage ??
              "Nothing was saved. Try again."}
          </p>
        ) : null}
        <div className="setup-hand__actions">
          <Button onClick={() => go(steps.length - 1)} variant="ghost">
            Back
          </Button>
          <Button {...save.buttonProps} variant="primary">
            Save to my club
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="hand-question" className="setup-hand">
      <Progress
        aria-label={`Question ${index + 1} of ${steps.length}`}
        max={steps.length}
        value={index}
      />
      <PaneTransition direction={direction} transitionKey={step.key}>
        <form
          className="setup-hand__step"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            go(index + 1);
          }}
        >
          <h2 className="setup-hand__question" id="hand-question">
            {step.question}
          </h2>
          <p className="setup-quiet">{step.hint}</p>
          {step.key === "name" ? (
            <Field error={problem} label="Club name">
              <Input
                autoComplete="organization"
                autoFocus
                onChange={(event) => set("name", event.currentTarget.value)}
                value={facts.name}
              />
            </Field>
          ) : null}
          {step.key === "sports" ? (
            <fieldset className="setup-checks">
              <legend className="td-sr">Sports</legend>
              <Checkbox
                checked={facts.sports.includes("beach")}
                label="Beach volleyball"
                onCheckedChange={(on) =>
                  set(
                    "sports",
                    on
                      ? [...new Set([...facts.sports, "beach" as const])]
                      : facts.sports.filter((s) => s !== "beach"),
                  )
                }
              />
              <Checkbox
                checked={facts.sports.includes("indoor")}
                label="Indoor volleyball"
                onCheckedChange={(on) =>
                  set(
                    "sports",
                    on
                      ? [...new Set([...facts.sports, "indoor" as const])]
                      : facts.sports.filter((s) => s !== "indoor"),
                  )
                }
              />
              {problem ? (
                <p className="setup-editor__error" role="alert">
                  {problem}
                </p>
              ) : null}
            </fieldset>
          ) : null}
          {step.key === "story" ? (
            <>
              <Field label="Tagline" optional>
                <Input
                  autoFocus
                  maxLength={160}
                  onChange={(event) =>
                    set("tagline", event.currentTarget.value)
                  }
                  placeholder="Beach volleyball for every level"
                  value={facts.tagline}
                />
              </Field>
              <Field label="About the club" optional>
                <Textarea
                  maxLength={4000}
                  onChange={(event) => set("about", event.currentTarget.value)}
                  rows={4}
                  value={facts.about}
                />
              </Field>
            </>
          ) : null}
          {step.key === "contact" ? (
            <>
              <Field
                hint="With the country code outside North America."
                label="Phone"
                optional
              >
                <Input
                  autoComplete="tel"
                  autoFocus
                  inputMode="tel"
                  onChange={(event) => set("phone", event.currentTarget.value)}
                  value={facts.phone}
                />
              </Field>
              <Field error={problem} label="Email" optional>
                <Input
                  autoComplete="email"
                  inputMode="email"
                  onChange={(event) => set("email", event.currentTarget.value)}
                  type="email"
                  value={facts.email}
                />
              </Field>
            </>
          ) : null}
          {step.key === "hours" ? (
            <>
              <HoursEditor
                idPrefix="hand-hours"
                onChange={(next) => set("weekly", next)}
                value={facts.weekly}
              />
              {problem ? (
                <p className="setup-editor__error" role="alert">
                  {problem}
                </p>
              ) : null}
            </>
          ) : null}
          {step.key === "socials" ? (
            <>
              <Field label="Instagram" optional>
                <Input
                  autoFocus
                  inputMode="url"
                  onChange={(event) =>
                    set("instagram", event.currentTarget.value)
                  }
                  placeholder="instagram.com/yourclub"
                  value={facts.instagram}
                />
              </Field>
              <Field label="Facebook" optional>
                <Input
                  inputMode="url"
                  onChange={(event) =>
                    set("facebook", event.currentTarget.value)
                  }
                  placeholder="facebook.com/yourclub"
                  value={facts.facebook}
                />
              </Field>
            </>
          ) : null}
          <div className="setup-hand__actions">
            {index > 0 ? (
              <Button
                onClick={() => go(index - 1)}
                type="button"
                variant="ghost"
              >
                Back
              </Button>
            ) : null}
            <Button type="submit" variant="primary">
              {index === steps.length - 1 ? "Check my answers" : "Next"}
            </Button>
          </div>
        </form>
      </PaneTransition>
    </section>
  );
}
