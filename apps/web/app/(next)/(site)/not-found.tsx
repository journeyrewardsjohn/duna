import { EmptyState } from "@duna/ui/tideline";
import { LinkButton } from "@/components/site/link-button";
import { siteLinks } from "@/components/site/links";

/** A page in the public site that does not exist, inside the site shell. */
export default function SiteNotFound() {
  return (
    <main className="site-state" id="main" tabIndex={-1}>
      <h1 className="td-sr">Page not found</h1>
      <EmptyState
        actions={
          <>
            <LinkButton href={siteLinks.findGame} variant="primary">
              Find a game
            </LinkButton>
            <LinkButton href="/" variant="secondary">
              Duna home
            </LinkButton>
          </>
        }
        description="The link may be old, or the page may have moved. Head home or find a court, event or player near you."
        icon="search"
        title="We can’t find that page"
      />
    </main>
  );
}
