import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AccessibilityInfo } from "react-native";

const Override = createContext<boolean | null>(null);

/** The system Reduce Motion setting, followed live. */
export function useSystemReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (live) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}

/** Reduce Motion: the system setting unless a `MotionPreference` forces it. */
export function useReducedMotion(): boolean {
  const forced = useContext(Override);
  const system = useSystemReducedMotion();
  return forced ?? system;
}

/**
 * Forces reduced motion on (or off) for a subtree: galleries and tests.
 * Product code follows the system setting.
 */
export function MotionPreference({
  reduceMotion,
  children,
}: {
  readonly reduceMotion: boolean | null;
  readonly children?: ReactNode;
}) {
  return <Override.Provider value={reduceMotion}>{children}</Override.Provider>;
}
