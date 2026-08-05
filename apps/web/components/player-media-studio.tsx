"use client";

import type { PlayerMediaStudio as PlayerMediaStudioState } from "@duna/api";
import { upload } from "@vercel/blob/client";
import {
  Check,
  ImagePlus,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Trash2,
  WandSparkles,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPlayerMediaWorkflowAction } from "@/app/app/settings/actions";
import {
  playerMediaPath,
  validatePlayerMediaInput,
} from "@/lib/player-media-storage";

type SlotKey = "action" | "portrait-one" | "portrait-two" | "portrait-three";
type SlotState = {
  readonly url?: string;
  readonly preview?: string;
  readonly progress?: number;
  readonly error?: string;
};

const slots: readonly {
  readonly key: SlotKey;
  readonly kind: "action" | "portrait";
  readonly title: string;
  readonly detail: string;
  readonly optional?: boolean;
}[] = [
  {
    key: "action",
    kind: "action",
    title: "Action photo",
    detail: "Full body, ball, court, and sand visible.",
  },
  {
    key: "portrait-one",
    kind: "portrait",
    title: "Front portrait",
    detail: "Natural light, face clear, no sunglasses.",
  },
  {
    key: "portrait-two",
    kind: "portrait",
    title: "Three-quarter portrait",
    detail: "A second expression helps preserve identity.",
  },
  {
    key: "portrait-three",
    kind: "portrait",
    title: "Side portrait",
    detail: "Optional, useful for stronger facial dynamics.",
    optional: true,
  },
];

function statusCopy(status: string) {
  if (status === "ready") return "Ready for Duna AI production";
  if (status === "generating") return "Generating your athlete package";
  if (status === "review") return "Ready for your review";
  if (status === "published") return "Published to your public profile";
  if (status === "rejected") return "Changes requested";
  if (status === "failed") return "Production needs attention";
  return "Draft";
}

