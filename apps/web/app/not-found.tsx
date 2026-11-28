import Link from "next/link";
import {
  ErrorState,
  errorStateActionClass,
} from "@/components/observability/error-state";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <ErrorState
        actions={
          <>
            <Link className={errorStateActionClass.primary} href="/discover">
              Find a game
            </Link>
            <Link className={errorStateActionClass.secondary} href="/">
              Duna home
            </Link>
          </>
        }
        alert={false}
        description="The link may be old, or the page may have moved. Head home or find a court, event or player near you."
        eyebrow="Page not found"
        title="We can’t find that page"
      />
      <SiteFooter />
    </>
  );
}
