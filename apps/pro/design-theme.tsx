import { resolveDunaMobileTokens } from "@duna/ui/mobile";
import type { DunaTheme } from "@duna/ui/tokens";
import { createContext, useContext, useMemo, type ReactNode } from "react";

export type ProDesignTokens = ReturnType<typeof resolveDunaMobileTokens>;

const ProDesignContext = createContext({
  tokens: resolveDunaMobileTokens("light", "editorial"),
  dark: false,
  reducedMotion: true,
});

export function ProDesignProvider({
  theme,
  reducedMotion,
  children,
}: {
  readonly theme: DunaTheme;
  readonly reducedMotion: boolean;
  readonly children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      tokens: resolveDunaMobileTokens(theme, "editorial"),
      dark: theme === "dark",
      reducedMotion,
    }),
    [theme, reducedMotion],
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
