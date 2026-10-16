"use client";

import { MessageCircle, Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { askDunaFetch, type AskConversation } from "./ask-duna-client";

export function AskDunaSidebar({ scopeKey }: { scopeKey: string }) {
  const pathname = usePathname();
  const [conversations, setConversations] = useState<AskConversation[]>([]);
  useEffect(() => {
    const abort = new AbortController();
    const load = () => {
      void askDunaFetch<{ conversations: AskConversation[] }>("conversations", {
        signal: abort.signal,
      })
        .then((result) => setConversations(result.conversations.slice(0, 5)))
        .catch(() => {
          if (!abort.signal.aborted) setConversations([]);
        });
    };
    load();
    window.addEventListener("ask-duna:history", load);
    window.addEventListener("focus", load);
    return () => {
      abort.abort();
      window.removeEventListener("ask-duna:history", load);
      window.removeEventListener("focus", load);
    };
  }, [scopeKey]);
  return (
    <section className="ask-duna-nav" aria-label="Ask Duna conversations">
      <div className="ask-duna-nav__heading">
        <Link
          onClick={() => window.dispatchEvent(new Event("ask-duna:new"))}
          href="/ask"
          className={pathname === "/ask" ? "active" : ""}
        >
          <MessageCircle size={18} aria-hidden />
          <span>Ask Duna</span>
        </Link>
        <Link
          onClick={() => window.dispatchEvent(new Event("ask-duna:new"))}
          href="/ask"
          aria-label="New Ask Duna conversation"
          className="ask-duna-nav__new"
        >
          <Plus size={16} aria-hidden />
        </Link>
      </div>
      <div className="ask-duna-nav__recent">
        {conversations.map((conversation) => (
          <Link
            key={conversation.id}
            href={`/ask/${conversation.id}`}
            className={pathname === `/ask/${conversation.id}` ? "active" : ""}
            aria-current={
              pathname === `/ask/${conversation.id}` ? "page" : undefined
            }
            title={conversation.title}
          >
            {conversation.title}
          </Link>
        ))}
        <Link
          href="/ask/history"
          className={pathname === "/ask/history" ? "active" : ""}
        >
          All conversations <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
