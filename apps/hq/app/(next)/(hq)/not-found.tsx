import { Button, EmptyState } from "@duna/ui/tideline";

/** A missing page or record inside the shell. */
export default function HqNotFound() {
  return (
    <div className="hqs-state">
      <EmptyState
        actions={
          <Button href="/" variant="primary">
            Back to Today
          </Button>
        }
        description="The link may be old, the page may have moved, or it may belong to a club you are not signed in to."
        icon="search"
        title="We can't find that page"
      />
    </div>
  );
}
