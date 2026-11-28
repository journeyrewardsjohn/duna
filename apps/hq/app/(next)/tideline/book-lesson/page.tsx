import "@duna/ui/tideline/styles.css";

import { buttonClassName, Tideline } from "@duna/ui/tideline";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import styles from "../gallery.module.css";
import { isTidelineGalleryEnabled } from "../gallery-guard";
import { InteractionsLab } from "../interactions";
import { BookLesson } from "./book-lesson";

// Read the flag per request, so one build serves both answers.
export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  return {
    title: isTidelineGalleryEnabled()
      ? "Book a lesson · Tideline gallery"
      : "Not found",
    robots: { index: false, follow: false },
  };
}

const themes = ["light", "dark", "live"] as const;
type GalleryTheme = (typeof themes)[number];

/** The booking flow on the comfortable scale, wired to the booking state. */
export default async function BookLessonPage({
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
      density="comfortable"
      ground
      theme={theme === "dark" ? "dark" : undefined}
      zone={theme === "live" ? "live" : undefined}
    >
      <header className={styles.top}>
        <a
          className={buttonClassName({ size: "sm", variant: "ghost" })}
          href={`/tideline?theme=${theme}`}
        >
          Tideline gallery
        </a>
        <nav aria-label="Theme" className={styles.themes}>
          {themes.map((name) => (
            <a
              aria-current={name === theme ? "page" : undefined}
              className={buttonClassName({
                size: "sm",
                variant: name === theme ? "secondary" : "ghost",
              })}
              href={`/tideline/book-lesson?theme=${name}`}
              key={name}
            >
              {name === "live"
                ? "Live zone"
                : name === "dark"
                  ? "Dark"
                  : "Light"}
            </a>
          ))}
        </nav>
      </header>
      <div className={styles.bookLab}>
        <InteractionsLab>
          <BookLesson />
        </InteractionsLab>
      </div>
    </Tideline>
  );
}
