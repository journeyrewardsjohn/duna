import type { FeatureFlagKey } from "./flags";

/**
 * Provider readiness registry: the outside integrations a feature can depend
 * on and the environment variable NAMES each one needs. Names only; this
 * module never reads the environment and never holds a value.
 *
 * `providerStatus(key)` in `@duna/api` evaluates a provider against the
 * runtime environment and returns `configured`, `not-configured` or
 * `test-mode`. A feature that needs a provider checks BOTH its flag
 * (`isFeatureEnabled`) and `providerStatus`; when the provider is not
 * configured the feature remains visible, says so honestly, and attempts no
 * outbound call.
 *
 * `requires` is a list of groups. Every group must be satisfied; a group is
 * satisfied when ANY one of its names holds a non-empty value. The names below
 * are the ones the code already reads (see docs/ENVIRONMENT_VARIABLES.md).
 */

export type ProviderStatus = "configured" | "not-configured" | "test-mode";

export interface ProviderDefinition {
  readonly label: string;
  /** What the owner must set up outside Duna for production. */
  readonly productionNote: string;
  readonly requires: readonly (readonly string[])[];
  /**
   * When set, the provider reports `test-mode` if this variable's value starts
   * with one of `testPrefixes` (the value itself is never returned or logged).
   */
  readonly modeFrom?: {
    readonly name: string;
    readonly testPrefixes: readonly string[];
  };
  /** Feature flags whose features depend on this provider. */
  readonly features: readonly FeatureFlagKey[];
}

const stripeMode = {
  name: "STRIPE_SECRET_KEY",
  testPrefixes: ["sk_test_", "rk_test_"],
} as const;

