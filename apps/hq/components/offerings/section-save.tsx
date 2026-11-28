"use client";

import { report } from "@duna/observability";
import {
  Button,
  IconButton,
  Input,
  useAction,
  useConfirm,
  useLeaveGuard,
  useOnline,
} from "@duna/ui/tideline";
import { Icon } from "@duna/ui/icons";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { unwrap } from "../money/money-action-result";
import type { MoneyActionResult } from "../money/money-action-result";

/**
 * How every section of an offering saves: explicit Save, single submit
 * (a double click sends one request), a toast that names what changed,
 * the page refreshed, a leave guard while there are unsaved changes, and
 * Save waits while offline. One rule for every section (the kit's "explicit
 * save" for settings a person reviews before they apply).
 *
 * `republishes`: the change makes a new version of a live offering (price,
 * options, photos). The person confirms that it goes live again at once.
 */
export function useSectionSave<T>({
  what,
  dirty,
  live,
  title,
  republishes = false,
  perform,
}: {
  /** "Details", "The price": named in the toast. */
  readonly what: string;
  readonly dirty: boolean;
  readonly live: boolean;
  readonly title: string;
  readonly republishes?: boolean;
  readonly perform: (idempotencyKey: string) => Promise<MoneyActionResult<T>>;
}) {
  const router = useRouter();
  const online = useOnline();
  const confirm = useConfirm();
  useLeaveGuard(dirty);
  const failed = (error: unknown) =>
    void report(error, {
      event: "hq.offerings.section_save_failed",
      tags: { what },
    });
  const save = useAction(
    async ({ idempotencyKey }) => {
      if (republishes && live) {
        const outcome = await confirm.run({
          tier: "confirm",
          title: `Change ${title} while it's live?`,
          description:
            "Players see the change as soon as it's saved. The offering is saved as a new version and published again.",
          verb: "Save and keep it live",
          cancelLabel: "Keep editing",
          agentConfirm: `Saves ${what.toLowerCase()} for ${title} and keeps it live`,
          perform: async () => unwrap(await perform(idempotencyKey)),
          report: failed,
        });
        if (outcome.status !== "done") return "kept" as const;
        return "saved" as const;
      }
      unwrap(await perform(idempotencyKey));
      return "saved" as const;
    },
    {
      messages: {
        success: (result) =>
          result === "saved" ? `${what} saved` : `${what} not changed`,
        error: `${what} wasn't saved. Your changes are still here.`,
      },
      report: failed,
      onSuccess: (result) => {
        if (result === "saved") router.refresh();
      },
    },
  );
  const button = (label = "Save") => (
    <Button
      {...save.buttonProps}
      disabled={!online || !dirty}
      variant="primary"
    >
      {label}
    </Button>
  );
  return { save, button, online, dialog: confirm.dialog };
}

/** A section's footer: offline note and the one Save. */
export function SectionFooter({
  online,
  children,
}: {
  readonly online: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div className="of-footer">
      {!online ? (
        <span className="pt-quiet">
          You're offline. Save when you're back online.
        </span>
      ) : null}
      <div className="pt-actions">{children}</div>
    </div>
  );
}

/** A list of short lines (highlights, how it works, benefits): add, edit, remove. */
export function LineList({
  label,
  values,
  onChange,
  addLabel,
  max = 12,
  maxLength = 220,
  disabled,
}: {
  readonly label: string;
  readonly values: readonly string[];
  readonly onChange: (values: string[]) => void;
  readonly addLabel: string;
  readonly max?: number;
  readonly maxLength?: number;
  readonly disabled?: boolean;
}) {
  return (
    <div className="of-lines">
      <p className="pt-label">{label}</p>
      {values.length > 0 ? (
        <ol className="of-lines__list">
          {values.map((value, index) => (
            <li key={index}>
              <Input
                aria-label={`${label} ${index + 1}`}
                disabled={disabled}
                maxLength={maxLength}
                onValueChange={(next) =>
                  onChange(
                    values.map((line, at) =>
                      at === index ? String(next ?? "") : line,
                    ),
                  )
                }
                value={value}
              />
              <IconButton
                disabled={disabled}
                label={`Remove ${label.toLowerCase()} ${index + 1}`}
                onClick={() => onChange(values.filter((_, at) => at !== index))}
                size="sm"
              >
                <Icon name="close" size="inline" />
              </IconButton>
            </li>
          ))}
        </ol>
      ) : null}
      {values.length < max ? (
        <Button
          disabled={disabled}
          onClick={() => onChange([...values, ""])}
          size="sm"
          variant="secondary"
        >
          {addLabel}
        </Button>
      ) : null}
    </div>
  );
}

export function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function cleanLines(values: readonly string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean);
}
