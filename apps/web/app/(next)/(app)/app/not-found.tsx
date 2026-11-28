import { Button, EmptyState } from "@duna/ui/tideline";
import { APP_ROUTES } from "@/lib/app-routes";

/** A Player web address that does not exist, inside the shell. */
export default function PlayerAppNotFound() {
  return (
    <section className="aps-state">
      <h1 className="td-sr">Page not found</h1>
      <EmptyState
        actions={
          <>
            <Button href={APP_ROUTES.home.path} variant="primary">
              Back to Home
            </Button>
            <Button href={APP_ROUTES.search.path} variant="secondary">
              Find a game
            </Button>
          </>
        }
        description="The link may be old, or the page may have moved. Everything in Duna is a search or a tap away."
        icon="search"
        title="We can’t find that page"
      />
    </section>
  );
}
