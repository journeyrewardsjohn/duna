"use client";

import {
  MAX_PARTICIPATION_CAPACITY,
  type ParticipationRevenueCliff,
} from "@duna/core";
import { Icon } from "@duna/ui/icons";
import {
  Button,
  IconButton,
  Notice,
  NumberInput,
  Switch,
} from "@duna/ui/tideline";
import {
  addLadderRow,
  cliffFixLadder,
  ladderReserve,
  ladderTotals,
  type LadderRowDraft,
  type RuleDraft,
} from "./rule-model";

/**
 * "Price by group size" as a small ladder (participation.md §5.1, §7.1):
 * each row says from how many players a price applies. Prices may stay the
 * same or fall as the group grows, never rise (the shared validation says
 * so inline). A cliff, where one more player lowers the club's total, is a
 * warning with the worked numbers and a fix.
 */
export function PriceLadder({
  draft,
  onChange,
  warnings,
  disabled,
  creditsAllowed,
}: {
  readonly draft: RuleDraft;
  readonly onChange: (draft: RuleDraft) => void;
  readonly warnings: readonly ParticipationRevenueCliff[];
  readonly disabled?: boolean;
  /** A credit ladder needs credit payment on the offering. */
  readonly creditsAllowed: boolean;
}) {
  const minimum = Math.max(1, draft.minParticipants ?? 1);
  const setLadder = (ladder: readonly LadderRowDraft[]) =>
    onChange({ ...draft, ladder });
  const totals = ladderTotals(draft);
  const fix = warnings.length > 0 ? cliffFixLadder(draft) : undefined;
  const reserve = ladderReserve(draft.ladder);
  return (
    <div className="pt-ladder">
      <Switch
        checked={draft.priceBySize}
        description={
          creditsAllowed
            ? "Players reserve the highest price when they book and get the difference back once the group is decided. Card payers pay the card price."
            : "Price by group size works with credits. Turn on credit payment in Price first."
        }
        disabled={disabled || (!creditsAllowed && !draft.priceBySize)}
        label="Price by group size"
        onCheckedChange={(checked) =>
          onChange({
            ...draft,
            priceBySize: checked,
            ladder:
              checked && draft.ladder.length === 0
                ? [{ from: minimum, credits: null }]
                : draft.ladder,
          })
        }
      />
      {draft.priceBySize ? (
        <>
          <ol aria-label="Price by group size" className="pt-ladder__rows">
            {draft.ladder.map((row, index) => (
              <li className="pt-ladder__row" key={index}>
                <span>From</span>
                <NumberInput
                  aria-label={`Row ${index + 1}: from how many players`}
                  className="pt-sentence__number"
                  disabled={disabled}
                  max={MAX_PARTICIPATION_CAPACITY}
                  min={1}
                  onValueChange={(value) =>
                    setLadder(
                      draft.ladder.map((candidate, at) =>
                        at === index
                          ? {
                              ...candidate,
                              from: value === null ? null : Math.trunc(value),
                            }
                          : candidate,
                      ),
                    )
                  }
                  value={row.from}
                />
                <span>players ·</span>
                <NumberInput
                  aria-label={`Row ${index + 1}: credits each`}
                  className="pt-sentence__number"
                  disabled={disabled}
                  min={1}
                  onValueChange={(value) =>
                    setLadder(
                      draft.ladder.map((candidate, at) =>
                        at === index
                          ? {
                              ...candidate,
                              credits:
                                value === null ? null : Math.trunc(value),
                            }
                          : candidate,
                      ),
                    )
                  }
                  value={row.credits}
                />
                <span>credits each</span>
                <IconButton
                  disabled={disabled || draft.ladder.length === 1}
                  label={`Remove row ${index + 1}`}
                  onClick={() =>
                    setLadder(draft.ladder.filter((_, at) => at !== index))
                  }
                  size="sm"
                  variant="ghost"
                >
                  <Icon name="close" size="inline" />
                </IconButton>
              </li>
            ))}
          </ol>
          <Button
            disabled={disabled}
            onClick={() => setLadder(addLadderRow(draft.ladder, minimum))}
            size="sm"
            variant="secondary"
          >
            Add a group size
          </Button>
          {reserve !== undefined ? (
            <p className="pt-sentence__note">
              {`Players reserve ${reserve} credit${reserve === 1 ? "" : "s"} each when they book.`}
            </p>
          ) : null}
          {warnings.map((warning) => {
            const before = totals.find(
              (row) => row.size === warning.groupSize - 1,
            );
            const after = totals.find((row) => row.size === warning.groupSize);
            return (
              <Notice
                action={
                  fix ? (
                    <Button
                      disabled={disabled}
                      onClick={() => setLadder(fix)}
                      size="sm"
                      variant="secondary"
                    >
                      Show a fix
                    </Button>
                  ) : undefined
                }
                key={`${warning.unit}-${warning.groupSize}`}
                role="status"
                title={warning.message}
                tone="warning"
              >
                {before && after ? (
                  <dl className="pt-ladder__worked">
                    <div>
                      <dt>{`${before.size} players`}</dt>
                      <dd>{`${before.total} credits in total`}</dd>
                    </div>
                    <div>
                      <dt>{`${after.size} players`}</dt>
                      <dd>{`${after.total} credits in total`}</dd>
                    </div>
                  </dl>
                ) : null}
                <p>
                  {`With ${warning.groupSize} players you earn less than with ${warning.groupSize - 1}. It's allowed: this is a warning, not a block.`}
                </p>
              </Notice>
            );
          })}
        </>
      ) : null}
    </div>
  );
}
