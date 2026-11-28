"use client";

import {
  MAX_PARTICIPATION_CAPACITY,
  participationPreset,
  type ParticipationPresetId,
} from "@duna/core";
import {
  NumberInput,
  RadioGroup,
  RadioOption,
  Select,
} from "@duna/ui/tideline";
import { useId } from "react";
import {
  draftFromPreset,
  draftPreset,
  LOCK_CHOICES,
  lockPhrase,
  RULE_PRESETS,
  type RuleDraft,
} from "./rule-model";

function presetLine(id: ParticipationPresetId): string {
  const preset = participationPreset(id);
  const rule = preset.rule;
  const players = (n: number) => `${n} player${n === 1 ? "" : "s"}`;
  const size =
    rule.minParticipants === rule.maxParticipants
      ? players(rule.maxParticipants)
      : `${rule.minParticipants} to ${players(rule.maxParticipants)}`;
  return [
    size,
    rule.minParticipants > 1 ? "cancel if fewer" : undefined,
    rule.waitlist ? "waitlist" : undefined,
    preset.priceBySize ? "price by group size" : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The four presets (participation.md §7.1), and Custom when the rule is its own. */
export function RulePresets({
  draft,
  onChange,
  disabled,
}: {
  readonly draft: RuleDraft;
  readonly onChange: (draft: RuleDraft) => void;
  readonly disabled?: boolean;
}) {
  const current = draftPreset(draft) ?? "custom";
  const labelId = useId();
  return (
    <div className="pt-presets">
      <p className="pt-label" id={labelId}>
        Start from
      </p>
      <RadioGroup
        aria-labelledby={labelId}
        className="pt-presets__group"
        disabled={disabled}
        onValueChange={(value) => {
          if (value === "custom") return;
          onChange(draftFromPreset(value as ParticipationPresetId, draft));
        }}
        value={current}
      >
        {RULE_PRESETS.map((preset) => (
          <RadioOption
            description={presetLine(preset.id)}
            key={preset.id}
            label={preset.label}
            value={preset.id}
          />
        ))}
        <RadioOption
          description="Your own numbers, below."
          label="Custom"
          value="custom"
        />
      </RadioGroup>
    </div>
  );
}

/**
 * The rule as a sentence whose words are controls (participation.md §7.1):
 * "Runs with at least [3] players, up to [8]. We decide [24 hours] before it
 * starts. If fewer are booked, [cancel and return credits or payment]."
 * The decision time is also the free-cancellation deadline; the sentence
 * says so once.
 */
export function RuleSentence({
  draft,
  onChange,
  disabled,
  capacityEditable = true,
  defaultLockMinutes,
  defaultLockLabel = "the club default",
}: {
  readonly draft: RuleDraft;
  readonly onChange: (draft: RuleDraft) => void;
  readonly disabled?: boolean;
  /** Off for the club default: each offering sets its own capacity. */
  readonly capacityEditable?: boolean;
  /** What "the club default" decision time is, to say it in words. */
  readonly defaultLockMinutes?: number;
  readonly defaultLockLabel?: string;
}) {
  const noun = draft.unit === "team" ? "teams" : "players";
  const hasMinimum = (draft.minParticipants ?? 1) > 1;
  const set = (patch: Partial<RuleDraft>) => onChange({ ...draft, ...patch });
  const lockValue =
    draft.lockMinutes === null ? "default" : String(draft.lockMinutes);
  const lockOptions = [
    ...(defaultLockMinutes !== undefined
      ? [
          {
            value: "default",
            label: `${lockPhrase(defaultLockMinutes)} (${defaultLockLabel})`,
          },
        ]
      : []),
    ...LOCK_CHOICES.map((minutes) => ({
      value: String(minutes),
      label: lockPhrase(minutes),
    })),
    ...(draft.lockMinutes !== null && !LOCK_CHOICES.includes(draft.lockMinutes)
      ? [
          {
            value: String(draft.lockMinutes),
            label: lockPhrase(draft.lockMinutes),
          },
        ]
      : []),
  ];
  return (
    <div className="pt-sentence" data-disabled={disabled || undefined}>
      <div className="pt-sentence__line">
        <span>Runs with at least</span>
        <NumberInput
          aria-label={`Fewest ${noun} it runs with`}
          className="pt-sentence__number"
          disabled={disabled}
          max={MAX_PARTICIPATION_CAPACITY}
          min={1}
          onValueChange={(value) =>
            set({ minParticipants: value === null ? null : Math.trunc(value) })
          }
          value={draft.minParticipants}
        />
        <span>
          {(draft.minParticipants ?? 1) === 1 ? noun.slice(0, -1) : noun}
          {capacityEditable ? "," : "."}
        </span>
        {capacityEditable ? (
          <>
            <span>up to</span>
            <NumberInput
              aria-label={`Most ${noun} a session holds`}
              className="pt-sentence__number"
              disabled={disabled}
              max={MAX_PARTICIPATION_CAPACITY}
              min={1}
              onValueChange={(value) =>
                set({ capacity: value === null ? null : Math.trunc(value) })
              }
              value={draft.capacity}
            />
          </>
        ) : null}
      </div>
      {hasMinimum ? (
        <>
          <div className="pt-sentence__line">
            <span>We decide</span>
            <Select
              aria-label="When we decide"
              className="pt-sentence__select"
              disabled={disabled}
              onValueChange={(value) =>
                set({
                  lockMinutes:
                    value === "default" || value === null
                      ? null
                      : Number(value),
                })
              }
              options={lockOptions}
              value={
                lockValue === "default" && defaultLockMinutes === undefined
                  ? "1440"
                  : lockValue
              }
            />
            <span>before it starts.</span>
          </div>
          <div className="pt-sentence__line">
            <span>If fewer are booked,</span>
            <Select
              aria-label="If fewer are booked"
              className="pt-sentence__select"
              disabled={disabled}
              onValueChange={(value) =>
                set({ policy: value === "run" ? "run" : "cancel" })
              }
              options={[
                {
                  value: "cancel",
                  label: "cancel and return credits or payment",
                },
                { value: "run", label: "run it anyway" },
              ]}
              value={draft.policy}
            />
          </div>
          <p className="pt-sentence__note">
            That time is also the last moment players can cancel for free.
          </p>
        </>
      ) : null}
      <div className="pt-sentence__line">
        <span>When it&apos;s full,</span>
        <Select
          aria-label="When it's full"
          className="pt-sentence__select"
          disabled={disabled}
          onValueChange={(value) => set({ waitlist: value === "waitlist" })}
          options={[
            { value: "waitlist", label: "keep a waitlist" },
            { value: "none", label: "don't keep a waitlist" },
          ]}
          value={draft.waitlist ? "waitlist" : "none"}
        />
      </div>
    </div>
  );
}
