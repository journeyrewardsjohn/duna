"use client";

import { hqHref } from "@duna/core/hq-routes";
import { useRouter } from "next/navigation";
import { WebsiteForm } from "./website-form";

/**
 * "Read my website again": Duna reads the site again and proposes only
 * what differs from the club's records, each with its current value.
 * Values a person set are never overwritten.
 */
export function RereadCard({
  website,
  reader,
}: {
  readonly website: string;
  readonly reader: "ready" | "not-configured";
}) {
  const router = useRouter();
  return (
    <WebsiteForm
      initial={website}
      onStarted={(run) => router.push(`${hqHref("setupReview")}?run=${run.id}`)}
      reader={reader}
      reread
      submitLabel="Read my website again"
    />
  );
}
