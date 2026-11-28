/** The object pattern (S3): ObjectHeader, SubNav and SectionNav. */
export {
  ObjectHeader,
  type ObjectHeaderFact,
  type ObjectHeaderProps,
} from "./object-header";
export {
  SectionNav,
  type SectionNavGroup,
  type SectionNavItem,
  type SectionNavProps,
} from "./section-nav";
export { SubNav, type SubNavProps } from "./sub-nav";
export { type ObjectLinkProps, plainLink, type RenderObjectLink } from "./link";
export {
  type SectionMark,
  sectionMarkLabel,
  sectionProgress,
  splitSubNav,
  SUB_NAV_MAX_VISIBLE,
  type SubNavItem,
} from "./object-core";
