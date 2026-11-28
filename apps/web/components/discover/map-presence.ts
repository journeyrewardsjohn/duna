/**
 * Whether a page shows its map, decided on the server before the first
 * paint so nothing moves when the map is missing.
 *
 *   on       the public map key is set: load the map when it is seen
 *   explain  no key, in demo mode or development: show the honest
 *            "isn't set up yet" state so the team sees what is missing
 *   off      no key for the public: no map panel at all (the list takes the
 *            width, the List / Map switch and the venue map disappear) and
 *            the gap is reported once on the server
 *
 * Pure: the server wrapper (`map-presence.server.ts`) reads the environment.
 */
export type MapPresence = "on" | "explain" | "off";

export function mapPresenceFor(input: {
  readonly configured: boolean;
  readonly demo: boolean;
  readonly development: boolean;
  /** Demo only: the persona suite viewing as a member of the public. */
  readonly asPublic?: boolean;
}): MapPresence {
  if (input.configured) return "on";
  if ((input.demo || input.development) && !input.asPublic) return "explain";
  return "off";
}

/** The public map key, as the token route reads it. */
export function publicMapKeyConfigured(
  env: Readonly<Record<string, string | undefined>>,
): boolean {
  return [
    env.MAPBOX_API_TOKEN_PUBLIC,
    env.mapbox_api_token_public,
    env.MAPBOX_API_TOKEN,
  ].some((value) => value?.trim().startsWith("pk."));
}
