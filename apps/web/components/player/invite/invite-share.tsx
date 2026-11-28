"use client";

import { report } from "@duna/observability";
import { Icon } from "@duna/ui/icons";
import { Button, errorToast, successToast } from "@duna/ui/tideline";
import { useEffect, useState } from "react";
import "./invite-share.css";
import {
  platformOf,
  smsUrl,
  whatsappUrl,
  type InviteOpened,
} from "./invite-links";

interface Capabilities {
  readonly canShare: boolean;
  readonly canText: boolean;
  readonly platform: "ios" | "other";
}

/**
 * What this device can open, read after mount so the server and first paint
 * agree. Text-message links only help on a phone or tablet; Web Share where
 * the browser has it. A computer without either keeps WhatsApp and Copy link.
 */
function useCapabilities(): Capabilities {
  const [capabilities, setCapabilities] = useState<Capabilities>({
    canShare: false,
    canText: false,
    platform: "other",
  });
  useEffect(() => {
    const canShare = typeof navigator.share === "function";
    const touch =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;
    setCapabilities({
      canShare,
      canText: touch,
      platform: platformOf(navigator.userAgent),
    });
  }, []);
  return capabilities;
}

/**
 * The ways a person sends one invitation themselves: Share, Text message,
 * WhatsApp and Copy link. Each opens their own app with the words and link
 * filled in; the person presses Send there. Duna sends nothing, so
 * `onOpened` only ever says what was opened.
 */
export function InviteShare({
  message,
  url,
  title,
  phone,
  onOpened,
}: {
  readonly message: string;
  /** The invitation's own link. */
  readonly url: string;
  readonly title: string;
  /** Addresses Messages and WhatsApp when the invitation was made for a number. */
  readonly phone?: string;
  readonly onOpened?: (how: InviteOpened) => void;
}) {
  const { canShare, canText, platform } = useCapabilities();
  const [copied, setCopied] = useState(false);

  const share = async () => {
    try {
      await navigator.share({ title, text: message, url });
      onOpened?.("shared");
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError")
        return;
      errorToast("Sharing didn’t open", {
        description: `Reference ${report(reason, { event: "web.invite.share_failed" })}`,
      });
    }
  };

  const text = () => {
    window.location.href = smsUrl(message, { phone, platform });
    onOpened?.("messages");
  };

  const whatsapp = () => {
    window.open(whatsappUrl(message, phone), "_blank", "noopener,noreferrer");
    onOpened?.("whatsapp");
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      onOpened?.("copied");
      successToast("Link copied");
    } catch (reason) {
      errorToast("The link couldn’t be copied", {
        description: `Reference ${report(reason, { event: "web.invite.copy_failed" })}`,
      });
    }
  };

  return (
    <div className="iv-actions" role="group" aria-label={`Send ${title}`}>
      {canShare ? (
        <Button
          icon={<Icon name="send" size="inline" />}
          onClick={share}
          size="sm"
          variant="primary"
        >
          Share
        </Button>
      ) : null}
      {canText ? (
        <Button
          icon={<Icon name="message" size="inline" />}
          onClick={text}
          size="sm"
          variant={canShare ? "secondary" : "primary"}
        >
          Text message
        </Button>
      ) : null}
      <Button
        onClick={whatsapp}
        size="sm"
        variant={canShare || canText ? "secondary" : "primary"}
      >
        WhatsApp
      </Button>
      <Button
        icon={copied ? <Icon name="check" size="inline" /> : undefined}
        onClick={copy}
        size="sm"
        variant="secondary"
      >
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}
