"use client";

import type { WaiverWorkspace } from "@duna/api";
import {
  parseMarkdown,
  type MarkdownInline,
} from "@duna/core";
import { Badge } from "@duna/ui";
import {
  Check,
  CircleAlert,
  Eye,
  FileText,
  FileUp,
  LockKeyhole,
  Monitor,
  Plus,
  ShieldCheck,
  Smartphone,
  X,
} from "lucide-react";
import { type ReactNode, useActionState, useMemo, useState } from "react";
import { createWaiverAction, type OperatorActionState } from "@/app/actions";

const initialState: OperatorActionState = { status: "idle", message: "" };

type SectionDraft = {
  readonly id: string;
  readonly title: string;
  readonly markdown: string;
  readonly acknowledgementRequired: boolean;
};

type LibraryWaiver = WaiverWorkspace["documents"][number];

function sectionId(value: string, index: number, usedIds: ReadonlySet<string>) {
  const base =
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 70) || `section-${index + 1}`;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) {
    const suffixText = `-${suffix}`;
    id = `${base.slice(0, 80 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }
  return id;
}

function PreviewInlineMarkdown({
  nodes,
  keyPrefix,
}: {
  readonly nodes: readonly MarkdownInline[];
  readonly keyPrefix: string;
}): ReactNode[] {
  return (
    nodes.map((node, index) => {
      const key = `${keyPrefix}-${index}`;
      if (node.type === "text") return node.value;
      if (node.type === "code") return <code key={key}>{node.value}</code>;
      if (node.type === "strong") {
        return (
          <strong key={key}>
            <PreviewInlineMarkdown keyPrefix={key} nodes={node.children} />
          </strong>
        );
      }
      if (node.type === "emphasis") {
        return (
          <em key={key}>
            <PreviewInlineMarkdown keyPrefix={key} nodes={node.children} />
          </em>
        );
      }
      return (
        <a href={node.href} key={key} rel="noreferrer" target="_blank">
          <PreviewInlineMarkdown keyPrefix={key} nodes={node.children} />
        </a>
      );
    })
  );
}

function WaiverTextPreview({ markdown }: { readonly markdown: string }) {
  return (
    <div className="waiver-signing-preview__document-copy">
      {parseMarkdown(markdown).map((block, index) => {
        const key = `preview-block-${index}`;
        if (block.type === "heading") {
          const content = (
            <PreviewInlineMarkdown keyPrefix={key} nodes={block.children} />
          );
          if (block.level === 1) return <h2 key={key}>{content}</h2>;
          return <h3 key={key}>{content}</h3>;
        }
        if (block.type === "list") {
          const items = block.items.map((item, itemIndex) => (
            <li key={`${key}-${itemIndex}`}>
              <PreviewInlineMarkdown
                keyPrefix={`${key}-${itemIndex}`}
                nodes={item}
              />
            </li>
          ));
          return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
        }
        if (block.type === "quote") {
          return (
            <blockquote key={key}>
              <PreviewInlineMarkdown keyPrefix={key} nodes={block.children} />
            </blockquote>
          );
        }
        if (block.type === "rule") return <hr key={key} />;
        return (
          <p key={key}>
            <PreviewInlineMarkdown keyPrefix={key} nodes={block.children} />
          </p>
        );
      })}
    </div>
  );
}

function WaiverSigningPreview({
  waiver,
  onClose,
}: {
  readonly waiver: LibraryWaiver;
  readonly onClose: () => void;
}) {
  const [reviewed, setReviewed] = useState(false);
  const requiredSections = waiver.keySections.filter(
    (section) => section.acknowledgementRequired,
  );
  const acknowledgementSummary = requiredSections.length
    ? `${requiredSections.length} specific acknowledgement${
        requiredSections.length === 1 ? "" : "s"
      } required`
    : "No separate section acknowledgements";

  return (
    <section className="hq-card waiver-signing-preview" aria-label="Waiver signing preview">
      <header className="waiver-signing-preview__header">
        <div>
          <span className="hq-eyebrow">Signer experience</span>
          <h3>Preview the required signing flow</h3>
          <p>
            This uses the saved document and signing rules. It is a safe preview
            only—no signature or record is created here.
          </p>
        </div>
        <button
          aria-label="Close signing preview"
          className="waiver-signing-preview__close"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden size={17} />
        </button>
      </header>
      <div className="waiver-signing-preview__toolbar">
        <span>
          <ShieldCheck aria-hidden size={16} /> {acknowledgementSummary}
        </span>
        <button
          className="hq-button hq-button--secondary"
          onClick={() => setReviewed((value) => !value)}
          type="button"
        >
          {reviewed ? "Preview locked state" : "Preview after reading"}
        </button>
      </div>
      <div className="waiver-signing-preview__surfaces">
        <article className="waiver-signing-preview__surface waiver-signing-preview__surface--web">
          <header>
            <span><Monitor aria-hidden size={15} /> Duna web</span>
            <small>Checkout requirement</small>
          </header>
          <div className="waiver-signing-preview__web-frame">
            <div className="waiver-signing-preview__web-topbar">
              <span>Duna</span>
              <small>Secure checkout</small>
            </div>
            <div className="waiver-signing-preview__web-panel">
              <div className="waiver-signing-preview__panel-heading">
                <ShieldCheck aria-hidden size={20} />
                <div>
                  <span>REQUIRED BEFORE CHECKOUT</span>
                  <h4>Review and sign the waiver</h4>
                  <p>
                    The complete document is shown below and this version is
                    retained with the signature.
                  </p>
                </div>
              </div>
              <div className="waiver-signing-preview__reader">
                <WaiverTextPreview markdown={waiver.markdown ?? ""} />
              </div>
              <p className="waiver-signing-preview__status">
                {reviewed
                  ? "Full document reviewed. You can now acknowledge and sign."
                  : "Scroll to the end of the full waiver to unlock acknowledgement."}
              </p>
              <div className="waiver-signing-preview__checks">
                {requiredSections.map((section) => (
                  <label key={section.id}>
                    <input disabled={!reviewed} type="checkbox" />
                    I specifically acknowledge: {section.title}
                  </label>
                ))}
                <label>
                  <input disabled={!reviewed} type="checkbox" />
                  I have reviewed the full waiver and affirmatively agree to it.
                </label>
              </div>
              {waiver.requiresSignature && (
                <label className="waiver-signing-preview__name">
                  Type your full legal name to sign
                  <input disabled={!reviewed} placeholder="Full legal name" />
                </label>
              )}
              <button disabled type="button">
                {waiver.requiresSignature ? "Sign waiver" : "Record acknowledgement"}
              </button>
            </div>
          </div>
        </article>
        <article className="waiver-signing-preview__surface waiver-signing-preview__surface--app">
          <header>
            <span><Smartphone aria-hidden size={15} /> Duna Player app</span>
            <small>Mobile sheet</small>
          </header>
          <div className="waiver-signing-preview__phone">
            <div className="waiver-signing-preview__phone-notch" />
            <div className="waiver-signing-preview__app-header">
              <div>
                <span>REQUIRED WAIVER</span>
                <h4>{waiver.title}</h4>
              </div>
              <X aria-hidden size={16} />
            </div>
            <div className="waiver-signing-preview__app-body">
              <p className="waiver-signing-preview__app-intro">
                Review the complete waiver below. Duna unlocks the acknowledgement controls after you reach the end.
              </p>
              <div className="waiver-signing-preview__app-reader">
                <WaiverTextPreview markdown={waiver.markdown ?? ""} />
              </div>
              <p className="waiver-signing-preview__status">
                {reviewed
                  ? "Full document reviewed. You can now acknowledge and sign."
                  : "Scroll to the bottom to continue."}
              </p>
              <div className="waiver-signing-preview__app-checks">
                {requiredSections.slice(0, 2).map((section) => (
                  <p key={section.id}>
                    <i aria-hidden /> I specifically acknowledge: {section.title}
                  </p>
                ))}
                <p><i aria-hidden /> I have reviewed the full waiver and affirmatively agree to it.</p>
              </div>
              {waiver.requiresSignature && (
                <div className="waiver-signing-preview__app-name">
                  <span>Type your full legal name to sign</span>
                  <em>Full legal name</em>
                </div>
              )}
              <button disabled type="button">
                {waiver.requiresSignature ? "Sign waiver" : "Record acknowledgement"}
              </button>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

export function WaiverLibrary({
  waivers,
}: {
  readonly waivers: WaiverWorkspace;
}) {
  const [state, action, pending] = useActionState(
    createWaiverAction,
    initialState,
  );
  const [creating, setCreating] = useState(waivers.documents.length === 0);
  const [revisionOf, setRevisionOf] = useState<string>();
  const [title, setTitle] = useState("");
  const [markdown, setMarkdown] = useState("");
  const [sourceFilename, setSourceFilename] = useState("");
  const [sourceMimeType, setSourceMimeType] = useState("");
  const [importStatus, setImportStatus] = useState<
    "idle" | "importing" | "ready" | "error"
  >("idle");
  const [importMessage, setImportMessage] = useState("");
  const [validityDays, setValidityDays] = useState(365);
  const [requiresSignature, setRequiresSignature] = useState(true);
  const [requiresParentForMinors, setRequiresParentForMinors] = useState(true);
  const [playerAcknowledgementAge, setPlayerAcknowledgementAge] = useState("");
  const [appliesToMembers, setAppliesToMembers] = useState(false);
  const [appliesToBookings, setAppliesToBookings] = useState(false);
  const [sections, setSections] = useState<readonly SectionDraft[]>([]);
  const [previewedWaiver, setPreviewedWaiver] = useState<LibraryWaiver>();
  const { serializedSections, sectionErrors } = useMemo(() => {
    const usedIds = new Set<string>();
    const errors = new Map<number, string>();
    const normalized = sections.map((section, index) => {
      const id = sectionId(section.id || section.title, index, usedIds);
      usedIds.add(id);
      const sectionTitle = section.title.trim();
      const sectionText = section.markdown.trim();
      if (!sectionTitle) {
        errors.set(index, "Add a short section title.");
      } else if (sectionTitle.length > 160) {
        errors.set(index, "Keep the title to 160 characters or fewer.");
      } else if (!sectionText) {
        errors.set(index, "Add the exact text for this highlighted section.");
      } else if (sectionText.length > 100_000) {
        errors.set(index, "Keep this section to 100,000 characters or fewer.");
      }
      return { ...section, id };
    });
    return {
      serializedSections: JSON.stringify(normalized),
      sectionErrors: errors,
    };
  }, [sections]);
  const titleError =
    title.trim().length === 0
      ? "Add a library name."
      : title.trim().length > 180
        ? "Keep the library name to 180 characters or fewer."
        : undefined;
  const documentError =
    markdown.trim().length === 0
      ? "Add the complete waiver text."
      : markdown.trim().length < 20
        ? "The full waiver text needs at least 20 characters."
        : markdown.trim().length > 100_000
          ? "The full waiver text is limited to 100,000 characters. Split a supporting document from the waiver before saving."
          : undefined;
  const hasDraftErrors = Boolean(titleError || documentError || sectionErrors.size);

  const beginRevision = (waiver: WaiverWorkspace["documents"][number]) => {
    setRevisionOf(waiver.id);
    setTitle(waiver.title);
    setMarkdown(waiver.markdown ?? "");
    setValidityDays(waiver.signatureValidityDays);
    setRequiresSignature(waiver.requiresSignature);
    setRequiresParentForMinors(waiver.requiresParentForMinors);
    setPlayerAcknowledgementAge(
      waiver.playerAcknowledgementMinimumAge?.toString() ?? "",
    );
    setAppliesToMembers(
      waiver.assignments.some(
        (assignment) => assignment.scope === "all-members",
      ),
    );
    setAppliesToBookings(
      waiver.assignments.some((assignment) => assignment.scope === "booking"),
    );
    setSections(waiver.keySections);
    setCreating(true);
  };

  const beginNew = () => {
    setRevisionOf(undefined);
    setTitle("");
    setMarkdown("");
    setSourceFilename("");
    setSourceMimeType("");
    setValidityDays(365);
    setRequiresSignature(true);
    setRequiresParentForMinors(true);
    setPlayerAcknowledgementAge("");
    setAppliesToMembers(false);
    setAppliesToBookings(false);
    setSections([]);
    setCreating(true);
  };

  const importMarkdown = async (file?: File) => {
    if (!file) return;
    setImportStatus("importing");
    setImportMessage(`Reading ${file.name}…`);
    setSourceFilename(file.name);
    setSourceMimeType(file.type || "text/markdown");
    try {
      const payload = new FormData();
      payload.set("file", file);
      const response = await fetch("/api/waivers/import", {
        method: "POST",
        body: payload,
      });
      const result = (await response.json()) as {
        title?: string;
        markdown?: string;
        keySections?: SectionDraft[];
        modelUsed?: "openai" | "guided-fallback";
        error?: string;
      };
      if (!response.ok || !result.markdown) {
        throw new Error(result.error ?? "The document could not be imported.");
      }
      setMarkdown(result.markdown);
      if (!title.trim() && result.title) setTitle(result.title);
      if (result.keySections?.length) setSections(result.keySections);
      setImportStatus("ready");
      setImportMessage(
        result.modelUsed === "openai"
          ? "Text extracted and key sections proposed for your review."
          : "Text extracted. Duna proposed sections using its local review rules.",
      );
    } catch (error) {
      setImportStatus("error");
      setImportMessage(
        error instanceof Error
          ? error.message
          : "The document could not be imported.",
      );
    }
  };

  return (
    <section className="settings-section waiver-library">
      <header className="settings-section__heading">
        <div>
          <span className="hq-eyebrow">Club recordkeeping</span>
          <h2>Waivers &amp; releases</h2>
          <p>
            Store one club-scoped source of truth, then add it to memberships,
            events, and booking flows. Each signature is tied to an immutable
            document version.
          </p>
        </div>
        <button
          className="hq-button hq-button--primary"
          onClick={beginNew}
          type="button"
        >
          <Plus aria-hidden size={16} /> New waiver
        </button>
      </header>

      <div className="waiver-library__records" aria-label="Saved waivers">
        {waivers.documents.map((waiver) => (
          <article className="hq-card waiver-library__record" key={waiver.id}>
            <header>
              <span>
                <ShieldCheck aria-hidden size={18} />
                <strong>{waiver.title}</strong>
              </span>
              <Badge tone={waiver.status === "active" ? "positive" : "neutral"}>
                {waiver.status}
              </Badge>
            </header>
            <div className="waiver-library__record-meta">
              <span>Version {waiver.version ?? "—"}</span>
              <span>Valid for {waiver.signatureValidityDays} days</span>
            </div>
            <small>
              {waiver.requiresParentForMinors
                ? "Parent or guardian signature required for minors."
                : "Adult player signature required."}{" "}
              {waiver.playerAcknowledgementMinimumAge
                ? `Players ${waiver.playerAcknowledgementMinimumAge}+ also acknowledge selected sections.`
                : ""}
            </small>
            <footer>
              <span className="waiver-library__record-assignments">
                {waiver.assignments.length > 0
                  ? waiver.assignments.map((assignment) => (
                      <Badge key={assignment.id} tone="neutral">
                        {assignment.scope.replaceAll("-", " ")}
                      </Badge>
                    ))
                  : <Badge tone="neutral">Library only</Badge>}
              </span>
              <span className="waiver-library__record-actions">
                <button onClick={() => setPreviewedWaiver(waiver)} type="button">
                  <Eye aria-hidden size={15} /> Preview signing
                </button>
                <button onClick={() => beginRevision(waiver)} type="button">
                  <FileText aria-hidden size={15} /> Create revision
                </button>
              </span>
            </footer>
          </article>
        ))}
      </div>
      {previewedWaiver && (
        <WaiverSigningPreview
          onClose={() => setPreviewedWaiver(undefined)}
          waiver={previewedWaiver}
        />
      )}

      {creating && (
        <form
          action={action}
          className="hq-card waiver-library__editor waiver-builder"
        >
          <input
            name="waiverDocumentId"
            type="hidden"
            value={revisionOf ?? ""}
          />
          <header className="waiver-builder__header">
            <span>
              <FileText aria-hidden size={19} />
            </span>
            <div>
              <h3>
                {revisionOf ? "Publish a new revision" : "Create a waiver"}
              </h3>
              <p>
                Import the legal text first, then set the audience and the proof
                Duna will keep for every signature.
              </p>
            </div>
            <div className="waiver-builder__steps" aria-label="Builder steps">
              <span className="is-current">1. Document</span>
              <span>2. Signing rules</span>
              <span>3. Safeguards</span>
            </div>
          </header>
          <input name="sourceFilename" type="hidden" value={sourceFilename} />
          <input name="sourceMimeType" type="hidden" value={sourceMimeType} />
          <input name="keySections" type="hidden" value={serializedSections} />
          <input
            name="requiresSignature"
            type="hidden"
            value={requiresSignature ? "true" : "false"}
          />
          <input
            name="requiresParentForMinors"
            type="hidden"
            value={requiresParentForMinors ? "true" : "false"}
          />
          <input
            name="appliesToMembers"
            type="hidden"
            value={appliesToMembers ? "true" : "false"}
          />
          <input
            name="appliesToBookings"
            type="hidden"
            value={appliesToBookings ? "true" : "false"}
          />
          <div className="event-form-grid event-form-grid--two waiver-builder__identity">
            <label>
              <span>Library name</span>
              <input
                name="title"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="2026 Youth participation waiver"
                required
                value={title}
              />
              {titleError && (
                <small className="operator-field-helper operator-field-helper--error">
                  {titleError}
                </small>
              )}
            </label>
            <label className="waiver-builder__import">
              <span>
                <FileUp aria-hidden size={16} /> Import a document
              </span>
              <input
                accept=".md,.markdown,.txt,.pdf,.docx"
                onChange={(event) =>
                  void importMarkdown(event.target.files?.[0])
                }
                type="file"
              />
              <small className="operator-field-helper">
                PDF, DOCX, Markdown, or text. Duna extracts the source into a
                reviewable draft and proposes key sections for your review.
              </small>
            </label>
          </div>
          {importStatus !== "idle" && (
            <p
              className={`operator-action-notice operator-action-notice--${
                importStatus === "error" ? "error" : "success"
              }`}
              role={importStatus === "error" ? "alert" : "status"}
            >
              {importStatus === "error" ? (
                <CircleAlert aria-hidden size={15} />
              ) : (
                <Check aria-hidden size={15} />
              )}
              {importMessage}
            </p>
          )}
          <label className="waiver-builder__document">
            <span>
              <strong>Full waiver text</strong>
              <small>Markdown supported · this exact text is versioned</small>
            </span>
            <textarea
              name="markdown"
              onChange={(event) => setMarkdown(event.target.value)}
              placeholder="Paste or import the full release text. Keep the release, indemnity, and arbitration language explicit."
              required
              rows={14}
              value={markdown}
            />
            {documentError && (
              <small className="operator-field-helper operator-field-helper--error">
                {documentError}
              </small>
            )}
          </label>
          <div className="event-form-grid event-form-grid--two waiver-builder__duration">
            <label>
              <span>Signature validity</span>
              <input
                min={1}
                name="signatureValidityDays"
                onChange={(event) =>
                  setValidityDays(Number(event.target.value) || 365)
                }
                type="number"
                value={validityDays}
              />
              <small className="operator-field-helper">
                365 days is the annual default.
              </small>
            </label>
            <label>
              <span>Player acknowledgement age</span>
              <select
                name="playerAcknowledgementMinimumAge"
                onChange={(event) =>
                  setPlayerAcknowledgementAge(event.target.value)
                }
                value={playerAcknowledgementAge}
              >
                <option value="">Parent signature only</option>
                <option value="13">13 and older</option>
                <option value="14">14 and older</option>
                <option value="15">15 and older</option>
                <option value="16">16 and older</option>
                <option value="17">17 and older</option>
              </select>
            </label>
          </div>
          <div className="waiver-library__toggles waiver-builder__rules">
            <div className="waiver-builder__rules-heading">
              <span>
                <LockKeyhole aria-hidden size={17} /> Signing safeguards
              </span>
              <p>
                Choose how Duna proves consent and when this release is needed.
              </p>
            </div>
            <label className={requiresSignature ? "is-selected" : undefined}>
              <input
                checked={requiresSignature}
                onChange={(event) => setRequiresSignature(event.target.checked)}
                type="checkbox"
              />
              Require a checkbox plus typed full legal name as the signature
            </label>
            <label
              className={requiresParentForMinors ? "is-selected" : undefined}
            >
              <input
                checked={requiresParentForMinors}
                onChange={(event) =>
                  setRequiresParentForMinors(event.target.checked)
                }
                type="checkbox"
              />
              Require a verified parent or guardian to sign for every player
              under 18
            </label>
            <label className={appliesToMembers ? "is-selected" : undefined}>
              <input
                checked={appliesToMembers}
                onChange={(event) => setAppliesToMembers(event.target.checked)}
                type="checkbox"
              />
              Require for all club members
            </label>
            <label className={appliesToBookings ? "is-selected" : undefined}>
              <input
                checked={appliesToBookings}
                onChange={(event) => setAppliesToBookings(event.target.checked)}
                type="checkbox"
              />
              Require for anyone booking or registering
            </label>
          </div>
          <div className="waiver-library__sections waiver-builder__sections">
            <header>
              <div>
                <h4>Highlight key sections</h4>
                <p>
                  Add the provisions that deserve a separate affirmative tap,
                  such as release, indemnity, arbitration, or class action.
                </p>
              </div>
              <button
                onClick={() =>
                  setSections((current) => [
                    ...current,
                    {
                      id: `section-${current.length + 1}`,
                      title: "",
                      markdown: "",
                      acknowledgementRequired: true,
                    },
                  ])
                }
                type="button"
              >
                <Plus aria-hidden size={15} /> Add section
              </button>
            </header>
            {sections.map((section, index) => (
              <div
                className="waiver-library__section"
                key={`${section.id}-${index}`}
              >
                <input
                  aria-label={`Section ${index + 1} title`}
                  onChange={(event) =>
                    setSections((current) =>
                      current.map((candidate, candidateIndex) =>
                        candidateIndex === index
                          ? { ...candidate, title: event.target.value }
                          : candidate,
                      ),
                    )
                  }
                  placeholder="Arbitration and class action waiver"
                  value={section.title}
                />
                <textarea
                  aria-label={`Section ${index + 1} text`}
                  onChange={(event) =>
                    setSections((current) =>
                      current.map((candidate, candidateIndex) =>
                        candidateIndex === index
                          ? { ...candidate, markdown: event.target.value }
                          : candidate,
                      ),
                    )
                  }
                  placeholder="Paste the exact section text…"
                  rows={4}
                  value={section.markdown}
                />
                {sectionErrors.get(index) && (
                  <small className="operator-field-helper operator-field-helper--error">
                    {sectionErrors.get(index)}
                  </small>
                )}
                <label>
                  <input
                    checked={section.acknowledgementRequired}
                    onChange={(event) =>
                      setSections((current) =>
                        current.map((candidate, candidateIndex) =>
                          candidateIndex === index
                            ? {
                                ...candidate,
                                acknowledgementRequired: event.target.checked,
                              }
                            : candidate,
                        ),
                      )
                    }
                    type="checkbox"
                  />
                  Require a separate acknowledgement tap
                </label>
              </div>
            ))}
          </div>
          {state.status !== "idle" && (
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
          )}
          <footer className="waiver-builder__footer">
            <button
              className="hq-button hq-button--secondary"
              onClick={() => setCreating(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="hq-button hq-button--primary"
              disabled={pending || hasDraftErrors}
              type="submit"
            >
              {pending
                ? "Saving…"
                : revisionOf
                  ? "Publish new revision"
                  : "Save waiver to library"}
            </button>
          </footer>
        </form>
      )}
    </section>
  );
}
