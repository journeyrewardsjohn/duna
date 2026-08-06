import { Badge } from "@duna/ui";
import type { ReactNode } from "react";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

export function EditorialPage({
  eyebrow,
  title,
  introduction,
  children,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly introduction: string;
  readonly children: ReactNode;
}) {
  return (
    <main className="public-detail" data-zone="editorial">
      <SiteHeader />
      <section className="editorial-hero">
        <Badge>{eyebrow}</Badge>
        <h1>{title}</h1>
        <p>{introduction}</p>
      </section>
      <article className="editorial-body">{children}</article>
      <SiteFooter />
    </main>
  );
}
