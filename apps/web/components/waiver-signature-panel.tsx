"use client";

import type { WaiverRequirement } from "@duna/api";
import { Check, ShieldCheck } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { executeWaiverAction } from "@/app/clubs/[slug]/products/[productSlug]/actions";
import { MarkdownContent } from "./markdown-content";

export function WaiverSignaturePanel({
  organizationId,
  requirements,
  onSigned,
}: {
  readonly organizationId: string;
  readonly requirements: readonly WaiverRequirement[];
  readonly onSigned: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [typedLegalName, setTypedLegalName] = useState("");
  const [acknowledged, setAcknowledged] = useState<readonly string[]>([]);
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();
  const readerRef = useRef<HTMLDivElement>(null);
  const requirement = requirements[currentIndex];
  if (!requirement) return null;
  const requiredSections = requirement.keySections.filter(
    (section) => section.acknowledgementRequired,
  );
  const sectionsReady = requiredSections.every((section) =>
    acknowledged.includes(section.id),
  );
  const canSign =
    scrolledToEnd &&
    accepted &&
    sectionsReady &&
    (!requirement.requiresSignature || typedLegalName.trim().length >= 3);

  const changeRequirement = (index: number) => {
    setCurrentIndex(index);
    setScrolledToEnd(false);
    setAccepted(false);
    setTypedLegalName("");
    setAcknowledged([]);
    setMessage(undefined);
    readerRef.current?.scrollTo({ top: 0 });
  };

  const sign = () => {
    if (!canSign) return;
    setMessage(undefined);
    startTransition(async () => {
      const response = await executeWaiverAction({
        organizationId,
        waiverDocumentId: requirement.documentId,
        subjectPersonId: requirement.subjectPersonId,
        typedLegalName: requirement.requiresSignature
          ? typedLegalName
          : undefined,
        acknowledgedSectionIds: acknowledged,
      });
      if (!response.ok) {
        setMessage(response.error);
        return;
      }
      setMessage("Signature recorded. Refreshing your waiver status…");
      onSigned();
    });
  };

  return (
    <section className="waiver-signature-panel" aria-label="Required waivers">
      <header>
        <ShieldCheck aria-hidden size={21} />
        <div>
          <span>Required before checkout</span>
          <h3>Review and sign the waiver</h3>
          <p>
            Duna displays the complete document and records the exact version,
            your authenticated account, and this signature event.
          </p>
        </div>
      </header>
      {requirements.length > 1 && (
        <div className="waiver-signature-panel__documents" role="tablist">
          {requirements.map((item, index) => (
            <button
              aria-selected={index === currentIndex}
              key={item.documentId}
              onClick={() => changeRequirement(index)}
              role="tab"
              type="button"
            >
              {item.complete && <Check aria-hidden size={14} />}
              {item.title}
            </button>
          ))}
        </div>
      )}
      <div
        className="waiver-signature-panel__reader"
        onScroll={(event) => {
          const target = event.currentTarget;
          if (
            target.scrollHeight - target.scrollTop - target.clientHeight <
            8
          ) {
            setScrolledToEnd(true);
          }
        }}
        ref={readerRef}
        tabIndex={0}
      >
        <MarkdownContent>{requirement.markdown}</MarkdownContent>
      </div>
      <p className="waiver-signature-panel__scroll-status">
        {scrolledToEnd
          ? "Full document reviewed. You can now acknowledge and sign."
          : "Scroll to the end of the full waiver to unlock acknowledgement."}
      </p>
      <div className="waiver-signature-panel__acknowledgements">
        {requiredSections.map((section) => (
          <label key={section.id}>
            <input
              checked={acknowledged.includes(section.id)}
              disabled={!scrolledToEnd}
              onChange={(event) =>
                setAcknowledged((current) =>
                  event.target.checked
                    ? [...current, section.id]
                    : current.filter((id) => id !== section.id),
                )
              }
              type="checkbox"
            />
            I specifically acknowledge: {section.title}
          </label>
        ))}
        <label>
          <input
            checked={accepted}
            disabled={!scrolledToEnd}
            onChange={(event) => setAccepted(event.target.checked)}
            type="checkbox"
          />
          I have reviewed the full waiver and affirmatively agree to it.
        </label>
      </div>
      {requirement.requiresSignature && (
        <label className="waiver-signature-panel__name">
          <span>Type your full legal name to sign</span>
          <input
            disabled={!scrolledToEnd}
            onChange={(event) => setTypedLegalName(event.target.value)}
            placeholder="Full legal name"
            value={typedLegalName}
          />
        </label>
      )}
      {message && <p role="status">{message}</p>}
      <button disabled={!canSign || pending} onClick={sign} type="button">
        {pending
          ? "Recording signature…"
          : requirement.requiresSignature
            ? "Sign waiver"
            : "Record acknowledgement"}
      </button>
    </section>
  );
}
