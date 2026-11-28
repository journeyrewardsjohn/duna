import type { DiscoveryMapItem } from "@duna/api";
import type { DiscoveryCoordinates } from "../../../discovery-search";

export function discoveryDistance(
  origin: DiscoveryCoordinates | undefined,
  item: Pick<DiscoveryMapItem, "latitude" | "longitude">,
) {
  if (!origin || item.latitude === undefined || item.longitude === undefined) {
    return Number.POSITIVE_INFINITY;
  }
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(item.latitude - origin.latitude);
  const longitudeDelta = radians(item.longitude - origin.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(origin.latitude)) *
      Math.cos(radians(item.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
