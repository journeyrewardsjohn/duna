"use client";

import { Button, RadioGroup, RadioOption, useConfirm } from "@duna/ui/tideline";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  transferOwnershipAction,
  updateMemberAction,
} from "@/app/(next)/(hq)/team/actions";
import { unwrap } from "../money/money-action-result";
import {
  accessSentences,
  firstName,
  removesAccess,
  roleLabel,
  roleSummaries,
  type StaffRole,
} from "./team-model";

export interface RolePreset {
  readonly role: StaffRole;
  /** The backend's permission scopes for the role. */
  readonly scopes: readonly string[];
}

function Sentences({ scopes }: { readonly scopes: readonly string[] }) {
  const words = accessSentences(scopes);
  return (
    <div className="team-access__lists">
      <div>
        <h3 className="team-access__heading">Can</h3>
        <ul className="team-access__list">
          {words.can.map((sentence) => (
            <li key={sentence}>{sentence}</li>
          ))}
        </ul>
      </div>
      {words.cannot.length > 0 ? (
        <div>
          <h3 className="team-access__heading">Can&apos;t</h3>
          <ul className="team-access__list">
            {words.cannot.map((sentence) => (
              <li key={sentence}>{sentence}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Access (a member's role): the role presets, with exactly what each can
 * see and do in sentences; the permission scopes only behind a disclosure
 * for owners who want them. A change that takes access away is confirmed
 * as destructive; making a director the owner is a strong confirmation.
 */
export function MemberAccess({
  personId,
  displayName,
  role,
  isOwner,
  active,
  presets,
  canChange,
  canInviteDirector,
  canTransferOwnership,
}: {
  readonly personId: string;
  readonly displayName: string;
  readonly role: StaffRole;
  readonly isOwner: boolean;
  readonly active: boolean;
  readonly presets: readonly RolePreset[];
  readonly canChange: boolean;
  readonly canInviteDirector: boolean;
  readonly canTransferOwnership: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [chosen, setChosen] = useState<StaffRole>(role);
  const first = firstName(displayName);
  const current = presets.find((preset) => preset.role === role);
  const next = presets.find((preset) => preset.role === chosen);
  const visible = presets.filter(
    (preset) =>
      preset.role !== "director" || canInviteDirector || role === "director",
  );

  if (isOwner) {
    return (
      <div className="team-access">
        <p className="team-lead">
          <strong>{`${first} owns the club.`}</strong>{" "}
          <span className="team-quiet">
            The owner can do everything and can&apos;t be changed here. To hand
            the club to someone else, open that director&apos;s Access page.
          </span>
        </p>
        <Sentences scopes={["*"]} />
      </div>
    );
  }

  const change = () => {
    if (!current || !next || chosen === role) return;
    const takesAway = removesAccess(current.scopes, next.scopes);
    const lost = accessSentences(current.scopes).can.filter(
      (sentence) => !accessSentences(next.scopes).can.includes(sentence),
    );
    void confirm
      .run({
        tier: "confirm",
        destructive: takesAway,
        title: `Make ${first} ${roleLabel(chosen).toLocaleLowerCase()}?`,
        description: `${first} goes from ${roleLabel(role).toLocaleLowerCase()} to ${roleLabel(chosen).toLocaleLowerCase()}: ${roleSummaries[chosen]}`,
        affected:
          takesAway && lost.length > 0
            ? `${first} will no longer be able to: ${lost.map((sentence) => sentence.replace(/\.$/, "").toLocaleLowerCase()).join("; ")}.`
            : `${first} gets more access from now on.`,
        verb: `Make ${first} ${roleLabel(chosen).toLocaleLowerCase()}`,
        cancelLabel: `Keep ${roleLabel(role).toLocaleLowerCase()}`,
        agentConfirm: `Changes ${displayName}'s role from ${roleLabel(role)} to ${roleLabel(chosen)}`,
        perform: async ({ idempotencyKey }) =>
          unwrap(
            await updateMemberAction({
              personId,
              role: chosen,
              idempotencyKey,
            }),
          ),
        success: `${first} is now ${roleLabel(chosen).toLocaleLowerCase()}`,
      })
      .then((outcome) => {
        if (outcome.status === "done") router.refresh();
        else setChosen(role);
      });
  };

  const transfer = () =>
    void confirm
      .run({
        tier: "strong",
        destructive: true,
        title: `Make ${first} the owner of the club?`,
        description: `Ownership moves to ${first} now. You stay on the team as a director.`,
        recipients: displayName,
        scope: "The whole club: money, pay, the team and settings",
        consequence:
          "Only the new owner can give ownership back. It can't be undone from your account.",
        verb: `Make ${first} the owner`,
        cancelLabel: "Keep ownership",
        agentConfirm: `Transfers club ownership to ${displayName}`,
        perform: async ({ idempotencyKey }) =>
          unwrap(await transferOwnershipAction({ personId, idempotencyKey })),
        success: `${first} owns the club now`,
      })
      .then((outcome) => {
        if (outcome.status === "done") router.refresh();
      });

  return (
    <div className="team-access">
      {canChange ? (
        <RadioGroup
          aria-label="Role"
          className="team-presets"
          onValueChange={(value) => setChosen(value as StaffRole)}
          value={chosen}
        >
          {visible.map((preset) => (
            <RadioOption
              description={roleSummaries[preset.role]}
              key={preset.role}
              label={`${roleLabel(preset.role)}${preset.role === role ? " (now)" : ""}`}
              value={preset.role}
            />
          ))}
        </RadioGroup>
      ) : (
        <p className="team-lead">
          <strong>{roleLabel(role)}</strong>{" "}
          <span className="team-quiet">{roleSummaries[role]}</span>
        </p>
      )}
      {next ? (
        <section
          aria-label={`What ${roleLabel(chosen).toLocaleLowerCase()} can do`}
        >
          <Sentences scopes={next.scopes} />
          <details className="team-access__advanced">
            <summary>Permissions, for advanced owners</summary>
            <p className="team-quiet">
              The exact permissions Duna checks for this role:
            </p>
            <ul className="team-access__scopes">
              {next.scopes.map((scope) => (
                <li className="team-num" key={scope}>
                  {scope}
                </li>
              ))}
            </ul>
          </details>
        </section>
      ) : null}
      {canChange && chosen !== role ? (
        <div className="team-form__actions team-form__actions--start">
          <Button onClick={() => setChosen(role)} variant="ghost">
            Cancel
          </Button>
          <Button onClick={change} variant="primary">
            {`Make ${first} ${roleLabel(chosen).toLocaleLowerCase()}`}
          </Button>
        </div>
      ) : null}
      {canTransferOwnership && role === "director" && active ? (
        <div className="team-transfer">
          <p className="team-quiet">
            {`${first} is a director, so the club can be handed to them.`}
          </p>
          <Button onClick={transfer} variant="secondary">
            {`Make ${first} the owner`}
          </Button>
        </div>
      ) : null}
      {confirm.dialog}
    </div>
  );
}
