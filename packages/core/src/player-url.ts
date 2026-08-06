export type PublicPlayerRouteInput = {
  readonly id: string;
  readonly displayName: string;
  readonly handle: string;
  readonly homeMarket?: string | null;
  readonly countryCode?: string | null;
  readonly profileClaimStatus?:
    "claimed" | "unclaimed" | "claim-pending" | "merged";
};

const playerIdSuffix =
  /-([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

function slugPart(value: string, fallback: string, maximumLength: number) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, maximumLength)
    .replace(/-$/g, "");
  return normalized || fallback;
}

function publicName(displayName: string) {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "player";
  return `${parts[0]} ${parts.at(-1)}`;
}

function publicCity(homeMarket?: string | null) {
  const value = homeMarket?.trim();
  if (!value || /^(market|city|location) not set$/i.test(value)) {
    return undefined;
  }
  return value.split(",")[0]?.trim() || undefined;
}

export function publicPlayerGeneratedIdentifier(input: PublicPlayerRouteInput) {
  const name = slugPart(publicName(input.displayName), "player", 52);
  const country = slugPart(
    input.countryCode ?? "international",
    "international",
    24,
  );
  const city = publicCity(input.homeMarket);
  const location = city ? `-${slugPart(city, "", 42)}` : "";
  return `${name}-${country}${location}-${input.id.toLowerCase()}`;
}

export function publicPlayerIdentifier(input: PublicPlayerRouteInput) {
  return input.profileClaimStatus === "claimed"
    ? input.handle.toLowerCase()
    : publicPlayerGeneratedIdentifier(input);
}

export function publicPlayerPath(input: PublicPlayerRouteInput) {
  return `/players/${publicPlayerIdentifier(input)}`;
}

export function playerIdFromPublicIdentifier(identifier: string) {
  return identifier.trim().match(playerIdSuffix)?.[1]?.toLowerCase();
}
