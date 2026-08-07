import { Coins, WalletCards } from "lucide-react";
import Link from "next/link";

export function WalletSectionNav({
  active,
}: {
  readonly active: "wallet" | "predictions";
}) {
  return (
    <nav aria-label="Wallet sections" className="wallet-section-nav">
      <Link
        aria-current={active === "wallet" ? "page" : undefined}
        href="/app/wallet"
      >
        <WalletCards aria-hidden size={17} />
        <span>
          <strong>Wallet</strong>
          <small>Money + club credits</small>
        </span>
      </Link>
      <Link
        aria-current={active === "predictions" ? "page" : undefined}
        href="/app/wallet/predictions"
      >
        <Coins aria-hidden size={17} />
        <span>
          <strong>Predictions</strong>
          <small>Markets + portfolio</small>
        </span>
      </Link>
    </nav>
  );
}
