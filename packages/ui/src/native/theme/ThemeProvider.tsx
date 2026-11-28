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
import { useColorScheme } from "react-native";
import { nativeTokens, type NativeTokens, type NativeZone } from "../tokens";
import { TitleRegion } from "../type/title-region";
import {
  parseThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from "./resolve";

/**
 * Where the person's choice is kept. The apps pass AsyncStorage under the key
 * they already use (`"duna-theme"`, values `light` / `dark` / `system`).
 */
export interface ThemeStorage {
  readonly get: () => Promise<string | null>;
  readonly set: (value: ThemePreference) => Promise<void>;
}

/** Adapts an AsyncStorage-like object (`getItem` / `setItem`) under `key`. */
export function themeStorage(
  storage: {
    readonly getItem: (key: string) => Promise<string | null>;
    readonly setItem: (key: string, value: string) => Promise<void>;
  },
  key = "duna-theme",
): ThemeStorage {
  return {
    get: () => storage.getItem(key),
    set: (value) => storage.setItem(key, value),
  };
}

export interface ThemeContextValue extends ResolvedTheme {
  readonly tokens: NativeTokens;
  /** Saves the choice (when storage is given) and applies it at once. */
  readonly setPreference: (preference: ThemePreference) => void;
  /** False only while the saved choice is being read. */
  readonly ready: boolean;
}

const fallback: ThemeContextValue = {
  ...resolveTheme({ preference: "light", deviceScheme: "light" }),
  tokens: nativeTokens,
  setPreference: () => undefined,
  ready: true,
};

const ThemeContext = createContext<ThemeContextValue>(fallback);

/** The resolved theme, colours and tokens; light outside a provider. */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** The colour roles of the nearest theme and zone. */
export function useColors(): ThemeContextValue["colors"] {
  return useContext(ThemeContext).colors;
}

export interface ThemeProviderProps {
  /** Used until the saved choice is read, and when nothing is saved. */
  readonly defaultPreference?: ThemePreference;
  /** Controlled preference: wins over storage. */
  readonly preference?: ThemePreference;
  readonly storage?: ThemeStorage;
  readonly onPreferenceChange?: (preference: ThemePreference) => void;
  /** The zone for the whole tree (rare; screens use `ZoneProvider`). */
  readonly zone?: NativeZone | null;
  /**
   * Render nothing until the saved choice is read, so the first frame is
   * already in the right theme (the native splash stays up meanwhile).
   * Default true when `storage` is given.
   */
  readonly holdUntilReady?: boolean;
  readonly children?: ReactNode;
}

/**
 * The app-root theme. It resolves Light / Dark / Match device against the
 * device scheme, follows the device live when the choice is Match device,
 * persists the choice through `storage`, and opens the root title region.
 */
export function ThemeProvider({
  defaultPreference = "light",
  preference: controlled,
  storage,
  onPreferenceChange,
  zone = null,
  holdUntilReady,
  children,
}: ThemeProviderProps) {
  const deviceScheme = useColorScheme();
  const [stored, setStored] = useState<ThemePreference | null>(null);
  const [ready, setReady] = useState(!storage);
  const storageRef = useRef(storage);
  storageRef.current = storage;

  useEffect(() => {
    if (!storage) return;
    let live = true;
    storage
      .get()
      .then((value) => {
        if (live) setStored(parseThemePreference(value));
      })
      .catch(() => undefined)
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
    // Read once per storage object.
  }, [storage]);

  const setPreference = useCallback(
    (next: ThemePreference) => {
      setStored(next);
      onPreferenceChange?.(next);
      void storageRef.current?.set(next).catch(() => undefined);
    },
    [onPreferenceChange],
  );

  const preference = controlled ?? stored ?? defaultPreference;
  const value = useMemo<ThemeContextValue>(
    () => ({
      ...resolveTheme({ preference, deviceScheme, zone }),
      tokens: nativeTokens,
      setPreference,
      ready,
    }),
    [preference, deviceScheme, zone, setPreference, ready],
  );

  if ((holdUntilReady ?? Boolean(storage)) && !ready) return null;
  return (
    <ThemeContext.Provider value={value}>
      <TitleRegion name="app">{children}</TitleRegion>
    </ThemeContext.Provider>
  );
}

/**
 * Sets the zone for a subtree: `live` while play is in progress (wins over
 * the preference), `hq` for operator surfaces. `null` returns to the plain
 * theme.
 */
export function ZoneProvider({
  zone,
  children,
}: {
  readonly zone: NativeZone | null;
  readonly children?: ReactNode;
}) {
  const parent = useContext(ThemeContext);
  const deviceScheme = useColorScheme();
  const value = useMemo<ThemeContextValue>(
    () => ({
      ...parent,
      ...resolveTheme({
        preference: parent.preference,
        deviceScheme,
        zone,
      }),
    }),
    [parent, deviceScheme, zone],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

/** The live zone for a subtree: scoring, a live match, recording. */
export function LiveZone({ children }: { readonly children?: ReactNode }) {
  return <ZoneProvider zone="live">{children}</ZoneProvider>;
}

/**
 * Forces a theme for a subtree regardless of the preference (galleries,
 * previews). Product screens use the preference and `ZoneProvider`.
 */
export function ThemeOverride({
  theme,
  children,
}: {
  readonly theme: "light" | "dark" | "live";
  readonly children?: ReactNode;
}) {
  const parent = useContext(ThemeContext);
  const value = useMemo<ThemeContextValue>(
    () => ({
      ...parent,
      ...resolveTheme({
        preference: theme === "light" ? "light" : "dark",
        deviceScheme: null,
        zone: theme === "live" ? "live" : null,
      }),
      preference: parent.preference,
    }),
    [parent, theme],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
