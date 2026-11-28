"use client";

import { Tideline } from "@duna/ui/tideline";
import { type ReactNode, useEffect, useRef } from "react";

const SCOPE_ID = "legal-scope";

/**
 * Set before first paint: the scope takes the site's resolved theme (the
 * site's boot script has already written it on <html>), so a dark reader
 * never sees a light flash. A design-system scope does not inherit a theme.
 */
const themeScript = `(function(){var s=document.getElementById("${SCOPE_ID}");if(s)s.dataset.theme=document.documentElement.dataset.theme==="dark"?"dark":"light";})();`;

/**
 * The Tideline scope of the legal center. It follows the site's light / dark
 * choice (and keeps following it when the person changes it). Moving between
 * documents Crosses through the site shell's page transition.
 */
export function LegalScope({ children }: { readonly children: ReactNode }) {
  const scope = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      scope.current?.setAttribute(
        "data-theme",
        root.dataset.theme === "dark" ? "dark" : "light",
      );
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return (
    <Tideline
      className="lc-root"
      ground
      id={SCOPE_ID}
      ref={scope}
      suppressHydrationWarning
    >
      {/* Opaque markup, so React never creates the script itself: it runs
          once, from the server HTML, before the content below paints. */}
      <div
        dangerouslySetInnerHTML={{ __html: `<script>${themeScript}</script>` }}
        hidden
        suppressHydrationWarning
      />
      {children}
    </Tideline>
  );
}
