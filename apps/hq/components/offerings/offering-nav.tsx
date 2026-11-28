"use client";

import { SubNav, type SubNavItem } from "@duna/ui/tideline";
import { renderNextLink } from "../money/money-subnav";

/** A SubNav whose tabs are router links (an offering's sections, the area's tabs). */
export function OfferingSubNav({
  label,
  items,
  current,
}: {
  readonly label: string;
  readonly items: readonly SubNavItem[];
  readonly current: string;
}) {
  return (
    <SubNav
      current={current}
      items={items}
      label={label}
      renderLink={renderNextLink}
    />
  );
}
