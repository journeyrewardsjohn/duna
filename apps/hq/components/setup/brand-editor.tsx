"use client";

import type { OperatorWorkspace } from "@duna/api";
import {
  Button,
  ClubLockup,
  Field,
  Input,
  MembershipCard,
  Segmented,
  Textarea,
  Tideline,
  useAction,
  useConfirm,
  useLeaveGuard,
} from "@duna/ui/tideline";
import { report } from "@duna/observability";
import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrandMediaPath, optimizeImageUpload } from "@/lib/media-storage";
import { type BrandUpdate, saveBrandAction } from "./actions";
import { BrandPreview } from "./brand-preview";
import { checkColour, type MarkForm } from "./setup-model";
import { unwrap } from "./setup-result";

type Theme = OperatorWorkspace["theme"];

interface BrandDraft {
  brandDisplayName: string;
  membershipProgramName: string;
  primary: string;
  logoUrl: string;
  markUrl: string;
  logoLightUrl: string;
  logoDarkUrl: string;
  heroMediaUrl: string;
  heroPosterUrl: string;
  cardStyle: "soft" | "crisp" | "borderless";
  profileLayout: "editorial" | "immersive" | "compact";
  brandVoice: string;
}

function draftOf(theme: Theme, clubName: string): BrandDraft {
  return {
    brandDisplayName: theme.brandDisplayName ?? clubName,
    membershipProgramName: theme.membershipProgramName ?? "",
    primary: theme.palette.primary.toUpperCase(),
    logoUrl: theme.logoUrl ?? "",
    markUrl: theme.markUrl ?? "",
    logoLightUrl: theme.logoLightUrl ?? "",
    logoDarkUrl: theme.logoDarkUrl ?? "",
    heroMediaUrl: theme.heroMediaUrl ?? "",
    heroPosterUrl: theme.heroPosterUrl ?? "",
    cardStyle: theme.cardStyle,
    profileLayout:
      theme.profileLayout === "immersive" || theme.profileLayout === "compact"
        ? theme.profileLayout
        : "editorial",
    brandVoice: theme.brandVoice ?? "",
  };
}

type MediaKey =
  | "logoUrl"
  | "markUrl"
  | "logoLightUrl"
  | "logoDarkUrl"
  | "heroMediaUrl"
  | "heroPosterUrl";

const isVideo = (url: string) => /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);

function MediaField({
  label,
  hint,
  value,
  organizationId,
  onChange,
  id,
  video = false,
}: {
  readonly video?: boolean;
  readonly label: string;
  readonly hint: string;
  readonly value: string;
  readonly organizationId: string;
  readonly onChange: (url: string) => void;
  readonly id: string;
}) {
  const [status, setStatus] = useState<{
    tone: "info" | "error";
    text: string;
  }>();
  const send = async (file: File | undefined) => {
    if (!file) return;
    if (
      !file.type.startsWith("image/") &&
      !(video && file.type.startsWith("video/"))
    ) {
      setStatus({
        tone: "error",
        text: video
          ? "Choose an image or a video."
          : "Choose an image (SVG or PNG with a clear background works best).",
      });
      return;
    }
    setStatus({ tone: "info", text: "Preparing your image…" });
    try {
      const prepared = file.type.startsWith("image/")
        ? await optimizeImageUpload(file)
        : file;
      const stored = await upload(
        createBrandMediaPath(organizationId, prepared.type),
        prepared,
        {
          access: "public",
          clientPayload: JSON.stringify({
            organizationId,
            fileName: prepared.name,
            contentType: prepared.type,
            size: prepared.size,
            purpose: "brand",
          }),
          contentType: prepared.type,
          handleUploadUrl: "/api/media/upload",
          onUploadProgress: ({ percentage }) =>
            setStatus({
              tone: "info",
              text: `Uploading… ${Math.round(percentage)}%`,
            }),
        },
      );
      onChange(stored.url);
      setStatus({ tone: "info", text: "Uploaded. Save to use it." });
    } catch (error) {
      report(error, { event: "hq.setup.brand_upload_failed" });
      setStatus({
        tone: "error",
        text: "The upload didn't finish. Try again, or paste the image's address.",
      });
    }
  };
  return (
    <Field
      error={status?.tone === "error" ? status.text : undefined}
      hint={status?.tone === "info" ? status.text : hint}
      label={label}
      optional
    >
      <span className="setup-media">
        <Input
          id={id}
          inputMode="url"
          onChange={(event) => onChange(event.currentTarget.value)}
          placeholder="https://"
          value={value}
        />
        <label className="setup-media__upload">
          <span>Upload</span>
          <input
            accept={video ? "image/*,video/*" : "image/*"}
            className="td-sr"
            onChange={(event) => void send(event.currentTarget.files?.[0])}
            type="file"
          />
        </label>
      </span>
    </Field>
  );
}

