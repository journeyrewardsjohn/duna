"use client";

import {
  Avatar,
  AvatarStack,
  Badge,
  Button,
  Field,
  Input,
  ProgressBar,
  Select,
} from "@duna/ui";
import {
  CalendarDays,
  Check,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  Filter,
  Layers3,
  Plus,
  Search,
  ShieldCheck,
  Tag,
  Trash2,
  UserRoundCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  createAudienceAction,
  previewAudienceAction,
  reviseAudienceAction,
} from "./actions";

export type AudiencePerson = {
  readonly id: string;
  readonly displayName: string;
  readonly initials: string;
  readonly avatarUrl?: string;
  readonly homeMarket?: string;
  readonly isMinor: boolean;
  readonly roles: readonly ("player" | "member" | "parent")[];
  readonly sandRating?: number;
};

export type AudienceReference = {
  readonly id: string;
  readonly title: string;
  readonly detail?: string;
  readonly kind: "event" | "product";
};

type AudienceMode = "static" | "dynamic" | "hybrid";
type FactKey =
  | "person-type"
  | "verified-dependent-count"
  | "registration"
  | "session-count"
  | "lifetime-value-minor"
  | "payment-state"
  | "membership-status"
  | "last-activity-at";

type SimpleRule = {
  readonly id: string;
  readonly kind: "condition";
  readonly fact: FactKey;
  readonly operator: string;
  readonly value: unknown;
};

type Preview = {
  readonly candidateCount: number;
  readonly estimatedSize: number;
  readonly unavailableFactKeys: readonly string[];
  readonly members: readonly {
    readonly personId: string;
    readonly reasonCode: string;
  }[];
};

