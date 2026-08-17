"use client";

import type { WaiverWorkspace } from "@duna/api";
import { Badge } from "@duna/ui";
import { Check, CircleAlert, FileText, Plus, ShieldCheck } from "lucide-react";
import { useActionState, useMemo, useState } from "react";
import { createWaiverAction, type OperatorActionState } from "@/app/actions";

const initialState: OperatorActionState = { status: "idle", message: "" };

type SectionDraft = {
  readonly id: string;
  readonly title: string;
  readonly markdown: string;
  readonly acknowledgementRequired: boolean;
};

function sectionId(title: string, index: number) {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `section-${index + 1}`
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
  const serializedSections = useMemo(
    () =>
      JSON.stringify(
        sections.map((section, index) => ({
          ...section,
          id: sectionId(section.id || section.title, index),
        })),
      ),
    [sections],
  );

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
            <p>
              Version {waiver.version ?? "—"} · signature valid for{" "}
              {waiver.signatureValidityDays} days
            </p>
            <small>
              {waiver.requiresParentForMinors
                ? "Parent or guardian signature required for minors."
                : "Adult player signature required."}{" "}
              {waiver.playerAcknowledgementMinimumAge
                ? `Players ${waiver.playerAcknowledgementMinimumAge}+ also acknowledge selected sections.`
                : ""}
            </small>
            <footer>
              {waiver.assignments.length > 0
                ? waiver.assignments.map((assignment) => (
                    <Badge key={assignment.id} tone="neutral">
                      {assignment.scope.replaceAll("-", " ")}
                    </Badge>
                  ))
                : "Library only"}
              <button onClick={() => beginRevision(waiver)} type="button">
                Create revision
              </button>
            </footer>
          </article>
        ))}
      </div>

      {creating && (
        <form action={action} className="hq-card waiver-library__editor">
          <input
            name="waiverDocumentId"
            type="hidden"
            value={revisionOf ?? ""}
          />
          <header>
            <span>
              <FileText aria-hidden size={19} />
            </span>
            <div>
              <h3>
                {revisionOf
                  ? "Create a new immutable revision"
                  : "Build a defensible signing flow"}
              </h3>
              <p>
                Show the complete text inline, capture a typed legal name, and
                make selected sections explicit acknowledgements.
              </p>
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
          <div className="event-form-grid event-form-grid--two">
            <label>
              <span>Library name</span>
              <input
                name="title"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="2026 Youth participation waiver"
                required
                value={title}
              />
            </label>
            <label>
              <span>Import source</span>
              <input
                accept=".md,.markdown,.txt,.pdf,.docx"
                onChange={(event) =>
                  void importMarkdown(event.target.files?.[0])
                }
                type="file"
              />
              <small className="operator-field-helper">
                PDF, DOCX, Markdown, and text are extracted into a reviewable
                draft. AI proposes key sections but never rewrites legal text.
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
          <label>
            <span>Full waiver text (Markdown)</span>
            <textarea
              name="markdown"
              onChange={(event) => setMarkdown(event.target.value)}
              placeholder="Paste or import the full release text. Keep the release, indemnity, and arbitration language explicit."
              required
              rows={14}
              value={markdown}
            />
          </label>
          <div className="event-form-grid event-form-grid--two">
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
          <div className="waiver-library__toggles">
            <label>
              <input
                checked={requiresSignature}
                onChange={(event) => setRequiresSignature(event.target.checked)}
                type="checkbox"
              />
              Require a checkbox plus typed full legal name as the signature
            </label>
            <label>
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
            <label>
              <input
                checked={appliesToMembers}
                onChange={(event) => setAppliesToMembers(event.target.checked)}
                type="checkbox"
              />
              Require for all club members
            </label>
            <label>
              <input
                checked={appliesToBookings}
                onChange={(event) => setAppliesToBookings(event.target.checked)}
                type="checkbox"
              />
              Require for anyone booking or registering
            </label>
          </div>
          <div className="waiver-library__sections">
            <header>
              <div>
                <h4>Key-section acknowledgements</h4>
                <p>
                  Use this for assumption of risk, release, indemnity,
                  arbitration, or a class-action waiver.
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
          <footer>
            <button
              className="hq-button hq-button--secondary"
              onClick={() => setCreating(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className="hq-button hq-button--primary"
              disabled={pending}
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
