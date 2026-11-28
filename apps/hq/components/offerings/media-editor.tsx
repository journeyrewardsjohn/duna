"use client";

import { productMediaForKind } from "@duna/core";
import { Icon } from "@duna/ui/icons";
import { report } from "@duna/observability";
import {
  Button,
  Field,
  IconButton,
  Input,
  Select,
  Textarea,
} from "@duna/ui/tideline";
import { upload } from "@vercel/blob/client";
import { useEffect, useState } from "react";
import { savePriceAction } from "@/app/(next)/(hq)/offerings/actions";
import {
  createProductMediaPath,
  optimizeImageUpload,
} from "@/lib/media-storage";
import { mediaDisplayUrl } from "./offering-model";
import { SectionFooter, useSectionSave } from "./section-save";

export interface MediaDraft {
  readonly key: string;
  readonly kind: "image" | "video";
  readonly url: string;
  readonly alt?: string;
  /** Index into the variant list; undefined: shown for every variant. */
  readonly variantIndex?: number;
}

/**
 * Photos and videos: upload, a hosted link, Duna's library, or a custom
 * cover when Duna can make one. The first is the cover. A photo can be for
 * every option or for one (a size, a colour); "every option" is saved
 * without a variant, so it never breaks a save (the old builder sent -1 for
 * those and the server refused every edit of such an offering).
 */
