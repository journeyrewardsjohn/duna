"use client";

import {
  SectionNav,
  type SectionNavProps,
  SubNav,
  type RenderObjectLink,
  type SubNavItem,
} from "@duna/ui/tideline";
import Link from "next/link";

/** next/link for the object family's links (client side, so it can be a function). */
export const renderNextLink: RenderObjectLink = ({
  href,
  children,
  ...props
}) => (
  <Link href={href} {...props}>
    {children}
  </Link>
);

/** Money's tabs as router links. */
export function MoneySubNav({
  items,
  current,
}: {
  readonly items: readonly SubNavItem[];
  readonly current: string;
}) {
  return (
    <SubNav
      current={current}
      items={items}
      label="Money"
      renderLink={renderNextLink}
    />
  );
}

/** A SectionNav with router links (Duna Pay setup's steps). */
export function MoneySectionNav(props: Omit<SectionNavProps, "renderLink">) {
  return <SectionNav {...props} renderLink={renderNextLink} />;
}
