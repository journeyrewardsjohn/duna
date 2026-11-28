"use client";

import { useEffect, useRef } from "react";
import { cx } from "../base/cx";
import { Icon } from "../base/icons";
import { Popover, PopoverContent, PopoverTrigger } from "../popover/popover";
import { plainLink, type RenderObjectLink } from "./link";
import {
  splitSubNav,
  SUB_NAV_MAX_VISIBLE,
  type SubNavItem,
} from "./object-core";

export interface SubNavProps {
  /** Names the navigation landmark: "Money", "Mara Lewis". */
  readonly label: string;
  readonly items: readonly SubNavItem[];
  /** The id of the current tab (marked `aria-current="page"`). */
  readonly current?: string;
  /** Tabs shown before "More" on wide screens (6 by default). */
  readonly max?: number;
  /** The app's router link; a plain anchor by default. */
  readonly renderLink?: RenderObjectLink;
  readonly className?: string;
}

function Count({ value }: { readonly value: number | undefined }) {
  if (value === undefined) return null;
  return <span className="td-subnav__count">{value}</span>;
}

/**
 * The tabs of an area or an open object (S3, ia-hq.md): a real `nav` of
 * links, the current one marked `aria-current="page"`, each with
 * `data-nav-id`. Past six tabs the rest sit under "More". On a narrow
 * container every tab is in one row that scrolls sideways, with the current
 * tab scrolled into view; "More" is not needed there.
 */
export function SubNav({
  label,
  items,
  current,
  max = SUB_NAV_MAX_VISIBLE,
  renderLink = plainLink,
  className,
}: SubNavProps) {
  const { visible, overflow } = splitSubNav(items, current, max);
  const rowRef = useRef<HTMLUListElement>(null);

  // On a phone the row scrolls: keep the current tab in view.
  useEffect(() => {
    const row = rowRef.current;
    if (!row || row.scrollWidth <= row.clientWidth) return;
    const active = row.querySelector<HTMLElement>("[aria-current='page']");
    if (!active) return;
    row.scrollLeft =
      active.offsetLeft - (row.clientWidth - active.offsetWidth) / 2;
  }, [current]);

  const link = (item: SubNavItem, extra?: string) =>
    renderLink({
      href: item.href,
      className: cx("td-subnav__link", extra),
      "aria-current": item.id === current ? "page" : undefined,
      "data-nav-id": item.id,
      children: (
        <>
          <span className="td-subnav__label">{item.label}</span>
          <Count value={item.count} />
        </>
      ),
    });

  return (
    <nav aria-label={label} className={cx("td-subnav", className)}>
      <ul className="td-subnav__row" ref={rowRef}>
        {visible.map((item) => (
          <li className="td-subnav__item" key={item.id}>
            {link(item)}
          </li>
        ))}
        {/* On a narrow container the overflow tabs join the scrolling row. */}
        {overflow.map((item) => (
          <li
            className="td-subnav__item td-subnav__item--overflow"
            key={item.id}
          >
            {link(item)}
          </li>
        ))}
        {overflow.length > 0 ? (
          <li className="td-subnav__item td-subnav__more">
            <Popover>
              <PopoverTrigger
                className="td-subnav__more-trigger"
                variant="ghost"
              >
                More
                <Icon name="chevron-down" size="inline" />
              </PopoverTrigger>
              <PopoverContent aria-label={`More in ${label}`} side="bottom">
                <ul className="td-subnav__menu">
                  {overflow.map((item) => (
                    <li key={item.id}>{link(item, "td-subnav__menu-link")}</li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
