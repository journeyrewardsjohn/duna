const canonicalHqUrl = "https://hq.duna.coach";
const legacyHqHosts = new Set(["duna-hq.vercel.app"]);

export function resolveDunaHqUrl(configured?: string): string {
  const candidate = configured?.trim();
  if (!candidate) return canonicalHqUrl;
  try {
    const url = new URL(candidate);
    if (legacyHqHosts.has(url.hostname)) return canonicalHqUrl;
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.origin
      : canonicalHqUrl;
  } catch {
    return canonicalHqUrl;
  }
}

const configuredHqUrl =
  process.env.NEXT_PUBLIC_HQ_URL ??
  (process.env.NODE_ENV === "development"
    ? "http://localhost:3001"
    : undefined);

export const DUNA_HQ_URL = resolveDunaHqUrl(configuredHqUrl);
