import { readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * The HQ global stylesheets and a dependency-free CSS rule scanner, shared by
 * `css-usage.ts` and `verify-hq-css-ratchet.ts`.
 *
 * "Global" means every stylesheet under `apps/hq/app` that is not a CSS
 * module, plus the shared HQ workspace sheet. Today those are the seven files
 * `apps/hq/app/layout.tsx` imports; a sheet split into a subfolder stays in
 * the list.
 */
export function hqGlobalSheets(repositoryRoot: string): string[] {
  const appSheets = globalSheetsIn(repositoryRoot, "apps/hq/app").sort();
  return [...appSheets, "packages/ui/src/hq-workspace.css"];
}

function globalSheetsIn(repositoryRoot: string, directory: string): string[] {
  return readdirSync(join(repositoryRoot, directory), {
    withFileTypes: true,
  }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return globalSheetsIn(repositoryRoot, path);
    const global =
      entry.name.endsWith(".css") && !entry.name.endsWith(".module.css");
    return global ? [path] : [];
  });
}

export interface CssRule {
  /** Selector list as written, comments removed, whitespace collapsed. */
  readonly selector: string;
  /** Enclosing conditional at-rules, outermost first. */
  readonly context: readonly string[];
  /** Offset of the first selector character. */
  readonly start: number;
  /** Offset just past the closing brace. */
  readonly end: number;
  /** One-based line of the first selector character. */
  readonly startLine: number;
  /** One-based line of the closing brace. */
  readonly endLine: number;
}

/** At-rules whose block holds style rules that apply under a condition. */
const conditionalAtRules = new Set([
  "container",
  "layer",
  "media",
  "scope",
  "starting-style",
  "supports",
]);

/**
 * Lists every style rule in a stylesheet with its position. Keyframes, font
 * faces, and other at-rules without selectors are skipped. Nested style rules
 * are reported with the parent selector substituted for `&`.
 */
export function parseCssRules(css: string): CssRule[] {
  const lineStarts = [0];
  for (let index = 0; index < css.length; index += 1) {
    if (css[index] === "\n") lineStarts.push(index + 1);
  }
  const lineOf = (offset: number) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if ((lineStarts[middle] ?? 0) <= offset) low = middle;
      else high = middle - 1;
    }
    return low + 1;
  };

  /** Offset just past a comment or string that starts at `index`, else -1. */
  const skipOpaque = (index: number): number => {
    const character = css[index];
    if (character === "/" && css[index + 1] === "*") {
      const close = css.indexOf("*/", index + 2);
      return close === -1 ? css.length : close + 2;
    }
    if (character === '"' || character === "'") {
      let cursor = index + 1;
      while (cursor < css.length && css[cursor] !== character) {
        cursor += css[cursor] === "\\" ? 2 : 1;
      }
      return cursor + 1;
    }
    return -1;
  };

  const closingBrace = (open: number): number => {
    let depth = 0;
    let cursor = open;
    while (cursor < css.length) {
      const skipped = skipOpaque(cursor);
      if (skipped !== -1) {
        cursor = skipped;
        continue;
      }
      if (css[cursor] === "{") depth += 1;
      if (css[cursor] === "}") {
        depth -= 1;
        if (depth === 0) return cursor;
      }
      cursor += 1;
    }
    throw new Error(`Unclosed block at line ${lineOf(open)}`);
  };

  const clean = (prelude: string) =>
    prelude
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const rules: CssRule[] = [];

  const walk = (
    from: number,
    to: number,
    context: readonly string[],
    parent: string | undefined,
  ) => {
    let cursor = from;
    let preludeStart = -1;
    while (cursor < to) {
      const skipped = skipOpaque(cursor);
      if (skipped !== -1) {
        // A string can sit inside a selector; a comment never starts one.
        if (css[cursor] !== "/" && preludeStart === -1) preludeStart = cursor;
        cursor = skipped;
        continue;
      }
      const character = css[cursor] ?? "";
      if (character === ";") {
        preludeStart = -1;
      } else if (character === "{") {
        const close = closingBrace(cursor);
        const prelude = clean(css.slice(preludeStart, cursor));
        if (prelude.startsWith("@")) {
          const name = /^@([\w-]+)/.exec(prelude)?.[1]?.toLowerCase() ?? "";
          if (conditionalAtRules.has(name)) {
            walk(cursor + 1, close, [...context, prelude], parent);
          }
        } else if (prelude) {
          const selector = parent
            ? prelude
                .split(",")
                .map((part) =>
                  part.includes("&")
                    ? part.replaceAll("&", `:is(${parent})`)
                    : `:is(${parent}) ${part.trim()}`,
                )
                .join(", ")
            : prelude;
          rules.push({
            selector,
            context,
            start: preludeStart,
            end: close + 1,
            startLine: lineOf(preludeStart),
            endLine: lineOf(close),
          });
          if (css.slice(cursor + 1, close).includes("{")) {
            walk(cursor + 1, close, context, selector);
          }
        }
        cursor = close + 1;
        preludeStart = -1;
        continue;
      } else if (preludeStart === -1 && !/\s/.test(character)) {
        preludeStart = cursor;
      }
      cursor += 1;
    }
  };

  walk(0, css.length, [], undefined);
  return rules;
}

/** Splits on commas that are not inside parentheses or brackets. */
export function splitSelectorList(selector: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of selector) {
    if (character === "(" || character === "[") depth += 1;
    if (character === ")" || character === "]") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function countLines(text: string): number {
  if (text.length === 0) return 0;
  const breaks = text.split("\n").length - 1;
  return text.endsWith("\n") ? breaks : breaks + 1;
}
