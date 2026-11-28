import { WalletStack } from "@duna/ui/tideline";
import styles from "./kit.module.css";

/** Fictional clubs and member: gallery data only. */
export function WalletDemo() {
  return (
    <div className={styles.stack}>
      <WalletStack
        cards={[
          {
            id: "sb",
            club: { name: "Sunset Beach Club", color: "#1E5AA8" },
            member: "Noa Williams",
            kind: "Club member",
            plan: "Annual member",
            status: "active",
            code: "SBC-0148-NW",
            validThrough: "Mar 31, 2027",
          },
          {
            id: "hs",
            club: { name: "Harbor Sand Club", color: "#0F7A6B" },
            member: "Noa Williams",
            plan: "Drop-in member",
            status: "paused",
          },
          {
            id: "op",
            club: { name: "Ocean Park Beach Courts" },
            member: "Noa Williams",
            kind: "Approved player · public beach",
            plan: "Approved player",
            status: "pending",
          },
        ]}
      />
      <WalletStack cards={[]} />
    </div>
  );
}
