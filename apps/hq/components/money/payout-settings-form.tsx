"use client";

import {
  Button,
  Input,
  MoneyInput,
  Select,
  useConfirm,
} from "@duna/ui/tideline";
import { formatMoney } from "@duna/core";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { updatePayoutSettingsAction } from "@/app/(next)/(hq)/money/actions";
import { unwrap } from "./money-action-result";
import {
  cleanDescriptor,
  descriptorProblem,
  payoutRhythm,
  type PayoutInterval,
  type Weekday,
  weekdayName,
  weekdays,
} from "./money-model";

export interface PayoutSettingsValue {
  readonly interval: PayoutInterval;
  readonly weeklyDay: Weekday;
  readonly monthlyDay: number;
  readonly minimumPayoutMinor: number;
  readonly currency: string;
  readonly statementDescriptor?: string;
  readonly payoutStatementDescriptor?: string;
  readonly syncStatus: "not-synced" | "synced" | "failed";
}

const intervals: { value: PayoutInterval; label: string }[] = [
  { value: "daily", label: "every business day" },
  { value: "weekly", label: "once a week" },
  { value: "monthly", label: "once a month" },
  { value: "manual", label: "only when I ask" },
];

/**
 * Payout schedule and statement names as sentences. Saving is a payout
 * change, so a person confirms it (strong tier: it restates the new rhythm,
 * the minimum and where the money goes). Nothing moves money here.
 */
