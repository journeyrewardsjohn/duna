import { DunaMark } from "@duna/ui";
import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { ThemeToggle } from "@duna/ui/theme-toggle";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { DUNA_HQ_URL } from "@/lib/site-urls";
import { SiteMobileMenu } from "./site-mobile-menu";
import { WebAuthButton } from "./web-auth-button";

export function SiteHeader() {
  const authConfigured = isWorkOSAuthKitConfigured();
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link
          aria-label="Duna home"
          className="site-header__brand"
          href="/"
          prefetch
        >
          <DunaMark />
        </Link>
        <nav aria-label="Main navigation" className="site-header__nav">
          <Link href="/discover">Play</Link>
          <Link href="/pro">Watch</Link>
          <Link href="/rankings">Sand Rating</Link>
          <Link href="/run-your-club">For clubs + coaches</Link>
        </nav>
        <div className="site-header__actions">
          <ThemeToggle />
          <a
            aria-label="Open Duna HQ"
            className="site-header__operator"
            href={DUNA_HQ_URL}
          >
            <span>
              <small>For business</small>
              <strong>Duna HQ</strong>
            </span>
            <i>
              <ArrowUpRight aria-hidden size={14} />
            </i>
          </a>
          <WebAuthButton configured={authConfigured} />
          <SiteMobileMenu configured={authConfigured} hqUrl={DUNA_HQ_URL} />
        </div>
      </div>
    </header>
  );
}