export function MediaEditor({
  itemId,
  organizationId,
  title,
  subtype,
  live,
  initial,
  variants,
  canWrite,
  demo,
}: {
  readonly itemId: string;
  readonly organizationId: string;
  readonly title: string;
  readonly subtype: string;
  readonly live: boolean;
  readonly initial: readonly MediaDraft[];
  /** The variant labels, in the order the server builds them. */
  readonly variants: readonly string[];
  readonly canWrite: boolean;
  readonly demo: boolean;
}) {
  const [media, setMedia] = useState<MediaDraft[]>([...initial]);
  const [link, setLink] = useState("");
  const [uploadState, setUploadState] = useState<string>("");
  const [aiAvailable, setAiAvailable] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [aiState, setAiState] = useState<"idle" | "making" | "failed">("idle");

  useEffect(() => {
    if (demo) return;
    let active = true;
    void fetch("/api/product-media/generate", { cache: "no-store" })
      .then(async (response) =>
        response.ok
          ? ((await response.json()) as { available?: boolean }).available ===
            true
          : false,
      )
      .then((available) => {
        if (active) setAiAvailable(available);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [demo]);

  const comparable = (list: readonly MediaDraft[]) =>
    JSON.stringify(
      list.map((entry) => [
        entry.kind,
        entry.url,
        entry.alt,
        entry.variantIndex,
      ]),
    );
  const dirty = comparable(media) !== comparable(initial);
  const { button, online, dialog } = useSectionSave({
    what: "Photos",
    dirty,
    live,
    title,
    republishes: true,
    perform: (idempotencyKey) =>
      savePriceAction({
        itemId,
        change: {
          media: media.map((entry) => ({
            kind: entry.kind,
            url: entry.url,
            ...(entry.alt ? { alt: entry.alt } : {}),
            ...(entry.variantIndex !== undefined && entry.variantIndex >= 0
              ? { variantIndex: entry.variantIndex }
              : {}),
          })),
        },
        idempotencyKey,
      }),
  });

  const add = (entry: Omit<MediaDraft, "key">, first = false) =>
    setMedia((current) =>
      first
        ? [{ ...entry, key: crypto.randomUUID() }, ...current]
        : [...current, { ...entry, key: crypto.randomUUID() }],
    );

  const uploadFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    try {
      for (const file of Array.from(files)) {
        setUploadState(`Preparing ${file.name}…`);
        const prepared = file.type.startsWith("image/")
          ? await optimizeImageUpload(file)
          : file;
        const stored = await upload(
          createProductMediaPath(organizationId, prepared.type),
          prepared,
          {
            access: "public",
            clientPayload: JSON.stringify({
              organizationId,
              fileName: prepared.name,
              contentType: prepared.type,
              size: prepared.size,
              purpose: "product",
            }),
            contentType: prepared.type,
            handleUploadUrl: "/api/media/upload",
            multipart: prepared.size > 100_000_000,
            onUploadProgress: ({ percentage }) =>
              setUploadState(
                `Uploading ${prepared.name}… ${Math.round(percentage)}%`,
              ),
          },
        );
        add({
          kind: prepared.type.startsWith("image/") ? "image" : "video",
          url: stored.url,
          alt: title,
        });
      }
      setUploadState("Uploaded. Save to keep it.");
    } catch (error) {
      void report(error, { event: "hq.offerings.media_upload_failed" });
      setUploadState(
        "The upload didn't finish. Try again, or add a link instead.",
      );
    }
  };

  const makeCover = async () => {
    setAiState("making");
    try {
      const response = await fetch("/api/product-media/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          offerName: title,
          offerType: subtype,
          prompt: prompt.trim(),
        }),
      });
      const result = (await response.json()) as { url?: string; alt?: string };
      if (!response.ok || !result.url) throw new Error("No cover");
      add({ kind: "image", url: result.url, alt: result.alt ?? title }, true);
      setAiState("idle");
    } catch (error) {
      void report(error, { event: "hq.offerings.cover_failed" });
      setAiState("failed");
    }
  };

  const library = productMediaForKind(subtype).slice(0, 4);
  const disabled = !canWrite;
  return (
    <div className="of-form">
      {media.length === 0 ? (
        <p className="pt-quiet">
          No photos yet. Players see a plain card until you add one.
        </p>
      ) : (
        <ul aria-label="Photos and videos" className="of-media">
          {media.map((entry, index) => (
            <li key={entry.key}>
              {entry.kind === "image" ? (
                // Club photos live on Duna's media storage; a plain img keeps them as uploaded.
                <img
                  alt={entry.alt ?? ""}
                  className="of-media__thumb"
                  src={mediaDisplayUrl(entry.url)}
                />
              ) : (
                <span className="of-media__thumb of-media__thumb--video">
                  <Icon name="film" />
                </span>
              )}
              <span className="of-media__text">
                <span>
                  {index === 0
                    ? "Cover"
                    : entry.kind === "image"
                      ? "Photo"
                      : "Video"}
                </span>
                {variants.length > 1 ? (
                  <Select
                    aria-label={`Shown for (${index + 1})`}
                    disabled={disabled}
                    onValueChange={(value) =>
                      setMedia((current) =>
                        current.map((candidate) =>
                          candidate.key === entry.key
                            ? {
                                ...candidate,
                                variantIndex:
                                  value === "all" || value === null
                                    ? undefined
                                    : Number(value),
                              }
                            : candidate,
                        ),
                      )
                    }
                    options={[
                      { value: "all", label: "Every option" },
                      ...variants.map((label, at) => ({
                        value: String(at),
                        label,
                      })),
                    ]}
                    value={
                      entry.variantIndex === undefined
                        ? "all"
                        : String(entry.variantIndex)
                    }
                  />
                ) : null}
              </span>
              <IconButton
                disabled={disabled}
                label={`Remove ${index === 0 ? "the cover" : `photo ${index + 1}`}`}
                onClick={() =>
                  setMedia((current) =>
                    current.filter((candidate) => candidate.key !== entry.key),
                  )
                }
                size="sm"
              >
                <Icon name="close" size="inline" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      {canWrite ? (
        <>
          <Field
            hint="Photos are made smaller before they upload."
            label="Upload photos or a video"
            optional
          >
            <input
              accept="image/avif,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
              className="of-file"
              disabled={demo}
              multiple
              onChange={(event) => void uploadFiles(event.currentTarget.files)}
              type="file"
            />
          </Field>
          {demo ? (
            <p className="pt-quiet">
              The demo club can't upload; use a link or the library.
            </p>
          ) : null}
          {uploadState ? (
            <p aria-live="polite" className="pt-quiet">
              {uploadState}
            </p>
          ) : null}
          <div className="of-inline">
            <Field label="Or add a link to a photo" optional>
              <Input
                onValueChange={(value) => setLink(String(value ?? ""))}
                placeholder="https://"
                type="url"
                value={link}
              />
            </Field>
            <Button
              disabled={!/^https:\/\//.test(link.trim())}
              onClick={() => {
                add({ kind: "image", url: link.trim(), alt: title });
                setLink("");
              }}
              size="sm"
              variant="secondary"
            >
              Add link
            </Button>
          </div>
          {library.length > 0 ? (
            <div className="of-library">
              <p className="pt-label">From Duna's library</p>
              <ul>
                {library.map((entry) => (
                  <li key={entry.id}>
                    <button
                      className="of-library__pick"
                      onClick={() =>
                        add(
                          {
                            kind: "image",
                            url: `https://duna.coach${entry.path}`,
                            alt: entry.alt,
                          },
                          media.length === 0,
                        )
                      }
                      type="button"
                    >
                      <img alt="" src={entry.path} />
                      <span>{entry.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {aiAvailable ? (
            <div className="of-inline">
              <Field
                hint="Say what the cover should show."
                label="Make a custom cover"
                optional
              >
                <Textarea
                  maxLength={600}
                  onChange={(event) => setPrompt(event.currentTarget.value)}
                  rows={2}
                  value={prompt}
                />
              </Field>
              <Button
                disabled={prompt.trim().length < 8 || aiState === "making"}
                loading={aiState === "making"}
                onClick={() => void makeCover()}
                size="sm"
                variant="secondary"
              >
                Make the cover
              </Button>
              {aiState === "failed" ? (
                <p className="pt-quiet">
                  Duna couldn't make a cover this time. Try other words.
                </p>
              ) : null}
            </div>
          ) : null}
          <SectionFooter online={online}>{button("Save photos")}</SectionFooter>
        </>
      ) : null}
      {dialog}
    </div>
  );
}
