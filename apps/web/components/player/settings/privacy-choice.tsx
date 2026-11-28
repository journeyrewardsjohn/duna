"use client";

/**
 * Who can see me: the three choices in plain sentences, saved in place, and
 * the public preview beside them (exactly what the public page shows, and
 * what it never shows). Juniors see the rule instead of a choice.
 */
import { report } from "@duna/observability";
import {
  Card,
  Chip,
  Notice,
  RadioGroup,
  RadioOption,
  useAction,
} from "@duna/ui/tideline";
import { useState } from "react";
import { unwrap } from "../action-result";
import {
  JUNIOR_RULE,
  publicPreview,
  visibilityChoices,
  type Visibility,
} from "../privacy-model";
import { saveVisibilityAction } from "./privacy-actions";

export function PrivacyChoice({
  visibility: initial,
  isMinor,
  handle,
  displayName,
  homeArea,
  ratingProvisional,
}: {
  readonly visibility: Visibility;
  readonly isMinor: boolean;
  readonly handle: string;
  readonly displayName: string;
  readonly homeArea: string;
  readonly ratingProvisional: boolean;
}) {
  const [visibility, setVisibility] = useState<Visibility>(initial);
  const save = useAction(
    async (_context, next: Visibility) =>
      unwrap(await saveVisibilityAction(next)),
    {
      messages: { success: "Saved" },
      optimistic: {
        apply: (next) => {
          const before = visibility;
          setVisibility(next);
          return () => setVisibility(before);
        },
      },
      report: (error) =>
        report(error, { event: "web.settings.visibility_failed" }),
    },
  );
  const preview = publicPreview({
    visibility,
    isMinor,
    handle,
    ratingProvisional,
  });
  return (
    <div className="pp-privacy">
      <div className="pp-stack">
        {isMinor ? (
          <Notice tone="info" title="Private by rule">
            {JUNIOR_RULE}
          </Notice>
        ) : (
          <RadioGroup
            aria-label="Who can see your profile"
            onValueChange={(value) => {
              if (value && value !== visibility)
                void save.run(value as Visibility);
            }}
            value={visibility}
          >
            {visibilityChoices(isMinor).map((choice) => (
              <RadioOption
                description={choice.sentence}
                key={choice.value}
                label={choice.label}
                value={choice.value}
              />
            ))}
          </RadioGroup>
        )}
        <p aria-live="polite" className="td-meta">
          {save.pending
            ? "Saving…"
            : save.status === "error" && save.error instanceof Error
              ? `${save.error.message}${save.reference ? ` Reference ${save.reference}` : ""}`
              : ""}
        </p>
      </div>
      <Card aria-label="Public preview" className="pp-preview" variant="flat">
        <p className="pp-eyebrow">What the public sees</p>
        {preview.published ? (
          <>
            <p className="pp-preview__name">{displayName}</p>
            <p className="td-meta">
              @{handle}
              {homeArea ? ` · ${homeArea}` : ""}
            </p>
            <ul className="pp-preview__list">
              {preview.shows.map((line) => (
                <li key={line}>
                  <Chip kind="status" tone="positive">
                    Shown
                  </Chip>{" "}
                  {line}
                </li>
              ))}
              {preview.hidden.map((line) => (
                <li key={line}>
                  <Chip kind="status" tone="neutral">
                    Never shown
                  </Chip>{" "}
                  {line}
                </li>
              ))}
            </ul>
            {preview.path ? (
              <a className="pp-link" href={preview.path}>
                Open your public page
              </a>
            ) : null}
          </>
        ) : (
          <>
            <p className="pp-preview__name">No public page</p>
            <p className="td-meta">{preview.summary}</p>
          </>
        )}
      </Card>
    </div>
  );
}
