import type { DiscoveryCoordinates } from "./discovery-search";

export type MeasurementSystem = "imperial" | "metric";

export type TravelEstimate = {
  readonly distanceMeters: number;
  readonly durationSeconds: number;
};

type RoutableItem = {
  readonly id: string;
  readonly latitude?: number;
  readonly longitude?: number;
};

export function buildDrivingMatrixRequest(
  origin: DiscoveryCoordinates,
  items: readonly RoutableItem[],
  accessToken: string,
) {
  const destinations = items
    .filter(
      (
        item,
      ): item is RoutableItem & {
        readonly latitude: number;
        readonly longitude: number;
      } => Number.isFinite(item.latitude) && Number.isFinite(item.longitude),
    )
    .slice(0, 9);
  if (destinations.length === 0) return undefined;
  const coordinates = [origin, ...destinations]
    .map((point) => `${point.longitude},${point.latitude}`)
    .join(";");
  const destinationIndexes = destinations
    .map((_, index) => index + 1)
    .join(";");
  return {
    destinationIds: destinations.map((item) => item.id),
    url:
      `https://api.mapbox.com/directions-matrix/v1/mapbox/driving-traffic/${coordinates}` +
      `?sources=0&destinations=${destinationIndexes}` +
      `&annotations=distance,duration&access_token=${encodeURIComponent(accessToken)}`,
  };
}

export function parseDrivingMatrix(
  destinationIds: readonly string[],
  payload: unknown,
): Readonly<Record<string, TravelEstimate>> {
  if (!payload || typeof payload !== "object") return {};
  const matrix = payload as {
    readonly code?: string;
    readonly distances?: readonly (readonly (number | null)[])[];
    readonly durations?: readonly (readonly (number | null)[])[];
  };
  if (matrix.code !== "Ok") return {};
  const distances = matrix.distances?.[0];
  const durations = matrix.durations?.[0];
  if (!distances || !durations) return {};
  return Object.fromEntries(
    destinationIds.flatMap((id, index) => {
      const distanceMeters = distances[index];
      const durationSeconds = durations[index];
      return typeof distanceMeters === "number" &&
        Number.isFinite(distanceMeters) &&
        typeof durationSeconds === "number" &&
        Number.isFinite(durationSeconds)
        ? [[id, { distanceMeters, durationSeconds }]]
        : [];
    }),
  );
}

export function formatDrivingDistance(
  distanceMeters: number,
  measurementSystem: MeasurementSystem,
) {
  const value =
    measurementSystem === "metric"
      ? distanceMeters / 1_000
      : distanceMeters / 1_609.344;
  const amount = value < 10 ? value.toFixed(1) : Math.round(value).toString();
  return `${amount} ${measurementSystem === "metric" ? "km" : "mi"}`;
}

export function formatDrivingDuration(durationSeconds: number) {
  const totalMinutes = Math.max(1, Math.round(durationSeconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0
    ? `${hours} hr ${minutes} min`
    : `${hours} ${hours === 1 ? "hr" : "hrs"}`;
}