export const providerRegistry = {
  workos: {
    label: "WorkOS (sign-in and organizations)",
    productionNote:
      "Production WorkOS environment with the Web, HQ and native redirect URIs registered.",
    requires: [
      ["WORKOS_CLIENT_ID"],
      ["WORKOS_API_KEY"],
      ["WORKOS_COOKIE_PASSWORD"],
    ],
    features: [],
  },
  stripe: {
    label: "Stripe (payments and billing)",
    productionNote:
      "Live secret and publishable keys plus a live webhook endpoint secret; test keys report test-mode.",
    requires: [
      ["STRIPE_SECRET_KEY"],
      ["STRIPE_WEBHOOK_SECRET"],
      ["STRIPE_PUBLISHABLE_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
    ],
    modeFrom: stripeMode,
    features: [],
  },
  stripeConnect: {
    label: "Stripe Connect (Duna Pay and contractor payouts)",
    productionNote:
      "Connect enabled on the live platform account (embedded components approved by Stripe review); uses the Stripe platform keys.",
    requires: [
      ["STRIPE_SECRET_KEY"],
      ["STRIPE_WEBHOOK_SECRET"],
      ["STRIPE_PUBLISHABLE_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"],
    ],
    modeFrom: stripeMode,
    features: ["pay.embeddedOnboarding", "team.contractorPayouts"],
  },
  mapbox: {
    label: "Mapbox (maps)",
    productionNote: "A public token restricted to the Duna Web and HQ URLs.",
    requires: [["MAPBOX_API_TOKEN_PUBLIC", "MAPBOX_API_TOKEN"]],
    features: ["facility.owners"],
  },
  weather: {
    label: "Tomorrow.io (weather and conditions)",
    productionNote: "A Tomorrow.io plan that covers hourly forecasts.",
    requires: [["TOMORROW_IO_API_KEY"]],
    features: [],
  },
  siteReader: {
    label: "Firecrawl (website reader for AI setup and site onboarding)",
    productionNote: "A Firecrawl key with enough monthly credits.",
    requires: [["FIRECRAWL_API_KEY", "FIRECRAWL_API"]],
    features: ["website.workspace"],
  },
  aiGateway: {
    label: "Vercel AI Gateway (Ask Duna and AI drafting)",
    productionNote:
      "AI Gateway enabled on the Vercel team (OIDC on Vercel) or an AI Gateway API key elsewhere.",
    requires: [
      ["AI_GATEWAY_API_KEY", "VERCEL_AI_GATEWAY_API_KEY", "VERCEL_OIDC_TOKEN"],
    ],
    features: ["website.workspace"],
  },
  videoCloudflareStream: {
    label: "Cloudflare Stream (live video)",
    productionNote:
      "Stream API token and account id; webhook secret for recordings.",
    requires: [
      ["CLOUDFLARE_STREAM_API_TOKEN"],
      ["CLOUDFLARE_ACCOUNT_ID", "CF_ACCOUNT_ID"],
    ],
    features: [],
  },
  videoYoutube: {
    label: "YouTube (live simulcast)",
    productionNote:
      "Google OAuth client approved for the YouTube Data API with the production redirect URI.",
    requires: [["YOUTUBE_CLIENT_ID"], ["YOUTUBE_CLIENT_SECRET"]],
    features: [],
  },
  push: {
    label: "Expo push notifications",
    productionNote:
      "Expo access token(s) for the Player and Pro projects, with APNs and FCM credentials uploaded to Expo.",
    requires: [
      [
        "EXPO_ACCESS_TOKEN",
        "EXPO_PLAYER_ACCESS_TOKEN",
        "EXPO_PRO_ACCESS_TOKEN",
      ],
    ],
    features: [],
  },
  email: {
    label: "Resend (email delivery)",
    productionNote: "A verified sending domain and from address in Resend.",
    requires: [["RESEND_API_KEY"], ["RESEND_FROM_EMAIL"]],
    features: ["concierge.channel.email"],
  },
  imessage: {
    label: "Sendblue (iMessage delivery)",
    productionNote:
      "A Sendblue account with provisioned numbers and the inbound webhook secret.",
    requires: [
      ["SENDBLUE_API_KEY"],
      ["SENDBLUE_API_SECRET"],
      ["SENDBLUE_PHONE_NUMBERS"],
      ["SENDBLUE_WEBHOOK_SECRET"],
    ],
    features: ["concierge.channel.imessage"],
  },
  whatsapp: {
    label: "Sent.dm (WhatsApp delivery)",
    productionNote:
      "The Sent.dm key the code already uses for SMS templates, plus an approved WhatsApp sender, the templates duna_concierge_message and duna_verification_code, and SENT_DM_WEBHOOK_SECRET for replies (Concierge, B7).",
    requires: [["SENT_DM_API_KEY", "SENT_DM_API"]],
    features: ["concierge.channel.whatsapp"],
  },
  imageGeneration: {
    label: "Higgsfield (image generation)",
    productionNote: "A Higgsfield workspace and API token.",
    requires: [["HIGGSFIELD_API_TOKEN"], ["HIGGSFIELD_WORKSPACE_ID"]],
    features: [],
  },
  sentry: {
    label: "Sentry (error reporting)",
    productionNote:
      "A Sentry organisation with a project for Web and one for HQ; each project's DSN in NEXT_PUBLIC_SENTRY_DSN on its Vercel project. Readable stack traces also need SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT at build time. Until the DSN is set, errors are still written to Duna's structured logs.",
    requires: [["NEXT_PUBLIC_SENTRY_DSN", "SENTRY_DSN"]],
    features: [],
  },
} as const satisfies Readonly<Record<string, ProviderDefinition>>;

export type ProviderKey = keyof typeof providerRegistry;

export const providerKeys = Object.freeze(
  Object.keys(providerRegistry) as ProviderKey[],
);

export function isProviderKey(value: string): value is ProviderKey {
  return Object.hasOwn(providerRegistry, value);
}

/** Providers a flagged feature depends on, from the registry. */
export function providersForFeature(
  key: FeatureFlagKey,
): readonly ProviderKey[] {
  return providerKeys.filter((provider) =>
    (providerRegistry[provider].features as readonly string[]).includes(key),
  );
}
