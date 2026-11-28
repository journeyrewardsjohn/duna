import "../../detail.css";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { load, value } from "@/components/club/load";
import { serializeGraph } from "@/components/club/structured-data";
import { clubThemeView } from "@/components/club/theme";
import { pageViewer } from "@/components/club/viewer";
import { EventPage, ProEventSummary } from "@/components/event/event-page";
import { eventWhen } from "@/components/event/event-model";
import { eventJsonLd } from "@/components/event/structured-data";
import { siteOgImage } from "@/components/site/og";
import { getServerCaller } from "@/lib/api";
import {
  absolutePublicUrl,
  professionalEventDescription,
  professionalEventImages,
  professionalEventJsonLd,
  serializeJsonLd,
} from "@/lib/pro-seo";

type Params = Promise<{ slug: string }>;

const loadEvent = cache(async (slug: string) => {
  const caller = await getServerCaller();
  const event = await load(
    () => caller.public.eventBySlug({ slug }),
    "web.event.load",
    { slug },
  );
  // A professional event shares the address space; read it only when there
  // is no club event of that name.
  const proEvent =
    event.status === "ok"
      ? undefined
      : await caller.public.proEvent({ slug }).catch(() => undefined);
  return { event, proEvent };
});

export async function generateMetadata({
  params,
}: {
  readonly params: Params;
}): Promise<Metadata> {
  const { slug } = await params;
  const { event: loaded, proEvent } = await loadEvent(slug);
  const event = value(loaded);
  const canonical = `/events/${slug}`;
  if (!event && !proEvent) {
    return { title: "Event not found", robots: { index: false } };
  }
  const title = event?.title ?? proEvent!.name;
  const description = (
    event
      ? (event.shortSummary ??
        `${title}: ${eventWhen(event).day} at ${event.location?.venueName ?? event.venueName}. Register on Duna.`)
      : professionalEventDescription(proEvent!)
  ).slice(0, 155);
  const eventImage = event
    ? (event.media?.find((media) => media.kind === "image")?.url ??
      event.imageUrl)
    : professionalEventImages(proEvent!)[0]?.url;
  const image = eventImage
    ? absolutePublicUrl(eventImage)
    : siteOgImage({
        title,
        eyebrow: event ? eventWhen(event).day : "Pro Tour",
        concept: "score",
      });
  return {
    title,
    description,
    alternates: {
      canonical,
      types: { "text/markdown": `${canonical}.md` },
    },
    openGraph: {
      title,
      description,
      type: "website",
      url: canonical,
      siteName: "Duna",
      images: [{ url: image, alt: title }],
    },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  };
}

export default async function EventRoute({
  params,
}: {
  readonly params: Params;
}) {
  const { slug } = await params;
  const [{ event, proEvent }, viewer] = await Promise.all([
    loadEvent(slug),
    pageViewer(),
  ]);
  if (event.status !== "ok") {
    if (proEvent) {
      return (
        <>
          <script
            dangerouslySetInnerHTML={{
              __html: serializeJsonLd(professionalEventJsonLd(proEvent)),
            }}
            type="application/ld+json"
          />
          <ProEventSummary event={proEvent} />
        </>
      );
    }
    if (event.status === "missing") notFound();
    throw new Error(`Event ${slug} did not load`);
  }
  const caller = await getServerCaller();
  const organizationSlug = event.value.organizationSlug;
  const [competition, organiser] = await Promise.all([
    event.value.kind === "tournament"
      ? caller.public.tournamentCompetition({ slug }).catch(() => undefined)
      : Promise.resolve(undefined),
    organizationSlug
      ? caller.public
          .organizationStorefront({ slug: organizationSlug })
          .catch(() => undefined)
      : Promise.resolve(undefined),
  ]);
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: serializeGraph(eventJsonLd(event.value)),
        }}
        type="application/ld+json"
      />
      <EventPage
        competition={competition}
        event={event.value}
        organiserColor={clubThemeView(organiser?.theme).color}
        viewer={viewer}
      />
    </>
  );
}
