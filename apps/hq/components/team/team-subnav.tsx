"use client";

import { SubNav, type SubNavItem } from "@duna/ui/tideline";
import { renderNextLink } from "../money/money-subnav";

/** Team's tabs, or a member's, as router links (S3 SubNav). */
export function TeamSubNav({
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
      renderLink={renderNextLink}
    />
  );
}
