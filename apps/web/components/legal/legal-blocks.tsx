import { DocumentTable, SectionHeading } from "@duna/ui/tideline";
import Link from "next/link";
import type { ReactNode } from "react";
import type { LegalBlock, LegalInline } from "./legal-markdown";

/**
 * A field the draft has not settled yet. It always reads as unfinished,
 * to sight and to screen readers, never as final text.
 */
function ToBeConfirmed({ kind, value }: { kind: string; value: string }) {
  return (
    <mark className="lc-tbc" data-kind={kind}>
      <span className="lc-tbc__tag">To be confirmed</span>{" "}
      <span className="lc-tbc__value">{value}</span>
    </mark>
  );
}

export function LegalInlines({ nodes }: { nodes: readonly LegalInline[] }) {
  return (
    <>
      {nodes.map((node, index): ReactNode => {
        switch (node.type) {
          case "text":
            return node.value;
          case "code":
            return <code key={index}>{node.value}</code>;
          case "strong":
            return (
              <strong key={index}>
                <LegalInlines nodes={node.children} />
              </strong>
            );
          case "emphasis":
            return (
              <em key={index}>
                <LegalInlines nodes={node.children} />
              </em>
            );
          case "placeholder":
            return (
              <ToBeConfirmed key={index} kind={node.kind} value={node.value} />
            );
          case "link":
            return node.href.startsWith("/") ? (
              <Link href={node.href} key={index}>
                <LegalInlines nodes={node.children} />
              </Link>
            ) : (
              <a
                href={node.href}
                key={index}
                rel={node.external ? "noopener noreferrer" : undefined}
              >
                <LegalInlines nodes={node.children} />
              </a>
            );
        }
      })}
    </>
  );
}

export function LegalBlocks({ blocks }: { blocks: readonly LegalBlock[] }) {
  return (
    <>
      {blocks.map((block, index): ReactNode => {
        switch (block.type) {
          case "paragraph":
            return (
              <p key={index}>
                <LegalInlines nodes={block.children} />
              </p>
            );
          case "list": {
            const items = block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <LegalInlines nodes={item} />
              </li>
            ));
            return block.ordered ? (
              <ol key={index}>{items}</ol>
            ) : (
              <ul key={index}>{items}</ul>
            );
          }
          case "table":
            return (
              <DocumentTable key={index} label={block.label}>
                <table>
                  <thead>
                    <tr>
                      {block.head.map((cell, cellIndex) => (
                        <th key={cellIndex} scope="col">
                          <LegalInlines nodes={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>
                            <LegalInlines nodes={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DocumentTable>
            );
          case "subheading":
            return (
              <SectionHeading
                id={block.id}
                key={index}
                level={3}
                title={block.title}
              >
                <LegalInlines nodes={block.children} />
              </SectionHeading>
            );
          case "review-note":
            return (
              <aside
                aria-label="Note for review"
                className="lc-review-note"
                key={index}
              >
                <p className="lc-review-note__tag">
                  Note for review. Not part of the text.
                </p>
                <LegalBlocks blocks={block.children} />
              </aside>
            );
          case "quote":
            return (
              <blockquote className="lc-quote" key={index}>
                <LegalBlocks blocks={block.children} />
              </blockquote>
            );
        }
      })}
    </>
  );
}
