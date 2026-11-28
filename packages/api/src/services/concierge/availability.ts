/**
 * Whether each Concierge channel can be used right now (B7): the kill switch
 * `concierge.channel.<channel>` and the provider's production values. `duna`
 * (in-app and push) is always available. Computed, never stored.
 */
import type { ProviderKey } from "@duna/core";
import { evaluateFeatureFlags } from "../../feature-flag-evaluator";
import { providerStatus } from "../../provider-readiness";
import type { ChannelAvailability } from "./channel-choice";
import type { ConciergeChannel, ConciergeOutsideChannel } from "./types";

const flagFor = {
  email: "concierge.channel.email",
  imessage: "concierge.channel.imessage",
  whatsapp: "concierge.channel.whatsapp",
} as const satisfies Record<ConciergeOutsideChannel, string>;

export const providerFor = {
  email: "email",
  imessage: "imessage",
  whatsapp: "whatsapp",
} as const satisfies Record<ConciergeOutsideChannel, ProviderKey>;

export type ChannelAvailabilityMap = Readonly<
  Record<ConciergeChannel, ChannelAvailability>
>;

export async function loadChannelAvailability(scope: {
  readonly organizationId?: string;
}): Promise<ChannelAvailabilityMap> {
  const flags = await evaluateFeatureFlags(Object.values(flagFor), {
    ...(scope.organizationId ? { organizationId: scope.organizationId } : {}),
  });
  const of = (channel: ConciergeOutsideChannel): ChannelAvailability => {
    if (!flags[flagFor[channel]]) return "not-enabled";
    return providerStatus(providerFor[channel]) === "not-configured"
      ? "provider-not-configured"
      : "available";
  };
  return {
    duna: "available",
    email: of("email"),
    imessage: of("imessage"),
    whatsapp: of("whatsapp"),
  };
}
