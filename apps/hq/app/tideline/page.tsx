import "@duna/ui/tideline/styles.css";
import "@duna/ui/tideline/legacy-bridge.css";

import {
  buttonClassName,
  Card,
  Tideline,
  TidelineFonts,
} from "@duna/ui/tideline";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { type GalleryExample, type GalleryGroup } from "./gallery";
import { isTidelineGalleryEnabled } from "./gallery-guard";
import styles from "./gallery.module.css";
import * as familySections from "./sections";
import { type GallerySection, GalleryShell } from "./shell";

// Read the flag per request, so one build serves both answers.
export const dynamic = "force-dynamic";

// Without the flag the route says nothing about itself, not even a title.
export function generateMetadata(): Metadata {
  return {
    title: isTidelineGalleryEnabled() ? "Tideline gallery" : "Not found",
    robots: { index: false, follow: false },
  };
}

const themes = ["light", "dark", "live"] as const;
type GalleryTheme = (typeof themes)[number];
const themeNames: Record<GalleryTheme, string> = {
  light: "Light",
  dark: "Dark",
  live: "Live zone",
};

function Example({ title, wide = false, children }: ExampleProps) {
  return (
    <Card
      className={wide ? `${styles.example} ${styles.wide}` : styles.example}
    >
      <h3 className={styles.exampleTitle}>{title}</h3>
      {children}
    </Card>
  );
}

interface ExampleProps {
  title: string;
  wide?: boolean;
  children: ReactNode;
}

/** Every `sections/<family>.tsx`, grouped into page sections and sorted. */
function gallerySections(): GallerySection[] {
  const examples: GalleryExample[] = Object.values(familySections).flat();
  const groups = new Map<
    string,
    { group: GalleryGroup; items: GalleryExample[] }
  >();
  for (const example of examples) {
    const entry = groups.get(example.group.id) ?? {
      group: example.group,
      items: [],
    };
    entry.items.push(example);
    groups.set(example.group.id, entry);
  }
  return [...groups.values()]
    .sort((a, b) => a.group.order - b.group.order)
    .map(({ group, items }) => {
      const content = items
        .sort((a, b) => a.order - b.order)
        .map((example) => (
          <Example
            key={example.title}
            title={example.title}
            wide={example.wide}
          >
            {example.content}
          </Example>
        ));
      const Wrap = group.wrap;
      return {
        id: group.id,
        title: group.title,
        content: Wrap ? <Wrap>{content}</Wrap> : content,
      };
    });
}

export default async function TidelineGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string }>;
}) {
  if (!isTidelineGalleryEnabled()) notFound();

  const requested = (await searchParams).theme;
  const theme: GalleryTheme = themes.includes(requested as GalleryTheme)
    ? (requested as GalleryTheme)
    : "light";

  return (
    <Tideline
      className={styles.page}
      ground
      theme={theme === "dark" ? "dark" : undefined}
      zone={theme === "live" ? "live" : undefined}
    >
      <TidelineFonts />
      <header className={styles.top}>
        <div className={styles.brand}>
          <span className="td-title">Tideline</span>
          <span className="td-meta">Component gallery · development only</span>
        </div>
        <a
          className={buttonClassName({ size: "sm", variant: "ghost" })}
          href={`/tideline/book-lesson?theme=${theme}`}
        >
          Book a lesson page
        </a>
        <nav aria-label="Theme" className={styles.themes}>
          {themes.map((name) => (
            <a
              aria-current={name === theme ? "page" : undefined}
              className={buttonClassName({
                size: "sm",
                variant: name === theme ? "secondary" : "ghost",
              })}
              href={`/tideline?theme=${name}`}
              key={name}
            >
              {themeNames[name]}
            </a>
          ))}
        </nav>
      </header>
      <div className={styles.intro}>
        <h1 className="td-display">Tideline gallery</h1>
        <p className="td-lead">
          Every component in <code className="td-code">@duna/ui/tideline</code>,
          with its states, on Vercel&apos;s UI SDK.
        </p>
      </div>
      <GalleryShell sections={gallerySections()} />
    </Tideline>
  );
}
