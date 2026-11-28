/**
 * Which processor mode a secret key runs in. The environment's keys decide
 * the mode (the owner controls them); code never embeds or requests a key.
 */
export type StripeKeyMode = "sandbox" | "live";

export function stripeKeyMode(
  key: string | undefined,
): StripeKeyMode | undefined {
  if (!key) return undefined;
  if (/^(sk|rk)_test_/.test(key)) return "sandbox";
  if (/^(sk|rk)_live_/.test(key)) return "live";
  return undefined;
}

/**
 * Live changes need a person's explicit confirmation for this run
 * (`--confirm-live`); sandbox runs need none.
 */
export function assertStripeBootstrapAllowed(input: {
  readonly key: string | undefined;
  readonly argv: readonly string[];
}): StripeKeyMode {
  const mode = stripeKeyMode(input.key);
  if (!mode) {
    throw new Error(
      "Set STRIPE_SECRET_KEY (a secret or restricted key) in the environment before bootstrapping.",
    );
  }
  if (mode === "live" && !input.argv.includes("--confirm-live")) {
    throw new Error(
      "This key is a live key. Re-run with --confirm-live to create Duna's products and prices in live mode.",
    );
  }
  return mode;
}
