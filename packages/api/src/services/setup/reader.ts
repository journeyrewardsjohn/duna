/**
 * The website reader seam for AI setup. Production uses the hosted reader
 * the repo already uses for site onboarding (`siteReader` in the provider
 * registry); tests inject a recorded reader. Every call is wrapped in
 * `withProviderCall` (ids and timings only; page text never reaches a log).
 */
import Firecrawl from "@mendable/firecrawl-js";
import { withProviderCall } from "../../observability";
import { providerStatus } from "../../provider-readiness";
import { SetupReadError } from "./failure-reasons";
import { setupLimits } from "./limits";

export interface SetupReaderBranding {
  readonly logo?: string | null;
  readonly colors?: Readonly<Record<string, string | undefined>>;
}

export interface SetupReaderPage {
  /** Where the reader ended up after redirects. */
  readonly finalUrl: string;
  readonly statusCode?: number;
  readonly title?: string;
  readonly markdown: string;
  readonly links: readonly string[];
  readonly branding?: SetupReaderBranding;
}

export interface SetupSiteReader {
  /** Reads one page; `discover` also asks for links and site branding. */
  read(
    url: string,
    options: { readonly discover: boolean },
  ): Promise<SetupReaderPage>;
  /** robots.txt text, or undefined when there is none or it cannot be read. */
  readRobots(origin: string): Promise<string | undefined>;
}

function readerKey(): string | undefined {
  return (
    process.env.FIRECRAWL_API_KEY?.trim() ||
    process.env.FIRECRAWL_API?.trim() ||
    undefined
  );
}

export function isSetupReaderConfigured(): boolean {
  return (
    providerStatus("siteReader") !== "not-configured" && Boolean(readerKey())
  );
}

/** Maps a reader failure to a reason a person can act on. */
export function readerFailureReason(error: unknown): SetupReadError {
  if (error instanceof SetupReadError) return error;
  const status = (error as { status?: number }).status;
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (status === 401 || status === 403 || status === 429) {
    // 401/403 from the reader's own API mean Duna's key; from the site they
    // mean the site refused. The reader reports the site's code in the
    // page metadata instead, so an API-level refusal is "no response".
    return new SetupReadError(status === 429 ? "timed-out" : "no-response");
  }
  if (status === 408 || /timed? ?out|timeout/.test(message)) {
    return new SetupReadError("timed-out");
  }
  return new SetupReadError("no-response");
}

/** Classifies the site's own HTTP status as reported by the reader. */
export function siteStatusFailure(
  statusCode: number | undefined,
): SetupReadError | undefined {
  if (!statusCode || statusCode < 400) return undefined;
  if (
    statusCode === 401 ||
    statusCode === 403 ||
    statusCode === 429 ||
    statusCode === 451
  ) {
    return new SetupReadError("blocked-by-site");
  }
  if (statusCode === 408 || statusCode === 504)
    return new SetupReadError("timed-out");
  if (statusCode === 413) return new SetupReadError("too-large");
  return new SetupReadError("no-response");
}

export function createFirecrawlSetupReader(): SetupSiteReader {
  const apiKey = readerKey();
  if (!apiKey) throw new SetupReadError("no-response");
  const client = new Firecrawl({
    apiKey,
    timeoutMs: setupLimits.readerTimeoutMs + 10_000,
    maxRetries: 1,
  });
  return {
    async read(url, { discover }) {
      try {
        const document = await withProviderCall(
          "siteReader",
          "setup.scrape",
          () =>
            client.scrape(url, {
              formats: discover
                ? ["markdown", "links", "branding"]
                : ["markdown"],
              // Footers carry phone numbers and addresses: read the whole page.
              onlyMainContent: false,
              blockAds: true,
              removeBase64Images: true,
              timeout: setupLimits.readerTimeoutMs,
              storeInCache: false,
            }),
        );
        const metadata = document.metadata ?? {};
        return {
          finalUrl:
            (typeof metadata.url === "string" && metadata.url) ||
            (typeof metadata.sourceURL === "string" && metadata.sourceURL) ||
            url,
          statusCode:
            typeof metadata.statusCode === "number"
              ? metadata.statusCode
              : undefined,
          title:
            typeof metadata.title === "string" ? metadata.title : undefined,
          markdown: document.markdown ?? "",
          links: document.links ?? [],
          branding: document.branding
            ? { logo: document.branding.logo, colors: document.branding.colors }
            : undefined,
        };
      } catch (error) {
        throw readerFailureReason(error);
      }
    },
    async readRobots(origin) {
      try {
        const document = await withProviderCall(
          "siteReader",
          "setup.robots",
          () =>
            client.scrape(new URL("/robots.txt", origin).toString(), {
              formats: ["rawHtml"],
              onlyMainContent: false,
              timeout: setupLimits.readerTimeoutMs,
              storeInCache: false,
            }),
        );
        const status = document.metadata?.statusCode;
        if (typeof status === "number" && status >= 400) return undefined;
        const text = document.rawHtml ?? document.markdown ?? "";
        // An HTML page at /robots.txt is a site's 404 page, not rules.
        return /<html|<body/i.test(text) ? undefined : text.slice(0, 100_000);
      } catch {
        return undefined;
      }
    },
  };
}
