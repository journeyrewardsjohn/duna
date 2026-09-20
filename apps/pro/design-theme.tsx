import { resolveDunaMobileTokens } from "@duna/ui/mobile";
import type { DunaTheme, DunaZone } from "@duna/ui/tokens";
import { createContext, useContext, useMemo, type ReactNode } from "react";

export type ProDesignTokens = ReturnType<typeof resolveDunaMobileTokens>;

const ProDesignContext = createContext({
  tokens: resolveDunaMobileTokens("light", "editorial"),
  dark: false,
  reducedMotion: true,
});

export function ProDesignProvider({
  theme,
  zone = "editorial",
  reducedMotion,
  children,
}: {
  readonly theme: DunaTheme;
  readonly zone?: DunaZone;
  readonly reducedMotion: boolean;
  readonly children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      tokens: resolveDunaMobileTokens(theme, zone),
      dark: theme === "dark" || zone === "live",
      reducedMotion,
    }),
    [theme, zone, reducedMotion],
  );
  return (
    <ProDesignContext.Provider value={value}>
      {children}
    </ProDesignContext.Provider>
  );
}

export function useProDesign() {
  return useContext(ProDesignContext);
}

export function useProStyles<T>(createStyles: (tokens: ProDesignTokens) => T) {
  const { tokens } = useProDesign();
  return useMemo(() => createStyles(tokens), [createStyles, tokens]);
}
