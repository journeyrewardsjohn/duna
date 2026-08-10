import { createPublicCallerFromRequest } from "@/lib/public-api";
import {
  canonicalPathFromMarkdownRequest,
  markdownPathForCanonical,
  publicMarkdownHeaders,
  renderAgentsGuide,
  renderCoachMarkdown,
  renderConsumerEventMarkdown,
  renderDiscoveryMarkdown,
  renderMatchMarkdown,
  renderOrganizationMarkdown,
  renderPlayerMarkdown,
  renderProCoverageMarkdown,
  renderProductMarkdown,
  renderProfessionalEventMarkdown,
  renderProfessionalMatchMarkdown,
  renderProfessionalTeamMarkdown,
  renderRankingsMarkdown,
  renderSitemapMarkdown,
  renderStaticPageMarkdown,
  renderStorefrontMarkdown,
  renderVenueMarkdown,
  renderVenueSummaryMarkdown,
} from "@/lib/public-markdown";
import { absolutePublicUrl } from "@/lib/pro-seo";
import sitemap from "@/app/sitemap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function markdownResponse(
  content: string,
  canonicalPath: string,
  options?: {
    readonly contentPath?: string;
    readonly canonicalType?: string;
  },
): Response {
  return new Response(content, {
    headers: {
      ...publicMarkdownHeaders,
      "Content-Location": absolutePublicUrl(
        options?.contentPath ?? markdownPathForCanonical(canonicalPath),
      ),
      Link: `<${absolutePublicUrl(canonicalPath)}>; rel="canonical"; type="${options?.canonicalType ?? "text/html"}"`,
    },
  });
}

function notFound(path: string): Response {
  return new Response(
    `# Public page not found\n\nNo public Duna Markdown page exists for \`${path}\`.\n\n- Agent guide: ${absolutePublicUrl("/agents")}\n- Public content index: ${absolutePublicUrl("/sitemap.md")}\n`,
    {
      status: 404,
      headers: {
        ...publicMarkdownHeaders,
        "Cache-Control": "public, max-age=60, s-maxage=300",
      },
    },
  );
}

