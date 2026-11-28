"use client";

import { Icon } from "@duna/ui/icons";
import { Sheet, SheetContent, SheetTrigger } from "@duna/ui/tideline";
import type { ReactNode } from "react";

/**
 * Below the wide layout the person's context moves out of the third column
 * into a sheet, opened from the thread header. The same content either way.
 */
export function ContextSheet({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <Sheet>
      <SheetTrigger
        className="inbox-context-trigger"
        size="sm"
        variant="secondary"
      >
        <Icon name="info" size="inline" /> Details
      </SheetTrigger>
      <SheetContent className="inbox-context-sheet" title={title}>
        {children}
      </SheetContent>
    </Sheet>
  );
}
