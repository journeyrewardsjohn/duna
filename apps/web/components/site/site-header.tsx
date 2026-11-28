"use client";

import {
  Icon,
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@duna/ui/tideline";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AccountLink } from "./account-link";
import { type SiteAudience, useSiteAudience } from "./audience";
import { SiteBrand } from "./brand";
import { LinkButton } from "./link-button";
import { siteLinks, siteNavigation } from "./links";

interface SiteHeaderProps {
  /** Whether sign-in is configured on this deployment. */
  readonly authConfigured: boolean;
}

function isCurrent(pathname: string, href: string) {
  const path = href.split("#")[0];
  return path !== "/" && pathname === path;
}

/** The scroll position past which the header draws its hairline. */
const HAIRLINE_AT = 8;

function useScrolledPast(offset: number) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const update = () => setPast(window.scrollY > offset);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, [offset]);
  return past;
}

/**
 * "I play" / "I run a club". It changes only the primary call to action (and
 * the phone thumb bar), never what the page shows. On the home page,
 * choosing "I run a club" also takes the visitor to the clubs chapter.
 */
export function AudienceSwitch({ className }: { readonly className?: string }) {
  const [audience, setAudience] = useSiteAudience();
  const pathname = usePathname();
  const choose = (next: SiteAudience) => {
    setAudience(next);
    if (next === "run" && pathname === "/") {
      const chapter = document.getElementById("clubs");
      if (chapter) {
        const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
        chapter.scrollIntoView({
          behavior: reduce ? "auto" : "smooth",
          block: "start",
        });
      }
    }
  };
  return (
    <div
      aria-label="I am here to"
      className={className ? `site-audience ${className}` : "site-audience"}
      role="group"
    >
      <button
        aria-pressed={audience === "play"}
        onClick={() => choose("play")}
        type="button"
      >
        I play
      </button>
      <button
        aria-pressed={audience === "run"}
        onClick={() => choose("run")}
        type="button"
      >
        I run a club
      </button>
    </div>
  );
}

/**
 * The primary call to action for each audience. Both are in the markup; the
 * `<html data-audience>` attribute (set before paint) shows one, so the right
 * button is there on the first frame.
 */
export function AudienceCta({
  block = false,
  className,
}: {
  readonly block?: boolean;
  readonly className?: string;
}) {
  const pathname = usePathname();
  const findGame = pathname === "/" ? "#search" : siteLinks.findGame;
  return (
    <>
      <LinkButton
        block={block}
        className={`site-cta site-cta--play ${className ?? ""}`}
        href={findGame}
        size="sm"
        variant="primary"
      >
        Find a game
      </LinkButton>
      <LinkButton
        block={block}
        className={`site-cta site-cta--run ${className ?? ""}`}
        href={siteLinks.startClub}
        size="sm"
        variant="primary"
      >
        Start your club
      </LinkButton>
    </>
  );
}

/**
 * The public header: the mark, the page links, the audience switch, sign in
 * (or the way into the app) and the primary call to action. Under 1080 px the
 * links move into a sheet.
 */
export function SiteHeader({ authConfigured }: SiteHeaderProps) {
  const pathname = usePathname();
  const scrolled = useScrolledPast(HAIRLINE_AT);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="site-header" data-scrolled={scrolled || undefined}>
      <div className="site-wrap site-header__row">
        <SiteBrand />
        <nav aria-label="Main" className="site-header__nav">
          {siteNavigation.map((item) => (
            <Link
              aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
              href={item.href}
              key={item.label}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="site-header__end">
          <AudienceSwitch className="site-header__audience" />
          <span className="site-header__account">
            <AccountLink configured={authConfigured} />
          </span>
          <span className="site-header__cta">
            <AudienceCta />
          </span>
          <Sheet onOpenChange={setMenuOpen} open={menuOpen} side="right">
            <SheetTrigger
              aria-label="Open menu"
              className="site-header__menu"
              variant="secondary"
            >
              <Icon name="more" size="control" />
            </SheetTrigger>
            <SheetContent
              className="site-menu"
              closeLabel="Close menu"
              title="Menu"
            >
              <nav aria-label="Main" className="site-menu__nav">
                {siteNavigation.map((item) => (
                  <Link
                    aria-current={
                      isCurrent(pathname, item.href) ? "page" : undefined
                    }
                    href={item.href}
                    key={item.label}
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <AudienceSwitch className="site-menu__audience" />
              <div className="site-menu__actions">
                <AccountLink block configured={authConfigured} />
                <AudienceCta block />
              </div>
              <SheetClose block variant="ghost">
                Close
              </SheetClose>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
