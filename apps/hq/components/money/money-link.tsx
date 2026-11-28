import type { RenderObjectLink } from "@duna/ui/tideline";
import Link from "next/link";

/**
 * next/link for the object family when it renders on the server (an
 * ObjectHeader in a server component). Client components use
 * `renderNextLink` from money-subnav.tsx.
 */
export const renderLink: RenderObjectLink = ({ href, children, ...props }) => (
  <Link href={href} {...props}>
    {children}
  </Link>
);
