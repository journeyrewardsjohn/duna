import type { Metadata } from "next";
import { PublicCreateStarter } from "@/components/public-create-starter";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Create an event",
  description:
    "Start a tournament or league on Duna, then finish it in one guided flow.",
};

export default function PublicCreatePage() {
  return (
    <main className="public-create-page">
      <SiteHeader />
      <PublicCreateStarter
        hqUrl={process.env.NEXT_PUBLIC_HQ_URL ?? "http://localhost:3001"}
      />
      <SiteFooter />
    </main>
  );
}
