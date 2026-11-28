"use client";

import { readParticipationRuleV2 } from "@duna/core";
import { report } from "@duna/observability";
import {
  Button,
  Checkbox,
  Notice,
  useAction,
  useConfirm,
  useOnline,
} from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  applyRuleToBookedAction,
  previewRuleChangeAction,
  saveGroupRuleAction,
} from "@/app/(next)/(hq)/offerings/actions";
import { unwrap } from "../money/money-action-result";
import { PriceLadder } from "../participation/price-ladder";
import {
  checkDraft,
  draftFromRule,
  FALLBACK_LOCK_MINUTES,
  lockPhrase,
  ruleInputFromDraft,
  ruleSentenceText,
  storedRule,
  type RuleDraft,
} from "../participation/rule-model";
import { RulePresets, RuleSentence } from "../participation/rule-sentence";
import { OfferingPreview } from "./offering-preview";

export interface GroupSizeProps {
  readonly itemId: string;
  readonly title: string;
  readonly summary?: string;
  readonly price: string;
  readonly coverUrl?: string;
  readonly coverAlt?: string;
  readonly live: boolean;
  /** The offering's own stored rule, when it has one. */
  readonly ownRule?: unknown;
  readonly capacity: number;
  readonly allowCredits: boolean;
  readonly creditCost?: number;
  readonly currency: string;
  readonly clubDefault?: unknown;
  /** The club default applies to this kind of offering. */
  readonly clubDefaultApplies: boolean;
  readonly bookedSessions: number;
  readonly canWrite: boolean;
  readonly now: string;
  readonly timeZone: string;
  readonly clubName: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Group size (PART-6): the rule as a sentence the owner edits, presets,
 * capacity, the decision time, what happens under the minimum, waitlist,
 * and price by group size. Inherits the club default until "Change for this
 * offering". Saving a change to an offering with booked sessions first shows
 * which sessions change and which are protected because people already
 * booked, and asks the person to confirm.
 */
export function GroupSizeEditor(props: GroupSizeProps) {
  const router = useRouter();
  const online = useOnline();
  const confirm = useConfirm();
  const inherits = props.ownRule === undefined || props.ownRule === null;
  const defaultLock =
    readParticipationRuleV2(props.clubDefault)?.lockMinutesBeforeStart ??
    FALLBACK_LOCK_MINUTES;
  const startDraft = useMemo(
    () =>
      draftFromRule(
        inherits && props.clubDefaultApplies
          ? props.clubDefault
          : props.ownRule,
        props.capacity,
      ),
    [
      inherits,
      props.clubDefaultApplies,
      props.clubDefault,
      props.ownRule,
      props.capacity,
    ],
  );
  const [editing, setEditing] = useState(!inherits);
  const [draft, setDraft] = useState<RuleDraft>(startDraft);
  const [touched, setTouched] = useState(false);
  const check = checkDraft(draft, {
    allowCredits: props.allowCredits,
    creditCost: props.creditCost,
    currency: props.currency,
  });
  const dirty =
    JSON.stringify(ruleInputFromDraft(draft)) !==
      JSON.stringify(ruleInputFromDraft(startDraft)) ||
    draft.capacity !== props.capacity ||
    (inherits && editing);

  const failed = (error: unknown) =>
    void report(error, { event: "hq.offerings.group_rule_failed" });

  const saveRule = async (
    rule: Record<string, unknown> | null,
    idempotencyKey: string,
  ) =>
    unwrap(
      await saveGroupRuleAction({
        itemId: props.itemId,
        rule,
        capacity: draft.capacity ?? props.capacity,
        idempotencyKey,
      }),
    );

  const save = useAction(
    async ({ idempotencyKey }) => {
      setTouched(true);
      if (!check.rule) return "invalid" as const;
      const rule = storedRule(check.rule);
      if (props.bookedSessions === 0 && !props.live) {
        await saveRule(rule, idempotencyKey);
        return "saved" as const;
      }
      // What it does to sessions people already booked.
      const preview = unwrap(
        await previewRuleChangeAction({ itemId: props.itemId, rules: rule }),
      );
      if (preview.issues.length > 0) {
        throw Object.assign(new Error(preview.issues.join(" ")), {
          userMessage: preview.issues.join(" "),
        });
      }
      let alsoApply = false;
      const booked = preview.bookedSessions;
      const outcome = await confirm.run({
        tier: "confirm",
        title: `Change the group rule for ${props.title}?`,
        description: (
          <div className="of-preview-change">
            <p>{ruleSentenceText(rule, { defaultLockMinutes: defaultLock })}</p>
            <p>
              {`${plural(preview.unbookedSessions, "session")} without bookings change now.`}
            </p>
            {booked.length > 0 ? (
              <>
                <p>
                  {`${plural(booked.length, "session")} already ${booked.length === 1 ? "has" : "have"} bookings and keep${booked.length === 1 ? "s" : ""} the rule people booked under:`}
                </p>
                <ul>
                  {booked.slice(0, 6).map((session) => (
                    <li key={session.id}>
                      {`${new Intl.DateTimeFormat("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        timeZone: props.timeZone,
                      }).format(
                        new Date(session.startsAt),
                      )} · ${plural(session.booked, "player")} booked`}
                    </li>
                  ))}
                </ul>
                {preview.changeClass === "loosens" ? (
                  <Checkbox
                    description="Only changes that are better for players can apply to booked sessions."
                    label="Also apply it to the booked sessions"
                    onCheckedChange={(checked) => {
                      alsoApply = checked === true;
                    }}
                  />
                ) : (
                  <p>
                    This change is stricter for players, so booked sessions keep
                    their rule.
                  </p>
                )}
              </>
            ) : null}
          </div>
        ),
        affected:
          booked.length > 0
            ? `${plural(
                booked.reduce((total, session) => total + session.booked, 0),
                "booked player",
              )} are protected.`
            : undefined,
        verb: "Save the new rule",
        cancelLabel: "Keep editing",
        agentConfirm: `Saves a new group rule for ${props.title}`,
        perform: async (context) => {
          await saveRule(rule, idempotencyKey);
          if (alsoApply && booked.length > 0) {
            unwrap(
              await applyRuleToBookedAction({
                itemId: props.itemId,
                occurrenceIds: booked.map((session) => session.id),
                idempotencyKey: context.idempotencyKey,
              }),
            );
          }
          return true;
        },
        report: failed,
      });
      return outcome.status === "done" ? ("saved" as const) : ("kept" as const);
    },
    {
      messages: {
        success: (result) => (result === "saved" ? "Group size saved" : ""),
        error: "The group rule wasn't saved.",
      },
      report: failed,
      onSuccess: (result) => {
        if (result === "saved") router.refresh();
      },
    },
  );

  const useDefault = useAction(
    async ({ idempotencyKey }) => saveRule(null, idempotencyKey),
    {
      messages: { success: "Now using the club default" },
      report: failed,
      onSuccess: () => {
        setEditing(false);
        setDraft(draftFromRule(props.clubDefault, props.capacity));
        router.refresh();
      },
    },
  );

  const previewRule = check.rule;
  const disabled = !props.canWrite;

  return (
    <div className="of-split">
      <div className="of-split__main">
        {inherits && !editing ? (
          <Notice
            action={
              props.canWrite ? (
                <Button
                  onClick={() => setEditing(true)}
                  size="sm"
                  variant="secondary"
                >
                  Change for this offering
                </Button>
              ) : undefined
            }
            title={
              props.clubDefaultApplies
                ? "Uses the club default"
                : "No group rule: it runs with whoever books"
            }
            tone="info"
          >
            {props.clubDefaultApplies
              ? ruleSentenceText(props.clubDefault, {
                  defaultLockMinutes: defaultLock,
                })
              : "Add a minimum here, or set the club's rule in Offerings settings."}
          </Notice>
        ) : (
          <>
            {inherits ? null : (
              <p className="pt-quiet">
                This offering has its own rule.{" "}
                {props.canWrite ? (
                  <button
                    className="of-inline-link"
                    disabled={useDefault.pending}
                    onClick={() => void useDefault.run()}
                    type="button"
                  >
                    Use the club default instead
                  </button>
                ) : null}
              </p>
            )}
            <RulePresets
              disabled={disabled}
              draft={draft}
              onChange={setDraft}
            />
            <RuleSentence
              defaultLockLabel="the club default"
              defaultLockMinutes={defaultLock}
              disabled={disabled}
              draft={draft}
              onChange={setDraft}
            />
            <PriceLadder
              creditsAllowed={props.allowCredits}
              disabled={disabled}
              draft={draft}
              onChange={setDraft}
              warnings={check.warnings}
            />
            {(touched || dirty) && check.issues.length > 0 ? (
              <Notice role="alert" title="Before you save" tone="danger">
                <ul className="of-issues">
                  {check.issues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}
            {props.bookedSessions > 0 ? (
              <p className="pt-quiet">
                {`${plural(props.bookedSessions, "session")} already ${props.bookedSessions === 1 ? "has" : "have"} bookings. You'll see what changes before anything is saved.`}
              </p>
            ) : null}
            {!online ? (
              <Notice tone="info" title="You're offline">
                Your changes stay here. Save when you're back online.
              </Notice>
            ) : null}
            {props.canWrite ? (
              <div className="pt-actions">
                {inherits ? (
                  <Button
                    onClick={() => {
                      setEditing(false);
                      setDraft(startDraft);
                    }}
                    variant="ghost"
                  >
                    Keep the club default
                  </Button>
                ) : null}
                <Button
                  {...save.buttonProps}
                  disabled={!online || !dirty}
                  variant="primary"
                >
                  Save group size
                </Button>
              </div>
            ) : (
              <p className="pt-quiet">Only an owner can change group rules.</p>
            )}
          </>
        )}
        <p className="pt-quiet">
          {`The club default decides ${lockPhrase(defaultLock)} before a session starts unless an offering says otherwise.`}
        </p>
      </div>
      <div className="of-split__side">
        <OfferingPreview
          capacity={draft.capacity ?? props.capacity}
          clubName={props.clubName}
          coverAlt={props.coverAlt}
          coverUrl={props.coverUrl}
          now={props.now}
          price={props.price}
          rule={
            editing
              ? previewRule
              : (readParticipationRuleV2(
                  inherits && props.clubDefaultApplies
                    ? props.clubDefault
                    : props.ownRule,
                ) ?? undefined)
          }
          summary={props.summary}
          timeZone={props.timeZone}
          title={props.title}
          tryIt
        />
      </div>
      {confirm.dialog}
    </div>
  );
}
