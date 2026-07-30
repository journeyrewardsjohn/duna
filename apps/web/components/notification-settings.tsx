"use client";

import type { PlayerSettings } from "@duna/api";
import { Badge } from "@duna/ui";
import { Bell, Mail, MessageSquareText, Smartphone } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { recordMarketingConsentAction } from "@/app/app/settings/actions";

type Consent = PlayerSettings["consents"][number];
type MarketingScope = Exclude<Consent["scope"], "transactional">;

const options: readonly {
  scope: MarketingScope;
  label: string;
  detail: string;
  icon: typeof Mail;
}[] = [
  {
    scope: "marketing-email",
    label: "Email discovery + product updates",
    detail: "Nearby play, programs, product news, and optional offers.",
    icon: Mail,
  },
  {
    scope: "marketing-sms",
    label: "Text discovery + offers",
    detail: "Optional SMS only; transactional booking texts are separate.",
    icon: MessageSquareText,
  },
  {
    scope: "marketing-push",
    label: "Push discovery + updates",
    detail: "Optional device notifications beyond account activity.",
    icon: Smartphone,
  },
];

export function NotificationSettings({
  consents,
}: {
  readonly consents: readonly Consent[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeScope, setActiveScope] = useState<MarketingScope>();
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const granted = (scope: MarketingScope) =>
    consents.find((consent) => consent.scope === scope)?.granted ?? false;

  const update = (scope: MarketingScope, next: boolean) => {
    setError(undefined);
    setNotice(undefined);
    setActiveScope(scope);
    startTransition(async () => {
      const response = await recordMarketingConsentAction(scope, next);
      setActiveScope(undefined);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setNotice(
        `${next ? "Enabled" : "Disabled"} ${scope.replace("marketing-", "")} updates.`,
      );
      router.refresh();
    });
  };

  return (
    <section id="notifications">
      <div className="settings-section__heading">
        <div>
          <span className="page-eyebrow">Communication</span>
          <h2>Notifications + consent</h2>
        </div>
      </div>

      {(notice || error) && (
        <p className={error ? "form-error" : "form-notice"} aria-live="polite">
          {error ?? notice}
        </p>
      )}

      <article className="settings-row">
        <Bell aria-hidden size={20} />
        <span>
          <strong>Account + activity notices</strong>
          <small>
            Bookings, payments, cancellations, safety, wallet, and guardian
            activity. Duna sends only what is required to operate your account.
          </small>
        </span>
        <Badge tone="positive">Service</Badge>
      </article>

      {options.map((option) => {
        const Icon = option.icon;
        const enabled = granted(option.scope);
        return (
          <article className="settings-row" key={option.scope}>
            <Icon aria-hidden size={20} />
            <span>
              <strong>{option.label}</strong>
              <small>{option.detail}</small>
            </span>
            <label className="settings-switch">
              <input
                checked={enabled}
                disabled={isPending}
                onChange={(event) => update(option.scope, event.target.checked)}
                type="checkbox"
              />
              <span aria-hidden />
              <span className="sr-only">
                {enabled ? "Disable" : "Enable"} {option.label}
              </span>
            </label>
            {activeScope === option.scope && <small>Saving…</small>}
          </article>
        );
      })}
    </section>
  );
}