export async function GET(request: Request): Promise<Response> {
  const requested =
    request.headers.get("x-duna-markdown-path") ??
    new URL(request.url).searchParams.get("path") ??
    "";
  const path = canonicalPathFromMarkdownRequest(requested);

  if (path === "/agents") {
    return markdownResponse(renderAgentsGuide(), "/agents", {
      contentPath: "/agents",
      canonicalType: "text/markdown",
    });
  }
  if (path === "/sitemap") {
    const entries = await sitemap();
    return markdownResponse(renderSitemapMarkdown(entries), "/sitemap.xml", {
      contentPath: "/sitemap.md",
      canonicalType: "application/xml",
    });
  }

  // Markdown companions are public machine-readable representations. Build an
  // explicitly anonymous caller so rewritten `.md` requests never depend on
  // AuthKit middleware state or accidentally inherit a signed-in identity.
  const caller = createPublicCallerFromRequest(request);

  if (path === "/discover") {
    const discovery = await caller.public.discoveryMap().catch(() => undefined);
    if (discovery) {
      return markdownResponse(renderDiscoveryMarkdown(discovery.items), path);
    }
  }

  if (path === "/pro") {
    const coverage = await caller.public.proCoverage().catch(() => undefined);
    if (coverage) {
      return markdownResponse(renderProCoverageMarkdown(coverage), path);
    }
  }
  if (path === "/rankings") {
    const rankings = await caller.public.worldRankings().catch(() => undefined);
    if (rankings) {
      return markdownResponse(renderRankingsMarkdown(rankings), path);
    }
  }

  const professionalMatch = path.match(
    /^\/events\/([^/]+)\/match\/([^/]+)\/([0-9a-f-]{36})$/i,
  );
  if (professionalMatch) {
    const [, eventSlug, , matchId] = professionalMatch;
    const detail = await caller.public
      .proMatch({ eventSlug: eventSlug!, matchId: matchId! })
      .catch(() => undefined);
    if (detail) {
      return markdownResponse(renderProfessionalMatchMarkdown(detail), path);
    }
    return notFound(path);
  }

  const eventMatch = path.match(/^\/events\/([^/]+)$/);
  if (eventMatch) {
    const slug = eventMatch[1]!;
    const professional = await caller.public
      .proEvent({ slug })
      .catch(() => undefined);
    if (professional) {
      return markdownResponse(
        renderProfessionalEventMarkdown(professional),
        path,
      );
    }
    const event = await caller.public
      .eventBySlug({ slug })
      .catch(() => undefined);
    if (event) {
      return markdownResponse(renderConsumerEventMarkdown(event), path);
    }
    return notFound(path);
  }

  const playerMatch = path.match(/^\/players\/([^/]+)$/);
  if (playerMatch) {
    const identifier = playerMatch[1]!;
    const route = await caller.public
      .playerRoute({ identifier })
      .catch(() => undefined);
    if (!route) return notFound(path);
    const [performance, intelligence] = await Promise.all([
      caller.public
        .playerPerformance({ handle: route.player.handle })
        .catch(() => undefined),
      caller.public
        .playerIntelligence({ handle: route.player.handle })
        .catch(() => undefined),
    ]);
    return markdownResponse(
      renderPlayerMarkdown({
        player: route.player,
        canonicalPath: route.canonicalPath,
        performance,
        intelligence,
      }),
      route.canonicalPath,
    );
  }

  const professionalTeamMatch = path.match(/^\/pro\/teams\/(\d+)$/);
  if (professionalTeamMatch) {
    const team = await caller.public
      .proTeam({ teamNo: Number(professionalTeamMatch[1]) })
      .catch(() => undefined);
    if (team) {
      return markdownResponse(renderProfessionalTeamMarkdown(team), path);
    }
    return notFound(path);
  }

  const matchMatch = path.match(/^\/matches\/([0-9a-f-]{36})$/i);
  if (matchMatch) {
    const match = await caller.public
      .matchDetails({ matchId: matchMatch[1]! })
      .catch(() => undefined);
    if (match) return markdownResponse(renderMatchMarkdown(match), path);
    return notFound(path);
  }

  const coachMatch = path.match(/^\/coaches\/([^/]+)$/);
  if (coachMatch) {
    const coach = await caller.public
      .coach({ handle: coachMatch[1]! })
      .catch(() => undefined);
    if (coach) return markdownResponse(renderCoachMarkdown(coach), path);
    return notFound(path);
  }

  const venueMatch = path.match(/^\/venues\/([^/]+)$/i);
  if (venueMatch) {
    const venueId = venueMatch[1]!;
    const [inventory, venues] = await Promise.all([
      caller.public.courtBookingInventory({ venueId }).catch(() => undefined),
      caller.public.venues().catch(() => []),
    ]);
    if (inventory) {
      return markdownResponse(renderVenueMarkdown(inventory), path);
    }
    const venue = venues.find((candidate) => candidate.id === venueId);
    if (venue) {
      return markdownResponse(renderVenueSummaryMarkdown(venue), path);
    }
    return notFound(path);
  }

  const productMatch = path.match(/^\/clubs\/([^/]+)\/products\/([^/]+)$/);
  if (productMatch) {
    const storefront = await caller.public
      .organizationStorefront({ slug: productMatch[1]! })
      .catch(() => undefined);
    const content = storefront
      ? renderProductMarkdown({
          storefront,
          productSlug: productMatch[2]!,
        })
      : undefined;
    if (content) return markdownResponse(content, path);
    return notFound(path);
  }

  const clubMatch = path.match(/^\/clubs\/([^/]+)$/);
  if (clubMatch) {
    const slug = clubMatch[1]!;
    const [storefront, organization, events, coaches, venues] =
      await Promise.all([
        caller.public.organizationStorefront({ slug }).catch(() => undefined),
        caller.public.organizationBySlug({ slug }).catch(() => undefined),
        caller.public.events().catch(() => []),
        caller.public.coaches({ organizationSlug: slug }).catch(() => []),
        caller.public.venues().catch(() => []),
      ]);
    if (storefront) {
      return markdownResponse(renderStorefrontMarkdown(storefront), path);
    }
    if (organization) {
      return markdownResponse(
        renderOrganizationMarkdown({
          organization,
          events: events.filter(
            (event) =>
              event.organizationId === organization.id ||
              event.organizationSlug === slug,
          ),
          coaches,
          venues: venues.filter(
            (venue) => venue.organizationId === organization.id,
          ),
        }),
        path,
      );
    }
    return notFound(path);
  }

  const staticContent = renderStaticPageMarkdown(path);
  return staticContent ? markdownResponse(staticContent, path) : notFound(path);
}
