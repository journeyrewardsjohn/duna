import { DunaMark } from "@duna/ui";
import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { ThemeToggle } from "@duna/ui/theme-toggle";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { DUNA_HQ_URL } from "@/lib/site-urls";
import {
  playNavigation,
  watchNavigation,
} from "@/lib/site-experience-navigation";
import { ClubFeaturesMenu } from "./club-features-menu";
import { SiteExperienceMenu } from "./site-experience-menu";
import { SiteMobileMenu } from "./site-mobile-menu";
import { WebAuthButton } from "./web-auth-button";

interface SiteHeaderProps {
  readonly authConfigured?: boolean;
}

export function SiteHeader({ authConfigured }: SiteHeaderProps = {}) {
  const configured =
    authConfigured === undefined ? isWorkOSAuthKitConfigured() : authConfigured;
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
          <SiteExperienceMenu navigation={playNavigation} />
          <SiteExperienceMenu navigation={watchNavigation} />
          <ClubFeaturesMenu />
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
          <WebAuthButton configured={configured} />
          <SiteMobileMenu configured={configured} hqUrl={DUNA_HQ_URL} />
        </div>
      </div>
    </header>
  );
}
