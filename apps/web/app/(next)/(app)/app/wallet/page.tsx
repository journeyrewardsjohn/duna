import type { Metadata } from "next";
import { getAppSession } from "@/components/app-shell/session";
import { loadWallet } from "./wallet-data";
import { WalletView } from "./wallet-view";

export const metadata: Metadata = { title: "Wallet" };

/**
 * Player web Wallet (`/app/wallet`, WALLET-1): every club card the person
 * holds (or, acting for a junior, the junior's), the pass on each card's
 * back, the selected club's plan, credits, bookings and activity, then the
 * Duna balance. `?card=<club id>` opens on that club's card.
 */
export default async function WalletPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ readonly card?: string | string[] }>;
}) {
  const { card } = await searchParams;
  const session = await getAppSession();
  const { model, demo } = await loadWallet(
    typeof card === "string" ? card : undefined,
  );
  return (
    <WalletView
      demo={demo}
      memberName={session.actingFor?.displayName ?? session.person!.displayName}
      model={model}
    />
  );
}
