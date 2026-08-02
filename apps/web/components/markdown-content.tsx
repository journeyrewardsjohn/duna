import type { ReactNode } from "react";

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

function inline(value: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  return value.split(pattern).map((part, index) => {
    const key = `${keyPrefix}-${index}`;
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = safeHref(link[2] ?? "");
      return href ? (
        <a href={href} key={key} rel="noreferrer" target="_blank">
          {link[1]}
        </a>
      ) : (
        link[1]
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={key}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }
    return part;
  });
}

export function MarkdownContent({
  children,
  className,
}: {
  readonly children: string;
  readonly className?: string;
}) {
  const lines = children.replaceAll("\r\n", "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? "";
    if (!line) {
      index += 1;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const content = inline(heading[2] ?? "", `heading-${index}`);
      blocks.push(
        heading[1]?.length === 1 ? (
          <h2 key={`block-${index}`}>{content}</h2>
        ) : (
          <h3 key={`block-${index}`}>{content}</h3>
        ),
      );
      index += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length) {
        const item = lines[index]?.trim().match(/^[-*]\s+(.+)$/);
        if (!item) break;
        items.push(
          <li key={`item-${index}`}>
            {inline(item[1] ?? "", `item-${index}`)}
          </li>,
        );
        index += 1;
      }
      blocks.push(<ul key={`block-${index}`}>{items}</ul>);
      continue;
    }
    const paragraph: string[] = [line];
    index += 1;
    while (
      index < lines.length &&
      lines[index]?.trim() &&
      !/^(#{1,3})\s+/.test(lines[index]?.trim() ?? "") &&
      !/^[-*]\s+/.test(lines[index]?.trim() ?? "")
    ) {
      paragraph.push(lines[index]?.trim() ?? "");
      index += 1;
    }
    blocks.push(
      <p key={`block-${index}`}>
        {inline(paragraph.join(" "), `paragraph-${index}`)}
      </p>,
    );
  }

  return <div className={className}>{blocks}</div>;
}
