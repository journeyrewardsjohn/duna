"use client";

import { Check, Copy, ExternalLink, Maximize2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type CopyState = "idle" | "copied" | "failed";

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("The address could not be copied.");
}

export function ProEventVenueCard({
  address,
  mapHref,
  mapImageSrc,
  timezone,
  title,
}: {
  readonly address: string;
  readonly mapHref: string;
  readonly mapImageSrc: string;
  readonly timezone?: string;
  readonly title: string;
}) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const [expanded, setExpanded] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const embeddedMapSrc = `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;

  useEffect(
    () => () => {
      if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [expanded]);

  const handleCopy = async () => {
    try {
      await copyText(address);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    if (copyResetTimer.current) clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setCopyState("idle"), 2400);
  };

  return (
    <>
      <section className="pro-event-section pro-event-venue">
        <button
          aria-haspopup="dialog"
          className="pro-event-venue__map"
          onClick={() => setExpanded(true)}
          type="button"
        >
          <img alt={`Map showing ${title}`} loading="lazy" src={mapImageSrc} />
          <span>
            Expand map <Maximize2 aria-hidden size={14} />
          </span>
        </button>
        <div className="pro-event-venue__details">
          <span className="page-eyebrow">Event location</span>
          <h2>{title}</h2>
          <a
            className="pro-event-venue__address"
            href={mapHref}
            rel="noreferrer"
            target="_blank"
          >
            {address}
            <ExternalLink aria-hidden size={14} />
          </a>
          {timezone && <small>Schedule shown in {timezone}</small>}
          <div className="pro-event-venue__actions">
            <button onClick={() => void handleCopy()} type="button">
              {copyState === "copied" ? (
                <Check aria-hidden size={15} />
              ) : (
                <Copy aria-hidden size={15} />
              )}
              {copyState === "copied" ? "Copied" : "Copy address"}
            </button>
            <a href={mapHref} rel="noreferrer" target="_blank">
              Open in Maps <ExternalLink aria-hidden size={14} />
            </a>
          </div>
          <span aria-live="polite" className="sr-only">
            {copyState === "copied"
              ? "Address copied to clipboard."
              : copyState === "failed"
                ? "Address could not be copied."
                : ""}
          </span>
        </div>
      </section>

      {expanded && (
        <div
          className="pro-event-map-dialog__backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setExpanded(false);
          }}
          role="presentation"
        >
          <section
            aria-label={`${title} map`}
            aria-modal="true"
            className="pro-event-map-dialog"
            role="dialog"
          >
            <header>
              <div>
                <span className="page-eyebrow">Event location</span>
                <h2>{title}</h2>
                <a href={mapHref} rel="noreferrer" target="_blank">
                  {address}
                </a>
              </div>
              <button
                aria-label="Close expanded map"
                onClick={() => setExpanded(false)}
                ref={closeButtonRef}
                type="button"
              >
                <X aria-hidden size={19} />
              </button>
            </header>
            <iframe
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={embeddedMapSrc}
              title={`Interactive map of ${title}`}
            />
            <footer>
              <button onClick={() => void handleCopy()} type="button">
                {copyState === "copied" ? (
                  <Check aria-hidden size={15} />
                ) : (
                  <Copy aria-hidden size={15} />
                )}
                {copyState === "copied" ? "Copied" : "Copy address"}
              </button>
              <a href={mapHref} rel="noreferrer" target="_blank">
                Open in Maps <ExternalLink aria-hidden size={14} />
              </a>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
