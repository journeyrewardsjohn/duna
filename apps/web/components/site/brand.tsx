import { CrestMark, Wordmark } from "@duna/ui/tideline";
import Link from "@/components/site/site-link";

/** The Crest and the drawn wordmark, as the link home. */
export function SiteBrand({ className }: { readonly className?: string }) {
  return (
    <Link aria-label="Duna home" className={className ?? "site-brand"} href="/">
      <CrestMark className="site-brand__mark" />
      <Wordmark
        className="site-brand__word"
        strokeClassName="site-brand__stroke"
      />
    </Link>
  );
}
