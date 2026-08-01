export interface ClerkCredentialPair {
  readonly publishableKey: string;
  readonly secretKey: string;
  readonly source: "production" | "development";
}

type ClerkEnvironment = Readonly<Record<string, string | undefined>>;

function completeCredentialPair(
  publishableKey: string | undefined,
  secretKey: string | undefined,
  source: ClerkCredentialPair["source"],
): ClerkCredentialPair | undefined {
  return publishableKey && secretKey
    ? { publishableKey, secretKey, source }
    : undefined;
}

export function resolveClerkCredentials(
  environment: ClerkEnvironment = process.env,
): ClerkCredentialPair | undefined {
  return (
    completeCredentialPair(
      environment.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      environment.CLERK_SECRET_KEY,
      "production",
    ) ??
    completeCredentialPair(
      environment.CLERK_PUB_KEY_DEV,
      environment.CLERK_SECRET_KEY_DEV,
      "development",
    )
  );
}

export function isClerkConfigured(
  environment: ClerkEnvironment = process.env,
): boolean {
  return Boolean(resolveClerkCredentials(environment));
}
