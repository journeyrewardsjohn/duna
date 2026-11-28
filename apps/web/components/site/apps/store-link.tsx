import { ownerContent } from "../owner-content";

const NAMES = { duna: "Duna", dunaPro: "Duna Pro" } as const;

/**
 * The App Store link for one of the two apps. No store address is configured
 * anywhere in the codebase yet, so until the owner adds one
 * (`owner-content.ts`) this is the spec's "link coming" mark: honest, not a
 * dead button.
 */
export function AppStoreLink({ app }: { readonly app: "duna" | "dunaPro" }) {
  const href = ownerContent.appStore?.[app];
  const name = NAMES[app];
  if (href) {
    return (
      <a className="site-store" href={href}>
        <span className="site-store__small">Download {name} on the</span>
        <span className="site-store__big">App Store</span>
      </a>
    );
  }
  return (
    <span className="site-store" data-pending="">
      <span className="site-store__small">{name} on the App Store</span>
      <span className="site-store__big">Link coming</span>
    </span>
  );
}
