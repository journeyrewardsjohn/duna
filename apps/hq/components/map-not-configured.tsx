"use client";

import { NotConfigured } from "@duna/ui/tideline";
import { ThemedTideline } from "@/components/themed-tideline";

/**
 * What a map shows when the map provider has no key in this runtime: the
 * kit's honest "isn't set up yet" state, in place of a broken or blank map.
 * The token route answers 200 with `state: "provider-not-configured"`.
 */
export function MapNotConfigured({
  feature = "The map",
  rightInset = 0,
}: {
  readonly feature?: string;
  /** Space to leave on the right (a results sheet drawn over the map). */
  readonly rightInset?: string | number;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        right: rightInset,
        zIndex: 3,
        display: "grid",
        placeItems: "start center",
        padding: "72px 16px 16px",
        pointerEvents: "none",
      }}
    >
      <ThemedTideline
        className="map-not-configured"
        style={{ maxWidth: 420, pointerEvents: "auto" }}
      >
        <NotConfigured
          compact
          feature={feature}
          needs="a map key"
          owner="the Duna team"
        />
      </ThemedTideline>
    </div>
  );
}

/** True when a token response says the map provider is not set up. */
export function isMapNotConfigured(payload: unknown): boolean {
  return (
    typeof payload === "object" &&
    payload !== null &&
    (payload as { state?: unknown }).state === "provider-not-configured"
  );
}
