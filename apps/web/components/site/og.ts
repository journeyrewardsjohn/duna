import { absolutePublicUrl } from "@/lib/pro-seo";

/** Which concept the social card draws (spec 2.12). */
export type SiteOgConcept = "rating" | "club" | "coach" | "price" | "score";

/**
 * The address of a page's social card (`/api/og/site`): Night Court ground,
 * the net line, the Jost title and one concept, drawn at request time.
 */
export function siteOgImage(input: {
  readonly title: string;
  readonly eyebrow: string;
  readonly concept: SiteOgConcept;
}): string {
  const parameters = new URLSearchParams({
    title: input.title.slice(0, 90),
    eyebrow: input.eyebrow.slice(0, 48),
    concept: input.concept,
  });
  return absolutePublicUrl(`/api/og/site?${parameters.toString()}`);
}
