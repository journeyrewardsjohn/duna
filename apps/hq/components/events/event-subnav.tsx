"use client";

import { SubNav, type SubNavItem } from "@duna/ui/tideline";
import { renderNextLink } from "../money/money-subnav";

/** An open event's tabs as router links (Overview, Divisions and entries…). */
export function EventSubNav({
  items,
  current,
  label,
}: {
  readonly items: readonly SubNavItem[];
  readonly current: string;
  readonly label: string;
}) {
  return (
    <SubNav
      current={current}
      items={items}
      label={label}
      // Up to seven tabs: all fit on a wide screen; a narrow one scrolls.
      max={8}
      renderLink={renderNextLink}
    />
  );
}
