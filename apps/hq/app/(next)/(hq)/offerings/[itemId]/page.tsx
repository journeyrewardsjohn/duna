import { readParticipationRuleV2 } from "@duna/core";
import { Notice } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { DetailsForm } from "@/components/offerings/details-form";
import { MediaEditor } from "@/components/offerings/media-editor";
import {
  mediaDisplayUrl,
  mediaInput,
  offeringCapacity,
  optionsFromVariants,
  priceSummary,
  variantMatrix,
} from "@/components/offerings/offering-model";
import { OfferingPreview } from "@/components/offerings/offering-preview";
import { loadCatalog } from "@/components/offerings/offerings-data";
import {
  loadOfferingPage,
  OfferingScreen,
  OfferingUnavailable,
} from "@/components/offerings/offerings-screen";
import { PageSection } from "@/components/shell/page-header";

export const metadata: Metadata = { title: "Offering" };

/** An offering's Overview: the words and photos players see, and the card itself. */
export default async function OfferingOverviewPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ itemId: string }>;
  readonly searchParams: Promise<{ created?: string }>;
}) {
  const { itemId } = await params;
  const { created } = await searchParams;
  const result = await loadOfferingPage(itemId);
  if (result.state !== "ok") return <OfferingUnavailable result={result} />;
  const { item, context, rule, checklist } = result.page;
  const catalog = await loadCatalog();
  const others =
    catalog.state === "ok"
      ? catalog.data
          .filter(
            (other) => other.id !== item.id && other.status !== "archived",
          )
          .map((other) => ({ id: other.id, title: other.title }))
      : [];
  const options = optionsFromVariants(item);
  const variantLabels = variantMatrix(options).map((coordinates) =>
    Object.values(coordinates).join(" · "),
  );
  const cover = item.media.find((media) => media.kind === "image");
  const blocking = checklist.filter((entry) => entry.blocking && !entry.done);
  const live = item.status === "active";
  return (
    <OfferingScreen page={result.page} tab="overview">
      {created === "1" ? (
        <Notice role="status" title="Your draft is ready" tone="positive">
          It's private until you publish. Each section below saves on its own.
        </Notice>
      ) : null}
      <div className="of-split">
        <div className="of-split__main">
          <PageSection id="details" title="Details">
            <DetailsForm
              canWrite={context.access.write}
              isPlan={item.type === "plan"}
              itemId={item.id}
              live={live}
              others={others}
              values={{
                title: item.title,
                shortSummary: item.shortSummary,
                description: item.description,
                configuration: item.configuration,
              }}
            />
          </PageSection>
          <PageSection id="photos" title="Photos and video">
            <MediaEditor
              canWrite={context.access.write}
              demo={context.demo}
              initial={mediaInput(item).map((media, index) => ({
                key: `${item.media[index]?.id ?? index}`,
                kind: media.kind,
                url: media.url,
                ...(media.alt ? { alt: media.alt } : {}),
                ...(media.variantIndex !== undefined
                  ? { variantIndex: media.variantIndex }
                  : {}),
              }))}
              itemId={item.id}
              live={live}
              organizationId={context.session.organization?.id ?? ""}
              subtype={item.subtype}
              title={item.title}
              variants={variantLabels}
            />
          </PageSection>
        </div>
        <div className="of-split__side">
          <OfferingPreview
            capacity={offeringCapacity(item)}
            clubName={context.organization}
            coverAlt={cover?.alt}
            coverUrl={cover ? mediaDisplayUrl(cover.url) : undefined}
            now={context.now}
            price={
              context.access.money ? priceSummary(item, context.currency) : ""
            }
            rule={
              rule.rule
                ? (readParticipationRuleV2(rule.rule) ?? undefined)
                : undefined
            }
            summary={item.shortSummary}
            timeZone={context.timeZone}
            title={item.title}
          />
          {item.status === "draft" && context.access.money ? (
            <PageSection id="publish" title="Before it goes live">
              {blocking.length === 0 ? (
                <p className="pt-quiet">
                  Everything players need is here. Publish from the top of the
                  page.
                </p>
              ) : (
                <ul className="of-issues">
                  {blocking.map((entry) => (
                    <li key={entry.id}>
                      {entry.label}
                      {entry.href ? (
                        <>
                          {" · "}
                          <a className="of-inline-link" href={entry.href}>
                            {entry.fixLabel ?? "Fix"}
                          </a>
                        </>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </PageSection>
          ) : null}
        </div>
      </div>
    </OfferingScreen>
  );
}
