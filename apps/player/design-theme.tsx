import {
  resolveDunaMobileTokens,
  resolveDunaSandColors,
} from "@duna/ui/mobile";
import {
  environmentalColors,
  type DunaTheme,
  type DunaThemePreference,
} from "@duna/ui/tokens";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";

export type PlayerDesignTokens = ReturnType<typeof resolveDunaMobileTokens>;

function rgb(hex: string) {
  return [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
    .join(",");
}

// Compatibility roles for the existing Player workflows. Their meaning is kept
// here while the shared tokens remain the authority for each appearance.
export function playerPalette(tokens: PlayerDesignTokens) {
  return {
    canvas: tokens.ground,
    ink: tokens.text1,
    depth: tokens.surface1,
    navy: tokens.inactiveFill,
    navyLift: tokens.surface2,
    bone: tokens.text1,
    muted: tokens.text2,
    aqua: tokens.text1,
    aquaDeep: tokens.text1,
    sand: tokens.gold,
    flare: tokens.flare,
    resultWin: tokens.surface2,
    resultWinBorder: tokens.gold,
    resultLoss: tokens.surface2,
    resultLossBorder: tokens.hairlineStrong,
    signal: tokens.signal,
    signalInk: environmentalColors.ink,
    positive: tokens.gain,
    warning: tokens.flareText,
    danger: tokens.loss,
    onAccent: tokens.buttonPrimaryForeground,
    white: environmentalColors.white,
    overlayRgb: rgb(tokens.text1),
    accentRgb: rgb(tokens.text1),
    warningRgb: rgb(tokens.flareText),
    positiveRgb: rgb(tokens.gain),
    dangerRgb: rgb(tokens.loss),
    flareRgb: rgb(tokens.flare),
    inkRgb: rgb(tokens.text1),
    depthRgb: rgb(tokens.surface1),
    navyRgb: rgb(tokens.inactiveFill),
    boneRgb: rgb(tokens.text1),
    whiteRgb: rgb(tokens.surface1),
  };
}

export type PlayerPalette = ReturnType<typeof playerPalette>;
const defaultTokens = resolveDunaMobileTokens("light", "editorial");
const PlayerDesignContext = createContext({
  theme: "light" as DunaTheme,
  preference: "light" as DunaThemePreference,
  setPreference: (() => {}) as (next: DunaThemePreference) => void,
  tokens: defaultTokens,
  colors: playerPalette(defaultTokens),
  sand: resolveDunaSandColors("light"),
});

export function PlayerDesignProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const deviceTheme = useColorScheme() === "dark" ? "dark" : "light";
  const [preference, setPreference] = useState<DunaThemePreference>("light");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let current = true;
    void AsyncStorage.getItem("duna-theme")
      .then((stored) => {
        if (
          current &&
          (stored === "light" || stored === "dark" || stored === "system")
        )
          setPreference(stored);
      })
      .catch(() => undefined)
      .finally(() => {
        if (current) setReady(true);
      });
    return () => {
      current = false;
    };
  }, []);
  const theme = preference === "system" ? deviceTheme : preference;
  const value = useMemo(() => {
    const tokens = resolveDunaMobileTokens(theme, "editorial");
    return {
      theme,
      preference,
      setPreference: (next: DunaThemePreference) => {
        setPreference(next);
        void AsyncStorage.setItem("duna-theme", next).catch(() => undefined);
      },
      tokens,
      colors: playerPalette(tokens),
      sand: resolveDunaSandColors(theme),
    };
  }, [theme, preference]);
  if (!ready) return null;
  return (
    <PlayerDesignContext.Provider value={value}>
      {children}
    </PlayerDesignContext.Provider>
  );
}

export function usePlayerDesign() {
  return useContext(PlayerDesignContext);
}

export function usePlayerStyles<T>(
  createStyles: (tokens: PlayerDesignTokens) => T,
) {
  const { tokens } = usePlayerDesign();
  return useMemo(() => createStyles(tokens), [createStyles, tokens]);
}
