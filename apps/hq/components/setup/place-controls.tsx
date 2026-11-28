"use client";

import { hqHref } from "@duna/core/hq-routes";
import { Button, SubNav, useConfirm } from "@duna/ui/tideline";
import { report } from "@duna/observability";
import { useRouter } from "next/navigation";
import { publishPlaceAction } from "./actions";
import { renderSetupLink } from "./setup-nav";
import { unwrap } from "./setup-result";

export type PlaceTab = "overview" | "layout" | "details";

/** A place's tabs. Layout and Details open the facility studio and the details editor. */
export function PlaceSubNav({
  venueId,
  name,
  current,
}: {
  readonly venueId: string;
  readonly name: string;
  readonly current: PlaceTab;
}) {
  return (
    <SubNav
      current={current}
      items={[
        {
          id: "overview",
          label: "Overview",
          href: hqHref("place", { venueId }),
        },
        {
          id: "layout",
          label: "Layout on the map",
          href: hqHref("placeLayout", { venueId }),
        },
        {
          id: "details",
          label: "Details and pricing",
          href: hqHref("placeDetails", { venueId }),
        },
      ]}
      label={name}
      renderLink={renderSetupLink}
    />
  );
}

/** Publishes a draft place to players, after a confirm. */
export function PublishPlaceButton({
  venueId,
  name,
  ready,
}: {
  readonly venueId: string;
  readonly name: string;
  /** Has a live court with a price. */
  readonly ready: boolean;
}) {
  const router = useRouter();
  const confirm = useConfirm();
  return (
    <>
      {confirm.dialog}
      <Button
        disabled={!ready || confirm.open}
        onClick={() =>
          void confirm
            .run({
              tier: "confirm",
              title: `Publish ${name}?`,
              description: "Players can find it and book its live courts.",
              affected:
                "Nobody is notified; it shows on your club page and in the app.",
              verb: `Publish ${name}`,
              cancelLabel: "Keep as draft",
              agentConfirm: `Publishes the place ${name} for players`,
              perform: async ({ idempotencyKey }) =>
                unwrap(await publishPlaceAction({ venueId, idempotencyKey })),
              success: `${name} is live`,
              report,
            })
            .then((outcome) => {
              if (outcome.status === "done") router.refresh();
            })
        }
        variant="primary"
      >
        Publish place
      </Button>
    </>
  );
}
