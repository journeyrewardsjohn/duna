"use client";

import type { PublicOrganizationStorefront } from "@duna/api";
import { Badge } from "@duna/ui";
import { ImageIcon, Play } from "lucide-react";
import { useState } from "react";

type CatalogMedia = PublicOrganizationStorefront["catalog"][number]["media"];
type CatalogVariants =
  PublicOrganizationStorefront["catalog"][number]["variants"];

export function CatalogMediaGallery({
  media,
  subtype,
  title,
  variants,
}: {
  readonly media: CatalogMedia;
  readonly subtype: string;
  readonly title: string;
  readonly variants: CatalogVariants;
}) {
  const [selectedId, setSelectedId] = useState(media[0]?.id);
  const selected = media.find((item) => item.id === selectedId) ?? media[0];

  return (
    <div className="catalog-media-gallery">
      <div className="catalog-product-hero">
        {selected?.kind === "image" ? (
          <img alt={selected.alt ?? title} src={selected.url} />
        ) : selected?.kind === "video" ? (
          <video
            aria-label={selected.alt ?? `${title} video`}
            controls
            playsInline
            poster={selected.posterUrl}
            preload="metadata"
            src={selected.url}
          />
        ) : (
          <span>{title.slice(0, 2).toUpperCase()}</span>
        )}
        <Badge>{subtype.replaceAll("-", " ")}</Badge>
      </div>
      {media.length > 1 && (
        <div
          aria-label={`${title} gallery`}
          className="catalog-media-thumbnails"
        >
          {media.map((item, index) => {
            const variantTitle = item.catalogVariantId
              ? variants.find((variant) => variant.id === item.catalogVariantId)
                  ?.title
              : undefined;
            return (
              <button
                aria-label={`Show ${item.kind} ${index + 1} of ${media.length}`}
                aria-pressed={item.id === selected?.id}
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                type="button"
              >
                {item.kind === "image" ? (
                  <img alt="" src={item.url} />
                ) : (
                  <>
                    {item.posterUrl ? (
                      <img alt="" src={item.posterUrl} />
                    ) : (
                      <span>
                        <Play aria-hidden size={18} />
                      </span>
                    )}
                    <i>
                      <Play aria-hidden size={11} /> Video
                    </i>
                  </>
                )}
                {variantTitle && (
                  <small>
                    <ImageIcon aria-hidden size={10} /> {variantTitle}
                  </small>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
