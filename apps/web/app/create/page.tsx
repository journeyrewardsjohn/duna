import type { Metadata } from "next";
import { PublicCreateStarter } from "@/components/public-create-starter";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { DUNA_HQ_URL } from "@/lib/site-urls";

export const metadata: Metadata = {
  title: "Create an event",
  description:
    "Start a tournament or league on Duna, then finish it in one guided flow.",
};

export default function PublicCreatePage() {
  return (
    <main className="public-create-page" data-zone="operator">
      <SiteHeader />
      <PublicCreateStarter hqUrl={DUNA_HQ_URL} />
      <SiteFooter />
    </main>
  );
}
