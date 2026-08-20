import type { DiscoveryEntityType, DiscoveryMapItem } from "@duna/api";

export type DiscoveryMapFilter = "all" | DiscoveryEntityType;

const openMatchKinds = new Set(["open-play", "pickup", "hosted-match"]);

export function isOpenCommunityMatch(item: DiscoveryMapItem): boolean {
  return (
    item.entityType === "event" &&
    openMatchKinds.has(item.kind) &&
    (item.spotsRemaining === undefined || item.spotsRemaining > 0)
  );
}

export function discoveryItemMatchesFilter(
  item: DiscoveryMapItem,
  filter: DiscoveryMapFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "match") return isOpenCommunityMatch(item);
  if (filter === "pro-tour") {
    return item.entityType === "pro-tour" || item.entityType === "match";
  }
  return item.entityType === filter;
}
