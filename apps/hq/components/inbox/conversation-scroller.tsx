"use client";

import { type ReactNode, useEffect, useRef } from "react";

/**
 * The messages pane opens at the newest message, and follows a new one in
 * when the person was already at the end (never pulls them away from what
 * they are reading further up).
 */
export function ConversationScroller({
  newest,
  children,
}: {
  /** Changes when a message arrives: the newest sequence number. */
  readonly newest: number;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  useEffect(() => {
    const node = ref.current;
    if (!node || !atEnd.current) return;
    node.scrollTop = node.scrollHeight;
  }, [newest]);
  return (
    <div
      className="inbox-scroller"
      onScroll={(event) => {
        const node = event.currentTarget;
        atEnd.current =
          node.scrollHeight - node.scrollTop - node.clientHeight < 48;
      }}
      ref={ref}
    >
      {children}
    </div>
  );
}
