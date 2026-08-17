export type MarkdownInline =
  | { readonly type: "text"; readonly value: string }
  | { readonly type: "strong"; readonly children: readonly MarkdownInline[] }
  | { readonly type: "emphasis"; readonly children: readonly MarkdownInline[] }
  | { readonly type: "code"; readonly value: string }
  | {
      readonly type: "link";
      readonly href: string;
      readonly children: readonly MarkdownInline[];
    };

export type MarkdownBlock =
  | {
      readonly type: "heading";
      readonly level: 1 | 2 | 3;
      readonly children: readonly MarkdownInline[];
    }
  | { readonly type: "paragraph"; readonly children: readonly MarkdownInline[] }
  | {
      readonly type: "list";
      readonly ordered: boolean;
      readonly items: readonly (readonly MarkdownInline[])[];
    }
  | { readonly type: "quote"; readonly children: readonly MarkdownInline[] }
  | { readonly type: "rule" };

function safeHref(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function delimiterAt(value: string, index: number) {
  const marker = value[index];
  if (marker !== "*" && marker !== "_") return undefined;
  const doubled = value.slice(index, index + 2) === `${marker}${marker}`;
  const delimiter = doubled ? `${marker}${marker}` : marker;
  const end = value.indexOf(delimiter, index + delimiter.length);
  return end > index + delimiter.length
    ? { delimiter, end, strong: doubled }
    : undefined;
}

export function parseMarkdownInline(value: string): readonly MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    nodes.push({ type: "text", value: buffer });
    buffer = "";
  };

  for (let index = 0; index < value.length; ) {
    if (value[index] === "\\" && index + 1 < value.length) {
      buffer += value[index + 1];
      index += 2;
      continue;
    }
    if (value[index] === "`") {
      const end = value.indexOf("`", index + 1);
      if (end > index + 1) {
        flush();
        nodes.push({ type: "code", value: value.slice(index + 1, end) });
        index = end + 1;
        continue;
      }
    }
    if (value[index] === "[") {
      const labelEnd = value.indexOf("](", index + 1);
      const urlEnd = labelEnd < 0 ? -1 : value.indexOf(")", labelEnd + 2);
      if (labelEnd > index + 1 && urlEnd > labelEnd + 2) {
        const href = safeHref(value.slice(labelEnd + 2, urlEnd).trim());
        if (href) {
          flush();
          nodes.push({
            type: "link",
            href,
            children: parseMarkdownInline(value.slice(index + 1, labelEnd)),
          });
          index = urlEnd + 1;
          continue;
        }
      }
    }
    const delimiter = delimiterAt(value, index);
    if (delimiter) {
      flush();
      const contentStart = index + delimiter.delimiter.length;
      const children = parseMarkdownInline(
        value.slice(contentStart, delimiter.end),
      );
      nodes.push(
        delimiter.strong
          ? { type: "strong", children }
          : { type: "emphasis", children },
      );
      index = delimiter.end + delimiter.delimiter.length;
      continue;
    }
    buffer += value[index];
    index += 1;
  }
  flush();
  return nodes;
}

function isBlockStart(line: string) {
  return (
    /^(#{1,3})\s+/.test(line) ||
    /^([-*_])(?:\s*\1){2,}\s*$/.test(line) ||
    /^>\s?/.test(line) ||
    /^[-+*]\s+/.test(line) ||
    /^\d+[.)]\s+/.test(line)
  );
}

export function parseMarkdown(value: string): readonly MarkdownBlock[] {
  const lines = value.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? "";
    if (!line) {
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1]?.length as 1 | 2 | 3,
        children: parseMarkdownInline(heading[2] ?? ""),
      });
      index += 1;
      continue;
    }
    if (/^([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index]?.trim() ?? "")) {
        quote.push((lines[index] ?? "").trim().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({
        type: "quote",
        children: parseMarkdownInline(quote.join(" ")),
      });
      continue;
    }
    const unordered = line.match(/^[-+*]\s+(.+)$/);
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    if (unordered || ordered) {
      const listItems: MarkdownInline[][] = [];
      const expression = unordered ? /^[-+*]\s+(.+)$/ : /^\d+[.)]\s+(.+)$/;
      while (index < lines.length) {
        const item = (lines[index] ?? "").trim().match(expression);
        if (!item) break;
        listItems.push([...parseMarkdownInline(item[1] ?? "")]);
        index += 1;
      }
      blocks.push({ type: "list", ordered: Boolean(ordered), items: listItems });
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length) {
      const next = lines[index]?.trim() ?? "";
      if (!next || isBlockStart(next)) break;
      paragraph.push(next);
      index += 1;
    }
    blocks.push({
      type: "paragraph",
      children: parseMarkdownInline(paragraph.join(" ")),
    });
  }
  return blocks;
}

export function markdownToPlainText(value: string) {
  const inlineText = (nodes: readonly MarkdownInline[]): string =>
    nodes
      .map((node) =>
        node.type === "text" || node.type === "code"
          ? node.value
          : inlineText(node.children),
      )
      .join("");
  return parseMarkdown(value)
    .map((block) => {
      if (block.type === "rule") return "";
      if (block.type === "list") {
        return block.items.map((item) => inlineText(item)).join(" ");
      }
      return inlineText(block.children);
    })
    .filter(Boolean)
    .join(" ");
}
