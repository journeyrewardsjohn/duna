/** Read-only pre-payment check. Never cache success across credential changes. */
export async function assertWebsiteHostingConnection(): Promise<void> {
  const token = process.env.DUNA_SITES_VERCEL_TOKEN?.trim();
  const team = process.env.DUNA_SITES_VERCEL_TEAM_ID?.trim();
  const key = process.env.DUNA_SITES_NEON_API_KEY?.trim();
  const org = process.env.DUNA_SITES_NEON_ORG_ID?.trim();
  if (!token || !team || !key || !org) {
    throw new Error(
      "Website hosting is not connected yet. Contact Duna to finish hosting setup.",
    );
  }
  const signal = AbortSignal.timeout(8_000);
  async function read(
    url: string,
    credential: string,
  ): Promise<Record<string, unknown>> {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${credential}` },
      signal,
      cache: "no-store",
      redirect: "error",
    });
    if (!response.ok) throw new Error("Provider access denied");
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid provider response");
    return value as Record<string, unknown>;
  }
  try {
    const [identity, vercel, neon] = await Promise.all([
      read(
        `https://api.vercel.com/v2/teams/${encodeURIComponent(team)}`,
        token,
      ),
      read(
        `https://api.vercel.com/v9/projects?teamId=${encodeURIComponent(team)}&limit=1`,
        token,
      ),
      read(
        `https://console.neon.tech/api/v2/projects?org_id=${encodeURIComponent(org)}&limit=1`,
        key,
      ),
    ]);
    if (
      identity.id !== team ||
      !Array.isArray(vercel.projects) ||
      !Array.isArray(neon.projects)
    )
      throw new Error("Provider scope mismatch");
    for (const project of vercel.projects) {
      if (!project || project.accountId !== team)
        throw new Error("Provider scope mismatch");
    }
    for (const project of neon.projects) {
      if (!project || project.org_id !== org)
        throw new Error("Provider scope mismatch");
    }
  } catch {
    // Provider bodies and network errors can contain credentials or private account details.
    throw new Error(
      "Website hosting connection could not be verified. Contact Duna before starting your subscription.",
    );
  }
}
