export const ARRIVAL_SHARING_OPENS_MINUTES = 60;
export const ARRIVAL_SHARING_CLOSES_MINUTES = 30;
export const ARRIVAL_GEOFENCE_RADIUS_METERS = 120;

export interface Coordinate {
  readonly latitude: number;
  readonly longitude: number;
}

export interface ArrivalSharingWindow {
  readonly opensAt: string;
  readonly closesAt: string;
  readonly active: boolean;
  readonly phase: "early" | "active" | "closed";
}

export type ArrivalStatus =
  "on-time" | "leave-now" | "running-late" | "arrived";

function validDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Arrival timing requires a valid date.");
  }
  return date;
}

export function arrivalSharingWindow(
  startsAt: string | Date,
  now: Date = new Date(),
): ArrivalSharingWindow {
  const start = validDate(startsAt).getTime();
  const current = validDate(now).getTime();
  const opens = start - ARRIVAL_SHARING_OPENS_MINUTES * 60_000;
  const closes = start + ARRIVAL_SHARING_CLOSES_MINUTES * 60_000;
  return {
    opensAt: new Date(opens).toISOString(),
    closesAt: new Date(closes).toISOString(),
    active: current >= opens && current < closes,
    phase: current < opens ? "early" : current >= closes ? "closed" : "active",
  };
}

export function distanceMeters(from: Coordinate, to: Coordinate): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const fromLatitude = radians(from.latitude);
  const toLatitude = radians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return Math.round(
    earthRadiusMeters *
      2 *
      Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)),
  );
}

// Used only when a routing provider is unavailable. The result is intentionally
// conservative and clearly labelled as an estimate in the clients.
export function fallbackTravelDurationSeconds(distance: number): number {
  if (!Number.isFinite(distance) || distance < 0) {
    throw new Error("Arrival distance must be a non-negative number.");
  }
  if (distance <= ARRIVAL_GEOFENCE_RADIUS_METERS) return 0;
  const walkingMeters = Math.min(distance, 650);
  const drivingMeters = Math.max(0, distance - walkingMeters);
  const walkingSeconds = walkingMeters / 1.25;
  const drivingSeconds = drivingMeters / 8.9;
  const transitionSeconds = drivingMeters > 0 ? 4 * 60 : 0;
  return Math.max(
    60,
    Math.round(walkingSeconds + drivingSeconds + transitionSeconds),
  );
}

export function arrivalStatus(input: {
  readonly distanceMeters: number;
  readonly accuracyMeters?: number;
  readonly travelDurationSeconds: number;
  readonly startsAt: string | Date;
  readonly now?: Date;
}): ArrivalStatus {
  const accuracy = Math.max(0, input.accuracyMeters ?? 0);
  if (
    input.distanceMeters <=
    Math.max(ARRIVAL_GEOFENCE_RADIUS_METERS, Math.min(accuracy * 1.5, 220))
  ) {
    return "arrived";
  }
  const now = input.now ?? new Date();
  const secondsUntilStart =
    (validDate(input.startsAt).getTime() - validDate(now).getTime()) / 1_000;
  const marginSeconds = secondsUntilStart - input.travelDurationSeconds;
  if (marginSeconds < -2 * 60) return "running-late";
  if (marginSeconds <= 5 * 60) return "leave-now";
  return "on-time";
}

export function leaveByTime(input: {
  readonly startsAt: string | Date;
  readonly travelDurationSeconds: number;
  readonly arrivalBufferMinutes?: number;
}): string {
  const arrivalBufferMinutes = input.arrivalBufferMinutes ?? 5;
  return new Date(
    validDate(input.startsAt).getTime() -
      input.travelDurationSeconds * 1_000 -
      arrivalBufferMinutes * 60_000,
  ).toISOString();
}
