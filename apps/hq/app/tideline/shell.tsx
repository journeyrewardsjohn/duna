"use client";

import { withViewTransition } from "@duna/ui/tideline";
import { type ReactNode, useState } from "react";
import styles from "./gallery.module.css";

export interface GallerySection {
  id: string;
  title: string;
  content: ReactNode;
}

/**
 * The gallery's navigation. "All" shows every section; choosing one shows
 * only that panel, through a view transition where the browser has them.
 */
export function GalleryShell({ sections }: { sections: GallerySection[] }) {
  const [active, setActive] = useState("all");
  const choose = (id: string) => withViewTransition(() => setActive(id));
  const items = [{ id: "all", title: "All" }, ...sections];
  return (
    <div className={styles.shell}>
      <nav aria-label="Sections" className={styles.nav}>
        {items.map((item) => (
          <button
            aria-current={active === item.id ? "true" : undefined}
            className={styles.navItem}
            key={item.id}
            onClick={() => choose(item.id)}
            type="button"
          >
            {item.title}
          </button>
        ))}
      </nav>
      <div className={styles.sections}>
        {sections.map((section) => (
          <section
            className={styles.section}
            hidden={active !== "all" && active !== section.id}
            id={section.id}
            key={section.id}
          >
            <h2 className="td-headline">{section.title}</h2>
            <div className={styles.grid}>{section.content}</div>
          </section>
        ))}
      </div>
    </div>
  );
}
