export interface WorkOSMobileUser {
  readonly email: string;
  readonly firstName?: string;
  readonly id: string;
  readonly lastName?: string;
  readonly profilePictureUrl?: string;
}

export function mobileUserDisplayName(
  user: WorkOSMobileUser | undefined,
  fallback = "Your Duna account",
): string {
  const name = [user?.firstName, user?.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .trim();
  if (name) return name;
  const emailName = user?.email.split("@", 1)[0]?.trim();
  return emailName || fallback;
}

export function mobileUserInitials(
  user: WorkOSMobileUser | undefined,
  fallback = "DU",
): string {
  const initials = [user?.firstName, user?.lastName]
    .filter((part): part is string => Boolean(part?.trim()))
    .map((part) => part.trim()[0]!.toUpperCase())
    .join("")
    .slice(0, 2);
  if (initials) return initials;
  const emailName = user?.email.split("@", 1)[0]?.trim();
  return emailName?.slice(0, 2).toUpperCase() || fallback;
}
