import {
  isProviderKey,
  providerKeys,
  providerRegistry,
  type ProviderDefinition,
  type ProviderKey,
  type ProviderStatus,
} from "@duna/core";
import { z } from "zod";

/**
 * Provider readiness: is an outside integration set up in this runtime?
 *
 * Reads only whether the named environment variables hold a non-empty value.
 * It never returns, logs or compares a value except to classify a Stripe key
 * prefix as test or live. It makes no network call and never throws.
 *
 * Use together with the feature flag:
 *
 *   const enabled = await isFeatureEnabled("concierge.channel.email", { organizationId, context: ctx });
 *   const provider = providerStatus("email");
 *   if (!enabled) return hidden / not-enabled;
 *   if (provider === "not-configured") return { state: "provider-not-configured" }; // visible, honest, no outbound call
 *   // configured or test-mode: call the provider (test-mode: label the UI as test).
 */

type Environment = Readonly<Record<string, string | undefined>>;

function hasValue(environment: Environment, name: string): boolean {
  return Boolean(environment[name]?.trim());
}

function statusOf(
  definition: ProviderDefinition,
  environment: Environment,
): ProviderStatus {
  const configured = definition.requires.every((group) =>
    group.some((name) => hasValue(environment, name)),
  );
  if (!configured) return "not-configured";
  if (definition.modeFrom) {
    const value = environment[definition.modeFrom.name]?.trim() ?? "";
    if (definition.modeFrom.testPrefixes.some((p) => value.startsWith(p))) {
      return "test-mode";
    }
  }
  return "configured";
}

export function providerStatus(
  key: ProviderKey,
  environment: Environment = process.env,
): ProviderStatus {
  try {
    if (!isProviderKey(key)) return "not-configured";
    return statusOf(providerRegistry[key], environment);
  } catch {
    return "not-configured";
  }
}

/** True when an outbound call to the provider may be attempted. */
export function isProviderUsable(
  key: ProviderKey,
  environment: Environment = process.env,
): boolean {
  return providerStatus(key, environment) !== "not-configured";
}

export const providerReadinessSchema = z.object({
  providers: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        status: z.enum(["configured", "not-configured", "test-mode"]),
        productionNote: z.string(),
        /** Names of required variables that are missing (names, never values). */
        missing: z.array(z.string()).readonly(),
        features: z.array(z.string()).readonly(),
      }),
    )
    .readonly(),
});

export type ProviderReadiness = z.infer<typeof providerReadinessSchema>;

export function loadProviderReadiness(
  environment: Environment = process.env,
): ProviderReadiness {
  return {
    providers: providerKeys.map((key) => {
      const definition: ProviderDefinition = providerRegistry[key];
      return {
        key,
        label: definition.label,
        status: providerStatus(key, environment),
        productionNote: definition.productionNote,
        missing: definition.requires
          .filter((group) => !group.some((name) => hasValue(environment, name)))
          .map((group) => group.join(" or ")),
        features: [...definition.features],
      };
    }),
  };
}
