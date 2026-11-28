"use client";

import type { OperatorWorkspace } from "@duna/api";
import { normalizeClubColor } from "@duna/ui";
import { upload } from "@vercel/blob/client";
import {
  Archive,
  BookOpen,
  Check,
  CircleAlert,
  FileText,
  Globe2,
  ImageIcon,
  Link2,
  Palette,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Type,
  UploadCloud,
  WalletCards,
} from "lucide-react";
import {
  useActionState,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  addBrandKnowledgeSourceAction,
  archiveBrandKnowledgeSourceAction,
  issueOrganizationCreditsAction,
  refundOrganizationOrderAction,
  updateCommerceSettingsAction,
  updateThemeAction,
  type OperatorActionState,
} from "@/app/actions";
import {
  createBrandMediaPath,
  inferMediaKindFromUrl,
  optimizeImageUpload,
} from "@/lib/media-storage";
import { AddressEntry } from "./place-address-fields";

const initialState: OperatorActionState = { status: "idle", message: "" };

type BrandMediaTarget =
  | "logoUrl"
  | "markUrl"
  | "logoLightUrl"
  | "logoDarkUrl"
  | "heroMediaUrl"
  | "heroPosterUrl";

type BrandMediaUpload = {
  readonly status: "idle" | "uploading" | "ready" | "error";
  readonly message: string;
};

function ActionNotice({ state }: { readonly state: OperatorActionState }) {
  if (state.status === "idle") return null;
  return (
    <p
      className={`operator-action-notice operator-action-notice--${state.status}`}
      role={state.status === "error" ? "alert" : "status"}
    >
      {state.status === "success" ? (
        <Check aria-hidden size={15} />
      ) : (
        <CircleAlert aria-hidden size={15} />
      )}
      {state.message}
    </p>
  );
}

