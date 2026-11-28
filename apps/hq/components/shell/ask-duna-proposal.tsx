"use client";

import {
  Button,
  ProposalCard,
  type ProposalChange,
  type UseConfirm,
} from "@duna/ui/tideline";
import type { AskAction, AskActionControls } from "../ask-duna-client";

/** "operator.blockCourtTime" → "Block court time". */
export function operationTitle(operation: string): string {
  const words = operation
    .replace(/^operator\./, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function fieldLabel(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length === 0
      ? "None"
      : value.every((item) => typeof item !== "object")
        ? value.join(", ")
        : `${value.length} items`;
  }
  return "Details in the change";
}

const creates = /^(operator\.)?(create|add|invite|schedule|draft|new)/i;
const ids = /(^id$|Id$|ids$|Ids$|idempotencyKey)/;

/**
 * The before / after rows of a proposal. Ask Duna's actions carry the new
 * values; the current value is only known for something new (it was not
 * set), so other rows say the current value stays until approval.
 */
export function proposalChanges(action: AskAction): ProposalChange[] {
  const isNew = creates.test(action.operation);
  return Object.entries(action.input)
    .filter(([key]) => !ids.test(key))
    .slice(0, 8)
    .map(([key, value]) => ({
      label: fieldLabel(key),
      before: isNew ? undefined : "As it is now",
      after: valueText(value),
    }));
}

const strongOperations =
  /refund|charge|payout|payment|price|delete|remove|cancel|bulk/i;

/** The confirmation tier for approving a proposal (a person approves every change). */
export function proposalTier(action: AskAction): "confirm" | "strong" {
  return strongOperations.test(action.operation) ? "strong" : "confirm";
}

function proposalStatus(
  action: AskAction,
): "proposed" | "applied" | "dismissed" {
  if (action.status === "succeeded") return "applied";
  if (action.status === "declined") return "dismissed";
  return "proposed";
}

/**
 * Ask Duna's proposal in the docked panel: the design system's ProposalCard
 * with Apply going through the interaction kit's confirmation at the action's
 * tier. Decline needs no confirmation (nothing changes).
 */
export function AskDunaProposal({
  action,
  controls,
  confirm,
}: {
  readonly action: AskAction;
  readonly controls: AskActionControls;
  readonly confirm: UseConfirm;
}) {
  const title = operationTitle(action.operation);
  const pending = action.status === "pending";
  const tier = proposalTier(action);
  return (
    <ProposalCard
      actions={
        pending ? (
          <>
            <Button
              disabled={controls.disabled}
              onClick={() => void controls.review("decline")}
              size="sm"
              variant="ghost"
            >
              Decline
            </Button>
            <Button
              data-agent-confirm={action.summary}
              disabled={controls.disabled}
              loading={controls.reviewing}
              onClick={() =>
                void confirm.run({
                  tier,
                  destructive: tier === "strong",
                  title: `${title}?`,
                  description: action.summary,
                  scope: tier === "strong" ? action.summary : undefined,
                  consequence:
                    tier === "strong"
                      ? "Duna saves a receipt. Check it before you ask for anything else."
                      : undefined,
                  reference: action.id,
                  verb: `Approve: ${title.toLowerCase()}`,
                  cancelLabel: "Not yet",
                  agentConfirm: action.summary,
                  perform: () => controls.review("approve"),
                })
              }
              size="sm"
              variant="primary"
            >
              Approve change
            </Button>
          </>
        ) : undefined
      }
      changes={proposalChanges(action)}
      reason={action.summary}
      reference={action.id}
      status={proposalStatus(action)}
      title={title}
    />
  );
}
