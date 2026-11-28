"use client";

import type { ReactNode } from "react";
import { usePlayOnce } from "./use-play-once";

/**
 * "Label, line, chip" (spec 2.9): every section opens with a 1 px hairline
 * and a 3 by 11 px post at its start, the net and its pole. The line Rises
 * left to right once as the section comes into view; it is drawn at rest.
 */
export function NetLine({
  label,
  chip,
}: {
  readonly label: ReactNode;
  readonly chip?: ReactNode;
}) {
  const { ref, phase } = usePlayOnce<HTMLSpanElement>(0.2);
  return (
    <div className="site-netline">
      <span className="site-label">{label}</span>
      <span
        aria-hidden="true"
        className="site-netline__net"
        data-phase={phase}
        ref={ref}
      />
      {chip ? <span className="site-netline__chip">{chip}</span> : null}
    </div>
  );
}
