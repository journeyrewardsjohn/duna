import { DunaMark } from "@duna/ui";
import { ArrowRight, Check, Smartphone } from "lucide-react";
import type { Metadata } from "next";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Return to Duna Pro",
  robots: { index: false, follow: false },
};

export default async function ProOnboardingCompletePage({
  searchParams,
}: {
  readonly searchParams: Promise<{ billing?: string }>;
}) {
  const { billing } = await searchParams;
  const succeeded = billing === "success";
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <header>
          <DunaMark />
          <span>Duna Pro</span>
        </header>
        <span className={styles.icon}>
          {succeeded ? <Check aria-hidden /> : <Smartphone aria-hidden />}
        </span>
        <p className={styles.eyebrow}>
          {succeeded ? "PLAN ACTIVATED" : "WORKSPACE SAVED"}
        </p>
        <h1>
          {succeeded
            ? "Your club is ready to run."
            : "Continue whenever you’re ready."}
        </h1>
        <p>
          {succeeded
            ? "Return to Duna Pro to finish your club profile, add your first venue, and invite your team."
            : "Your new organization is safely on the Free plan. You can activate a paid plan later from Duna HQ."}
        </p>
        <a className={styles.primary} href="duna-pro://">
          Open Duna Pro <ArrowRight aria-hidden size={17} />
        </a>
        <a className={styles.secondary} href="https://hq.duna.coach/settings">
          Manage billing on the web
        </a>
      </section>
    </main>
  );
}
