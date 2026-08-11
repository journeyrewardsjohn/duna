export function pickupInviteActionLabel(inviteeCount: number): string {
  return inviteeCount === 1 ? "Send invite" : `Send ${inviteeCount} invites`;
}

export function pickupInviteExplanation(paidMatch: boolean): string {
  return paidMatch
    ? "Invited players confirm and pay for their own place. Spots stay open until then."
    : "Invited players confirm their own place. Spots stay open until then.";
}

export function pickupInviteResult(input: {
  readonly invitedCount: number;
  readonly alreadyActiveCount: number;
  readonly paidMatch: boolean;
}): string {
  if (input.invitedCount === 0) {
    return input.alreadyActiveCount === 1
      ? "This player is already part of this match."
      : "These players are already part of this match.";
  }

  const sent =
    input.invitedCount === 1
      ? "Invite sent."
      : `${input.invitedCount} invites sent.`;
  const confirmation = input.paidMatch ? "confirms and pays" : "confirms";
  const availability =
    input.invitedCount === 1
      ? `Spots stay open until the player ${confirmation}.`
      : `Spots stay open until each player ${confirmation}.`;
  const alreadyActive =
    input.alreadyActiveCount > 0
      ? " Some selected players were already part of this match."
      : "";

  return `${sent} ${availability}${alreadyActive}`;
}
