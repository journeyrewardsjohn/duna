"use client";

import {
  MAX_PARTICIPATION_CREDIT_TIERS,
  participationTierLabel,
} from "@duna/core";
import { Plus, Trash2 } from "lucide-react";
import {
  highestParticipationTierCredits,
  resolveParticipationTiers,
  type ParticipationDraft,
  type ParticipationTierRow,
} from "./product-participation-draft";

const CUTOFF_OPTIONS = [
  { minutes: 0, label: "When the session starts" },
  { minutes: 60, label: "1 hour before" },
  { minutes: 120, label: "2 hours before" },
  { minutes: 180, label: "3 hours before" },
  { minutes: 360, label: "6 hours before" },
  { minutes: 720, label: "12 hours before" },
  { minutes: 1_440, label: "24 hours before" },
  { minutes: 2_880, label: "48 hours before" },
  { minutes: 4_320, label: "3 days before" },
  { minutes: 10_080, label: "7 days before" },
] as const;

function cutoffOptions(current: number) {
  return CUTOFF_OPTIONS.some((option) => option.minutes === current)
    ? CUTOFF_OPTIONS
    : [
        ...CUTOFF_OPTIONS,
        { minutes: current, label: `${current} minutes before` },
      ];
}

export function ParticipationMinimumFields({
  capacity,
  draft,
  onChange,
}: {
  readonly capacity: number;
  readonly draft: ParticipationDraft;
  readonly onChange: (draft: ParticipationDraft) => void;
}) {
  const minPlayers = Math.min(capacity, Math.max(1, draft.minPlayers));
  const hasRules = minPlayers > 1 || draft.tiersEnabled;
  return (
    <>
      <label>
        <span>Minimum players to run</span>
        <input
          max={capacity}
          min="1"
          onChange={(event) =>
            onChange({
              ...draft,
              minPlayers: Math.min(
                capacity,
                Math.max(1, Number(event.target.value) || 1),
              ),
            })
          }
          type="number"
          value={minPlayers}
        />
      </label>
      {minPlayers > 1 && (
        <label>
          <span>If fewer than {minPlayers} players book</span>
          <select
            onChange={(event) =>
              onChange({
                ...draft,
                minimumPolicy:
                  event.target.value === "cancel" ? "cancel" : "run",
              })
            }
            value={draft.minimumPolicy}
          >
            <option value="run">Run the session anyway</option>
            <option value="cancel">
              Cancel it and return credits or payment
            </option>
          </select>
        </label>
      )}
      {hasRules && (
        <label>
          <span>Decide and lock the group size</span>
          <select
            onChange={(event) =>
              onChange({ ...draft, cutoffMinutes: Number(event.target.value) })
            }
            value={draft.cutoffMinutes}
          >
            {cutoffOptions(draft.cutoffMinutes).map((option) => (
              <option key={option.minutes} value={option.minutes}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </>
  );
}

export function ParticipationTierFields({
  capacity,
  creditCost,
  draft,
  onChange,
}: {
  readonly capacity: number;
  readonly creditCost: number;
  readonly draft: ParticipationDraft;
  readonly onChange: (draft: ParticipationDraft) => void;
}) {
  const tiers = resolveParticipationTiers(draft, capacity);
  const floor = Math.min(capacity, Math.max(1, draft.minPlayers));
  const maxRows = Math.min(
    MAX_PARTICIPATION_CREDIT_TIERS,
    capacity - floor + 1,
  );
  const highest = highestParticipationTierCredits(draft, capacity);
  const updateRow = (index: number, patch: Partial<ParticipationTierRow>) =>
    onChange({
      ...draft,
      tierRows: tiers.map((tier, position) => ({
        upTo: tier.maxParticipants,
        credits: tier.creditsPerPlayer,
        ...(position === index ? patch : {}),
      })),
    });
  return (
    <div className="guided-participation-tiers">
      <label className="operator-switch">
        <input
          checked={draft.tiersEnabled}
          onChange={(event) =>
            onChange({
              ...draft,
              tiersEnabled: event.target.checked,
              tierRows:
                event.target.checked && draft.tierRows.length === 0
                  ? capacity > floor
                    ? [
                        { upTo: floor, credits: creditCost + 1 },
                        { upTo: capacity, credits: creditCost },
                      ]
                    : [{ upTo: capacity, credits: creditCost }]
                  : draft.tierRows,
            })
          }
          type="checkbox"
        />
        <span>
          <strong>Price by group size</strong>
          Charge fewer credits per player as more players join the session.
        </span>
      </label>
      {draft.tiersEnabled && (
        <>
          <ol aria-label="Group-size credit tiers">
            {tiers.map((tier, index) => {
              const last = index === tiers.length - 1;
              return (
                <li key={index}>
                  <span className="guided-participation-tier-range">
                    {participationTierLabel(tier, capacity)}
                  </span>
                  {last ? (
                    // Keeps the credit column aligned with the rows above.
                    <span aria-hidden="true" />
                  ) : (
                    <label>
                      <span>Up to</span>
                      <input
                        aria-label={`Tier ${index + 1} largest group size`}
                        max={capacity - (tiers.length - 1 - index)}
                        min={tier.minParticipants}
                        onChange={(event) =>
                          updateRow(index, {
                            upTo: Number(event.target.value) || 1,
                          })
                        }
                        type="number"
                        value={tier.maxParticipants}
                      />
                    </label>
                  )}
                  <label>
                    <span>Credits each</span>
                    <input
                      aria-label={`Tier ${index + 1} credits per player`}
                      max="10000"
                      min="1"
                      onChange={(event) =>
                        updateRow(index, {
                          credits: Math.max(1, Number(event.target.value) || 1),
                        })
                      }
                      type="number"
                      value={tier.creditsPerPlayer}
                    />
                  </label>
                  <button
                    aria-label={`Remove tier ${index + 1}`}
                    disabled={tiers.length <= 1}
                    onClick={() =>
                      onChange({
                        ...draft,
                        tierRows: tiers
                          .filter((_, position) => position !== index)
                          .map((entry) => ({
                            upTo: entry.maxParticipants,
                            credits: entry.creditsPerPlayer,
                          })),
                      })
                    }
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={16} />
                  </button>
                </li>
              );
            })}
          </ol>
          <button
            className="guided-participation-add"
            disabled={tiers.length >= maxRows}
            onClick={() => {
              const lastTier = tiers.at(-1);
              onChange({
                ...draft,
                tierRows: [
                  ...tiers.map((tier, position) => ({
                    upTo:
                      position === tiers.length - 1
                        ? tier.minParticipants
                        : tier.maxParticipants,
                    credits: tier.creditsPerPlayer,
                  })),
                  {
                    upTo: capacity,
                    credits: Math.max(1, (lastTier?.creditsPerPlayer ?? 2) - 1),
                  },
                ],
              });
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={16} />
            Add a group size
          </button>
          <label className="guided-inline-field">
            <span>Final group size comes from</span>
            <select
              onChange={(event) =>
                onChange({
                  ...draft,
                  settlementBasis:
                    event.target.value === "attendance"
                      ? "attendance"
                      : "cutoff",
                })
              }
              value={draft.settlementBasis}
            >
              <option value="cutoff">Bookings when the group locks</option>
              <option value="attendance">Recorded attendance</option>
            </select>
          </label>
          <p className="guided-product-note" role="status">
            Each player reserves {highest} credit{highest === 1 ? "" : "s"} when
            they book. Once the group size is final, Duna returns the difference
            to their wallet automatically. Nobody pays more than they reserved.
          </p>
        </>
      )}
    </div>
  );
}
