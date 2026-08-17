import {
  parseMarkdown,
  type MarkdownInline,
} from "@duna/core";
import type { ReactNode } from "react";

function InlineMarkdown({
  nodes,
  keyPrefix,
}: {
  readonly nodes: readonly MarkdownInline[];
  readonly keyPrefix: string;
}): ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === "text") return node.value;
    if (node.type === "code") return <code key={key}>{node.value}</code>;
    if (node.type === "strong") {
      return (
        <strong key={key}>
          <InlineMarkdown keyPrefix={key} nodes={node.children} />
        </strong>
      );
    }
    if (node.type === "emphasis") {
      return (
        <em key={key}>
          <InlineMarkdown keyPrefix={key} nodes={node.children} />
        </em>
      );
    }
    return (
      <a href={node.href} key={key} rel="noreferrer" target="_blank">
        <InlineMarkdown keyPrefix={key} nodes={node.children} />
      </a>
    );
  });
}

export function MarkdownContent({
  children,
  className,
}: {
  readonly children: string;
  readonly className?: string;
}) {
  return (
    <div className={className}>
      {parseMarkdown(children).map((block, index) => {
        const key = `block-${index}`;
        if (block.type === "heading") {
          const content = <InlineMarkdown keyPrefix={key} nodes={block.children} />;
          if (block.level === 1) return <h2 key={key}>{content}</h2>;
          return <h3 key={key}>{content}</h3>;
        }
        if (block.type === "list") {
          const items = block.items.map((item, itemIndex) => (
            <li key={`${key}-${itemIndex}`}>
              <InlineMarkdown keyPrefix={`${key}-${itemIndex}`} nodes={item} />
            </li>
          ));
          return block.ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>;
        }
        if (block.type === "quote") {
          return (
            <blockquote key={key}>
              <InlineMarkdown keyPrefix={key} nodes={block.children} />
            </blockquote>
          );
        }
        if (block.type === "rule") return <hr key={key} />;
        return (
          <p key={key}>
            <InlineMarkdown keyPrefix={key} nodes={block.children} />
          </p>
        );
      })}
    </div>
  );
}
