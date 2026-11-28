import { EmptyState } from "@duna/ui/tideline";
import { LinkButton } from "@/components/site/link-button";
import { siteLinks } from "@/components/site/links";

/** A club address that does not exist: help the visitor find one near them. */
export default function ClubNotFound() {
  return (
    <main className="site-state" id="main" tabIndex={-1}>
      <h1 className="td-sr">Club not found</h1>
      <EmptyState
        actions={
          <>
            <LinkButton href={siteLinks.findGame} variant="primary">
              Search clubs near you
            </LinkButton>
            <LinkButton href="/" variant="secondary">
              Duna home
            </LinkButton>
          </>
        }
        description="This club's link may have changed, or the club isn't on Duna yet. Search for clubs, courts and games near you."
        icon="search"
        title="We can't find that club"
      />
    </main>
  );
}
