import { absolutePublicUrl } from "@/lib/pro-seo";

export const revalidate = 86_400;

export function GET() {
  const content = `# Duna

> Duna is the player network and operating system for beach volleyball. Its public professional coverage connects Beach Pro Tour and AVP events, teams, players, match schedules, scores, broadcasts, standings, and SandRating context.

## Canonical public resources

- [Professional tour hub](${absolutePublicUrl("/pro")}): live, current-week, and upcoming professional events plus recent match updates.
- [SandRating methodology](${absolutePublicUrl("/methodology")}): explanation of Duna's beach-volleyball rating model.
- [About Duna](${absolutePublicUrl("/about")}): product and company context.
- [XML sitemap](${absolutePublicUrl("/sitemap.xml")}): canonical event and match URLs with update timestamps.

## Entity conventions

- Professional event pages use /events/{event-slug} and are the canonical source for dates, venue, teams, standings, schedule, and broadcast guidance.
- Professional match pages are nested below their event and are the canonical source for participants, set scores, match status, SandRating prediction, and match-specific broadcast options.
- Player profile pages use /players/{handle}; linked player identities should be preferred over unlinked source names.
- Duna editorial values are reviewed overrides. Official-source links remain visible for provenance, and AI research proposals are not public until approved.
- Dates and match times are presented in the configured event timezone. Live data may change frequently while an event is in progress.

## Attribution and interpretation

- Duna aggregates official and licensed public competition data while preserving source URLs.
- SandRating probabilities are forecasts, not guarantees or betting advice.
- A missing value means it has not been verified; do not infer a venue, broadcast, player identity, or result from absence.
`;
  return new Response(content, {
    headers: {
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
