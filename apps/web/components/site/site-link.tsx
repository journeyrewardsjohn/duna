"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useFirstViewSettled } from "./first-view";
import { isCrossDocumentPath } from "./links";

/**
 * `next/link` for the public site. Two differences, neither visible:
 *
 * - It prefetches only once the first screen has settled
 *   (`useFirstViewSettled`), so a phone's first seconds go to the page being
 *   read, not to the RSC payloads and scripts of every link in view. A tap
 *   before then is still a client navigation; it just fetches on the tap.
 * - A page still served by the `(legacy)` root layout is never prefetched:
 *   crossing root layouts is a full page load anyway, and its prefetch only
 *   pulled the legacy stylesheet into a rebuilt page.
 */
export default function SiteLink({
  prefetch,
  ...props
}: ComponentProps<typeof Link>) {
  const settled = useFirstViewSettled();
  const href =
    typeof props.href === "string" ? props.href : props.href.pathname;
  const allowed = settled && !isCrossDocumentPath(href ?? "");
  return <Link {...props} prefetch={allowed ? prefetch : false} />;
}
