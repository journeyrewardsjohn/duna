"use client";

import { SubNav, type SubNavItem } from "@duna/ui/tideline";
import { renderNextLink } from "../money/money-subnav";

/** An open person's tabs as router links (Overview, Memberships and credits…). */
export function PeopleSubNav({
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
