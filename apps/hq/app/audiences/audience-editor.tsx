"use client";

import { useState, useTransition } from "react";
import {
  createAudienceAction,
  previewAudienceAction,
  reviseAudienceAction,
} from "./actions";

type Person = {
  readonly id: string;
  readonly displayName: string;
  readonly initials: string;
};
const facts = [
  "person-type",
  "verified-dependent-count",
  "registration",
  "session-count",
  "lifetime-value-minor",
  "payment-state",
  "membership-status",
  "last-activity-at",
] as const;
const operatorsByFact: Record<(typeof facts)[number], readonly string[]> = {
  "person-type": ["is", "is-not"],
  "verified-dependent-count": [
    "is",
    "greater-than",
    "greater-than-or-equal",
    "less-than",
    "less-than-or-equal",
  ],
  registration: ["is", "is-not"],
  "session-count": [
    "is",
    "greater-than",
    "greater-than-or-equal",
    "less-than",
    "less-than-or-equal",
  ],
  "lifetime-value-minor": [
    "is",
    "greater-than",
    "greater-than-or-equal",
    "less-than",
    "less-than-or-equal",
  ],
  "payment-state": ["is", "is-not"],
  "membership-status": ["is", "is-not"],
  "last-activity-at": ["before", "after"],
};

export function AudienceEditor({
  people,
  audienceId,
  initialName = "",
  initialMode = "static",
  initialIncludePersonIds = [],
  initialExcludePersonIds = [],
  initialRuleAst,
}: {
  readonly people: readonly Person[];
  readonly audienceId?: string;
  readonly initialName?: string;
  readonly initialMode?: "static" | "dynamic" | "hybrid";
  readonly initialIncludePersonIds?: readonly string[];
  readonly initialExcludePersonIds?: readonly string[];
  readonly initialRuleAst?: unknown;
}) {
  const initialRuleState = (() => {
    if (!initialRuleAst || typeof initialRuleAst !== "object") return undefined;
    const root = (
      initialRuleAst as {
        root?: { operator?: "all" | "any"; rules?: unknown[] };
      }
    ).root;
    const conditionIndex =
      root?.rules?.findIndex((item) =>
        Boolean(
          item &&
          typeof item === "object" &&
          (item as { kind?: string }).kind === "condition",
        ),
      ) ?? -1;
    const condition = root?.rules?.find(
      (
        item,
      ): item is {
        kind: "condition";
        fact: (typeof facts)[number];
        operator: string;
        value: unknown;
      } =>
        Boolean(
          item &&
          typeof item === "object" &&
          (item as { kind?: string }).kind === "condition",
        ),
    );
    return {
      group: root?.operator,
      condition,
      conditionIndex,
      rules: Array.isArray(root?.rules) ? root.rules : [],
    };
  })();
  const [name, setName] = useState(initialName);
  const [mode, setMode] = useState<"static" | "dynamic" | "hybrid">(
    initialMode,
  );
  const [group, setGroup] = useState<"all" | "any">(
    initialRuleState?.group ?? "all",
  );
  const [fact, setFact] = useState<(typeof facts)[number]>(
    initialRuleState?.condition?.fact ?? "person-type",
  );
  const [operator, setOperator] = useState(
    initialRuleState?.condition?.operator ?? "is",
  );
  const [value, setValue] = useState(
    typeof initialRuleState?.condition?.value === "object"
      ? ""
      : String(initialRuleState?.condition?.value ?? "player"),
  );
  const initialRegistration =
    initialRuleState?.condition?.fact === "registration" &&
    initialRuleState.condition.value &&
    typeof initialRuleState.condition.value === "object"
      ? (initialRuleState.condition.value as {
          kind?: "event" | "product";
          referenceId?: string;
          status?: string;
        })
      : undefined;
  const [registrationKind, setRegistrationKind] = useState<"event" | "product">(
    initialRegistration?.kind ?? "event",
  );
  const [registrationReferenceId, setRegistrationReferenceId] = useState(
    initialRegistration?.referenceId ?? "",
  );
  const [registrationStatus, setRegistrationStatus] = useState(
    initialRegistration?.status ?? "registered",
  );
  const [included, setIncluded] = useState<string[]>([
    ...initialIncludePersonIds,
  ]);
  const [excluded, setExcluded] = useState<string[]>([
    ...initialExcludePersonIds,
  ]);
  const [notice, setNotice] = useState("");
  const [revisionKey, setRevisionKey] = useState(() => crypto.randomUUID());
  const [pending, startTransition] = useTransition();
  const editedCondition = {
    kind: "condition" as const,
    fact,
    operator,
    value:
      fact === "registration"
        ? {
            kind: registrationKind,
            referenceId: registrationReferenceId,
            status: registrationStatus,
          }
        : [
              "verified-dependent-count",
              "session-count",
              "lifetime-value-minor",
            ].includes(fact)
          ? Number(value)
          : value,
  };
  const canEditCondition = Boolean(
    initialRuleState?.condition &&
    operatorsByFact[initialRuleState.condition.fact]?.includes(
      initialRuleState.condition.operator,
    ),
  );
  const preserveAdvancedRule = Boolean(
    audienceId &&
    initialRuleState?.rules.length &&
    (initialRuleState.conditionIndex < 0 || !canEditCondition),
  );
  const rules = initialRuleState?.rules.length
    ? initialRuleState.conditionIndex >= 0
      ? initialRuleState.rules.map((rule, index) =>
          index === initialRuleState.conditionIndex ? editedCondition : rule,
        )
      : initialRuleState.rules
    : [editedCondition];
  const ruleAst = preserveAdvancedRule
    ? initialRuleAst
    : {
        version: 1,
        root: {
          kind: "group" as const,
          operator: group,
          rules,
        },
      };
  const toggle = (id: string, kind: "include" | "exclude") => {
    const set = kind === "include" ? setIncluded : setExcluded;
    const other = kind === "include" ? setExcluded : setIncluded;
    set((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
    other((current) => current.filter((item) => item !== id));
  };
  return (
    <form
      className="audience-editor module-card"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          try {
            const saved = audienceId
              ? await reviseAudienceAction({
                  audienceId,
                  ruleAst,
                  includePersonIds: included,
                  excludePersonIds: excluded,
                  idempotencyKey: revisionKey,
                })
              : await createAudienceAction({
                  name,
                  mode,
                  ruleAst,
                  includePersonIds: included,
                  excludePersonIds: excluded,
                });
            setNotice(`Saved ${saved.name} · revision ${saved.revision}`);
            setRevisionKey(crypto.randomUUID());
          } catch (error) {
            setNotice(
              error instanceof Error
                ? error.message
                : "Could not save audience.",
            );
          }
        });
      }}
    >
      <label>
        Name
        <input
          disabled={Boolean(audienceId)}
          required
          minLength={2}
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. U18 summer players"
        />
      </label>
      <fieldset className="audience-mode-options">
        <legend>How should Duna build this audience?</legend>
        {(["static", "dynamic", "hybrid"] as const).map((item) => (
          <label key={item}>
            <input
              checked={mode === item}
              disabled={Boolean(audienceId)}
              name="mode"
              onChange={() => setMode(item)}
              type="radio"
              value={item}
            />{" "}
            {item}
          </label>
        ))}
      </fieldset>
      {mode !== "static" && (
        <section>
          <h2>
            Match people when {group === "all" ? "every" : "any"} rule applies
          </h2>
          {preserveAdvancedRule ? (
            <p>
              This revision uses advanced or nested rules. They will be
              preserved exactly; use the advanced rule builder to change them.
            </p>
          ) : (
            <>
              <label>
                Match{" "}
                <select
                  value={group}
                  onChange={(event) =>
                    setGroup(event.target.value as "all" | "any")
                  }
                >
                  <option value="all">all rules</option>
                  <option value="any">any rule</option>
                </select>
              </label>
              <label>
                Field{" "}
                <select
                  value={fact}
                  onChange={(event) => {
                    const next = event.target.value as typeof fact;
                    setFact(next);
                    setOperator(operatorsByFact[next][0]!);
                    setValue(
                      next === "person-type"
                        ? "player"
                        : next === "payment-state"
                          ? "pending"
                          : "",
                    );
                  }}
                >
                  {facts.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Operator{" "}
                <select
                  value={operator}
                  onChange={(event) => setOperator(event.target.value)}
                >
                  {operatorsByFact[fact].map((item) => (
                    <option key={item} value={item}>
                      {item.replaceAll("-", " ")}
                    </option>
                  ))}
                </select>
              </label>
              {fact === "registration" ? (
                <fieldset>
                  <legend>Registration</legend>
                  <label>
                    Type{" "}
                    <select
                      value={registrationKind}
                      onChange={(event) =>
                        setRegistrationKind(
                          event.target.value as "event" | "product",
                        )
                      }
                    >
                      <option value="event">Event</option>
                      <option value="product">Product</option>
                    </select>
                  </label>
                  <label>
                    Event or product ID{" "}
                    <input
                      required
                      value={registrationReferenceId}
                      onChange={(event) =>
                        setRegistrationReferenceId(event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Registration status{" "}
                    <input
                      required
                      value={registrationStatus}
                      onChange={(event) =>
                        setRegistrationStatus(event.target.value)
                      }
                    />
                  </label>
                </fieldset>
              ) : (
                <label>
                  {fact === "lifetime-value-minor"
                    ? "Value in minor currency units"
                    : "Value"}{" "}
                  {fact === "person-type" ? (
                    <select
                      value={value}
                      onChange={(event) => setValue(event.target.value)}
                    >
                      <option value="player">Player</option>
                      <option value="adult-guardian">Adult guardian</option>
                      <option value="minor">Minor</option>
                    </select>
                  ) : fact === "payment-state" ? (
                    <select
                      value={value}
                      onChange={(event) => setValue(event.target.value)}
                    >
                      <option value="failed">Failed</option>
                      <option value="pending">Pending</option>
                      <option value="overdue">Overdue</option>
                    </select>
                  ) : (
                    <input
                      required
                      inputMode={
                        [
                          "verified-dependent-count",
                          "session-count",
                          "lifetime-value-minor",
                        ].includes(fact)
                          ? "numeric"
                          : undefined
                      }
                      value={value}
                      onChange={(event) => setValue(event.target.value)}
                    />
                  )}
                </label>
              )}
              <button
                type="button"
                onClick={() =>
                  startTransition(async () => {
                    const preview = await previewAudienceAction(ruleAst);
                    setNotice(
                      preview.unavailableFactKeys.length
                        ? `Preview: ${preview.estimatedSize} people; unavailable facts: ${preview.unavailableFactKeys.join(", ")}`
                        : `Preview: ${preview.estimatedSize} people · ${preview.ruleHash}`,
                    );
                  })
                }
              >
                Preview rule
              </button>
            </>
          )}
        </section>
      )}
      {mode !== "dynamic" && (
        <section>
          <h2>Explicit people</h2>
          <p>
            Select people to include or exclude. Exclusions win in hybrid
            audiences.
          </p>
          {people.map((person) => (
            <div className="audience-person-row" key={person.id}>
              <strong>
                {person.initials} · {person.displayName}
              </strong>
              <button
                type="button"
                aria-pressed={included.includes(person.id)}
                onClick={() => toggle(person.id, "include")}
              >
                Include
              </button>
              <button
                type="button"
                aria-pressed={excluded.includes(person.id)}
                onClick={() => toggle(person.id, "exclude")}
              >
                Exclude
              </button>
            </div>
          ))}
        </section>
      )}
      <p role="status">
        {notice ||
          "No delivery, discounts, credits, or payment activity starts from an audience."}
      </p>
      <button
        className="button button--primary"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving…" : "Save immutable revision"}
      </button>
    </form>
  );
}
