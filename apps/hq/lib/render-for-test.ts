import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Server-renders a component for a unit test and exposes what a person or
 * assistive technology would get from the first paint: text, and elements
 * with their attributes. HQ has no DOM test environment, so tests that need
 * clicks, focus, or computed styles belong in the Playwright suite.
 */
export interface Rendered {
  readonly html: string;
  /** Visible text with markup removed and whitespace collapsed. */
  readonly text: string;
  /** Attribute maps for every element with the given tag name. */
  elements(tag: string): Record<string, string>[];
}

const entities: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
};

function decode(value: string): string {
  return value.replace(
    /&(?:amp|lt|gt|quot|#x27|#39);/g,
    (entity) => entities[entity] ?? entity,
  );
}

export function renderForTest<Props extends object>(
  component: ComponentType<Props>,
  props: Props,
): Rendered {
  return renderElementForTest(createElement(component, props));
}

/** For async server components: `renderElementForTest(await Page(props))`. */
export function renderElementForTest(element: ReactNode): Rendered {
  const html = renderToStaticMarkup(element);
  return {
    html,
    text: decode(html.replace(/<[^>]*>/g, " "))
      .replace(/\s+/g, " ")
      .trim(),
    elements(tag) {
      const pattern = new RegExp(`<${tag}(\\s[^>]*)?/?>`, "g");
      return Array.from(html.matchAll(pattern), (match) => {
        const attributes: Record<string, string> = {};
        for (const [, name, value] of (match[1] ?? "").matchAll(
          /([\w:-]+)(?:="([^"]*)")?/g,
        )) {
          if (name) attributes[name] = decode(value ?? "");
        }
        return attributes;
      });
    },
  };
}
