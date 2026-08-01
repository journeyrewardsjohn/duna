import { DunaMark } from "@duna/ui";
import { ThemeToggle } from "@duna/ui/theme-toggle";
import { ArrowUpRight, Menu } from "lucide-react";
import Link from "next/link";

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
          <Link href="/clubs/south-bay-volleyball">For clubs</Link>
          <Link href="/app/profile">Sand Rating</Link>
        </nav>
        <div className="site-header__actions">
          <ThemeToggle />
          <a
            className="site-header__operator"
            href={process.env.NEXT_PUBLIC_HQ_URL ?? "http://localhost:3001"}
          >
            Duna HQ <ArrowUpRight aria-hidden size={15} />
          </a>
          <Link className="site-header__enter" href="/app">
            Enter Duna
          </Link>
          <button aria-label="Open menu" className="site-header__menu">
            <Menu aria-hidden size={21} />
          </button>
        </div>
      </div>
    </header>
  );
}
