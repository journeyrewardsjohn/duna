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
  const value = normalized ?? fallback;
  return (
    <IdentityChip
      aria-label={normalized ? `Country ${normalized}` : "International"}
      className={className}
    >
      {value}
    </IdentityChip>
  );
}
