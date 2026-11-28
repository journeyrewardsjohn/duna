/** Pure helpers for the document family (no DOM, testable). */

export interface DocumentSectionLink {
  /** The heading's element id. */
  id: string;
  title: string;
  /** Sub-headings, listed under their section. */
  children?: readonly DocumentSectionLink[];
}

/**
 * The section being read: the last heading whose top has passed `offset`
 * (pixels from the top of the viewport), or the first heading before any has.
 * `headings` are in document order with their current viewport tops.
 */
export function activeSectionId(
  headings: readonly { id: string; top: number }[],
  offset: number,
): string | undefined {
  let current: string | undefined;
  for (const heading of headings) {
    if (heading.top - offset <= 1) current = heading.id;
    else break;
  }
  return current ?? headings[0]?.id;
}

/** The absolute link to a heading on the current page. */
export function sectionHref(
  location: { origin: string; pathname: string; search?: string },
  id: string,
): string {
  return `${location.origin}${location.pathname}${location.search ?? ""}#${encodeURIComponent(id)}`;
}
