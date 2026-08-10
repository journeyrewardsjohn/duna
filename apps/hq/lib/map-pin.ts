const TILE_SIZE = 256;

function clampLatitude(latitude: number): number {
  return Math.max(-85.05112878, Math.min(85.05112878, latitude));
}

function worldY(latitude: number, worldSize: number): number {
  const radians = (clampLatitude(latitude) * Math.PI) / 180;
  return (
    ((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2) *
    worldSize
  );
}

function latitudeFromWorldY(y: number, worldSize: number): number {
  const normalized = 1 - (2 * y) / worldSize;
  return (Math.atan(Math.sinh(Math.PI * normalized)) * 180) / Math.PI;
}

export function moveMapCoordinate(input: {
  readonly latitude: number;
  readonly longitude: number;
  readonly deltaX: number;
  readonly deltaY: number;
  readonly zoom: number;
}): { latitude: number; longitude: number } {
  const worldSize = TILE_SIZE * 2 ** input.zoom;
  const longitude = input.longitude + (input.deltaX / worldSize) * 360;
  const latitude = latitudeFromWorldY(
    worldY(input.latitude, worldSize) + input.deltaY,
    worldSize,
  );
  return {
    latitude: Math.max(-90, Math.min(90, latitude)),
    longitude: ((((longitude + 180) % 360) + 360) % 360) - 180,
  };
}

export function nudgeMapCoordinate(input: {
  readonly latitude: number;
  readonly longitude: number;
  readonly direction: "up" | "down" | "left" | "right";
  readonly large?: boolean;
  readonly zoom?: number;
}) {
  const distance = input.large ? 20 : 4;
  return moveMapCoordinate({
    latitude: input.latitude,
    longitude: input.longitude,
    deltaX:
      input.direction === "left"
        ? -distance
        : input.direction === "right"
          ? distance
          : 0,
    deltaY:
      input.direction === "up"
        ? -distance
        : input.direction === "down"
          ? distance
          : 0,
    zoom: input.zoom ?? 17,
  });
}
