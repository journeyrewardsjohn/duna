"use client";

import type { AppRouter } from "@duna/api";
import { Badge } from "@duna/ui";
import type { inferRouterOutputs } from "@trpc/server";
import { ArrowRight, ShieldCheck, WalletCards } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { transferFamilyCreditsAction } from "@/app/app/settings/actions";

type FamilyWallets = inferRouterOutputs<AppRouter>["player"]["familyWallets"];

function walletKey(wallet: FamilyWallets[number]) {
  return `${wallet.dependentPersonId}:${wallet.organizationId}`;
}

export function FamilyWalletSettings({
  wallets,
}: {
  readonly wallets: FamilyWallets;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activeKey, setActiveKey] = useState<string>();
  const [credits, setCredits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  if (wallets.length === 0) return null;

  function fund(
    event: FormEvent<HTMLFormElement>,
    wallet: FamilyWallets[number],
  ) {
    event.preventDefault();
    const key = walletKey(wallet);
    const amount = Number(credits[key]);
    if (!Number.isInteger(amount) || amount < 1) {
      setError("Enter a whole number of credits to fund.");
      return;
    }
    setError(undefined);
    setNotice(undefined);
    setActiveKey(key);
    startTransition(async () => {
      const response = await transferFamilyCreditsAction({
        dependentPersonId: wallet.dependentPersonId,
        organizationId: wallet.organizationId,
        credits: amount,
      });
      setActiveKey(undefined);
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setCredits((current) => ({ ...current, [key]: "" }));
      setNotice(
        `${amount} ${amount === 1 ? "credit" : "credits"} moved to ${wallet.dependentName}'s ${wallet.organizationName} wallet.`,
      );
      router.refresh();
    });
  }

  return (
    <section id="family-wallets">
      <div className="settings-section__heading">
        <div>
          <span className="page-eyebrow">Organization credits</span>
          <h2>Family wallets</h2>
          <p>
            Pay directly when booking for a child, or move club credits into
            their wallet so they can book independently.
          </p>
        </div>
        <WalletCards aria-hidden size={22} />
      </div>

      {(notice || error) && (
        <p className={error ? "form-error" : "form-notice"} aria-live="polite">
          {error ?? notice}
        </p>
      )}

      <div className="family-wallet-grid">
        {wallets.map((wallet) => {
          const key = walletKey(wallet);
          return (
            <article className="family-wallet-card" key={key}>
              <header>
                <span>
                  <small>{wallet.organizationName}</small>
                  <strong>{wallet.dependentName}</strong>
                </span>
                <Badge
                  tone={
                    wallet.relationshipStatus === "verified"
                      ? "positive"
                      : wallet.relationshipStatus === "rejected"
                        ? "danger"
                        : "warning"
                  }
                >
                  {wallet.relationshipStatus === "verified"
                    ? "Guardian verified"
                    : wallet.relationshipStatus === "rejected"
                      ? "Review rejected"
                      : "Review pending"}
                </Badge>
              </header>
              <div className="family-wallet-balances">
                <span>
                  <small>Your wallet</small>
                  <strong>{wallet.guardianCredits}</strong>
                </span>
                <ArrowRight aria-hidden />
                <span>
                  <small>{wallet.dependentName}&apos;s wallet</small>
                  <strong>{wallet.dependentCredits}</strong>
                </span>
              </div>
              {wallet.fundingEnabled ? (
                <form onSubmit={(event) => fund(event, wallet)}>
                  <label>
                    Credits to move
                    <input
                      inputMode="numeric"
                      max={wallet.guardianCredits}
                      min={1}
                      onChange={(event) =>
                        setCredits((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                      placeholder="0"
                      required
                      type="number"
                      value={credits[key] ?? ""}
                    />
                  </label>
                  <button
                    disabled={
                      isPending ||
                      wallet.guardianCredits < 1 ||
                      activeKey === key
                    }
                    type="submit"
                  >
                    {activeKey === key ? "Moving…" : "Fund child wallet"}
                  </button>
                </form>
              ) : (
                <p className="family-wallet-card__locked">
                  <ShieldCheck aria-hidden />
                  Funding unlocks only after guardian review and spending
                  authority are verified.
                </p>
              )}
              <footer>
                Credits stay specific to {wallet.organizationName}. Every move
                is recorded as a balanced ledger transaction.
              </footer>
            </article>
          );
        })}
      </div>
    </section>
  );
}
