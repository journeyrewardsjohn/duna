/**
 * Loads the map engine only when a map is about to be seen: the public key
 * from `/api/mapbox/token`, then the engine and its own control sheet (the
 * provider's logo and attribution, which its terms require, live in that
 * sheet). Nothing here runs on the first paint of a page.
 */
import { isMapNotConfigured } from "@/components/map-not-configured";

type MapboxModule = typeof import("mapbox-gl");

export type MapEngine =
  | { readonly state: "ready"; readonly mapboxgl: MapboxModule["default"] }
  | { readonly state: "not-configured" }
  | { readonly state: "error"; readonly error: unknown };

let pending: Promise<MapEngine> | null = null;

export function loadMapEngine(): Promise<MapEngine> {
  pending ??= (async (): Promise<MapEngine> => {
    try {
      const response = await fetch("/api/mapbox/token");
      const payload: unknown = await response.json().catch(() => undefined);
      if (isMapNotConfigured(payload)) return { state: "not-configured" };
      const token = (payload as { token?: string } | undefined)?.token;
      if (!response.ok || !token?.startsWith("pk.")) {
        throw new Error(`Map key request answered ${response.status}`);
      }
      const [engine] = await Promise.all([
        import("mapbox-gl"),
        import("./map-vendor"),
      ]);
      const mapboxgl = engine.default;
      mapboxgl.accessToken = token;
      return { state: "ready", mapboxgl };
    } catch (error) {
      pending = null;
      return { state: "error", error };
    }
  })();
  return pending;
}

/** Street map to zoom 16, satellite for the last three levels (contract R14). */
export const MAP_STYLES = {
  standard: "mapbox://styles/mapbox/standard",
  satellite: "mapbox://styles/mapbox/standard-satellite",
} as const;
