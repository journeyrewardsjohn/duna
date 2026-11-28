"use client";

import { Icon } from "@duna/ui/icons";
import { Button } from "@duna/ui/tideline";

/** Opens the browser's print dialog for the run sheet. */
export function PrintButton() {
  return (
    <Button
      icon={<Icon name="layout" />}
      onClick={() => window.print()}
      size="sm"
      variant="primary"
    >
      Print
    </Button>
  );
}
