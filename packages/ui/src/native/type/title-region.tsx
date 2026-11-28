import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { devWarn } from "../dev";

/**
 * A screen region that may hold one `Title` (contract R2: one Jost title per
 * screen). The theme provider opens the root region; each screen, pane and
 * tab opens its own (the themed scaffolds and tab chrome do this for you).
 */
interface TitleRegistry {
  readonly name: string;
  readonly titles: Set<symbol>;
}

const TitleRegionContext = createContext<TitleRegistry | null>(null);

export function TitleRegion({
  name,
  children,
}: {
  /** Shown in the development warning ("player.home", "detail"). */
  readonly name: string;
  readonly children?: ReactNode;
}) {
  const registry = useMemo<TitleRegistry>(
    () => ({ name, titles: new Set() }),
    [name],
  );
  return (
    <TitleRegionContext.Provider value={registry}>
      {children}
    </TitleRegionContext.Provider>
  );
}

/** Registers a mounted Title; warns in development when a region has two. */
export function useTitleRegistration(text: string): void {
  const registry = useContext(TitleRegionContext);
  useEffect(() => {
    if (!registry) return;
    const id = Symbol(text);
    registry.titles.add(id);
    if (registry.titles.size > 1) {
      devWarn(
        `Two Titles are mounted in the "${registry.name}" region ("${text}" is the latest). Use one Jost title per screen (contract R2); use Text variant="phone-heading" for the rest, or give each pane its own TitleRegion.`,
      );
    }
    return () => {
      registry.titles.delete(id);
    };
  }, [registry, text]);
}
