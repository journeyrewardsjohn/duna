import { isWorkOSAuthKitConfigured } from "@duna/api/workos-environment";
import { SiteAudienceHeader } from "./site-audience-header";

export function SiteHeader({
  authConfigured,
}: { readonly authConfigured?: boolean } = {}) {
  return (
    <SiteAudienceHeader
      authConfigured={authConfigured ?? isWorkOSAuthKitConfigured()}
    />
  );
}
