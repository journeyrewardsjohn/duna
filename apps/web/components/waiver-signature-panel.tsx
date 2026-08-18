"use client";

import type { WaiverRequirement } from "@duna/api";
import { Check, Copy, Send, ShieldCheck } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { executeWaiverAction } from "@/app/clubs/[slug]/products/[productSlug]/actions";
import { MarkdownContent } from "./markdown-content";

type SignerRole =
  "adult-player" | "parent-or-guardian" | "player-acknowledgement";

function signerLabel(role: SignerRole): string {
  return role === "parent-or-guardian"
    ? "parent or guardian"
    : role === "player-acknowledgement"
      ? "player"
      : "adult player";
}

export function WaiverSignaturePanel({
  organizationId,
  requirements,
  onSigned,
}: {
  readonly organizationId: string;
  readonly requirements: readonly WaiverRequirement[];
  readonly onSigned?: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);
  const [verified, setVerified] = useState(false);
  const [typedLegalName, setTypedLegalName] = useState("");
  const [remainingSignerRoles, setRemainingSignerRoles] = useState<
    readonly SignerRole[]
  >([]);
  const [message, setMessage] = useState<string>();
  const [pending, startTransition] = useTransition();
  const readerRef = useRef<HTMLDivElement>(null);
  const requirement = requirements[currentIndex];
  if (!requirement) return null;
  const requiredSections = requirement.keySections.filter(
    (section) => section.acknowledgementRequired,
  );
  const sectionNames = requiredSections.map((section) => section.title);
  const verificationLabel = sectionNames.length
    ? `I verify I read ${sectionNames.join(", ")}.`
    : "I verify I read the full waiver.";
  const canSign =
    scrolledToEnd &&
    verified &&
    (!requirement.requiresSignature || typedLegalName.trim().length >= 3);
  const supportsShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const changeRequirement = (index: number) => {
    setCurrentIndex(index);
    setScrolledToEnd(false);
    setVerified(false);
    setTypedLegalName("");
    setRemainingSignerRoles([]);
    setMessage(undefined);
    readerRef.current?.scrollTo({ top: 0 });
  };

  const completionUrl = () => {
    const url = new URL("/waivers/complete", window.location.origin);
    url.searchParams.set("organizationId", organizationId);
    url.searchParams.set("waiverDocumentId", requirement.documentId);
    url.searchParams.set("subjectPersonId", requirement.subjectPersonId);
    return url.toString();
  };

  const shareCompletionLink = async (role: SignerRole) => {
    const url = completionUrl();
    const text = `Please complete the ${requirement.title} for ${signerLabel(role)} eligibility.`;
    try {
      if (supportsShare) {
        await navigator.share({ title: requirement.title, text, url });
        setMessage("Secure completion link shared.");
      } else {
        await navigator.clipboard.writeText(url);
        setMessage(
          "Secure completion link copied. Send it to the required signer.",
        );
      }
    } catch {
      // The signer can continue here if they dismiss their share sheet.
    }
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
        acknowledgedSectionIds: requiredSections.map((section) => section.id),
      });
      if (!response.ok) {
        setMessage(response.error);
        return;
      }
      setRemainingSignerRoles(response.result.remainingSignerRoles);
      setMessage(
        response.result.remainingSignerRoles.length
          ? "Your signature is recorded. Another required signer can complete their part from the link below."
          : "Signature recorded. This participant is cleared to take part.",
      );
      if (response.result.remainingSignerRoles.length === 0) onSigned?.();
    });
  };

  return (
    <section
      className="waiver-signature-panel"
      aria-label="Participation waiver"
    >
      <header>
        <ShieldCheck aria-hidden size={21} />
        <div>
          <span>Required before participation</span>
          <h3>Complete the participation waiver</h3>
          <p>
            Your purchase is confirmed. Complete this before the player arrives
            or takes part in the activity.
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
          ? "Full document reviewed. Verify the key sections to continue."
          : "Scroll to the end of the full waiver to continue."}
      </p>
      {!verified ? (
        <button
          className="waiver-signature-panel__verify"
          disabled={!scrolledToEnd}
          onClick={() => setVerified(true)}
          type="button"
        >
          <Check aria-hidden size={17} /> {verificationLabel}
        </button>
      ) : (
        <p className="waiver-signature-panel__verified" role="status">
          <Check aria-hidden size={17} /> Key sections verified. Add the legal
          name for the final signature.
        </p>
      )}
      {verified && requirement.requiresSignature && (
        <label className="waiver-signature-panel__name">
          <span>Type your full legal name to sign</span>
          <input
            onChange={(event) => setTypedLegalName(event.target.value)}
            placeholder="Full legal name"
            value={typedLegalName}
          />
        </label>
      )}
      {verified && (
        <button disabled={!canSign || pending} onClick={sign} type="button">
          {pending
            ? "Recording signature…"
            : requirement.requiresSignature
              ? "Sign and agree"
              : "Record acknowledgement"}
        </button>
      )}
      {remainingSignerRoles.length > 0 && (
        <div className="waiver-signature-panel__share">
          <strong>Another signature is required</strong>
          <p>
            Send a secure link to finish this player’s waiver on web or Duna.
          </p>
          {remainingSignerRoles.map((role) => (
            <button
              key={role}
              onClick={() => void shareCompletionLink(role)}
              type="button"
            >
              {supportsShare ? (
                <Send aria-hidden size={16} />
              ) : (
                <Copy aria-hidden size={16} />
              )}
              Send to {signerLabel(role)}
            </button>
          ))}
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
