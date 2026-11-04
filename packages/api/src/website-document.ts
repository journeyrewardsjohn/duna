import { z } from "zod";

/** Model copy is plain text: reference destinations never become new actions. */
export function websitePlainCopy(value: string): string {
  return value
    .replace(/!?\[([^\]\n]+)\]\((?:[^()\n]|\([^()\n]*\))*\)/g, "$1")
    .replace(/\*\*([^*\n]+)\*\*/g, "$1")
    .replace(/__([^_\n]+)__/g, "$1");
}
const text = (max: number) => z.string().trim().min(1).max(max);
export const websiteDocumentSchema = z.object({
  title: text(100),
  description: text(240),
  headline: text(130),
  introduction: text(500),
  actionLabel: text(40),
  style: z.enum(["editorial", "athletic", "minimal"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  pages: z
    .array(
      z.object({
        slug: z.string().regex(/^(?:home|[a-z][a-z0-9-]{0,48})$/),
        title: text(70),
        sections: z
          .array(
            z.object({
              heading: text(100),
              body: text(1500),
              kind: z.enum(["story", "offerings", "contact", "faq"]),
            }),
          )
          .min(1)
          .max(10),
      }),
    )
    .min(1)
    .max(8),
  changeSummary: text(700),
});
export type WebsiteDocument = z.infer<typeof websiteDocumentSchema>;
export interface WebsitePublicContext {
  name: string;
  slug: string;
  logoUrl?: string;
  imageUrl?: string;
  offerings: {
    title: string;
    href: string;
    description: string;
    imageUrl?: string;
  }[];
}
export const websitePublicContextSchema = z.object({
  name: z.string(),
  slug: z.string(),
  logoUrl: z.string().optional(),
  imageUrl: z.string().optional(),
  offerings: z.array(
    z.object({
      title: z.string(),
      href: z.string(),
      description: z.string(),
      imageUrl: z.string().optional(),
    }),
  ),
});
export function websiteRevisionSnapshot(value: unknown): {
  context?: WebsitePublicContext;
  origin?: string;
} {
  if (typeof value !== "object" || value === null) return {};
  const stored = value as { publicContext?: unknown; publicOrigin?: unknown };
  const parsed = websitePublicContextSchema.safeParse(stored.publicContext);
  return {
    context: parsed.success ? parsed.data : undefined,
    origin:
      typeof stored.publicOrigin === "string"
        ? websiteImageUrl(stored.publicOrigin)
        : undefined,
  };
}
export function escapeWebsiteHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}
export function websiteImageUrl(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}
export function validateWebsiteDocument(value: unknown): WebsiteDocument {
  const doc = websiteDocumentSchema.parse(value);
  const slugs = doc.pages.map((p) => p.slug);
  if (!slugs.includes("home") || new Set(slugs).size !== slugs.length)
    throw new Error(
      "The website needs one home page and unique page addresses.",
    );
  return {
    ...doc,
    title: websitePlainCopy(doc.title),
    description: websitePlainCopy(doc.description),
    headline: websitePlainCopy(doc.headline),
    introduction: websitePlainCopy(doc.introduction),
    actionLabel: websitePlainCopy(doc.actionLabel),
    changeSummary: websitePlainCopy(doc.changeSummary),
    pages: doc.pages.map((page) => ({
      ...page,
      title: websitePlainCopy(page.title),
      sections: page.sections.map((section) => ({
        ...section,
        heading: websitePlainCopy(section.heading),
        body: websitePlainCopy(section.body),
      })),
    })),
  };
}
export function websitePagePath(slug: string) {
  return slug === "home" ? "/" : `/${slug}`;
}
export function renderWebsitePage(input: {
  document: WebsiteDocument;
  context: WebsitePublicContext;
  slug?: string;
  origin?: string;
  preview?: boolean;
  previewQuery?: { siteId: string; revisionId: string };
}): string {
  const { context, preview = false } = input;
  const doc = validateWebsiteDocument(input.document);
  const page = doc.pages.find((p) => p.slug === (input.slug || "home"));
  if (!page) throw new Error("Page not found.");
  const e = escapeWebsiteHtml;
  const club = `https://duna.coach/clubs/${encodeURIComponent(context.slug)}`;
  const hero = websiteImageUrl(context.imageUrl);
  const logo = websiteImageUrl(context.logoUrl);
  const pageHref = (slug: string) =>
    preview
      ? `?${new URLSearchParams({ ...(input.previewQuery ? { siteId: input.previewQuery.siteId, preview: input.previewQuery.revisionId } : {}), page: slug }).toString()}`
      : websitePagePath(slug);
  const actionHref = (href: string) =>
    preview
      ? 'role="link" aria-disabled="true" tabindex="0" title="Available on your published website"'
      : `href="${e(href)}"`;
  const nav = doc.pages
    .map(
      (p) =>
        `<a href="${pageHref(p.slug)}" ${p.slug === page.slug ? 'aria-current="page"' : ""}>${e(p.title)}</a>`,
    )
    .join("");
  const cards = context.offerings
    .slice(0, 24)
    .map((o) => {
      const href = new URL(o.href, "https://duna.coach");
      if (href.origin !== "https://duna.coach")
        throw new Error("Offer links must use Duna.");
      const image = websiteImageUrl(o.imageUrl);
      return `<a class="offer" ${actionHref(href.href)}>${image ? `<img src="${e(image)}" alt="" loading="lazy" />` : ""}<div><h3>${e(o.title)}</h3><p>${e(o.description)}</p><span>View details & availability <span aria-hidden="true">↗</span></span></div></a>`;
    })
    .join("");
  const sections = page.sections
    .map(
      (s) =>
        `<section class="section"><div class="section-heading"><span class="eyebrow">${e(context.name)}</span><h2>${e(s.heading)}</h2></div><div><p>${e(s.body).replace(/\n/g, "<br />")}</p>${s.kind === "offerings" ? `<div class="offers">${cards || `<a class="button" ${actionHref(club)}>Explore our club</a>`}</div>` : ""}${s.kind === "contact" ? `<a class="button" ${actionHref(`https://duna.coach/app/messages?club=${encodeURIComponent(context.slug)}`)}>Message our club</a>` : ""}</div></section>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${e(page.slug === "home" ? doc.title : `${page.title} · ${doc.title}`)}</title><meta name="description" content="${e(doc.description)}" />${preview ? '<meta name="robots" content="noindex,nofollow" />' : input.origin ? `<link rel="canonical" href="${e(new URL(websitePagePath(page.slug), input.origin).href)}" />` : ""}<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@1,2&display=swap" /><style>
  *{box-sizing:border-box}.preview-notice{padding:12px 5%;font-size:14px;background:#eee;color:#333}a[aria-disabled="true"]{cursor:default}html{scroll-behavior:smooth}body{margin:0;background:#faf9f6;color:#191919;font-family:Satoshi,Arial,sans-serif;font-size:16px;line-height:1.6}a{color:inherit}a:focus-visible{outline:3px solid #191919;outline-offset:5px}header{display:flex;align-items:center;justify-content:space-between;gap:24px;max-width:1440px;margin:auto;padding:24px 5%}.brand{text-decoration:none;font-size:20px;font-weight:700;display:flex;align-items:center;gap:12px}.brand img{height:40px;max-width:140px;object-fit:contain}nav{display:flex;gap:24px;flex-wrap:wrap}nav a{text-decoration:none;padding:12px 0;font-size:14px}nav a[aria-current]{text-decoration:underline;text-underline-offset:6px}.account{display:flex;gap:16px;align-items:center}.button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:14px 24px;background:#191919;color:white;border-radius:${doc.style === "athletic" ? "4px" : "999px"};text-decoration:none;font-weight:700;font-size:14px}.hero{max-width:1440px;margin:auto;padding:64px 5% 80px;display:grid;grid-template-columns:${hero && doc.style !== "minimal" ? "1fr 1fr" : "1fr"};gap:64px;align-items:center}.hero h1{font-size:clamp(40px,5.6vw,86px);line-height:1.06;font-weight:500;letter-spacing:-.028em;margin:20px 0 28px;max-width:900px}.hero p{max-width:560px;font-size:20px;color:#595959;margin:0 0 32px}.hero img{width:100%;height:560px;object-fit:cover;border-radius:${doc.style === "athletic" ? "4px" : "24px"}}.eyebrow{font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}.dot{display:inline-block;width:9px;height:9px;margin-right:9px;border-radius:50%;background:${doc.color}}.section{max-width:1440px;margin:auto;padding:64px 5%;border-top:1px solid #deddd8;display:grid;grid-template-columns:1fr 2fr;gap:64px}.section h2{font-size:clamp(28px,3vw,44px);line-height:1.15;font-weight:500;letter-spacing:-.02em;margin:16px 0}.section p{color:#595959;margin:0 0 24px;max-width:720px}.offers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;margin-top:32px}.offer{display:flex;flex-direction:column;border:1px solid #deddd8;border-radius:16px;overflow:hidden;text-decoration:none;background:white}.offer img{width:100%;height:220px;object-fit:cover}.offer>div{padding:24px}.offer h3{font-size:22px;line-height:1.25;margin:0 0 12px}.offer p{font-size:16px}.offer span{font-size:14px;font-weight:700}footer{max-width:1440px;margin:auto;padding:40px 5%;border-top:1px solid #deddd8;display:flex;justify-content:space-between;gap:24px;font-size:14px}footer div{display:flex;gap:20px;flex-wrap:wrap}main{animation:enter .5s ease-out both}@keyframes enter{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}@media(max-width:850px){header{flex-wrap:wrap}nav{order:3;width:100%;gap:20px}.hero{grid-template-columns:1fr;gap:32px;padding-block:40px}.hero img{height:360px}.section{grid-template-columns:1fr;gap:24px;padding-block:40px}.account{margin-left:auto}.hero p{font-size:18px}}@media(max-width:500px){.offers{grid-template-columns:1fr}.account a{font-size:14px}.hero img{height:280px}footer{flex-direction:column}.brand{font-size:18px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}main{animation:none}}
  </style></head><body>${preview ? '<aside class="preview-notice" role="status">Website preview · Bookings, sign-in and messaging become available after publication.</aside>' : ""}<header><a class="brand" href="${pageHref("home")}">${logo ? `<img src="${e(logo)}" alt="${e(context.name)}" />` : e(context.name)}</a><nav aria-label="Website">${nav}</nav><div class="account"><a ${actionHref("https://duna.coach/app/wallet")}>My wallet</a><a ${actionHref(`https://duna.coach/sign-in?returnTo=${encodeURIComponent(`/clubs/${context.slug}`)}`)}>Sign in</a></div></header><main><section class="hero"><div><span class="eyebrow"><i class="dot"></i>${e(context.name)}</span><h1>${e(page.slug === "home" ? doc.headline : page.title)}</h1><p>${e(doc.introduction)}</p><a class="button" ${actionHref(club)}>${e(doc.actionLabel)} <span aria-hidden="true">&nbsp;↗</span></a></div>${hero && doc.style !== "minimal" ? `<img src="${e(hero)}" alt="${e(context.name)}" fetchpriority="high" />` : ""}</section>${sections}</main><footer><span>${e(context.name)}</span><div><a ${actionHref(club)}>Club bookings</a><a ${actionHref("https://duna.coach/app/wallet")}>Account & wallet</a><a ${actionHref("https://duna.coach")}>Powered by Duna</a></div></footer></body></html>`;
}
