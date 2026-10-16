"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type AskDunaSurface = {
  scopeKey: string;
  organizationName: string;
  pageLabel: string;
  admin?: boolean;
  canAsk?: boolean;
};
export type AskDunaRequest = { id: number; scopeKey: string; prompt?: string };

const FloatingPanel = dynamic(() =>
  import("./ask-duna-floating").then((module) => module.AskDunaFloating),
);
const FloatingContext = createContext<{
  register: (surface: AskDunaSurface) => () => void;
  open: (scopeKey: string, prompt?: string) => void;
} | null>(null);

/** Lives above page navigation so an operator's draft, files and stream survive it. */
export function AskDunaFloatingProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [surface, setSurface] = useState<
    (AskDunaSurface & { registration: symbol; active: boolean }) | null
  >(null);
  const [request, setRequest] = useState<AskDunaRequest>();
  const requestSequence = useRef(0);
  const [retainedScope, setRetainedScope] = useState<string>();
  const register = useCallback((next: AskDunaSurface) => {
    const registration = Symbol();
    setSurface({ ...next, registration, active: true });
    return () =>
      setSurface((current) =>
        // A route's loading boundary can temporarily remove its shell. Keep
        // this scoped in-memory surface mounted but hidden through that gap.
        current?.registration === registration
          ? { ...current, active: false }
          : current,
      );
  }, []);
  const open = useCallback((scopeKey: string, prompt?: string) => {
    setRequest({ id: ++requestSequence.current, scopeKey, prompt });
  }, []);
  const acknowledge = useCallback((id: number) => {
    setRequest((current) => (current?.id === id ? undefined : current));
  }, []);
  const value = useMemo(() => ({ register, open }), [register, open]);
  const fullWorkspace =
    pathname === "/ask" ||
    (pathname.startsWith("/ask/") && pathname !== "/ask/history") ||
    pathname === "/ai";
  useEffect(() => {
    if (!fullWorkspace && surface) setRetainedScope(surface.scopeKey);
  }, [fullWorkspace, surface?.scopeKey]);
  return (
    <FloatingContext.Provider value={value}>
      {children}
      {surface && (!fullWorkspace || retainedScope === surface.scopeKey) && (
        <FloatingPanel
          key={surface.scopeKey}
          surface={surface}
          pathname={pathname}
          visible={surface.active && !fullWorkspace}
          onRequestHandled={acknowledge}
          request={request?.scopeKey === surface.scopeKey ? request : undefined}
        />
      )}
    </FloatingContext.Provider>
  );
}

export function useAskDunaFloating({
  scopeKey,
  organizationName,
  pageLabel,
  admin,
  canAsk,
}: AskDunaSurface) {
  const context = useContext(FloatingContext);
  if (!context) throw new Error("Ask Duna needs its workspace provider.");
  const { register, open } = context;
  useEffect(
    () => register({ scopeKey, organizationName, pageLabel, admin, canAsk }),
    [register, scopeKey, organizationName, pageLabel, admin, canAsk],
  );
  return useCallback(
    (prompt?: string) => open(scopeKey, prompt),
    [open, scopeKey],
  );
}