function SubmitButton({
  pending,
  children,
  secondary,
  disabled,
}: {
  readonly pending: boolean;
  readonly children: ReactNode;
  readonly secondary?: boolean;
  readonly disabled?: boolean;
}) {
  return (
    <button
      className={`hq-button ${
        secondary ? "hq-button--secondary" : "hq-button--primary"
      }`}
      disabled={pending || disabled}
      type="submit"
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function MoneyField({
  label,
  name,
  placeholder,
  value,
  onChange,
  helper,
  required,
}: {
  readonly label: string;
  readonly name: string;
  readonly placeholder?: string;
  readonly value?: string;
  readonly onChange?: (value: string) => void;
  readonly helper?: string;
  readonly required?: boolean;
}) {
  return (
    <label>
      <span>{label}</span>
      <span className="operator-money-input">
        <small>$</small>
        <input
          inputMode="decimal"
          min="0"
          name={name}
          onChange={
            onChange ? (event) => onChange(event.target.value) : undefined
          }
          placeholder={placeholder}
          required={required}
          step="0.01"
          type="number"
          value={value}
        />
      </span>
      {helper && <small className="operator-field-helper">{helper}</small>}
    </label>
  );
}

export function PeopleWalletControls({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    issueOrganizationCreditsAction,
    initialState,
  );
  return (
    <section className="hq-card operator-control-card credit-adjustment-card">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Organization wallet</span>
          <h2>Issue credits</h2>
          <p>
            Credits are usable only with {workspace.organization.name}. Every
            adjustment posts an equal debit and credit to the organization
            subledger.
          </p>
        </div>
        <WalletCards aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--two">
          <label>
            <span>Person</span>
            <select
              disabled={workspace.people.length === 0}
              name="personId"
              required
            >
              {workspace.people.map((person) => (
                <option key={person.personId} value={person.personId}>
                  {person.displayName} · {person.creditBalance} credits
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Credits</span>
            <input min="1" name="credits" required type="number" />
          </label>
          <label>
            <span>Expires · optional</span>
            <input name="expiresAt" type="datetime-local" />
          </label>
          <label>
            <span>Reason</span>
            <input
              name="reason"
              placeholder="Service recovery, refund, or manual adjustment"
              required
            />
          </label>
        </div>
        <label className="operator-confirmation">
          <input name="confirmed" required type="checkbox" value="true" />
          <span>
            <strong>Post this credit adjustment.</strong>
            This creates an auditable journal and cannot be silently edited.
          </span>
        </label>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton
            disabled={workspace.people.length === 0}
            pending={pending}
          >
            Issue credits
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}

export function PeopleRefundControls({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const purchases = workspace.people.flatMap((person) =>
    person.recentPurchases
      .filter((purchase) =>
        ["paid", "partially-refunded"].includes(purchase.status),
      )
      .map((purchase) => ({
        ...purchase,
        personName: person.displayName,
      })),
  );
  const [orderId, setOrderId] = useState(purchases[0]?.orderId ?? "");
  const [disposition, setDisposition] = useState<
    "original-payment" | "organization-credit"
  >("original-payment");
  const selected =
    purchases.find((purchase) => purchase.orderId === orderId) ?? purchases[0];
  const [state, action, pending] = useActionState(
    refundOrganizationOrderAction,
    initialState,
  );
  return (
    <section className="hq-card operator-control-card refund-composer">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Purchase care</span>
          <h2>Refund a purchase</h2>
          <p>
            Return funds through the original payment method or issue
            closed-loop organization credits. Duna records the corresponding
            reversal journal.
          </p>
        </div>
        <ReceiptText aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form" key={selected?.orderId}>
        <div className="operator-form-grid operator-form-grid--two">
          <label className="operator-field--wide">
            <span>Purchase</span>
            <select
              disabled={purchases.length === 0}
              name="orderId"
              onChange={(event) => setOrderId(event.target.value)}
              required
              value={selected?.orderId ?? ""}
            >
              {purchases.map((purchase) => (
                <option key={purchase.orderId} value={purchase.orderId}>
                  {purchase.personName} · {purchase.description} ·{" "}
                  {(purchase.amountMinor / 100).toLocaleString("en-US", {
                    style: "currency",
                    currency: purchase.currency,
                  })}
                </option>
              ))}
            </select>
          </label>
          <MoneyField
            label="Refund amount"
            name="amount"
            placeholder={
              selected ? (selected.amountMinor / 100).toFixed(2) : "0.00"
            }
          />
          <label>
            <span>Return as</span>
            <select
              name="disposition"
              onChange={(event) =>
                setDisposition(
                  event.target.value as
                    "original-payment" | "organization-credit",
                )
              }
              value={disposition}
            >
              <option value="original-payment">Original payment</option>
              <option value="organization-credit">Organization credits</option>
            </select>
          </label>
          {disposition === "organization-credit" && (
            <label>
              <span>Credits to issue</span>
              <input min="1" name="credits" required type="number" />
            </label>
          )}
          <label className="operator-field--wide">
            <span>Reason</span>
            <input
              minLength={5}
              name="reason"
              placeholder="Cancellation, service recovery, duplicate charge…"
              required
            />
          </label>
        </div>
        <label className="operator-confirmation">
          <input name="confirmed" required type="checkbox" value="true" />
          <span>
            <strong>Review and confirm this refund.</strong>
            Original-payment refunds move real money and cannot be undone from
            Duna.
          </span>
        </label>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton disabled={!selected} pending={pending}>
            Submit refund
          </SubmitButton>
        </div>
      </form>
      {purchases.length === 0 && (
        <p className="hq-empty">
          Paid organization purchases will appear here.
        </p>
      )}
    </section>
  );
}

function BrandKnowledgeSourceCard({
  source,
}: {
  readonly source: OperatorWorkspace["brandKnowledge"]["sources"][number];
}) {
  const [state, action, pending] = useActionState(
    archiveBrandKnowledgeSourceAction,
    initialState,
  );
  const sourceHref = source.sourceUrl ?? source.storageUrl;
  const updated = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(source.updatedAt));
  return (
    <article className="brand-knowledge-source">
      <div className="brand-knowledge-source__icon" aria-hidden>
        {source.kind === "link" ? (
          <Link2 size={18} />
        ) : source.kind === "document" ? (
          <FileText size={18} />
        ) : (
          <BookOpen size={18} />
        )}
      </div>
      <div className="brand-knowledge-source__copy">
        <div className="brand-knowledge-source__title">
          <strong>{source.title}</strong>
          <span
            className={`brand-knowledge-status brand-knowledge-status--${source.status}`}
          >
            {source.status}
          </span>
        </div>
        <p>{source.contentText}</p>
        <small>
          {source.scope} · {source.kind} · updated {updated}
        </small>
        {source.failureReason && (
          <span className="brand-knowledge-source__error">
            {source.failureReason}
          </span>
        )}
      </div>
      <div className="brand-knowledge-source__actions">
        {sourceHref && (
          <a
            aria-label={`Open ${source.title}`}
            href={sourceHref}
            rel="noreferrer"
            target="_blank"
          >
            <Globe2 aria-hidden size={17} />
          </a>
        )}
        {source.status !== "archived" && (
          <form action={action}>
            <input name="sourceId" type="hidden" value={source.id} />
            <input name="confirmed" type="hidden" value="true" />
            <button
              aria-label={`Archive ${source.title}`}
              disabled={pending}
              type="submit"
            >
              <Archive aria-hidden size={17} />
            </button>
          </form>
        )}
      </div>
      <ActionNotice state={state} />
    </article>
  );
}

export function ThemeKitEditor({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    updateThemeAction,
    initialState,
  );
  const [knowledgeState, knowledgeAction, knowledgePending] = useActionState(
    addBrandKnowledgeSourceAction,
    initialState,
  );
  const [brandDisplayName, setBrandDisplayName] = useState(
    workspace.theme.brandDisplayName ?? workspace.organization.name,
  );
  const [membershipProgramName, setMembershipProgramName] = useState(
    workspace.theme.membershipProgramName ?? "",
  );
  const [logoUrl, setLogoUrl] = useState(workspace.theme.logoUrl ?? "");
  const [markUrl, setMarkUrl] = useState(workspace.theme.markUrl ?? "");
  const [logoLightUrl, setLogoLightUrl] = useState(
    workspace.theme.logoLightUrl ?? "",
  );
  const [logoDarkUrl, setLogoDarkUrl] = useState(
    workspace.theme.logoDarkUrl ?? "",
  );
  const [heroMediaType, setHeroMediaType] = useState<"image" | "video">(
    workspace.theme.heroMediaType ?? "image",
  );
  const [heroMediaUrl, setHeroMediaUrl] = useState(
    workspace.theme.heroMediaUrl ?? "",
  );
  const [heroPosterUrl, setHeroPosterUrl] = useState(
    workspace.theme.heroPosterUrl ?? "",
  );
  const [tagline, setTagline] = useState(workspace.theme.tagline ?? "");
  const [profileSummary, setProfileSummary] = useState(
    workspace.theme.profileSummary ?? "",
  );
  const [brandVoice, setBrandVoice] = useState(
    workspace.theme.brandVoice ?? "",
  );
  const [submittedClubColor, setSubmittedClubColor] = useState(
    workspace.theme.palette.primary,
  );
  const headingFont = "Satoshi";
  const bodyFont = "Satoshi";
  const [cardStyle, setCardStyle] = useState(workspace.theme.cardStyle);
  const [profileLayout, setProfileLayout] = useState(
    workspace.theme.profileLayout === "immersive" ||
      workspace.theme.profileLayout === "compact"
      ? workspace.theme.profileLayout
      : "editorial",
  );
  const [knowledgeKind, setKnowledgeKind] = useState<
    "note" | "link" | "document"
  >("note");
  const [mediaUploads, setMediaUploads] = useState<
    Record<BrandMediaTarget, BrandMediaUpload>
  >({
    logoUrl: { status: "idle", message: "" },
    markUrl: { status: "idle", message: "" },
    logoLightUrl: { status: "idle", message: "" },
    logoDarkUrl: { status: "idle", message: "" },
    heroMediaUrl: { status: "idle", message: "" },
    heroPosterUrl: { status: "idle", message: "" },
  });
  const normalizedClubColor = useMemo(
    () => normalizeClubColor(submittedClubColor),
    [submittedClubColor],
  );
  const previewStyle = {
    "--theme-preview-primary": normalizedClubColor.core,
    "--theme-preview-accent": normalizedClubColor.edge,
    "--theme-preview-sand": normalizedClubColor.tint,
    "--theme-preview-ink": "#1B1B19",
    "--theme-preview-canvas": "#F6F5F1",
    "--theme-preview-success": "#2F6B3A",
    "--club-tint": normalizedClubColor.tint,
    "--club-edge": normalizedClubColor.edge,
    "--club-core": normalizedClubColor.core,
    "--club-ink": normalizedClubColor.ink,
    "--theme-preview-heading": `"${headingFont}", sans-serif`,
    "--theme-preview-body": `"${bodyFont}", sans-serif`,
  } as CSSProperties;
  const activeSources = workspace.brandKnowledge.sources.filter(
    (source) => source.status !== "archived",
  );

  function setMediaUpload(
    target: BrandMediaTarget,
    status: BrandMediaUpload["status"],
    message: string,
  ) {
    setMediaUploads((current) => ({
      ...current,
      [target]: { status, message },
    }));
  }

  function setBrandMediaValue(target: BrandMediaTarget, value: string) {
    if (target === "logoUrl") setLogoUrl(value);
    if (target === "markUrl") setMarkUrl(value);
    if (target === "logoLightUrl") setLogoLightUrl(value);
    if (target === "logoDarkUrl") setLogoDarkUrl(value);
    if (target === "heroMediaUrl") setHeroMediaUrl(value);
    if (target === "heroPosterUrl") setHeroPosterUrl(value);
  }

  function updateHeroMediaUrl(value: string) {
    setHeroMediaUrl(value);
    setHeroMediaType(inferMediaKindFromUrl(value) ?? "image");
    setMediaUpload("heroMediaUrl", "idle", "");
  }

  async function uploadBrandMedia(
    file: File | undefined,
    target: BrandMediaTarget,
  ) {
    if (!file) return;
    if (target !== "heroMediaUrl" && !file.type.startsWith("image/")) {
      setMediaUpload(
        target,
        "error",
        target === "heroPosterUrl"
          ? "Choose an image for the video poster."
          : "Choose an image for this logo.",
      );
      return;
    }
    setMediaUpload(target, "uploading", "Preparing your file…");
    try {
      const prepared = file.type.startsWith("image/")
        ? await optimizeImageUpload(file)
        : file;
      const stored = await upload(
        createBrandMediaPath(workspace.organization.id, prepared.type),
        prepared,
        {
          access: "public",
          clientPayload: JSON.stringify({
            organizationId: workspace.organization.id,
            fileName: prepared.name,
            contentType: prepared.type,
            size: prepared.size,
            purpose: "brand",
          }),
          contentType: prepared.type,
          handleUploadUrl: "/api/media/upload",
          onUploadProgress: ({ percentage }) => {
            setMediaUpload(
              target,
              "uploading",
              `Uploading… ${Math.round(percentage)}%`,
            );
          },
        },
      );
      if (!stored.url) {
        throw new Error("Duna storage did not return a media URL.");
      }
      setBrandMediaValue(target, stored.url);
      if (target === "heroMediaUrl") {
        setHeroMediaType(
          prepared.type.startsWith("video/") ? "video" : "image",
        );
      }
      setMediaUpload(target, "ready", "Uploaded. Save to apply it.");
    } catch (error) {
      setMediaUpload(
        target,
        "error",
        error instanceof Error ? error.message : "The upload could not finish.",
      );
    }
  }

  const mediaUploadPending = Object.values(mediaUploads).some(
    (item) => item.status === "uploading",
  );

  return (
    <section
      className="hq-card operator-control-card theme-kit-editor"
      id="theme-kit"
    >
      <header className="theme-kit-identity-header">
        <div>
          <span className="hq-eyebrow">Brand Theme Kit</span>
          <h2>One source for every branded surface.</h2>
          <p>
            Profiles, offers, messages, event posters, and Duna AI previews
            resolve this same saved identity.
          </p>
        </div>
        <span className="theme-kit-canonical">
          <ShieldCheck aria-hidden size={17} />
          Canonical identity
        </span>
      </header>

      <form action={action} className="operator-form theme-kit-form">
        <div className="theme-kit-workspace">
          <div className="theme-kit-settings">
            <section className="theme-kit-section">
              <header className="theme-kit-section__heading">
                <ShieldCheck aria-hidden size={20} />
                <div>
                  <span>Identity foundation</span>
                  <strong>Name it once. Carry its voice everywhere.</strong>
                </div>
              </header>
              <div className="operator-form-grid operator-form-grid--two">
                <label>
                  <span>Brand display name</span>
                  <input
                    maxLength={120}
                    name="brandDisplayName"
                    onChange={(event) =>
                      setBrandDisplayName(event.target.value)
                    }
                    value={brandDisplayName}
                  />
                </label>
                <label>
                  <span>Membership program name</span>
                  <input
                    maxLength={120}
                    name="membershipProgramName"
                    onChange={(event) =>
                      setMembershipProgramName(event.target.value)
                    }
                    placeholder={`${brandDisplayName || "Your brand"} Members`}
                    value={membershipProgramName}
                  />
                </label>
                <label className="operator-field--wide">
                  <span>Tagline</span>
                  <input
                    maxLength={180}
                    name="tagline"
                    onChange={(event) => setTagline(event.target.value)}
                    placeholder="Where the next point begins."
                    value={tagline}
                  />
                </label>
                <label className="operator-field--wide">
                  <span>Profile summary</span>
                  <textarea
                    maxLength={2000}
                    name="profileSummary"
                    onChange={(event) => setProfileSummary(event.target.value)}
                    placeholder="What should players and parents understand first?"
                    rows={4}
                    value={profileSummary}
                  />
                </label>
                <label className="operator-field--wide">
                  <span>Brand voice</span>
                  <textarea
                    maxLength={4000}
                    name="brandVoice"
                    onChange={(event) => setBrandVoice(event.target.value)}
                    placeholder="Describe how your organization sounds. Include words to use, words to avoid, and an example welcome message."
                    rows={5}
                    value={brandVoice}
                  />
                  <small>
                    Used as guidance for drafts. Every outbound message remains
                    reviewable before it is sent.
                  </small>
                </label>
              </div>
            </section>

            <section className="theme-kit-section">
              <header className="theme-kit-section__heading">
                <Palette aria-hidden size={20} />
                <div>
                  <span>Color system</span>
                  <strong>One club color, tuned for every surface.</strong>
                </div>
              </header>
              <div className="theme-color-system theme-color-system--normalized">
                <label className="theme-color-field theme-color-field--source">
                  <input
                    aria-label="Club color"
                    name="submittedClubColor"
                    onChange={(event) =>
                      setSubmittedClubColor(event.target.value)
                    }
                    type="color"
                    value={submittedClubColor}
                  />
                  <span>
                    <strong>Club color</strong>
                    <code>{submittedClubColor.toUpperCase()}</code>
                  </span>
                </label>
                <div
                  aria-label="Normalized club color tones"
                  className="theme-color-system__swatches"
                >
                  {[
                    ["Tint", normalizedClubColor.tint],
                    ["Edge", normalizedClubColor.edge],
                    ["Core", normalizedClubColor.core],
                    ["Ink", normalizedClubColor.ink],
                  ].map(([label, color]) => (
                    <span key={label}>
                      <i style={{ backgroundColor: color }} />
                      <small>{label}</small>
                      <code>{color}</code>
                    </span>
                  ))}
                </div>
                <p>
                  Duna tunes your color so it stays readable across the product.
                  Your hue is preserved.
                </p>
                {normalizedClubColor.conflictsWithFlare && (
                  <p className="operator-action-notice operator-action-notice--error">
                    <CircleAlert aria-hidden size={15} />
                    Choose a color farther from Duna live coral so status
                    remains unmistakable.
                  </p>
                )}
              </div>
            </section>

            <section className="theme-kit-section">
              <header className="theme-kit-section__heading">
                <ImageIcon aria-hidden size={20} />
                <div>
                  <span>Adaptive identity assets</span>
                  <strong>
                    Correct marks for light, dark, and compact use.
                  </strong>
                </div>
              </header>
              <div className="theme-asset-grid">
                {[
                  {
                    label: "Primary logo",
                    name: "logoUrl",
                    target: "logoUrl" as const,
                    value: logoUrl,
                    setter: setLogoUrl,
                    className: "theme-asset--light",
                  },
                  {
                    label: "Compact mark",
                    name: "markUrl",
                    target: "markUrl" as const,
                    value: markUrl,
                    setter: setMarkUrl,
                    className: "theme-asset--light",
                  },
                  {
                    label: "Light-surface logo",
                    name: "logoLightUrl",
                    target: "logoLightUrl" as const,
                    value: logoLightUrl,
                    setter: setLogoLightUrl,
                    className: "theme-asset--light",
                  },
                  {
                    label: "Dark-surface logo",
                    name: "logoDarkUrl",
                    target: "logoDarkUrl" as const,
                    value: logoDarkUrl,
                    setter: setLogoDarkUrl,
                    className: "theme-asset--dark",
                  },
                ].map((asset) => (
                  <div
                    className={`theme-asset ${asset.className}`}
                    key={asset.name}
                  >
                    <span
                      className="theme-asset__preview"
                      style={
                        asset.value
                          ? { backgroundImage: `url("${asset.value}")` }
                          : undefined
                      }
                    >
                      {!asset.value && brandDisplayName.slice(0, 2)}
                    </span>
                    <strong>{asset.label}</strong>
                    <small>Transparent PNG, WebP, AVIF, or JPEG</small>
                    <label className="theme-asset__upload">
                      <input
                        accept="image/avif,image/jpeg,image/png,image/webp"
                        disabled={
                          mediaUploads[asset.target].status === "uploading"
                        }
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          event.currentTarget.value = "";
                          void uploadBrandMedia(file, asset.target);
                        }}
                        type="file"
                      />
                      <span>
                        <UploadCloud aria-hidden size={15} />
                        {mediaUploads[asset.target].status === "uploading"
                          ? "Uploading…"
                          : asset.value
                            ? "Replace image"
                            : "Upload image"}
                      </span>
                    </label>
                    <details className="theme-asset__url">
                      <summary>Use a hosted URL instead</summary>
                      <input
                        aria-label={`${asset.label} URL`}
                        name={asset.name}
                        onChange={(event) => asset.setter(event.target.value)}
                        placeholder="https://…"
                        type="url"
                        value={asset.value}
                      />
                    </details>
                    {mediaUploads[asset.target].message && (
                      <span
                        aria-live="polite"
                        className={`theme-media-status theme-media-status--${mediaUploads[asset.target].status}`}
                      >
                        {mediaUploads[asset.target].message}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="theme-kit-section">
              <header className="theme-kit-section__heading">
                <ImageIcon aria-hidden size={20} />
                <div>
                  <span>Hero media</span>
                  <strong>
                    Set the atmosphere without hiding the utility.
                  </strong>
                </div>
              </header>
              <label className="theme-hero-upload">
                <span
                  className="theme-hero-upload__preview"
                  style={
                    heroMediaType === "image" && heroMediaUrl
                      ? { backgroundImage: `url("${heroMediaUrl}")` }
                      : heroMediaType === "video" && heroPosterUrl
                        ? { backgroundImage: `url("${heroPosterUrl}")` }
                        : undefined
                  }
                >
                  {heroMediaType === "video" && heroMediaUrl ? (
                    <span>Video ready</span>
                  ) : !heroMediaUrl ? (
                    <ImageIcon aria-hidden size={24} />
                  ) : null}
                </span>
                <span className="theme-hero-upload__copy">
                  <strong>
                    {mediaUploads.heroMediaUrl.status === "uploading"
                      ? mediaUploads.heroMediaUrl.message
                      : heroMediaUrl
                        ? "Replace hero media"
                        : "Upload a hero image or video"}
                  </strong>
                  <small>
                    Duna optimizes images. Videos upload directly and may take a
                    moment.
                  </small>
                </span>
                <span className="theme-hero-upload__button">
                  <UploadCloud aria-hidden size={16} /> Choose file
                </span>
                <input
                  accept="image/avif,image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                  disabled={mediaUploads.heroMediaUrl.status === "uploading"}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    void uploadBrandMedia(file, "heroMediaUrl");
                  }}
                  type="file"
                />
              </label>
              {mediaUploads.heroMediaUrl.message &&
                mediaUploads.heroMediaUrl.status !== "uploading" && (
                  <span
                    aria-live="polite"
                    className={`theme-media-status theme-media-status--${mediaUploads.heroMediaUrl.status}`}
                  >
                    {mediaUploads.heroMediaUrl.message}
                  </span>
                )}
              <div className="operator-form-grid operator-form-grid--two">
                <input
                  name="heroMediaType"
                  type="hidden"
                  value={heroMediaType}
                />
                <label>
                  <span>Layout</span>
                  <select
                    name="profileLayout"
                    onChange={(event) =>
                      setProfileLayout(
                        event.target.value === "immersive" ||
                          event.target.value === "compact"
                          ? event.target.value
                          : "editorial",
                      )
                    }
                    value={profileLayout}
                  >
                    <option value="editorial">Editorial</option>
                    <option value="immersive">Immersive hero</option>
                    <option value="compact">Compact utility</option>
                  </select>
                </label>
                <label className="operator-field--wide">
                  <span>Hosted image or video URL · optional</span>
                  <input
                    name="heroMediaUrl"
                    onChange={(event) => updateHeroMediaUrl(event.target.value)}
                    placeholder="https://…"
                    type="url"
                    value={heroMediaUrl}
                  />
                  <small className="theme-media-detection">
                    {heroMediaUrl
                      ? `${heroMediaType === "video" ? "Video" : "Image"} detected automatically from the uploaded file or hosted URL.`
                      : "Image or video type is detected automatically after upload or when you add a hosted URL."}
                  </small>
                </label>
                <div className="operator-field--wide theme-poster-field">
                  <span
                    className="theme-poster-field__preview"
                    style={
                      heroPosterUrl
                        ? { backgroundImage: `url("${heroPosterUrl}")` }
                        : undefined
                    }
                  >
                    {!heroPosterUrl && <ImageIcon aria-hidden size={20} />}
                  </span>
                  <span className="theme-poster-field__copy">
                    <strong>Video poster image · optional</strong>
                    <small>Shown while a video loads or cannot autoplay.</small>
                  </span>
                  <label className="theme-asset__upload">
                    <input
                      accept="image/avif,image/jpeg,image/png,image/webp"
                      disabled={
                        mediaUploads.heroPosterUrl.status === "uploading"
                      }
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        void uploadBrandMedia(file, "heroPosterUrl");
                      }}
                      type="file"
                    />
                    <span>
                      <UploadCloud aria-hidden size={15} />
                      {mediaUploads.heroPosterUrl.status === "uploading"
                        ? "Uploading…"
                        : heroPosterUrl
                          ? "Replace image"
                          : "Upload image"}
                    </span>
                  </label>
                  <details className="theme-asset__url">
                    <summary>Use a hosted URL instead</summary>
                    <input
                      aria-label="Video poster image URL"
                      onChange={(event) => {
                        setHeroPosterUrl(event.target.value);
                        setMediaUpload("heroPosterUrl", "idle", "");
                      }}
                      placeholder="https://…"
                      type="url"
                      value={heroPosterUrl}
                    />
                  </details>
                  <input
                    name="heroPosterUrl"
                    type="hidden"
                    value={heroPosterUrl}
                  />
                  {mediaUploads.heroPosterUrl.message && (
                    <span
                      aria-live="polite"
                      className={`theme-media-status theme-media-status--${mediaUploads.heroPosterUrl.status}`}
                    >
                      {mediaUploads.heroPosterUrl.message}
                    </span>
                  )}
                </div>
              </div>
            </section>

            <section className="theme-kit-section">
              <header className="theme-kit-section__heading">
                <Type aria-hidden size={20} />
                <div>
                  <span>Type & licensing</span>
                  <strong>Brand type, with resilient fallbacks.</strong>
                </div>
              </header>
              <div className="operator-form-grid operator-form-grid--two">
                <input name="headingFont" type="hidden" value="Satoshi" />
                <input name="bodyFont" type="hidden" value="Satoshi" />
                <div className="operator-field--wide theme-kit-type-lock">
                  <span>Typography system</span>
                  <strong>Satoshi throughout the Duna product.</strong>
                  <p>
                    Duna keeps type consistent and licensed across club pages.
                    Your submitted color, imagery, mark, and voice carry the
                    club identity.
                  </p>
                </div>
                <label>
                  <span>Card style</span>
                  <select
                    name="cardStyle"
                    onChange={(event) =>
                      setCardStyle(
                        event.target.value === "crisp" ||
                          event.target.value === "borderless"
                          ? event.target.value
                          : "soft",
                      )
                    }
                    value={cardStyle}
                  >
                    <option value="soft">Soft</option>
                    <option value="crisp">Crisp</option>
                    <option value="borderless">Borderless</option>
                  </select>
                </label>
                <input
                  name="safeFallbackFont"
                  type="hidden"
                  value="Satoshi, sans-serif"
                />
              </div>
              <input name="fontLicenseConfirmed" type="hidden" value="true" />
            </section>
          </div>

          <aside
            className={`theme-kit-preview theme-kit-preview--${profileLayout} theme-kit-preview--${cardStyle}`}
            style={previewStyle}
          >
            <span className="hq-eyebrow">Live member preview</span>
            <div className="theme-kit-preview__frame">
              <div
                className="theme-kit-preview__hero"
                style={
                  heroMediaType === "image" && heroMediaUrl
                    ? { backgroundImage: `url("${heroMediaUrl}")` }
                    : heroMediaType === "video" && heroPosterUrl
                      ? { backgroundImage: `url("${heroPosterUrl}")` }
                      : undefined
                }
              >
                {heroMediaType === "video" && heroMediaUrl && (
                  <video
                    autoPlay
                    loop
                    muted
                    playsInline
                    poster={heroPosterUrl || undefined}
                    src={heroMediaUrl}
                  />
                )}
                {logoLightUrl || logoUrl ? (
                  <span
                    aria-label={`${brandDisplayName} logo`}
                    className="theme-kit-preview__logo"
                    role="img"
                    style={{
                      backgroundImage: `url("${logoLightUrl || logoUrl}")`,
                    }}
                  />
                ) : (
                  <span>{brandDisplayName.slice(0, 2)}</span>
                )}
              </div>
              <div className="theme-kit-preview__copy">
                <small>{brandDisplayName}</small>
                <h3>{tagline || "Make every session count."}</h3>
                <p>
                  {profileSummary ||
                    "A clear, welcoming home for your community, schedule, and offers."}
                </p>
              </div>
              <div className="theme-kit-preview__cards">
                <article>
                  <small>Next up</small>
                  <strong>Community open play</strong>
                  <span>8 spots · 6:00 PM</span>
                </article>
                <article>
                  <small>{membershipProgramName || "For members"}</small>
                  <strong>Book with one tap</strong>
                  <span>Credits and access apply automatically</span>
                </article>
              </div>
              <button type="button">Explore the schedule</button>
            </div>
            <div className="theme-kit-preview__voice">
              <Sparkles aria-hidden size={17} />
              <div>
                <small>Voice sample</small>
                <p>
                  {brandVoice ||
                    "Welcome back. We found a few sessions that fit the way you like to play."}
                </p>
              </div>
            </div>
          </aside>
        </div>

        <label className="operator-switch">
          <input
            defaultChecked={Boolean(workspace.theme.publishedAt)}
            name="publish"
            type="checkbox"
            value="true"
          />
          <span>
            <strong>Apply this identity to player-facing surfaces</strong>
            Leave off while the first Theme Kit is still being prepared.
          </span>
        </label>
        <label className="operator-confirmation">
          <input name="confirmed" required type="checkbox" value="true" />
          <span>
            <strong>I reviewed the identity and live preview.</strong>
            Saved changes become the canonical source for supported surfaces.
          </span>
        </label>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton
            disabled={
              normalizedClubColor.conflictsWithFlare || mediaUploadPending
            }
            pending={pending}
          >
            Save canonical Theme Kit
          </SubmitButton>
        </div>
      </form>

      <section className="brand-knowledge">
        <header className="brand-knowledge__header">
          <div>
            <span className="hq-eyebrow">Brand Knowledge</span>
            <h3>Teach Duna how your business works.</h3>
            <p>
              Approve the voice, services, policies, venues, and operating
              context Duna should use when drafting and recommending.
            </p>
          </div>
          <div className="brand-knowledge__metrics">
            <span>
              <strong>{workspace.brandKnowledge.activeSourceCount}</strong>
              active sources
            </span>
            <span>
              <strong>
                {workspace.brandKnowledge.contextRevision.slice(0, 8)}
              </strong>
              context revision
            </span>
          </div>
        </header>

        <div className="brand-knowledge__workspace">
          <form
            action={knowledgeAction}
            className="brand-knowledge-composer operator-form"
          >
            <div className="brand-knowledge-composer__heading">
              <Sparkles aria-hidden size={20} />
              <div>
                <strong>Add approved knowledge</strong>
                <span>
                  Nothing joins Duna AI context until an operator confirms it.
                </span>
              </div>
            </div>
            <fieldset className="brand-knowledge-choice-grid">
              <legend>Source type</legend>
              {[
                {
                  value: "note",
                  label: "Knowledge note",
                  help: "A direct fact, rule, or brand instruction",
                  icon: BookOpen,
                },
                {
                  value: "link",
                  label: "Approved link",
                  help: "A public page plus your approved summary",
                  icon: Link2,
                },
                {
                  value: "document",
                  label: "Document",
                  help: "A private file reference plus approved summary",
                  icon: FileText,
                },
              ].map((option) => {
                const Icon = option.icon;
                return (
                  <label
                    className={
                      knowledgeKind === option.value ? "is-selected" : ""
                    }
                    key={option.value}
                  >
                    <input
                      checked={knowledgeKind === option.value}
                      name="kind"
                      onChange={() =>
                        setKnowledgeKind(
                          option.value as "note" | "link" | "document",
                        )
                      }
                      type="radio"
                      value={option.value}
                    />
                    <Icon aria-hidden size={19} />
                    <strong>{option.label}</strong>
                    <small>{option.help}</small>
                  </label>
                );
              })}
            </fieldset>
            <div className="operator-form-grid operator-form-grid--two">
              <label>
                <span>Knowledge scope</span>
                <select defaultValue="brand" name="scope">
                  <option value="brand">Brand-wide</option>
                  <option value="organization">Organization operations</option>
                  <option value="venue">Venue-specific</option>
                  <option value="service">Service-specific</option>
                  <option value="product">Product-specific</option>
                </select>
              </label>
              <label>
                <span>Source title</span>
                <input
                  maxLength={160}
                  name="title"
                  placeholder="Youth clinic voice & expectations"
                  required
                />
              </label>
              {knowledgeKind === "link" && (
                <label className="operator-field--wide">
                  <span>Public source URL</span>
                  <input name="sourceUrl" required type="url" />
                </label>
              )}
              {knowledgeKind === "document" && (
                <>
                  <label>
                    <span>Secure document URL</span>
                    <input name="storageUrl" required type="url" />
                  </label>
                  <label>
                    <span>File name</span>
                    <input
                      name="originalFilename"
                      placeholder="club-handbook.pdf"
                      required
                    />
                  </label>
                  <label className="operator-field--wide">
                    <span>File type</span>
                    <input name="mimeType" placeholder="application/pdf" />
                  </label>
                </>
              )}
              <label className="operator-field--wide">
                <span>Approved knowledge</span>
                <textarea
                  maxLength={100000}
                  minLength={20}
                  name="contentText"
                  placeholder={
                    knowledgeKind === "note"
                      ? "State the fact, policy, preference, or voice instruction Duna should use."
                      : "Summarize exactly what Duna is approved to learn and use from this source."
                  }
                  required
                  rows={6}
                />
                <small>
                  Be explicit. Duna uses this text as the approved context and
                  retains the source for traceability.
                </small>
              </label>
            </div>
            <label className="operator-confirmation">
              <input name="confirmed" required type="checkbox" value="true" />
              <span>
                <strong>I approve this source for Duna AI.</strong>
                It may inform drafts and recommendations, but never bypasses
                product, safety, legal, access, pricing, or payment controls.
              </span>
            </label>
            <div className="operator-form-footer">
              <ActionNotice state={knowledgeState} />
              <SubmitButton pending={knowledgePending}>
                Approve and add source
              </SubmitButton>
            </div>
          </form>

          <aside className="brand-knowledge-context">
            <div className="brand-knowledge-context__heading">
              <ShieldCheck aria-hidden size={22} />
              <div>
                <span className="hq-eyebrow">Effective AI context</span>
                <strong>Grounded, scoped, and reviewable.</strong>
              </div>
            </div>
            <div className="brand-knowledge-context__preview">
              <small>What Duna currently knows</small>
              {workspace.brandKnowledge.contextPreview.length > 0 ? (
                <ul>
                  {workspace.brandKnowledge.contextPreview.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p>
                  Add the first approved source to create this organization’s
                  grounded brand context.
                </p>
              )}
            </div>
            <div className="brand-knowledge-context__rules">
              <small>Always authoritative</small>
              <ul>
                {workspace.brandKnowledge.safetyRules.map((rule) => (
                  <li key={rule}>
                    <ShieldCheck aria-hidden size={15} />
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>

        <div className="brand-knowledge-library">
          <div className="brand-knowledge-library__heading">
            <div>
              <span className="hq-eyebrow">Source library</span>
              <h4>
                {activeSources.length === 0
                  ? "No approved sources yet."
                  : `${activeSources.length} approved ${
                      activeSources.length === 1 ? "source" : "sources"
                    }`}
              </h4>
            </div>
            <span>
              Archived sources stay in the audit trail and leave active AI
              context immediately.
            </span>
          </div>
          {workspace.brandKnowledge.sources.length > 0 ? (
            <div className="brand-knowledge-source-list">
              {workspace.brandKnowledge.sources.map((source) => (
                <BrandKnowledgeSourceCard key={source.id} source={source} />
              ))}
            </div>
          ) : (
            <div className="brand-knowledge-empty">
              <BookOpen aria-hidden size={22} />
              <div>
                <strong>Start with the facts your team repeats most.</strong>
                <span>
                  Voice guidance, service descriptions, venue details, and
                  approved FAQs are good first sources.
                </span>
              </div>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}

function TaxSettingsEditor({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  const [state, action, pending] = useActionState(
    updateCommerceSettingsAction,
    initialState,
  );
  return (
    <section className="hq-card operator-control-card" id="tax">
      <header className="hq-card-heading">
        <div>
          <span className="hq-eyebrow">Business + tax location</span>
          <h2>Organization address</h2>
          <p>
            Duna uses this as the fallback taxable location. In-person sales use
            the venue address, and shipped goods use the delivery address.
          </p>
        </div>
        <ShieldCheck aria-hidden size={24} />
      </header>
      <form action={action} className="operator-form">
        <div className="operator-form-grid operator-form-grid--two">
          <label className="operator-field--wide">
            <span>Legal business name</span>
            <input
              defaultValue={workspace.organization.legalName}
              name="legalName"
            />
          </label>
          <AddressEntry
            initial={{
              googlePlaceId: workspace.organization.googlePlaceId,
              addressLine1: workspace.organization.addressLine1,
              addressLine2: workspace.organization.addressLine2,
              locality: workspace.organization.locality,
              administrativeArea: workspace.organization.administrativeArea,
              postalCode: workspace.organization.postalCode,
              countryCode: workspace.organization.countryCode,
              latitude: workspace.organization.latitude,
              longitude: workspace.organization.longitude,
            }}
            label="Business address"
            required
          />
        </div>
        <label className="operator-switch">
          <input
            defaultChecked={workspace.organization.stripeTaxEnabled}
            name="stripeTaxEnabled"
            type="checkbox"
            value="true"
          />
          <span>
            <strong>Calculate eligible tax automatically</strong>
            Requires completed payment onboarding and appropriate tax
            registrations.
          </span>
        </label>
        <label className="operator-confirmation">
          <input name="confirmed" required type="checkbox" value="true" />
          <span>
            <strong>I checked the legal address.</strong>
            Duna will not register the business for taxes or make legal
            attestations on its behalf.
          </span>
        </label>
        <div className="operator-form-footer">
          <ActionNotice state={state} />
          <SubmitButton pending={pending}>Save business settings</SubmitButton>
        </div>
      </form>
    </section>
  );
}

export function CommerceSettingsControls({
  workspace,
}: {
  readonly workspace: OperatorWorkspace;
}) {
  return (
    <div className="operator-controls-grid">
      <ThemeKitEditor workspace={workspace} />
      <TaxSettingsEditor workspace={workspace} />
    </div>
  );
}