/**
 * The club's brand: its mark (logo on its colour, an image tile or a
 * monogram), its colour with the contrast checked, and how it appears on a
 * membership card and the club page, in light and dark. Saving keeps a
 * draft; publishing to the club page is its own confirmed step.
 */
export function BrandEditor({
  theme,
  clubName,
  organizationId,
}: {
  readonly theme: Theme;
  readonly clubName: string;
  readonly organizationId: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(() => draftOf(theme, clubName));
  const [draft, setDraft] = useState(saved);
  const [form, setForm] = useState<MarkForm>(
    theme.logoUrl ? "logo" : theme.markUrl ? "tile" : "monogram",
  );
  const [problem, setProblem] = useState<string>();
  const confirm = useConfirm();
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  useLeaveGuard(dirty);
  const colour = checkColour(draft.primary);

  const update = (publish: boolean): BrandUpdate => ({
    ...draft,
    primary: colour.hex,
    markForm: form,
    heroMediaType: isVideo(draft.heroMediaUrl) ? "video" : "image",
    publish,
  });

  const valid = () => {
    if (!colour.valid) return "Use a colour like #1A2B3C.";
    if (colour.nearLive)
      return "That colour is too close to Duna's live colour. Choose another.";
    return undefined;
  };

  const saveDraft = useAction(
    async ({ idempotencyKey }) =>
      unwrap(await saveBrandAction(update(false), idempotencyKey)),
    {
      messages: { success: "Brand saved as a draft" },
      onSuccess: () => {
        setSaved(draft);
        router.refresh();
      },
      onError: (error) =>
        setProblem(
          (error as { userMessage?: string }).userMessage ??
            "Nothing was saved. Try again.",
        ),
      report,
    },
  );

  const publish = () => {
    const found = valid();
    if (found) {
      setProblem(found);
      return;
    }
    void confirm
      .run({
        tier: "confirm",
        title: "Publish your brand to your club page?",
        description:
          "Your mark, colour and names show on your public club page and in the player app.",
        affected:
          "Anyone who opens your club page sees the change. Nobody is notified.",
        verb: "Publish brand",
        cancelLabel: "Not yet",
        agentConfirm: "Publishes the club's brand to its public club page",
        perform: async ({ idempotencyKey }) =>
          unwrap(await saveBrandAction(update(true), idempotencyKey)),
        success: "Brand published to your club page",
        report,
      })
      .then((outcome) => {
        if (outcome.status === "done") {
          setSaved(draft);
          router.refresh();
        }
      });
  };

  const set = <K extends keyof BrandDraft>(key: K, value: BrandDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (problem) setProblem(undefined);
  };
  const media = (key: MediaKey) => (url: string) => set(key, url);
  const club = {
    name: draft.brandDisplayName || clubName,
    color: colour.valid ? colour.hex : null,
    logo: form === "logo" ? draft.logoUrl || null : null,
    logoLight: draft.logoLightUrl || null,
    logoDark: draft.logoDarkUrl || null,
    tile: form === "tile" ? draft.markUrl || null : null,
    source: form,
  };

  return (
    <div className="setup-brand-editor">
      {confirm.dialog}
      <form
        className="setup-brand-editor__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          const found = valid();
          if (found) setProblem(found);
          else void saveDraft.run();
        }}
      >
        <Field label="Name on your mark and card">
          <Input
            onChange={(event) =>
              set("brandDisplayName", event.currentTarget.value)
            }
            value={draft.brandDisplayName}
          />
        </Field>
        <Field
          hint="Chosen by you; Duna picks dark or light text on it."
          label="Club colour"
        >
          <span className="setup-colour-input">
            <input
              aria-label="Club colour picker"
              className="setup-colour-input__swatch"
              onChange={(event) =>
                set("primary", event.currentTarget.value.toUpperCase())
              }
              type="color"
              value={colour.valid ? colour.hex : "#0E1A22"}
            />
            <Input
              onChange={(event) => set("primary", event.currentTarget.value)}
              value={draft.primary}
            />
          </span>
        </Field>
        <MediaField
          hint="Your logo mark, drawn on your colour. SVG or a PNG with a clear background."
          id="brand-logo"
          label="Logo"
          onChange={media("logoUrl")}
          organizationId={organizationId}
          value={draft.logoUrl}
        />
        <MediaField
          hint="A square image used edge to edge, if you'd rather show a photo or badge."
          id="brand-tile"
          label="Image tile"
          onChange={media("markUrl")}
          organizationId={organizationId}
          value={draft.markUrl}
        />
        <MediaField
          hint="A light version of your logo for dark grounds."
          id="brand-logo-light"
          label="Logo for dark backgrounds"
          onChange={media("logoLightUrl")}
          organizationId={organizationId}
          value={draft.logoLightUrl}
        />
        <MediaField
          hint="A dark version of your logo for light grounds."
          id="brand-logo-dark"
          label="Logo for light backgrounds"
          onChange={media("logoDarkUrl")}
          organizationId={organizationId}
          value={draft.logoDarkUrl}
        />
        <MediaField
          hint="The big image or short video at the top of your club page."
          id="brand-hero"
          label="Club page photo or video"
          onChange={media("heroMediaUrl")}
          organizationId={organizationId}
          value={draft.heroMediaUrl}
          video
        />
        {isVideo(draft.heroMediaUrl) ? (
          <MediaField
            hint="Shown before the video plays."
            id="brand-poster"
            label="Video cover image"
            onChange={media("heroPosterUrl")}
            organizationId={organizationId}
            value={draft.heroPosterUrl}
          />
        ) : null}
        <div className="setup-brand-editor__choice">
          <span className="setup-brand__label" id="brand-layout">
            Club page layout
          </span>
          <Segmented
            aria-labelledby="brand-layout"
            onValueChange={(next) => {
              if (
                next === "editorial" ||
                next === "immersive" ||
                next === "compact"
              )
                set("profileLayout", next);
            }}
            options={[
              { value: "editorial", label: "Editorial" },
              { value: "immersive", label: "Immersive" },
              { value: "compact", label: "Compact" },
            ]}
            value={draft.profileLayout}
          />
        </div>
        <div className="setup-brand-editor__choice">
          <span className="setup-brand__label" id="brand-cards">
            Cards on your page
          </span>
          <Segmented
            aria-labelledby="brand-cards"
            onValueChange={(next) => {
              if (next === "soft" || next === "crisp" || next === "borderless")
                set("cardStyle", next);
            }}
            options={[
              { value: "soft", label: "Soft" },
              { value: "crisp", label: "Crisp" },
              { value: "borderless", label: "No border" },
            ]}
            value={draft.cardStyle}
          />
        </div>
        <Field
          hint="What your members call their membership, like Club Pass."
          label="Membership name"
          optional
        >
          <Input
            onChange={(event) =>
              set("membershipProgramName", event.currentTarget.value)
            }
            value={draft.membershipProgramName}
          />
        </Field>
        <Field
          hint="How Duna should sound when it writes for your club."
          label="Your club's voice"
          optional
        >
          <Textarea
            onChange={(event) => set("brandVoice", event.currentTarget.value)}
            rows={3}
            value={draft.brandVoice}
          />
        </Field>
        {problem ? (
          <p className="setup-editor__error" role="alert">
            {problem}
          </p>
        ) : null}
        <div className="setup-brand-editor__bar">
          <span className="setup-quiet" aria-live="polite">
            {dirty
              ? "Brand changes aren't saved yet."
              : theme.publishedAt
                ? "Your brand is published."
                : "Saved as a draft."}
          </span>
          <Button
            disabled={!dirty}
            loading={saveDraft.pending}
            type="submit"
            variant="secondary"
          >
            Save draft
          </Button>
          <Button
            disabled={confirm.open}
            onClick={publish}
            type="button"
            variant="primary"
          >
            Publish brand
          </Button>
        </div>
      </form>

      <div className="setup-brand-editor__preview" aria-label="Preview">
        <BrandPreview
          color={draft.primary}
          form={form}
          idPrefix="brand"
          logo={draft.logoUrl || null}
          name={club.name}
          onFormChange={setForm}
          tile={draft.markUrl || null}
        />
        <p className="setup-quiet">
          Preview each form here. Your club page shows your logo whenever you
          have one.
        </p>
        <div className="setup-brand__tiles">
          <Tideline
            className="setup-brand__tile"
            ground
            theme="light"
            zone="hq"
          >
            <span className="setup-brand__tile-label">Membership card</span>
            <MembershipCard
              club={club}
              kind="Club member"
              member="Member name"
              plan={draft.membershipProgramName || "Membership"}
              rise={false}
              status="active"
            />
          </Tideline>
          <Tideline className="setup-brand__tile" ground theme="dark" zone="hq">
            <span className="setup-brand__tile-label">Club page</span>
            <ClubLockup {...club} location={undefined} size="lg" />
          </Tideline>
        </div>
      </div>
    </div>
  );
}