export function PayoutSettingsForm({
  value,
  bank,
  canWrite,
}: {
  readonly value: PayoutSettingsValue;
  /** "First Sand Bank ending 1842" */
  readonly bank: string;
  readonly canWrite: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [interval, setPayoutInterval] = useState<PayoutInterval>(
    value.interval,
  );
  const [weeklyDay, setWeeklyDay] = useState<Weekday>(value.weeklyDay);
  const [monthlyDay, setMonthlyDay] = useState(value.monthlyDay);
  const [minimum, setMinimum] = useState<number | null>(
    value.minimumPayoutMinor,
  );
  const [statement, setStatement] = useState(value.statementDescriptor ?? "");
  const [payoutStatement, setPayoutStatement] = useState(
    value.payoutStatementDescriptor ?? "",
  );
  const statementProblem = descriptorProblem(statement);
  const payoutStatementProblem = descriptorProblem(payoutStatement);
  const changed =
    interval !== value.interval ||
    weeklyDay !== value.weeklyDay ||
    monthlyDay !== value.monthlyDay ||
    (minimum ?? 0) !== value.minimumPayoutMinor ||
    statement !== (value.statementDescriptor ?? "") ||
    payoutStatement !== (value.payoutStatementDescriptor ?? "");
  const rhythm = payoutRhythm({ interval, weeklyDay, monthlyDay });
  const minimumText = formatMoney(minimum ?? 0, value.currency);
  const disabled = !canWrite;

  const save = () =>
    void confirm
      .run({
        tier: "strong",
        title: "Change how you're paid out?",
        description: `Payouts go out ${rhythm.toLowerCase()}${
          interval === "manual" ? "" : `, once at least ${minimumText} is ready`
        }.`,
        scope: `Every payout to ${bank}`,
        consequence:
          "Takes effect from the next payout. Money already on its way is not affected.",
        verb: "Change payout schedule",
        cancelLabel: "Keep the current schedule",
        agentConfirm: `Changes payouts to ${rhythm.toLowerCase()} with a ${minimumText} minimum`,
        perform: async () =>
          unwrap(
            await updatePayoutSettingsAction({
              interval,
              weeklyDay,
              monthlyDay,
              minimumPayoutMinor: minimum ?? 0,
              currency: value.currency,
              statementDescriptor: statement || undefined,
              payoutStatementDescriptor: payoutStatement || undefined,
            }),
          ),
        success: `Payout schedule saved: ${rhythm.toLowerCase()}`,
      })
      .then((outcome) => {
        if (outcome.status === "done") router.refresh();
      });

  return (
    <form
      aria-label="Payout schedule"
      className="money-sentence"
      onSubmit={(event) => {
        event.preventDefault();
        if (changed && !statementProblem && !payoutStatementProblem) save();
      }}
    >
      <div className="money-sentence__line">
        <span>Pay us out</span>
        <div className="money-sentence__field">
          <Select
            aria-label="How often"
            disabled={disabled}
            onValueChange={(next) =>
              next && setPayoutInterval(next as PayoutInterval)
            }
            options={intervals}
            value={interval}
          />
        </div>
        {interval === "weekly" ? (
          <>
            <span>on</span>
            <div className="money-sentence__field">
              <Select
                aria-label="Day of the week"
                disabled={disabled}
                onValueChange={(next) => next && setWeeklyDay(next as Weekday)}
                options={weekdays.map((day) => ({
                  value: day,
                  label: weekdayName(day),
                }))}
                value={weeklyDay}
              />
            </div>
          </>
        ) : null}
        {interval === "monthly" ? (
          <>
            <span>on day</span>
            <div className="money-sentence__field money-sentence__field--narrow">
              <Select
                aria-label="Day of the month"
                disabled={disabled}
                onValueChange={(next) => next && setMonthlyDay(Number(next))}
                options={Array.from({ length: 28 }, (_, i) => String(i + 1))}
                value={String(monthlyDay)}
              />
            </div>
          </>
        ) : null}
      </div>
      {interval !== "manual" ? (
        <div className="money-sentence__line">
          <span>once at least</span>
          <div className="money-sentence__field money-sentence__field--narrow">
            <MoneyInput
              aria-label="Smallest payout"
              currency={value.currency}
              disabled={disabled}
              onValueChange={setMinimum}
              value={minimum}
            />
          </div>
          <span>is ready.</span>
        </div>
      ) : (
        <p className="money-quiet">
          Money waits in your balance until you press Request a payout.
        </p>
      )}
      <div className="money-sentence__line">
        <span>Players see</span>
        <div className="money-sentence__field">
          <Input
            aria-describedby="statement-hint"
            aria-invalid={statementProblem ? true : undefined}
            aria-label="Name on card statements"
            disabled={disabled}
            maxLength={22}
            onValueChange={(next) =>
              setStatement(cleanDescriptor(String(next ?? "")))
            }
            placeholder="YOUR CLUB"
            value={statement}
          />
        </div>
        <span>on their card statement, and your bank shows</span>
        <div className="money-sentence__field">
          <Input
            aria-describedby="statement-hint"
            aria-invalid={payoutStatementProblem ? true : undefined}
            aria-label="Name on payouts"
            disabled={disabled}
            maxLength={22}
            onValueChange={(next) =>
              setPayoutStatement(cleanDescriptor(String(next ?? "")))
            }
            placeholder="YOUR CLUB PAYOUT"
            value={payoutStatement}
          />
        </div>
        <span>for each payout.</span>
      </div>
      <p className="money-quiet" id="statement-hint">
        5 to 22 capital letters, numbers, spaces, dots or dashes.
      </p>
      {statementProblem || payoutStatementProblem ? (
        <p className="money-field-error" role="alert">
          {statementProblem ?? payoutStatementProblem}
        </p>
      ) : null}
      {value.syncStatus === "failed" ? (
        <p className="money-field-error" role="status">
          Your last change didn't reach Duna Pay. Save again to retry.
        </p>
      ) : null}
      {canWrite ? (
        <div className="money-form-actions">
          <Button
            disabled={
              !changed || Boolean(statementProblem || payoutStatementProblem)
            }
            type="submit"
            variant="primary"
          >
            Save payout schedule
          </Button>
        </div>
      ) : (
        <p className="money-quiet">Only an owner can change payouts.</p>
      )}
      {confirm.dialog}
    </form>
  );
}
