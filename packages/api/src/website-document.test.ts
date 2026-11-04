import { describe, expect, it } from "vitest";
import {
  renderWebsitePage,
  validateWebsiteDocument,
  type WebsiteDocument,
  websiteImageUrl,
} from "./website-document";
const document: WebsiteDocument = {
  title: "Our Club",
  description: "A local club",
  headline: "Come play",
  introduction: "Find your next game.",
  actionLabel: "Book a court",
  style: "editorial",
  color: "#F0FF00",
  pages: [
    {
      slug: "home",
      title: "Home",
      sections: [
        {
          heading: "Play together",
          body: "Everyone is welcome.",
          kind: "offerings",
        },
      ],
    },
    {
      slug: "about",
      title: "About",
      sections: [{ heading: "Our club", body: "Contact us.", kind: "contact" }],
    },
  ],
  changeSummary: "First draft",
};
const context = {
  name: "Our Club",
  slug: "our-club",
  offerings: [
    {
      title: "Group lesson",
      description: "See availability.",
      href: "https://duna.coach/clubs/our-club/products/lesson",
    },
  ],
};
describe("website document security and preview", () => {
  it("escapes owner, source, and model text instead of executing markup", () => {
    const html = renderWebsitePage({
      document: {
        ...document,
        headline: "<script>alert(1)</script>",
        description: '" onload="alert(1)',
      },
      context: { ...context, name: "<img src=x onerror=alert(1)>" },
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<img src=x");
  });
  it("keeps preview page navigation on the protected preview endpoint and disables live actions", () => {
    const html = renderWebsitePage({ document, context, preview: true });
    expect(html).toContain('href="?page=about"');
    expect(html).toContain('href="?page=home"');
    expect(html).not.toContain('href="/"');
    expect(html).not.toContain('href="https://duna.coach');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("noindex,nofollow");
  });
  it("retains the authorized site and revision when preview navigation changes pages", () => {
    const html = renderWebsitePage({
      document,
      context,
      preview: true,
      previewQuery: { siteId: "site-1", revisionId: "revision-2" },
    });
    expect(html).toContain(
      'href="?siteId=site-1&preview=revision-2&page=about"',
    );
  });
  it("publishes working club links and canonical pages without preview affordances", () => {
    const html = renderWebsitePage({
      document,
      context,
      slug: "about",
      origin: "https://club.example.org",
    });
    expect(html).toContain('href="/about"');
    expect(html).toContain('href="https://club.example.org/about"');
    expect(html).toContain(
      'href="https://duna.coach/app/messages?club=our-club"',
    );
    expect(html).not.toContain('role="link" aria-disabled');
  });
  it("renders model Markdown as plain copy without activating its destinations", () => {
    const html = renderWebsitePage({
      document: {
        ...document,
        headline: "**Come play**",
        introduction:
          "Use [our booking page](https://unapproved.example/book) or [contact](javascript:alert(1)).",
        pages: [
          {
            ...document.pages[0]!,
            sections: [
              {
                heading: "__Get started__",
                body: "Read [our guide](https://unapproved.example/a_(b)) today.",
                kind: "story",
              },
            ],
          },
        ],
      },
      context,
    });
    expect(html).toContain("<h1>Come play</h1>");
    expect(html).toContain("Use our booking page or contact.");
    expect(html).toContain("Read our guide today.");
    expect(html).not.toContain("unapproved.example");
    expect(html).not.toContain("javascript:");
  });
  it("requires unique safe page addresses and a home page", () => {
    expect(() =>
      validateWebsiteDocument({ ...document, pages: [document.pages[1]] }),
    ).toThrow();
    expect(() =>
      validateWebsiteDocument({
        ...document,
        pages: [document.pages[0], document.pages[0]],
      }),
    ).toThrow();
    expect(() =>
      validateWebsiteDocument({
        ...document,
        pages: [{ ...document.pages[0], slug: "../admin" }],
      }),
    ).toThrow();
  });
  it("rejects executable images and cross-origin offerings", () => {
    expect(websiteImageUrl("javascript:alert(1)")).toBeUndefined();
    expect(
      websiteImageUrl("https://user:pass@example.org/a.png"),
    ).toBeUndefined();
    expect(() =>
      renderWebsitePage({
        document,
        context: {
          ...context,
          offerings: [
            {
              ...context.offerings[0]!,
              href: "https://evil.example.org/checkout",
            },
          ],
        },
      }),
    ).toThrow("Offer links must use Duna");
  });
});
