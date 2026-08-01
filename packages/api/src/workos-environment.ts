export interface WorkOSCredentials {
  readonly clientId: string;
  readonly apiKey: string;
}

type WorkOSEnvironment = Readonly<Record<string, string | undefined>>;

function value(input: string | undefined): string | undefined {
  const normalized = input?.trim();
  return normalized || undefined;
}

export function resolveWorkOSCredentials(
  environment: WorkOSEnvironment = process.env,
): WorkOSCredentials | undefined {
  const clientId = value(environment.WORKOS_CLIENT_ID);
  const apiKey = value(environment.WORKOS_API_KEY);
  return clientId && apiKey ? { clientId, apiKey } : undefined;
}

export function isWorkOSConfigured(
  environment: WorkOSEnvironment = process.env,
): boolean {
  return Boolean(resolveWorkOSCredentials(environment));
}

export function isWorkOSAuthKitConfigured(
  environment: WorkOSEnvironment = process.env,
): boolean {
  const cookiePassword = value(environment.WORKOS_COOKIE_PASSWORD);
  return Boolean(
    resolveWorkOSCredentials(environment) &&
    cookiePassword &&
    cookiePassword.length >= 32,
  );
}
