import { Firecrawl } from "@mendable/firecrawl-js";
import {
  enrichAvpLeagueSnapshotWithFeed,
  parseAvpLeagueEventId,
  parseAvpLeagueHtml,
} from "../src/sand-data/avp";
import {
  firecrawlScrapeOptions,
  parseFirecrawlJsonDocument,
} from "../src/sand-data/http";
import type { ScraperControl } from "../src/sand-data/scraper-controls";
import { parseFivbEventIndexHtml } from "../src/sand-data/sources";

const key =
  process.env.FIRECRAWL_API_KEY?.trim() || process.env.FIRECRAWL_API?.trim();
if (!key)
  throw new Error("FIRECRAWL_API_KEY is required for the parity audit.");

const client = new Firecrawl({ apiKey: key, timeoutMs: 90_000, maxRetries: 1 });
const nativeHeaders = {
  "User-Agent":
    "Mozilla/5.0 (compatible; DunaSandData/1.0; +https://duna.sport)",
};
const control = (
  source: ScraperControl["source"],
  changeTracking: boolean,
): ScraperControl => ({
  source,
  enabled: true,
  engine: "firecrawl",
  minRequestIntervalMs: 0,
  maxRequestsPerHour: 90,
  liveTransportEnabled: false,
  firecrawlCacheTtlSeconds: 0,
  firecrawlChangeTracking: changeTracking,
});

const fivbUrl = "https://fivb.12ndr.at/?season=2026&international=fivb";
const nativeFivbResponse = await fetch(fivbUrl, { headers: nativeHeaders });
const nativeFivbHtml = await nativeFivbResponse.text();
const firecrawlFivb = await client.scrape(
  fivbUrl,
  firecrawlScrapeOptions(control("fivb-12ndr", true), {
    timeoutMs: 90_000,
    proxy: "auto",
  }),
);
const firecrawlFivbHtml = firecrawlFivb.rawHtml ?? firecrawlFivb.html ?? "";
const nativeEvents = parseFivbEventIndexHtml(nativeFivbHtml, 2026);
const firecrawlEvents = parseFivbEventIndexHtml(firecrawlFivbHtml, 2026);
const eventIds = (events: typeof nativeEvents) =>
  events
    .map((event) => event.externalEventId)
    .sort()
    .join("|");

const avpUrl = "https://avp.com/league/";
const nativeAvpResponse = await fetch(avpUrl, { headers: nativeHeaders });
const nativeAvpHtml = await nativeAvpResponse.text();
const firecrawlAvp = await client.scrape(
  avpUrl,
  firecrawlScrapeOptions(control("avp-league", true), {
    waitForSelector: "#league-app table",
    waitAfterSelectorMs: 1_500,
    timeoutMs: 90_000,
    proxy: "auto",
    maxAgeMs: 0,
  }),
);
const firecrawlAvpHtml = firecrawlAvp.html ?? firecrawlAvp.rawHtml ?? "";
const renderedAvp = parseAvpLeagueHtml(firecrawlAvpHtml);
const avpEventId = parseAvpLeagueEventId(firecrawlAvp.rawHtml ?? nativeAvpHtml);
const firecrawlAvpFeed = avpEventId
  ? await client.scrape(
      `https://volleyballapi.web4data.co.uk/api/matches/byevent/${avpEventId}?noStats=1`,
      firecrawlScrapeOptions(control("avp-league", true), {
        timeoutMs: 90_000,
        proxy: "auto",
        maxAgeMs: 0,
      }),
    )
  : undefined;
const enrichedAvp = firecrawlAvpFeed
  ? enrichAvpLeagueSnapshotWithFeed(
      renderedAvp,
      parseFirecrawlJsonDocument(
        firecrawlAvpFeed.rawHtml ?? firecrawlAvpFeed.html ?? "",
      ),
    )
  : renderedAvp;

const result = {
  fivb12ndr: {
    nativeStatus: nativeFivbResponse.status,
    nativeEvents: nativeEvents.length,
    firecrawlEvents: firecrawlEvents.length,
    sameEventIds: eventIds(nativeEvents) === eventIds(firecrawlEvents),
  },
  avpLeague: {
    nativeStatus: nativeAvpResponse.status,
    nativeShell: nativeAvpHtml.includes('id="league-app"'),
    eventId: avpEventId,
    firecrawlCityStandings: renderedAvp.cityStandings.length,
    firecrawlRosters: renderedAvp.rosters.length,
    firecrawlCompetitions: renderedAvp.competitions.length,
    structuredCompetitions: enrichedAvp.competitions.length,
    championships: enrichedAvp.competitions.filter(
      (competition) => competition.kind === "championship",
    ).length,
    matches: enrichedAvp.competitions.reduce(
      (total, competition) => total + competition.matches.length,
      0,
    ),
  },
};

console.log(JSON.stringify(result, null, 2));

if (
  !nativeFivbResponse.ok ||
  nativeEvents.length === 0 ||
  firecrawlEvents.length !== nativeEvents.length ||
  !result.fivb12ndr.sameEventIds ||
  !nativeAvpResponse.ok ||
  !result.avpLeague.nativeShell ||
  !result.avpLeague.eventId ||
  result.avpLeague.firecrawlCityStandings === 0 ||
  result.avpLeague.firecrawlRosters === 0 ||
  result.avpLeague.firecrawlCompetitions === 0 ||
  result.avpLeague.structuredCompetitions === 0 ||
  result.avpLeague.championships === 0 ||
  result.avpLeague.matches === 0
) {
  process.exitCode = 1;
}
