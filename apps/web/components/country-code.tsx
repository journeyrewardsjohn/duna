import { IdentityChip } from "@duna/ui";
import { countryCode } from "@/lib/country-flag";

export function CountryCode({
  className,
  code,
  fallback = "INTL",
}: {
  readonly className?: string;
  readonly code?: string;
  readonly fallback?: string;
}) {
  const normalized = countryCode(code);
  if (normalized) {
    return (
      <span
        aria-label={`${normalized} flag`}
        className={[
          "duna-country-flag",
          "fi",
          "fis",
          `fi-${normalized.toLowerCase()}`,
          className,
        ]
          .filter(Boolean)
          .join(" ")}
        role="img"
      />
    );
  }

  return (
    <IdentityChip aria-label="International" className={className}>
      {fallback}
    </IdentityChip>
  );
}
