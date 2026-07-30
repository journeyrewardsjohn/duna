export interface GuardianCopyDecision {
  readonly recipientPersonId: string;
  readonly guardianCopyPersonIds: readonly string[];
  readonly enforced: boolean;
}

export function enforceGuardianCopies(input: {
  readonly recipientPersonId: string;
  readonly recipientIsMinor: boolean;
  readonly verifiedGuardianPersonIds: readonly string[];
  readonly requestedCopyPersonIds?: readonly string[];
}): GuardianCopyDecision {
  const requested = input.requestedCopyPersonIds ?? [];
  if (!input.recipientIsMinor) {
    return {
      recipientPersonId: input.recipientPersonId,
      guardianCopyPersonIds: [...new Set(requested)],
      enforced: false,
    };
  }
  if (input.verifiedGuardianPersonIds.length === 0) {
    throw new Error("Coach-to-minor messaging requires a verified guardian");
  }
  return {
    recipientPersonId: input.recipientPersonId,
    guardianCopyPersonIds: [
      ...new Set([...requested, ...input.verifiedGuardianPersonIds]),
    ],
    enforced: true,
  };
}

export function canSendAt(input: {
  readonly now: Date;
  readonly timezoneOffsetMinutes: number;
  readonly quietHoursStart: number;
  readonly quietHoursEnd: number;
  readonly transactional: boolean;
}): boolean {
  if (input.transactional) return true;
  const localMinutes =
    (input.now.getUTCHours() * 60 +
      input.now.getUTCMinutes() +
      input.timezoneOffsetMinutes +
      1440) %
    1440;
  if (input.quietHoursStart < input.quietHoursEnd) {
    return !(
      localMinutes >= input.quietHoursStart &&
      localMinutes < input.quietHoursEnd
    );
  }
  return !(
    localMinutes >= input.quietHoursStart || localMinutes < input.quietHoursEnd
  );
}
