"use client";

import { Smartphone } from "lucide-react";
import { useEffect } from "react";

export function WaiverAppHandoff({
  organizationId,
  waiverDocumentId,
  subjectPersonId,
}: {
  readonly organizationId: string;
  readonly waiverDocumentId: string;
  readonly subjectPersonId: string;
}) {
  const appUrl = () => {
    const query = new URLSearchParams({
      organizationId,
      waiverDocumentId,
      subjectPersonId,
    });
    return `duna://waiver/complete?${query.toString()}`;
  };
  const openInApp = () => {
    window.location.assign(appUrl());
  };

  useEffect(() => {
    const isMobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isMobile) openInApp();
    // An unavailable custom scheme leaves this HTTPS page in place, which is
    // the dependable browser fallback for every signer.
  }, []); // Link fields are immutable for the lifetime of this page.

  return (
    <button className="waiver-app-handoff" onClick={openInApp} type="button">
      <Smartphone aria-hidden size={16} /> Open in the Duna app
    </button>
  );
}