const OPERATORS: Record<FactKey, readonly string[]> = {
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

const OPERATOR_LABELS: Record<string, string> = {
  is: "is",
  "is-not": "is not",
  "greater-than": "is more than",
  "greater-than-or-equal": "is at least",
  "less-than": "is less than",
  "less-than-or-equal": "is at most",
  before: "is before",
  after: "is after",
};

const FACTS = [
  {
    key: "person-type",
    label: "Person type",
    description: "Player, parent, or minor",
    category: "People & family",
    icon: UsersRound,
  },
  {
    key: "verified-dependent-count",
    label: "Linked players",
    description: "Verified players in a family",
    category: "People & family",
    icon: ShieldCheck,
  },
  {
    key: "registration",
    label: "Registration",
    description: "Event or product registration",
    category: "Participation",
    icon: CalendarDays,
  },
  {
    key: "session-count",
    label: "Sessions attended",
    description: "Number of recorded sessions",
    category: "Participation",
    icon: UserRoundCheck,
  },
  {
    key: "lifetime-value-minor",
    label: "Lifetime value",
    description: "Settled customer value",
    category: "Payments",
    icon: CircleDollarSign,
  },
  {
    key: "payment-state",
    label: "Payment status",
    description: "Failed, pending, or overdue",
    category: "Payments",
    icon: WalletCards,
  },
  {
    key: "membership-status",
    label: "Membership status",
    description: "Current membership lifecycle",
    category: "Membership & activity",
    icon: Tag,
  },
  {
    key: "last-activity-at",
    label: "Last activity",
    description: "Most recent recorded activity",
    category: "Membership & activity",
    icon: Clock3,
  },
] as const satisfies readonly {
  key: FactKey;
  label: string;
  description: string;
  category: string;
  icon: typeof UsersRound;
}[];

const FACT_BY_KEY = new Map(FACTS.map((fact) => [fact.key, fact]));
const FACT_CATEGORIES = [...new Set(FACTS.map((fact) => fact.category))];

function defaultValue(fact: FactKey): unknown {
  if (fact === "person-type") return "player";
  if (fact === "verified-dependent-count" || fact === "session-count") return 1;
  if (fact === "lifetime-value-minor") return 10_000;
  if (fact === "payment-state") return "failed";
  if (fact === "membership-status") return "active";
  if (fact === "last-activity-at") return new Date().toISOString();
  return { kind: "event", referenceId: "", status: "registered" };
}

function createRule(fact: FactKey = "person-type"): SimpleRule {
  return {
    id: crypto.randomUUID(),
    kind: "condition",
    fact,
    operator: OPERATORS[fact][0]!,
    value: defaultValue(fact),
  };
}

function hydrateRules(initialRuleAst: unknown): {
  readonly advanced: boolean;
  readonly group: "all" | "any";
  readonly rules: readonly SimpleRule[];
} {
  if (!initialRuleAst || typeof initialRuleAst !== "object")
    return { advanced: false, group: "all", rules: [createRule()] };
  const root = (
    initialRuleAst as {
      root?: { operator?: "all" | "any"; rules?: unknown[] };
    }
  ).root;
  if (!root || !Array.isArray(root.rules) || !root.rules.length)
    return { advanced: true, group: "all", rules: [] };
  const rules: SimpleRule[] = [];
  for (const [index, item] of root.rules.entries()) {
    if (!item || typeof item !== "object")
      return { advanced: true, group: root.operator ?? "all", rules: [] };
    const condition = item as {
      kind?: string;
      fact?: FactKey;
      operator?: string;
      value?: unknown;
    };
    if (
      condition.kind !== "condition" ||
      !condition.fact ||
      !FACT_BY_KEY.has(condition.fact) ||
      !condition.operator ||
      !OPERATORS[condition.fact].includes(condition.operator)
    )
      return { advanced: true, group: root.operator ?? "all", rules: [] };
    rules.push({
      id: `existing-${index}`,
      kind: "condition",
      fact: condition.fact,
      operator: condition.operator,
      value: condition.value,
    });
  }
  return {
    advanced: false,
    group: root.operator ?? "all",
    rules,
  };
}

function ruleIsComplete(rule: SimpleRule): boolean {
  if (
    rule.fact === "verified-dependent-count" ||
    rule.fact === "session-count" ||
    rule.fact === "lifetime-value-minor"
  )
    return typeof rule.value === "number" && Number.isFinite(rule.value);
  if (rule.fact === "registration") {
    const value = rule.value as {
      referenceId?: string;
      kind?: string;
      status?: string;
    };
    return Boolean(value.referenceId && value.kind && value.status);
  }
  if (rule.fact === "last-activity-at")
    return (
      typeof rule.value === "string" && !Number.isNaN(Date.parse(rule.value))
    );
  return typeof rule.value === "string" && rule.value.length > 0;
}

function roleLabel(role: AudiencePerson["roles"][number]): string {
  return role === "parent" ? "Parent" : role[0]!.toUpperCase() + role.slice(1);
}

function factLabel(key: string): string {
  return FACT_BY_KEY.get(key as FactKey)?.label ?? key.replaceAll("-", " ");
}

export function AudienceEditor({
  people,
  references = [],
  audienceId,
  initialName = "",
  initialMode = "static",
  initialIncludePersonIds = [],
  initialExcludePersonIds = [],
  initialRuleAst,
}: {
  readonly people: readonly AudiencePerson[];
  readonly references?: readonly AudienceReference[];
  readonly audienceId?: string;
  readonly initialName?: string;
  readonly initialMode?: AudienceMode;
  readonly initialIncludePersonIds?: readonly string[];
  readonly initialExcludePersonIds?: readonly string[];
  readonly initialRuleAst?: unknown;
}) {
  const router = useRouter();
  const initialRules = useMemo(
    () => hydrateRules(initialRuleAst),
    [initialRuleAst],
  );
  const [name, setName] = useState(initialName);
  const [mode, setMode] = useState<AudienceMode>(initialMode);
  const [group, setGroup] = useState<"all" | "any">(initialRules.group);
  const [rules, setRules] = useState<readonly SimpleRule[]>(initialRules.rules);
  const [included, setIncluded] = useState<string[]>([
    ...initialIncludePersonIds,
  ]);
  const [excluded, setExcluded] = useState<string[]>([
    ...initialExcludePersonIds,
  ]);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const [previewError, setPreviewError] = useState("");
  const [createKey, setCreateKey] = useState(() => crypto.randomUUID());
  const [revisionKey, setRevisionKey] = useState(() => crypto.randomUUID());
  const [saving, startSaving] = useTransition();
  const [previewing, startPreviewing] = useTransition();
  const previewSequence = useRef(0);
  const addRuleMenu = useRef<HTMLDetailsElement>(null);

  const ruleAst = useMemo(
    () =>
      initialRules.advanced
        ? initialRuleAst
        : {
            version: 1,
            root: {
              kind: "group" as const,
              operator: group,
              rules: rules.map((rule) => ({
                kind: rule.kind,
                fact: rule.fact,
                operator: rule.operator,
                value: rule.value,
              })),
            },
          },
    [group, initialRuleAst, initialRules.advanced, rules],
  );

  const definitionReady =
    initialRules.advanced ||
    (rules.length > 0 && rules.every((rule) => ruleIsComplete(rule)));
  const canSave = name.trim().length >= 2 && definitionReady;

  useEffect(() => {
    if (!definitionReady || !ruleAst) {
      setPreview(undefined);
      return;
    }
    const sequence = ++previewSequence.current;
    const timer = window.setTimeout(() => {
      startPreviewing(async () => {
        try {
          const result = await previewAudienceAction({
            mode,
            ruleAst,
            includePersonIds: mode === "dynamic" ? [] : included,
            excludePersonIds: mode === "hybrid" ? excluded : [],
          });
          if (sequence !== previewSequence.current) return;
          setPreview(result);
          setPreviewError("");
        } catch (error) {
          if (sequence !== previewSequence.current) return;
          setPreview(undefined);
          setPreviewError(
            error instanceof Error ? error.message : "Preview is unavailable.",
          );
        }
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [definitionReady, excluded, included, mode, ruleAst]);

  const filteredPeople = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return people;
    return people.filter((person) =>
      [
        person.displayName,
        person.homeMarket,
        ...person.roles,
        person.sandRating?.toFixed(2),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized)),
    );
  }, [people, query]);

  const includedPreviewPeople = (preview?.members ?? [])
    .map((member) => people.find((person) => person.id === member.personId))
    .filter((person): person is AudiencePerson => Boolean(person));
  const previewPercent = preview?.candidateCount
    ? Math.round((preview.estimatedSize / preview.candidateCount) * 100)
    : 0;

  const updateRule = (id: string, update: Partial<SimpleRule>) =>
    setRules((current) =>
      current.map((rule) => (rule.id === id ? { ...rule, ...update } : rule)),
    );

  const chooseFact = (id: string, fact: FactKey) =>
    updateRule(id, {
      fact,
      operator: OPERATORS[fact][0]!,
      value: defaultValue(fact),
    });

  const addRule = (fact: FactKey) => {
    setRules((current) => [...current, createRule(fact)]);
    if (addRuleMenu.current) addRuleMenu.current.open = false;
  };

  const togglePerson = (id: string, disposition: "include" | "exclude") => {
    const active = disposition === "include" ? included : excluded;
    const setActive = disposition === "include" ? setIncluded : setExcluded;
    const setOther = disposition === "include" ? setExcluded : setIncluded;
    setActive(
      active.includes(id)
        ? active.filter((personId) => personId !== id)
        : [...active, id],
    );
    setOther((current) => current.filter((personId) => personId !== id));
  };

  return (
    <form
      className="audience-builder"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSave || !ruleAst) {
          setNotice("Complete the audience name and every rule before saving.");
          return;
        }
        startSaving(async () => {
          try {
            const saved = audienceId
              ? await reviseAudienceAction({
                  audienceId,
                  ruleAst,
                  includePersonIds: mode === "dynamic" ? [] : included,
                  excludePersonIds: mode === "hybrid" ? excluded : [],
                  idempotencyKey: revisionKey,
                })
              : await createAudienceAction({
                  name,
                  mode,
                  ruleAst,
                  includePersonIds: mode === "dynamic" ? [] : included,
                  excludePersonIds: mode === "hybrid" ? excluded : [],
                  idempotencyKey: createKey,
                });
            setNotice(
              audienceId
                ? `Revision ${saved.revision} is now current.`
                : `${saved.name} is ready to use.`,
            );
            if (audienceId) {
              setRevisionKey(crypto.randomUUID());
              router.refresh();
            } else {
              setCreateKey(crypto.randomUUID());
              router.push(`/audiences/${saved.id}`);
            }
          } catch (error) {
            setNotice(
              error instanceof Error
                ? error.message
                : "Could not save this audience.",
            );
          }
        });
      }}
    >
      <div className="audience-builder__main">
        <section className="audience-builder__panel audience-builder__identity">
          <div className="audience-builder__section-heading">
            <span>1</span>
            <div>
              <h2>Name the audience</h2>
              <p>
                Use a name your staff will recognize in messages and offers.
              </p>
            </div>
          </div>
          <Field htmlFor="audience-name" label="Audience name" required>
            <Input
              autoComplete="off"
              disabled={Boolean(audienceId)}
              id="audience-name"
              minLength={2}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. U18 summer players"
              required
              value={name}
            />
          </Field>
        </section>

        <section className="audience-builder__panel">
          <div className="audience-builder__section-heading">
            <span>2</span>
            <div>
              <h2>Choose how membership works</h2>
              <p>Build from saved people, live rules, or both.</p>
            </div>
          </div>
          <div className="audience-mode-grid" role="radiogroup">
            {(
              [
                {
                  value: "static",
                  title: "Selected people",
                  description: "A roster you curate by hand.",
                  icon: UserRoundCheck,
                },
                {
                  value: "dynamic",
                  title: "Live rules",
                  description: "Updates as people and activity change.",
                  icon: Filter,
                },
                {
                  value: "hybrid",
                  title: "Rules + people",
                  description: "Start with rules, then include or exclude.",
                  icon: Layers3,
                },
              ] as const
            ).map((option) => {
              const Icon = option.icon;
              return (
                <button
                  aria-checked={mode === option.value}
                  className="audience-mode-card"
                  disabled={Boolean(audienceId)}
                  key={option.value}
                  onClick={() => setMode(option.value)}
                  role="radio"
                  type="button"
                >
                  <Icon aria-hidden size={20} />
                  <strong>{option.title}</strong>
                  <span>{option.description}</span>
                  {mode === option.value && <Check aria-hidden size={18} />}
                </button>
              );
            })}
          </div>
        </section>

        {mode !== "static" && (
          <section className="audience-builder__panel audience-rule-builder">
            <div className="audience-builder__section-heading audience-builder__section-heading--split">
              <span>3</span>
              <div>
                <h2>Set the rules</h2>
                <p>Every field uses the control that fits its data.</p>
              </div>
              <div
                aria-label="Rule matching behavior"
                className="audience-match-toggle"
                role="group"
              >
                <button
                  aria-pressed={group === "all"}
                  onClick={() => setGroup("all")}
                  type="button"
                >
                  All rules <small>AND</small>
                </button>
                <button
                  aria-pressed={group === "any"}
                  onClick={() => setGroup("any")}
                  type="button"
                >
                  Any rule <small>OR</small>
                </button>
              </div>
            </div>

            {initialRules.advanced ? (
              <div className="audience-advanced-notice">
                <ShieldCheck aria-hidden size={20} />
                <div>
                  <strong>Advanced rules are protected</strong>
                  <p>
                    This audience contains nested logic. Duna will preserve it
                    exactly when you save a new revision.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="audience-rule-list">
                  {rules.map((rule, index) => (
                    <div key={rule.id}>
                      {index > 0 && (
                        <div className="audience-rule-joiner">
                          <span>{group === "all" ? "AND" : "OR"}</span>
                        </div>
                      )}
                      <RuleEditor
                        onChange={(update) => updateRule(rule.id, update)}
                        onFactChange={(fact) => chooseFact(rule.id, fact)}
                        onRemove={() =>
                          setRules((current) =>
                            current.filter((item) => item.id !== rule.id),
                          )
                        }
                        references={references}
                        removable={rules.length > 1}
                        rule={rule}
                      />
                    </div>
                  ))}
                </div>
                <div className="audience-rule-actions">
                  <details className="audience-add-rule" ref={addRuleMenu}>
                    <summary>
                      <Plus aria-hidden size={17} /> Add rule
                      <ChevronDown aria-hidden size={16} />
                    </summary>
                    <div className="audience-add-rule__menu">
                      {FACT_CATEGORIES.map((category) => (
                        <section key={category}>
                          <span>{category}</span>
                          {FACTS.filter(
                            (fact) => fact.category === category,
                          ).map((fact) => {
                            const Icon = fact.icon;
                            return (
                              <button
                                key={fact.key}
                                onClick={() => addRule(fact.key)}
                                type="button"
                              >
                                <Icon aria-hidden size={18} />
                                <span>
                                  <strong>{fact.label}</strong>
                                  <small>{fact.description}</small>
                                </span>
                              </button>
                            );
                          })}
                        </section>
                      ))}
                    </div>
                  </details>
                  {rules.length > 1 && (
                    <button
                      className="audience-clear-rules"
                      onClick={() => setRules([createRule()])}
                      type="button"
                    >
                      Clear all
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {mode !== "dynamic" && (
          <section className="audience-builder__panel audience-people-picker">
            <div className="audience-builder__section-heading">
              <span>{mode === "static" ? "3" : "4"}</span>
              <div>
                <h2>
                  {mode === "static" ? "Select people" : "Fine-tune people"}
                </h2>
                <p>
                  {mode === "static"
                    ? "Choose the people who belong in this saved group."
                    : "Explicit exclusions win; inclusions always join the result."}
                </p>
              </div>
            </div>
            <Input
              aria-label="Search people"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, role, city, or Sand Rating"
              startAdornment={<Search />}
              type="search"
              value={query}
            />
            <div className="audience-people-picker__summary">
              <span>{filteredPeople.length} people</span>
              <span>{included.length} included</span>
              {mode === "hybrid" && <span>{excluded.length} excluded</span>}
            </div>
            <div className="audience-person-grid">
              {filteredPeople.map((person) => {
                const isIncluded = included.includes(person.id);
                const isExcluded = excluded.includes(person.id);
                return (
                  <article className="audience-person-card" key={person.id}>
                    <Avatar
                      name={person.displayName}
                      size="medium"
                      src={person.avatarUrl}
                    />
                    <div className="audience-person-card__identity">
                      <strong>{person.displayName}</strong>
                      <span>
                        {person.homeMarket ?? "Location not added"}
                        {typeof person.sandRating === "number" &&
                          ` · Sand ${person.sandRating.toFixed(2)}`}
                      </span>
                      <div>
                        {person.roles.map((role) => (
                          <Badge key={role}>{roleLabel(role)}</Badge>
                        ))}
                        {person.isMinor && <Badge tone="warning">Minor</Badge>}
                      </div>
                    </div>
                    <div className="audience-person-card__actions">
                      <button
                        aria-pressed={isIncluded}
                        onClick={() => togglePerson(person.id, "include")}
                        type="button"
                      >
                        {isIncluded && <Check aria-hidden size={15} />}
                        Include
                      </button>
                      {mode === "hybrid" && (
                        <button
                          aria-pressed={isExcluded}
                          onClick={() => togglePerson(person.id, "exclude")}
                          type="button"
                        >
                          {isExcluded && <Check aria-hidden size={15} />}
                          Exclude
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
              {filteredPeople.length === 0 && (
                <p className="audience-person-grid__empty">
                  No people match that search.
                </p>
              )}
            </div>
          </section>
        )}
      </div>

      <aside className="audience-preview-card" aria-live="polite">
        <div className="audience-preview-card__heading">
          <span>Audience preview</span>
          <Badge tone={previewError ? "warning" : "positive"}>
            {previewing
              ? "Updating"
              : previewError
                ? "Needs attention"
                : "Live"}
          </Badge>
        </div>
        <div className="audience-preview-card__size">
          <strong>{preview?.estimatedSize ?? "—"}</strong>
          <span>
            of {preview?.candidateCount ?? people.length} eligible people
          </span>
        </div>
        <div className="audience-preview-card__share">
          <div>
            <span>Organization reach</span>
            <strong>{preview ? `${previewPercent}%` : "—"}</strong>
          </div>
          <ProgressBar label="Organization reach" value={previewPercent} />
        </div>
        {includedPreviewPeople.length > 0 ? (
          <div className="audience-preview-card__people">
            <AvatarStack
              people={includedPreviewPeople.map((person) => ({
                name: person.displayName,
                ...(person.avatarUrl ? { src: person.avatarUrl } : {}),
              }))}
              total={preview?.estimatedSize}
            />
            <div>
              {includedPreviewPeople.slice(0, 4).map((person) => (
                <span key={person.id}>{person.displayName}</span>
              ))}
            </div>
          </div>
        ) : (
          <div className="audience-preview-card__empty">
            <UsersRound aria-hidden size={24} />
            <span>
              {previewing
                ? "Finding matching people…"
                : "Add people or rules to see who matches."}
            </span>
          </div>
        )}
        {(preview?.unavailableFactKeys.length ?? 0) > 0 && (
          <div className="audience-preview-card__warning">
            <strong>Some facts are not connected yet</strong>
            <span>
              {preview!.unavailableFactKeys.map(factLabel).join(", ")}
            </span>
          </div>
        )}
        {previewError && (
          <p className="audience-preview-card__error">{previewError}</p>
        )}
        <div className="audience-preview-card__definition">
          <span>Definition</span>
          <strong>
            {mode === "static"
              ? `${included.length} selected people`
              : `${rules.length} ${rules.length === 1 ? "rule" : "rules"} · ${group === "all" ? "match all" : "match any"}`}
          </strong>
          {mode === "hybrid" && (
            <small>
              {included.length} included · {excluded.length} excluded
            </small>
          )}
        </div>
        <Button disabled={!canSave || saving} size="large" type="submit">
          {saving
            ? "Saving…"
            : audienceId
              ? "Save new revision"
              : "Create audience"}
        </Button>
        <p className="audience-preview-card__assurance">
          Saving an audience never sends a message or charges a payment. Prior
          revisions remain available for audit history.
        </p>
        {notice && <p className="audience-preview-card__notice">{notice}</p>}
      </aside>
    </form>
  );
}

function RuleEditor({
  onChange,
  onFactChange,
  onRemove,
  references,
  removable,
  rule,
}: {
  readonly onChange: (update: Partial<SimpleRule>) => void;
  readonly onFactChange: (fact: FactKey) => void;
  readonly onRemove: () => void;
  readonly references: readonly AudienceReference[];
  readonly removable: boolean;
  readonly rule: SimpleRule;
}) {
  const definition = FACT_BY_KEY.get(rule.fact)!;
  const Icon = definition.icon;
  return (
    <article className="audience-rule-card">
      <header>
        <span className="audience-rule-card__icon">
          <Icon aria-hidden size={19} />
        </span>
        <div>
          <strong>{definition.label}</strong>
          <span>{definition.description}</span>
        </div>
        {removable && (
          <button
            aria-label={`Remove ${definition.label} rule`}
            onClick={onRemove}
            type="button"
          >
            <Trash2 aria-hidden size={17} />
          </button>
        )}
      </header>
      <div className="audience-rule-card__controls">
        <Field label="Field">
          <Select
            aria-label="Rule field"
            onChange={(event) => onFactChange(event.target.value as FactKey)}
            value={rule.fact}
          >
            {FACT_CATEGORIES.map((category) => (
              <optgroup key={category} label={category}>
                {FACTS.filter((fact) => fact.category === category).map(
                  (fact) => (
                    <option key={fact.key} value={fact.key}>
                      {fact.label}
                    </option>
                  ),
                )}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Condition">
          <Select
            aria-label="Rule condition"
            onChange={(event) => onChange({ operator: event.target.value })}
            value={rule.operator}
          >
            {OPERATORS[rule.fact].map((operator) => (
              <option key={operator} value={operator}>
                {OPERATOR_LABELS[operator] ?? operator.replaceAll("-", " ")}
              </option>
            ))}
          </Select>
        </Field>
        <RuleValue
          onChange={(value) => onChange({ value })}
          references={references}
          rule={rule}
        />
      </div>
    </article>
  );
}

function RuleValue({
  onChange,
  references,
  rule,
}: {
  readonly onChange: (value: unknown) => void;
  readonly references: readonly AudienceReference[];
  readonly rule: SimpleRule;
}) {
  if (rule.fact === "person-type")
    return (
      <Field label="Person">
        <Select
          aria-label="Person type"
          onChange={(event) => onChange(event.target.value)}
          value={String(rule.value)}
        >
          <option value="player">Player</option>
          <option value="adult-guardian">Parent or guardian</option>
          <option value="minor">Minor player</option>
        </Select>
      </Field>
    );
  if (rule.fact === "payment-state")
    return (
      <Field label="Status">
        <Select
          aria-label="Payment status"
          onChange={(event) => onChange(event.target.value)}
          value={String(rule.value)}
        >
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
        </Select>
      </Field>
    );
  if (rule.fact === "membership-status")
    return (
      <Field label="Status">
        <Select
          aria-label="Membership status"
          onChange={(event) => onChange(event.target.value)}
          value={String(rule.value)}
        >
          <option value="active">Active</option>
          <option value="trialing">Trialing</option>
          <option value="past-due">Past due</option>
          <option value="paused">Paused</option>
          <option value="cancelled">Cancelled</option>
          <option value="inactive">Inactive</option>
        </Select>
      </Field>
    );
  if (rule.fact === "registration") {
    const value = rule.value as {
      kind: "event" | "product";
      referenceId: string;
      status: string;
    };
    const choices = references.filter(
      (reference) => reference.kind === value.kind,
    );
    return (
      <div className="audience-rule-card__registration">
        <Field label="Registration type">
          <Select
            aria-label="Registration type"
            onChange={(event) =>
              onChange({
                ...value,
                kind: event.target.value as "event" | "product",
                referenceId: "",
              })
            }
            value={value.kind}
          >
            <option value="event">Event</option>
            <option value="product">Product</option>
          </Select>
        </Field>
        <Field label={value.kind === "event" ? "Event" : "Product"}>
          <Select
            aria-label={value.kind === "event" ? "Event" : "Product"}
            onChange={(event) =>
              onChange({ ...value, referenceId: event.target.value })
            }
            required
            value={value.referenceId}
          >
            <option value="">
              {choices.length ? "Choose one" : `No ${value.kind}s available`}
            </option>
            {choices.map((reference) => (
              <option key={reference.id} value={reference.id}>
                {reference.title}
                {reference.detail ? ` · ${reference.detail}` : ""}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Registration status">
          <Select
            aria-label="Registration status"
            onChange={(event) =>
              onChange({ ...value, status: event.target.value })
            }
            value={value.status}
          >
            <option value="registered">Registered</option>
            <option value="confirmed">Confirmed</option>
            <option value="checked-in">Checked in</option>
            <option value="cancelled">Cancelled</option>
            <option value="refunded">Refunded</option>
          </Select>
        </Field>
      </div>
    );
  }
  if (rule.fact === "last-activity-at") {
    const parsed = new Date(String(rule.value));
    const dateValue = Number.isNaN(parsed.getTime())
      ? ""
      : parsed.toISOString().slice(0, 10);
    return (
      <Field label="Date">
        <Input
          aria-label="Activity date"
          onChange={(event) =>
            onChange(
              event.target.value ? `${event.target.value}T00:00:00.000Z` : "",
            )
          }
          required
          type="date"
          value={dateValue}
        />
      </Field>
    );
  }
  if (rule.fact === "lifetime-value-minor")
    return (
      <Field label="Amount">
        <Input
          aria-label="Lifetime value amount"
          inputMode="decimal"
          min="0"
          onChange={(event) =>
            onChange(Math.round(Number(event.target.value || 0) * 100))
          }
          required
          startAdornment={<span>$</span>}
          step="0.01"
          type="number"
          value={(Number(rule.value) / 100).toString()}
        />
      </Field>
    );
  return (
    <Field
      label={rule.fact === "session-count" ? "Sessions" : "Linked players"}
    >
      <Input
        aria-label={
          rule.fact === "session-count" ? "Session count" : "Linked players"
        }
        inputMode="numeric"
        min="0"
        onChange={(event) => onChange(Number(event.target.value))}
        required
        step="1"
        type="number"
        value={Number(rule.value)}
      />
    </Field>
  );
}
