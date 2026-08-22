export interface BookingPaymentRosterMember {
  readonly personId?: string;
  readonly displayName: string;
  readonly status: "captain" | "selected" | "invited" | "claimed";
  readonly paid: boolean;
}

export function unpaidAdditionalPlayers(
  roster: readonly BookingPaymentRosterMember[],
) {
  return roster.flatMap((member) =>
    member.status !== "captain" && !member.paid && member.personId
      ? [
          {
            person: {
              id: member.personId,
              displayName: member.displayName,
            },
          },
        ]
      : [],
  );
}

export function canPayForEveryone(input: {
  readonly expectedTeamSize: number;
  readonly roster: readonly BookingPaymentRosterMember[];
}): boolean {
  return (
    input.expectedTeamSize > 1 &&
    input.roster.filter((member) => !member.paid && Boolean(member.personId))
      .length > 1 &&
    unpaidAdditionalPlayers(input.roster).length > 0
  );
}
