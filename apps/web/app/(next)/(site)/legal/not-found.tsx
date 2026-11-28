import Link from "@/components/site/site-link";
import { buttonClassName, EmptyState } from "@duna/ui/tideline";
import { legalSearchEntries } from "@/components/legal/legal-library";
import { LegalSearch } from "@/components/legal/legal-search";

/** An unknown /legal address: say so, then offer the hub's search. */
export default function LegalNotFound() {
  return (
    <main className="lc-main lc-hub lc-missing" id="main" tabIndex={-1}>
      <h1 className="td-sr">Document not found</h1>
      <EmptyState
        actions={
          <Link
            className={buttonClassName({ variant: "secondary" })}
            href="/legal"
          >
            All legal documents
          </Link>
        }
        description="The address may be old or mistyped. Search for the document instead, or open the legal center."
        icon="search"
        title="We couldn’t find that document"
      />
      <LegalSearch
        entries={legalSearchEntries()}
        label="Search terms and policies"
      />
    </main>
  );
}
