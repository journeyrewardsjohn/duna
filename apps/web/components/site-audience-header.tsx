"use client";

import { usePathname } from "next/navigation";
import { DunaMark } from "@duna/ui";
import { ThemeToggle } from "@duna/ui/theme-toggle";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { DUNA_HQ_URL, DUNA_HQ_SIGNUP_URL } from "@/lib/site-urls";
import {
  playNavigation,
  watchNavigation,
} from "@/lib/site-experience-navigation";
import { ClubFeaturesMenu } from "./club-features-menu";
import { SiteExperienceMenu } from "./site-experience-menu";
import { SiteMobileMenu } from "./site-mobile-menu";
import { WebAuthButton } from "./web-auth-button";

interface SiteHeaderProps {
  readonly authConfigured: boolean;
}

export function SiteAudienceHeader({
  authConfigured: configured,
}: SiteHeaderProps) {
  const pathname = usePathname();
  const forClubs = pathname === "/" || pathname.startsWith("/run-your-club");
  return (
    <header
      className="site-header site-header--simple site-header--audience"
      data-audience={forClubs ? "clubs" : "players"}
    >
      <div className="site-audience-bar">
        <nav
          aria-label="Choose your Duna experience"
          className="site-audience-switch"
        >
          <Link href="/" aria-current={forClubs ? "page" : undefined}>
            For Clubs
          </Link>
          <Link href="/players" aria-current={!forClubs ? "page" : undefined}>
            For Players
          </Link>
        </nav>
        <span>One platform. Every side of the game.</span>
      </div>
      <div className="site-header__inner">
        <Link
          aria-label="Duna home"
          className="site-header__brand"
          href={forClubs ? "/" : "/players"}
          prefetch
        >
          <DunaMark />
        </Link>
        <nav aria-label="Main navigation" className="site-header__nav">
          {forClubs ? (
            <>
              <ClubFeaturesMenu label="Features" />
              <Link href="/#built-for">Who it’s for</Link>
              <Link href="/run-your-club#plans">Pricing</Link>
            </>
          ) : (
            <>
              <SiteExperienceMenu navigation={playNavigation} />
              <SiteExperienceMenu navigation={watchNavigation} />
              <Link href="/methodology">Sand Rating</Link>
            </>
          )}
        </nav>
        <div className="site-header__actions">
          <ThemeToggle />
          <a
            aria-label="Open Duna HQ"
            className="site-header__operator"
            href={DUNA_HQ_URL}
          >
            Duna HQ
            <ArrowUpRight aria-hidden size={14} />
          </a>
          <WebAuthButton configured={configured} compact={forClubs} />
          {forClubs ? (
            <a className="site-header__club-start" href={DUNA_HQ_SIGNUP_URL}>
              Get started <ArrowUpRight aria-hidden size={16} />
            </a>
          ) : null}
          <SiteMobileMenu configured={configured} hqUrl={DUNA_HQ_URL} />
        </div>
      </div>
    </header>
  );
}
