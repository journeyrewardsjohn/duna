import { DunaMark } from "@duna/ui";
import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { ThemeToggle } from "@duna/ui/theme-toggle";
import { ArrowUpRight, Menu } from "lucide-react";
import Link from "next/link";
import { DUNA_HQ_URL } from "@/lib/site-urls";
import { WebAuthButton } from "./web-auth-button";

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link aria-label="Duna home" className="site-header__brand" href="/">
          <DunaMark />
        </Link>
        <nav aria-label="Main navigation" className="site-header__nav">
          <Link href="/app/discover">Discover</Link>
          <Link href="/app/play">Play</Link>
          <Link href="/create">Create an event</Link>
          <Link href="/pro">Pro tour</Link>
          <Link href="/run-your-club">For clubs + coaches</Link>
          <Link href="/app/profile">Sand Rating</Link>
        </nav>
        <div className="site-header__actions">
          <ThemeToggle />
          <a className="site-header__operator" href={DUNA_HQ_URL}>
            Duna HQ <ArrowUpRight aria-hidden size={15} />
          </a>
          <WebAuthButton configured={isWorkOSAuthKitConfigured()} />
          <button aria-label="Open menu" className="site-header__menu">
            <Menu aria-hidden size={21} />
          </button>
        </div>
      </div>
    </header>
  );
}
