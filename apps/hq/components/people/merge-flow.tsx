"use client";

import {
  Button,
  Chip,
  Combobox,
  Field,
  Notice,
  RadioGroup,
  RadioOption,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { mergePeopleAction } from "@/app/(next)/(hq)/people/actions";
import { type MergeSide, mergePlan } from "./people-model";
import { reportFailure, unwrap } from "./people-result";

/**
 * Merge two records of one person: both side by side, the record to keep,
 * exactly what the merged person keeps and what moves across, then one
 * strong confirmation that says it. A junior and an adult are never merged.
 */
export function MergeFlow({
  people,
  initialA,
  initialB,
}: {
  readonly people: readonly MergeSide[];
  readonly initialA?: string;
  readonly initialB?: string;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [aId, setAId] = useState<string | null>(initialA ?? null);
  const [bId, setBId] = useState<string | null>(initialB ?? null);
  const [keep, setKeep] = useState<"a" | "b">("a");
  const options = useMemo(
    () => people.map((person) => ({ value: person.id, label: person.name })),
    [people],
  );
  const a = people.find((person) => person.id === aId);
  const b = people.find((person) => person.id === bId);
  const kept = keep === "a" ? a : b;
  const merged = keep === "a" ? b : a;
  const plan = kept && merged ? mergePlan(kept, merged) : undefined;

  const choose = (side: "a" | "b", value: string | null) => {
    if (side === "a") setAId(value);
    else setBId(value);
    const next = new URLSearchParams();
    const nextA = side === "a" ? value : aId;
    const nextB = side === "b" ? value : bId;
    if (nextA) next.set("a", nextA);
    if (nextB) next.set("b", nextB);
    const query = next.toString();
    router.replace(`/people/merge${query ? `?${query}` : ""}`, {
      scroll: false,
    });
  };

  const run = () => {
    if (!kept || !merged || !plan || plan.blocked) return;
    void confirm.run({
      tier: "strong",
      destructive: true,
      title: `Merge ${merged.name} into ${kept.name}?`,
      description: `${kept.name}'s record stays. ${merged.name}'s record is removed and everything in it joins ${kept.name}.`,
      scope: (
        <ul className="people-plain-list">
          {plan.kept.map((item) => (
            <li key={item.label}>{`${item.label}: ${item.value}`}</li>
          ))}
        </ul>
      ),
      recipients: `${kept.name} (kept) and ${merged.name} (merged in)`,
      consequence: `${plan.moved.join("; ")} move to ${kept.name}. A merge can't be undone.`,
      reference: `${kept.id} ← ${merged.id}`,
      verb: `Merge into ${kept.name}`,
      cancelLabel: "Keep both",
      agentConfirm: `Merges ${merged.name}'s record into ${kept.name}'s`,
      perform: async ({ idempotencyKey }) =>
        unwrap(
          await mergePeopleAction({
            keepId: kept.id,
            mergeId: merged.id,
            idempotencyKey,
          }),
        ),
      errorMessage: "Nothing was merged.",
      report: reportFailure("hq.people.merge_failed"),
    });
  };

  const column = (person: MergeSide | undefined, label: string) => (
    <div className="people-merge__side" data-kept={person && person === kept}>
      <p className="people-eyebrow">{label}</p>
      {person ? (
        <dl className="people-facts">
          <div>
            <dt>Name</dt>
            <dd>{person.name}</dd>
          </div>
          <div>
            <dt>Contact</dt>
            <dd>
              {person.isJunior
                ? "Through the guardian"
                : [person.email, person.phone].filter(Boolean).join(" · ") ||
                  "None"}
            </dd>
          </div>
          <div>
            <dt>Plan</dt>
            <dd>{person.plan ?? "No plan"}</dd>
          </div>
          <div>
            <dt>Credits</dt>
            <dd className="people-num">{person.credits}</dd>
          </div>
          <div>
            <dt>Joined</dt>
            <dd>{person.memberSince.slice(0, 10)}</dd>
          </div>
          <div>
            <dt>Coming up</dt>
            <dd className="people-num">{person.upcoming}</dd>
          </div>
        </dl>
      ) : (
        <p className="people-quiet">Choose a person.</p>
      )}
    </div>
  );

  return (
    <div className="people-merge">
      <div className="people-form people-form--grid">
        <Field label="First record">
          <Combobox
            emptyText="No one by that name"
            onValueChange={(value) => choose("a", value)}
            options={options}
            placeholder="Search by name"
            value={aId}
          />
        </Field>
        <Field label="Second record">
          <Combobox
            emptyText="No one by that name"
            onValueChange={(value) => choose("b", value)}
            options={options}
            placeholder="Search by name"
            value={bId}
          />
        </Field>
      </div>

      <section aria-label="Side by side" className="people-merge__compare">
        {column(a, "First record")}
        {column(b, "Second record")}
      </section>

      {a && b ? (
        <>
          <Field label="Keep">
            <RadioGroup
              inline
              onValueChange={(value) => setKeep(value as "a" | "b")}
              value={keep}
            >
              <RadioOption label={`${a.name}'s record`} value="a" />
              <RadioOption label={`${b.name}'s record`} value="b" />
            </RadioGroup>
          </Field>
          {plan?.blocked ? (
            <Notice role="alert" title="These can't be merged" tone="warning">
              {plan.blocked}
            </Notice>
          ) : plan ? (
            <section aria-label="What is kept" className="people-merge__plan">
              <ul className="people-merge__kept">
                {plan.kept.map((item) => (
                  <li key={item.label}>
                    <span className="people-quiet">{item.label}</span>
                    <strong>{item.value}</strong>
                    <Chip>
                      {item.from === "both"
                        ? "Added together"
                        : item.from === "kept"
                          ? `From ${kept!.name}`
                          : `From ${merged!.name}`}
                    </Chip>
                  </li>
                ))}
              </ul>
              <ul className="people-plain-list">
                {plan.moved.map((line) => (
                  <li key={line}>{`${line} move across.`}</li>
                ))}
              </ul>
            </section>
          ) : null}
          <div className="people-actions">
            <Button
              disabled={!plan || Boolean(plan.blocked)}
              onClick={run}
              variant="primary"
            >
              Review the merge
            </Button>
          </div>
        </>
      ) : null}
      {confirm.dialog}
    </div>
  );
}
