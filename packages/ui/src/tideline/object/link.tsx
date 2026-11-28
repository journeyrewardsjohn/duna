import type { ReactNode } from "react";

/** What a navigation link needs; an app passes its router's link to render it. */
export interface ObjectLinkProps {
  readonly href: string;
  readonly className?: string;
  readonly children: ReactNode;
  readonly "aria-current"?: "page" | "location" | undefined;
  readonly "data-nav-id"?: string;
  readonly onClick?: () => void;
}

/** Renders a link: the app's router link (`next/link`) or a plain anchor. */
export type RenderObjectLink = (props: ObjectLinkProps) => ReactNode;

export const plainLink: RenderObjectLink = ({ children, ...props }) => (
  <a {...props}>{children}</a>
);
