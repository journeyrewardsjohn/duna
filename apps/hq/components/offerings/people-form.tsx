"use client";

import { hqHref } from "@duna/core/hq-routes";
import {
  Button,
  Checkbox,
  Field,
  NumberInput,
  RadioGroup,
  RadioOption,
  Switch,
} from "@duna/ui/tideline";
import { useState } from "react";
import { saveOfferingAction } from "@/app/(next)/(hq)/offerings/actions";
import { SectionFooter, useSectionSave } from "./section-save";

/**
 * People › Coaches: who can run it (every coach, or chosen ones), how many
 * a session needs, and whether players pick their coach. With no coach on
 * the team yet, the fix is a link to invite one.
 */
export function CoachesForm({
  itemId,
  title,
  live,
  configuration,
  coaches,
  canWrite,
}: {
  readonly itemId: string;
  readonly title: string;
  readonly live: boolean;
  readonly configuration: Record<string, unknown>;
  readonly coaches: readonly { readonly id: string; readonly name: string }[];
  readonly canWrite: boolean;
}) {
  const initialMode =
    configuration.coachAssignmentMode === "selected" ? "selected" : "all";
  const initialIds = Array.isArray(configuration.coachPersonIds)
    ? configuration.coachPersonIds.filter(
        (id): id is string => typeof id === "string",
      )
    : [];
  const [mode, setMode] = useState(initialMode);
  const [ids, setIds] = useState<string[]>(
    initialMode === "selected" ? initialIds : [],
  );
  const [required, setRequired] = useState<number | null>(
    typeof configuration.requiredCoachCount === "number"
      ? configuration.requiredCoachCount
      : 1,
  );
  const [pick, setPick] = useState(
    configuration.customerCoachSelection !== false,
  );
  const problems: string[] = [];
  if (mode === "selected" && ids.length === 0)
    problems.push("Choose at least one coach.");
  const pool = mode === "selected" ? ids.length : coaches.length;
  if (required !== null && pool > 0 && required > pool) {
    problems.push("It can't need more coaches than can run it.");
  }
  const state = JSON.stringify({ mode, ids, required, pick });
  const [initial] = useState(state);
  const dirty = state !== initial;
  const { button, online, dialog } = useSectionSave({
    what: "Coaches",
    dirty: dirty && problems.length === 0,
    live,
    title,
    perform: (idempotencyKey) =>
      saveOfferingAction({
        itemId,
        configuration: {
          coachAssignmentMode: mode,
          coachPersonIds:
            mode === "selected" ? ids : coaches.map((coach) => coach.id),
          requiredCoachCount: required ?? 1,
          customerCoachSelection: pick,
        },
        idempotencyKey,
      }),
  });
  if (coaches.length === 0) {
    return (
      <div className="of-form">
        <p className="pt-quiet">
          No coach is on your team yet, so nobody can run it or be picked.
        </p>
        <Button href={hqHref("teamInvite")} size="sm" variant="secondary">
          Invite a coach
        </Button>
      </div>
    );
  }
  const disabled = !canWrite;
  return (
    <form className="of-form" onSubmit={(event) => event.preventDefault()}>
      <RadioGroup
        aria-label="Who can run it"
        disabled={disabled}
        onValueChange={(value) =>
          setMode(value === "selected" ? "selected" : "all")
        }
        value={mode}
      >
        <RadioOption
          description={`${coaches.length} coach${coaches.length === 1 ? "" : "es"} today, and anyone who joins.`}
          label="Every coach"
          value="all"
        />
        <RadioOption label="Chosen coaches" value="selected" />
      </RadioGroup>
      {mode === "selected" ? (
        <fieldset className="of-fieldset">
          <legend className="pt-label">Coaches</legend>
          {coaches.map((coach) => (
            <Checkbox
              checked={ids.includes(coach.id)}
              disabled={disabled}
              key={coach.id}
              label={coach.name}
              onCheckedChange={(checked) =>
                setIds((current) =>
                  checked
                    ? [...current, coach.id]
                    : current.filter((id) => id !== coach.id),
                )
              }
            />
          ))}
        </fieldset>
      ) : null}
      <Field label="Coaches each session needs">
        <NumberInput
          disabled={disabled}
          min={1}
          onValueChange={(value) =>
            setRequired(value === null ? null : Math.trunc(value))
          }
          value={required}
        />
      </Field>
      <Switch
        checked={pick}
        disabled={disabled}
        label="Players choose their coach"
        onCheckedChange={setPick}
      />
      {problems.length > 0 && dirty ? (
        <ul className="of-issues" role="alert">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      {canWrite ? (
        <SectionFooter online={online}>{button("Save coaches")}</SectionFooter>
      ) : null}
      {dialog}
    </form>
  );
}
