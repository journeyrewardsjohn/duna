/**
 * The public map token (moved from the retired `discovery-map.tsx`). Built
 * in through `EXPO_PUBLIC_MAPBOX_API_TOKEN`, or fetched once from the Duna
 * web app (which holds it). No token: callers show the "map not set up"
 * state and the list keeps working.
 */
import Mapbox from "@rnmapbox/maps";
import { useEffect, useState } from "react";
import { dunaWebUrl } from "../../../mobile-api";

let publicTokenRequest: Promise<string | undefined> | undefined;
const embeddedPublicToken = process.env.EXPO_PUBLIC_MAPBOX_API_TOKEN?.trim();

async function publicMapboxToken(): Promise<string | undefined> {
  if (embeddedPublicToken?.startsWith("pk.")) return embeddedPublicToken;
  publicTokenRequest ??= fetch(`${dunaWebUrl}/api/mapbox/token`)
    .then(async (response) => {
      if (!response.ok) return undefined;
      const payload = (await response.json()) as { token?: string };
      return payload.token?.startsWith("pk.") ? payload.token : undefined;
    })
    .catch(() => undefined);
  return publicTokenRequest;
}

export type MapTokenState = "loading" | "ready" | "not-configured";

/** The token, once known; `state` says whether the map can draw at all. */
export function useMapboxTokenState(active = true): {
  readonly token?: string;
  readonly state: MapTokenState;
} {
  const [token, setToken] = useState<string>();
  const [state, setState] = useState<MapTokenState>("loading");
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    void publicMapboxToken().then((nextToken) => {
      if (!mounted) return;
      if (!nextToken) {
        setState("not-configured");
        return;
      }
      Mapbox.setAccessToken(nextToken);
      setToken(nextToken);
      setState("ready");
    });
    return () => {
      mounted = false;
    };
  }, [active]);
  return { ...(token ? { token } : {}), state };
}

export function useMapboxToken(active = true): string | undefined {
  return useMapboxTokenState(active).token;
}
