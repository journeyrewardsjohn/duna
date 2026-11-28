"use client";

import {
  Icon,
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
} from "@duna/ui/tideline";
import Link from "@/components/site/site-link";
import { usePathname } from "next/navigation";
import { AccountLink } from "./account-link";
import { siteNavigation } from "./links";
import { AudienceCta, AudienceSwitch, isCurrent } from "./site-header";

export interface SiteMenuProps {
  readonly authConfigured: boolean;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/**
 * The phone and tablet menu (under 1080 px): the page links, the audience
 * switch, sign in and the call to action in a sheet. Loaded on its own after
 * the first screen settles, or at once when the menu button is pressed
 * (`SiteHeader`), so the sheet's script is not part of every first view.
 */
export function SiteMenu({
  authConfigured,
  open,
  onOpenChange,
}: SiteMenuProps) {
  const pathname = usePathname();
  return (
    <Sheet onOpenChange={onOpenChange} open={open} side="right">
      <SheetTrigger
        aria-label="Open menu"
        className="site-header__menu"
        variant="secondary"
      >
        <Icon name="more" size="control" />
      </SheetTrigger>
      <SheetContent className="site-menu" closeLabel="Close menu" title="Menu">
        <nav aria-label="Main" className="site-menu__nav">
          {siteNavigation.map((item) => (
            <Link
              aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
              href={item.href}
              key={item.label}
              onClick={() => onOpenChange(false)}
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
  );
}
