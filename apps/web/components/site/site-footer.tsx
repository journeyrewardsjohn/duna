import Link from "@/components/site/site-link";
import { SiteBrand } from "./brand";
import { siteLinks } from "./links";

const columns = [
  {
    heading: "Play",
    links: [
      { label: "Find a game", href: siteLinks.findGame },
      { label: "Add a score", href: siteLinks.addScore },
      { label: "Sand Rating", href: siteLinks.sandRating },
      { label: "Rankings", href: siteLinks.rankings },
    ],
  },
  {
    heading: "Run",
    links: [
      { label: "For clubs", href: siteLinks.forClubs },
      { label: "For coaches", href: siteLinks.forCoaches },
      { label: "Pricing", href: siteLinks.pricing },
    ],
  },
  {
    heading: "Watch",
    links: [
      { label: "Pro Tour", href: siteLinks.proTour },
      { label: "Events", href: siteLinks.events },
      { label: "The Duna apps", href: siteLinks.apps },
      { label: "Duna for Apple Watch", href: siteLinks.appleWatch },
    ],
  },
  {
    heading: "Duna",
    links: [
      { label: "About", href: siteLinks.about },
      { label: "Safety", href: siteLinks.safety },
    ],
  },
  {
    heading: "Legal",
    links: [
      { label: "Legal center", href: "/legal" },
      { label: "Terms of Service", href: "/legal/terms" },
      { label: "Duna HQ Terms", href: "/legal/hq-terms" },
      { label: "Privacy Policy", href: "/legal/privacy" },
      { label: "Cookie Policy", href: "/legal/cookies" },
      { label: "Booking and refunds", href: "/legal/booking-and-refunds" },
    ],
  },
] as const;

/** The public footer: Play, Run, Watch, Duna and the Legal group. */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-wrap site-footer__grid">
        <div className="site-footer__brand">
          <SiteBrand />
          <p>Every court. Every coast.</p>
        </div>
        {columns.map((column) => (
          <nav
            aria-label={column.heading}
            className="site-footer__column"
            key={column.heading}
          >
            <h2 className="site-footer__heading">{column.heading}</h2>
            <ul>
              {column.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href}>{link.label}</Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="site-wrap site-footer__base">
        <span>© 2026 Duna</span>
        <span>People in photographs are illustrations, not Duna members.</span>
      </div>
    </footer>
  );
}
