/**
 * Typed registry of every product feature flag.
 *
 * The registry is the source of truth for which flag keys exist, what they
 * mean and their default. Rows in the `feature_flags` table (edited by Super
 * Admin under /admin/flags) only override the default for a scope; a key that
 * is not listed here is never evaluated.
 *
 * Flags are KILL SWITCHES (owner decision, 2026-11-27: "ship everything
 * switched on"). Every default is ON; no row means on. A row with
 * enabled=false turns the feature off globally, for one organization, or for
 * one market. A feature that also needs an outside provider must check BOTH
 * the flag and `providerStatus(...)` (see ./providers.ts): flag on AND
 * provider configured. When the provider is missing the feature stays visible,
 * says so honestly, and makes no outbound call.
 *
 * Evaluate on the server with `isFeatureEnabled(key, { organizationId })` from
 * `@duna/api`. Clients read the `clientVisible` flags through the
 * `public.flags.enabled` tRPC query.
 *
 * Add a flag by appending an entry. Keys are dot-separated, start with a
 * lowercase domain, may use camelCase after it, and match
 * /^[a-z0-9][a-zA-Z0-9._-]*$/ within 96 characters (the Super Admin editor
 * enforces the same pattern). Never reuse or rename a key that has shipped.
 */

export interface FeatureFlagDefinition {
  /** What turning the flag on does, written for the Super Admin editor. */
  readonly description: string;
  /** Work package that owns the gated behavior. */
  readonly owner: string;
  /** Value when no row applies, in demo mode, and when the table cannot be read. */
  readonly defaultEnabled: boolean;
  /** Whether `public.flags.enabled` may return the evaluated value to clients. */
  readonly clientVisible: boolean;
}

export const featureFlagRegistry = {
  "concierge.channel.email": {
    description:
      "Concierge may deliver Send-card messages by email (Resend). Off: the email adapter returns not-enabled and makes no provider call.",
    owner: "B7",
    defaultEnabled: true,
    clientVisible: true,
  },
  "concierge.channel.imessage": {
    description:
      "Concierge may deliver Send-card messages by iMessage (Sendblue). Off: the adapter returns not-enabled and makes no provider call.",
    owner: "B7",
    defaultEnabled: true,
    clientVisible: true,
  },
  "concierge.channel.whatsapp": {
    description:
      "Concierge may deliver Send-card messages by WhatsApp. Off: the adapter returns not-enabled and makes no provider call.",
    owner: "B7",
    defaultEnabled: true,
    clientVisible: true,
  },
  "invites.sms": {
    description:
      "Players may text an invitation (one transactional message per chosen contact) to something they host or are booked into. Off: send answers not-enabled and makes no provider call; the preview still works.",
    owner: "INVITE-SMS",
    defaultEnabled: true,
    clientVisible: true,
  },
  "team.contractorPayouts": {
    description:
      "Pay 1099 contractors through their own connected account. Off: no payout is created and no provider call is made.",
    owner: "B3c",
    defaultEnabled: true,
    clientVisible: true,
  },
  "training.storefront": {
    description:
      "List reviewed drills publicly for sale in the drill storefront.",
    owner: "B5",
    defaultEnabled: true,
    clientVisible: true,
  },
  "training.scene3d": {
    description:
      "Offer the lazy-loaded three.js 3D player for training scenes alongside the 2D renderer.",
    owner: "B6c",
    defaultEnabled: true,
    clientVisible: true,
  },
  "website.workspace": {
    description:
      "Replace the one-edit website flow with the Website Changes workspace (requests, preview, checks, publish, undo).",
    owner: "B8a",
    defaultEnabled: true,
    clientVisible: true,
  },
  "facility.owners": {
    description:
      "Facility owners can list public courts, set access rules, approve players and stop play.",
    owner: "B9",
    defaultEnabled: true,
    clientVisible: true,
  },
  "ai.onDeviceVideo": {
    description:
      "Run video analysis on the device where supported instead of uploading for server-side analysis.",
    owner: "planned",
    defaultEnabled: true,
    clientVisible: true,
  },
  "health.juniors": {
    description:
      "Extend Health features to junior players under guardian consent and review.",
    owner: "planned",
    defaultEnabled: true,
    clientVisible: true,
  },
  "pay.embeddedOnboarding": {
    description:
      "Use Stripe Connect embedded components for Duna Pay onboarding instead of the hosted flow (test mode until Stripe review).",
    owner: "B2",
    defaultEnabled: true,
    clientVisible: true,
  },
} as const satisfies Readonly<Record<string, FeatureFlagDefinition>>;

export type FeatureFlagKey = keyof typeof featureFlagRegistry;

export const featureFlagKeys = Object.freeze(
  Object.keys(featureFlagRegistry) as FeatureFlagKey[],
);

export const clientVisibleFeatureFlagKeys = Object.freeze(
  featureFlagKeys.filter((key) => featureFlagRegistry[key].clientVisible),
);

export function isFeatureFlagKey(value: string): value is FeatureFlagKey {
  return Object.hasOwn(featureFlagRegistry, value);
}

export function featureFlagDefault(key: FeatureFlagKey): boolean {
  return featureFlagRegistry[key].defaultEnabled;
}
