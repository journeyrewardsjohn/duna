"use client";

import { hqHref } from "@duna/core/hq-routes";
import {
  SubNav,
  type RenderObjectLink,
  type SubNavItem,
} from "@duna/ui/tideline";
import Link from "next/link";

/** next/link for the object family's links (client side, so it can be a function). */
export const renderSetupLink: RenderObjectLink = ({
  href,
  children,
  ...props
}) => (
  <Link href={href} {...props}>
    {children}
  </Link>
);

export type SetupTab = "overview" | "identity" | "places" | "review";

const items: readonly SubNavItem[] = [
  { id: "overview", label: "Overview", href: hqHref("setup") },
  { id: "identity", label: "Identity", href: hqHref("setupIdentity") },
  { id: "places", label: "Places and courts", href: hqHref("places") },
  { id: "review", label: "Website read", href: hqHref("setupReview") },
];

/** Club setup's tabs (S3 SubNav in the page header's slot). Tabs are routes. */
export function SetupNav({
  current,
  pending,
}: {
  readonly current: SetupTab;
  /** Proposals waiting for the person, shown on the read's tab. */
  readonly pending?: number;
}) {
  return (
    <SubNav
      current={current}
      items={items.map((item) =>
        item.id === "review" && pending ? { ...item, count: pending } : item,
      )}
      label="Club setup"
      renderLink={renderSetupLink}
    />
  );
}
