/**
 * Slots only the owner can fill (docs/design/website.md §2.6, §5, §9): a real
 * club's result and real people's words, each with written permission. While
 * a slot is `undefined` it renders nothing on the site: no placeholder, no
 * invented proof. Fill one here, with the permission on file, to show it.
 */
export interface OwnerResult {
  /** A true number from a real club, in their words or ours, approved. */
  readonly text: string;
  /** "Name, Club": exactly as approved. */
  readonly attribution: string;
}

export const ownerContent: {
  /** `/run-your-club`: one real club result. */
  readonly clubResult?: OwnerResult;
  /** `/coaches`: a real coach's words. */
  readonly coachQuote?: OwnerResult;
  /** `/apps`: the App Store addresses, once the apps are listed. */
  readonly appStore?: { readonly duna?: string; readonly dunaPro?: string };
} = {};
