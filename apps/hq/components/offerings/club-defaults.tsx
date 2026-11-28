"use client";

import { report } from "@duna/observability";
import {
  Button,
  Checkbox,
  Notice,
  useAction,
  useConfirm,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  keepRuleAction,
  setDefaultsAction,
  turnOnCancelAction,
} from "@/app/(next)/(hq)/offerings/actions";
import { unwrap } from "../money/money-action-result";
import {
  checkDraft,
  draftFromRule,
  ruleInputFromDraft,
  storedRule,
  type RuleDraft,
} from "../participation/rule-model";
import { RulePresets, RuleSentence } from "../participation/rule-sentence";
import { SectionFooter, useSectionSave } from "./section-save";

type Kind = "service" | "open-play" | "pickup";

const kinds: readonly { readonly value: Kind; readonly label: string }[] = [
  { value: "service", label: "Lessons and groups" },
  { value: "open-play", label: "Open play" },
  { value: "pickup", label: "Pickup games the club runs" },
];

/**
 * Offerings › Booking rules: the club's rule as a sentence that every
 * offering without its own inherits (participation.md §7.1, PART-6). A
 * club default carries no price ladder (each offering sets its own); the
 * shared core validates it with the same words as everywhere else.
 */
export function ClubDefaultsForm({
  rules,
  appliesTo,
  inheritedBy,
  proposed,
  canWrite,
}: {
  readonly rules: unknown;
  readonly appliesTo: readonly string[];
  readonly inheritedBy: number;
  readonly proposed: boolean;
  readonly canWrite: boolean;
}) {
  const start = draftFromRule(rules, 12);
  const [draft, setDraft] = useState<RuleDraft>({
    ...start,
    capacity: null,
    priceBySize: false,
    ladder: [],
  });
  const [applies, setApplies] = useState<Kind[]>(
    appliesTo.filter((kind): kind is Kind =>
      kinds.some((entry) => entry.value === kind),
    ),
  );
  const check = checkDraft(draft, { forClubDefault: true });
  const state = JSON.stringify({ rule: ruleInputFromDraft(draft), applies });
  const [initial] = useState(state);
  const dirty = state !== initial || proposed;
  const { button, online, dialog } = useSectionSave({
    what: "The club's booking rule",
    dirty: dirty && Boolean(check.rule) && applies.length > 0,
    live: false,
    title: "the club",
    perform: (idempotencyKey) =>
      setDefaultsAction({
        rules: check.rule ? storedRule(check.rule) : {},
        appliesTo: applies,
        idempotencyKey,
      }),
  });
  return (
    <form className="of-form" onSubmit={(event) => event.preventDefault()}>
      {proposed ? (
        <Notice title="A suggested rule, not saved yet" tone="info">
          Save it to make it the club's rule, or change any word first.
        </Notice>
      ) : null}
      <RulePresets
        disabled={!canWrite}
        draft={{ ...draft, capacity: draft.capacity }}
        onChange={(next) =>
          setDraft({ ...next, capacity: null, priceBySize: false, ladder: [] })
        }
      />
      <RuleSentence
        capacityEditable={false}
        disabled={!canWrite}
        draft={draft}
        onChange={(next) => setDraft({ ...next, capacity: null })}
      />
      {check.issues.length > 0 ? (
        <Notice role="alert" title="Before you save" tone="danger">
          <ul className="of-issues">
            {check.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </Notice>
      ) : null}
      <fieldset className="of-fieldset">
        <legend className="pt-label">It applies to</legend>
        {kinds.map((kind) => (
          <Checkbox
            checked={applies.includes(kind.value)}
            disabled={!canWrite}
            key={kind.value}
            label={kind.label}
            onCheckedChange={(checked) =>
              setApplies((current) =>
                checked
                  ? [...current, kind.value]
                  : current.filter((value) => value !== kind.value),
              )
            }
          />
        ))}
      </fieldset>
      <p className="pt-quiet">
        {inheritedBy === 1
          ? "1 offering uses this rule because it has none of its own."
          : `${inheritedBy} offerings use this rule because they have none of their own.`}{" "}
        Sessions people already booked keep the rule they booked under.
      </p>
      {canWrite ? (
        <SectionFooter online={online}>
          {button("Save the club's rule")}
        </SectionFooter>
      ) : null}
      {dialog}
    </form>
  );
}

export interface RuleReview {
  readonly subjectType: "session" | "pickup-session";
  readonly subjectId: string;
  readonly title: string;
  readonly startsAt: string;
  readonly minParticipants: number;
}

/**
 * Rules to review (decision 7): older minimums were moved over as "runs
 * anyway". For each, keep it that way or turn on cancel-when-too-small.
 */
export function RulesToReview({
  rules,
  timeZone,
  canWrite,
}: {
  readonly rules: readonly RuleReview[];
  readonly timeZone: string;
  readonly canWrite: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const keep = useAction<[RuleReview], { state: "kept" }>(
    async ({ idempotencyKey }, rule) =>
      unwrap(
        await keepRuleAction({
          subjectType: rule.subjectType,
          subjectId: rule.subjectId,
          idempotencyKey,
        }),
      ),
    {
      messages: { success: "Kept as it is" },
      report: (error) =>
        void report(error, { event: "hq.offerings.keep_rule_failed" }),
      onSuccess: () => router.refresh(),
    },
  );
  if (rules.length === 0) {
    return (
      <p className="pt-quiet">
        Nothing to review. Every older rule has been looked at.
      </p>
    );
  }
  return (
    <>
      <ul aria-label="Rules to review" className="of-tasks">
        {rules.map((rule) => (
          <li key={rule.subjectId}>
            <span className="of-tasks__text">
              <span className="of-row__title">{rule.title}</span>
              <span className="pt-quiet">
                {`${new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone }).format(new Date(rule.startsAt))} · needs ${rule.minParticipants} players · runs even if fewer book`}
              </span>
            </span>
            {canWrite ? (
              <span className="pt-actions">
                <Button
                  disabled={keep.pending}
                  onClick={() => void keep.run(rule)}
                  size="sm"
                  variant="secondary"
                >
                  Keep
                </Button>
                <Button
                  onClick={() =>
                    void confirm
                      .run({
                        tier: "confirm",
                        title: `Cancel ${rule.title} if fewer than ${rule.minParticipants} book?`,
                        description:
                          "If it's too small at the decision time, it's cancelled and everyone gets their money or credits back.",
                        verb: "Turn on cancel",
                        cancelLabel: "Not now",
                        agentConfirm: `Makes ${rule.title} cancel when fewer than ${rule.minParticipants} players book`,
                        perform: async ({ idempotencyKey }) =>
                          unwrap(
                            await turnOnCancelAction({
                              subjectType: rule.subjectType,
                              subjectId: rule.subjectId,
                              minParticipants: rule.minParticipants,
                              idempotencyKey,
                            }),
                          ),
                        success: `${rule.title} now cancels when it's too small`,
                      })
                      .then((outcome) => {
                        if (outcome.status === "done") router.refresh();
                      })
                  }
                  size="sm"
                  variant="ghost"
                >
                  Turn on cancel
                </Button>
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {confirm.dialog}
    </>
  );
}