export function PlayerMediaStudio({
  studio,
}: {
  readonly studio: PlayerMediaStudioState;
}) {
  const router = useRouter();
  const [references, setReferences] = useState<
    Partial<Record<SlotKey, SlotState>>
  >({});
  const [brief, setBrief] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  async function choose(key: SlotKey, kind: "action" | "portrait", file: File) {
    setError(undefined);
    try {
      const media = validatePlayerMediaInput({
        contentType: file.type,
        size: file.size,
      });
      const previous = references[key];
      if (previous?.preview?.startsWith("blob:")) {
        URL.revokeObjectURL(previous.preview);
      }
      const preview = URL.createObjectURL(file);
      setReferences((value) => ({
        ...value,
        [key]: { preview, progress: 1 },
      }));
      const blob = await upload(
        playerMediaPath({
          personId: studio.personId,
          kind,
          extension: media.extension,
        }),
        file,
        {
          access: "public",
          handleUploadUrl: "/api/player-media/upload",
          clientPayload: JSON.stringify({
            personId: studio.personId,
            kind,
            contentType: file.type,
            size: file.size,
          }),
          onUploadProgress: ({ percentage }) => {
            setReferences((value) => ({
              ...value,
              [key]: { ...value[key], preview, progress: percentage },
            }));
          },
        },
      );
      setReferences((value) => ({
        ...value,
        [key]: { url: blob.url, preview, progress: 100 },
      }));
    } catch (uploadError) {
      const message =
        uploadError instanceof Error
          ? uploadError.message
          : "The image could not be uploaded.";
      setReferences((value) => ({
        ...value,
        [key]: { ...value[key], error: message },
      }));
    }
  }

  function remove(key: SlotKey) {
    const current = references[key];
    if (current?.preview?.startsWith("blob:")) {
      URL.revokeObjectURL(current.preview);
    }
    setReferences((value) => ({ ...value, [key]: undefined }));
  }

  function submit() {
    setError(undefined);
    setNotice(undefined);
    const referenceImages = slots.flatMap((slot) => {
      const url = references[slot.key]?.url;
      return url ? [{ url, kind: slot.kind }] : [];
    });
    if (
      !references.action?.url ||
      !references["portrait-one"]?.url ||
      !references["portrait-two"]?.url
    ) {
      setError("Add one action photo and at least two portraits first.");
      return;
    }
    if (!rightsConfirmed) {
      setError("Confirm that you can use every uploaded image.");
      return;
    }
    startTransition(async () => {
      const response = await createPlayerMediaWorkflowAction({
        referenceImages,
        brief: brief.trim() || undefined,
        rightsConfirmed: true,
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setNotice(
        "Your source images and creative brief are ready for Duna AI production and human review.",
      );
      router.refresh();
    });
  }

  return (
    <section className="settings-section player-media-studio" id="player-media">
      <div className="settings-section__heading">
        <div>
          <span className="settings-kicker">AI athlete studio</span>
          <h2>Build your public profile artwork.</h2>
          <p>
            Give Duna one action image and two or three clear portraits. We use
            Higgsfield to create a reviewable transparent player cutout and a
            cinematic beach-volleyball hero—never an automatic public overwrite.
          </p>
        </div>
        <WandSparkles aria-hidden size={24} />
      </div>

      {studio.workflow && (
        <div
          className="player-media-studio__status"
          data-status={studio.workflow.status}
        >
          <span>
            {studio.workflow.status === "published" ? (
              <Check aria-hidden size={20} />
            ) : (
              <Sparkles aria-hidden size={20} />
            )}
          </span>
          <div>
            <small>Latest media package</small>
            <strong>{statusCopy(studio.workflow.status)}</strong>
            <p>
              Submitted{" "}
              {new Date(studio.workflow.createdAt).toLocaleDateString()}
              {studio.workflow.failureReason
                ? ` · ${studio.workflow.failureReason}`
                : ""}
            </p>
          </div>
          {studio.workflow.outputImages.length > 0 && (
            <div className="player-media-studio__outputs">
              {studio.workflow.outputImages.map((output) => (
                <span key={`${output.kind}-${output.url}`}>
                  <Image
                    alt={`${studio.displayName} ${output.kind}`}
                    fill
                    sizes="90px"
                    src={output.url}
                    unoptimized
                  />
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="player-media-studio__guide">
        <div>
          <strong>What works best</strong>
          {studio.requirements.guidance.map((item) => (
            <span key={item}>
              <Check aria-hidden size={15} /> {item}
            </span>
          ))}
        </div>
        <div aria-hidden className="player-media-studio__result-preview">
          <span>01</span>
          <strong>Identity-faithful cutout</strong>
          <i />
          <span>02</span>
          <strong>Editorial poster hero</strong>
        </div>
      </div>

      <div className="player-media-studio__uploads">
        {slots.map((slot) => {
          const state = references[slot.key];
          const uploading =
            state?.progress !== undefined &&
            state.progress < 100 &&
            !state.error;
          return (
            <article data-ready={Boolean(state?.url)} key={slot.key}>
              <div className="player-media-studio__preview">
                {state?.preview ? (
                  <Image
                    alt={`${slot.title} preview`}
                    fill
                    sizes="(max-width: 680px) 90vw, 260px"
                    src={state.preview}
                    unoptimized
                  />
                ) : (
                  <ImagePlus aria-hidden size={28} />
                )}
                {uploading && (
                  <span className="player-media-studio__progress">
                    <i style={{ width: `${state.progress}%` }} />
                  </span>
                )}
                {state?.url && (
                  <button
                    aria-label={`Remove ${slot.title}`}
                    onClick={() => remove(slot.key)}
                    type="button"
                  >
                    <Trash2 aria-hidden size={16} />
                  </button>
                )}
              </div>
              <div>
                <small>
                  {slot.kind === "action" ? "Playing image" : "Face reference"}
                  {slot.optional ? " · optional" : " · required"}
                </small>
                <strong>{slot.title}</strong>
                <p>{slot.detail}</p>
                <label>
                  {uploading ? (
                    <>
                      <LoaderCircle aria-hidden className="spin" size={16} />
                      Uploading {Math.round(state?.progress ?? 0)}%
                    </>
                  ) : state?.url ? (
                    <>
                      <Check aria-hidden size={16} /> Replace image
                    </>
                  ) : (
                    <>
                      <ImagePlus aria-hidden size={16} /> Choose image
                    </>
                  )}
                  <input
                    accept="image/jpeg,image/png,image/webp,image/avif"
                    disabled={uploading || pending}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void choose(slot.key, slot.kind, file);
                      event.currentTarget.value = "";
                    }}
                    type="file"
                  />
                </label>
                {state?.error && <small role="alert">{state.error}</small>}
              </div>
            </article>
          );
        })}
      </div>

      <div className="player-media-studio__brief">
        <label>
          Creative direction <span>Optional</span>
          <textarea
            maxLength={1_000}
            onChange={(event) => setBrief(event.target.value)}
            placeholder="Examples: energetic defender, warm sunset color, calm and confident, preserve my current uniform colors…"
            rows={4}
            value={brief}
          />
        </label>
        <label className="player-media-studio__rights">
          <input
            checked={rightsConfirmed}
            onChange={(event) => setRightsConfirmed(event.target.checked)}
            type="checkbox"
          />
          <span>
            <ShieldCheck aria-hidden size={19} />
            <strong>I own or have permission to use these images.</strong>
            <small>
              Duna may use them to produce and publish my approved athlete
              media.
            </small>
          </span>
        </label>
        <button disabled={pending} onClick={submit} type="button">
          {pending ? (
            <LoaderCircle aria-hidden className="spin" size={18} />
          ) : (
            <Sparkles aria-hidden size={18} />
          )}
          Create my athlete media brief
        </button>
      </div>
      {notice && <p className="form-notice">{notice}</p>}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
