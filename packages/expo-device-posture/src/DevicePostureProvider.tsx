import { requireNativeView, requireOptionalNativeModule } from "expo";
import * as Hinge from "expo-hinge";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import {
  UNAVAILABLE_POSTURE,
  derivePostureSnapshot,
  parseRegionsEvent,
  type HingeReading,
  type NativeRegions,
  type PostureSnapshot,
} from "./posture";

interface DunaDevicePostureNativeModule {
  readonly isAvailable: boolean;
}

interface ObserverProps extends ViewProps {
  readonly onRegionsChange: (event: { nativeEvent: unknown }) => void;
}

const nativeModule =
  requireOptionalNativeModule<DunaDevicePostureNativeModule>(
    "DunaDevicePosture",
  );

// Only ask for the native view when the module is linked: requireNativeView
// throws on binaries built before this module existed (an over-the-air update
// reaching an older binary must degrade, not crash).
const NativeObserver: ComponentType<ObserverProps> | null = nativeModule
  ? requireNativeView<ObserverProps>("DunaDevicePosture")
  : null;

/** True when this binary and OS can report the Duo's reserved regions. */
export function isDevicePostureAvailable(): boolean {
  return Boolean(nativeModule?.isAvailable);
}

function hingeAvailable(): boolean {
  try {
    return Hinge.isAvailable();
  } catch {
    return false;
  }
}

/**
 * Follows the hinge status only. The angle changes continuously while the
 * hinge moves; re-rendering the whole shell for it would be wasteful, and the
 * angle is for effects, so effects read it with `expo-hinge`'s own hooks.
 */
function useHingeStatus(): HingeReading | null {
  const read = (): HingeReading | null => {
    const hinge = Hinge.getHinge();
    return hinge ? { angle: hinge.angle, status: hinge.status } : null;
  };
  const [reading, setReading] = useState(read);
  useEffect(() => {
    setReading(read());
    const subscription = Hinge.addHingeListener(({ hinge }) => {
      setReading((current) => {
        if (!hinge) return null;
        if (current && current.status === hinge.status) return current;
        return { angle: hinge.angle, status: hinge.status };
      });
    });
    return () => subscription.remove();
  }, []);
  return reading;
}

const PostureContext = createContext<PostureSnapshot>(UNAVAILABLE_POSTURE);

/**
 * Mount once at the root of the app shell, as the full-window container.
 * It renders a transparent, non-interactive observer that fills the window and
 * reports reserved regions in window coordinates.
 */
export function DevicePostureProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [regions, setRegions] = useState<NativeRegions | null>(null);
  const hinge = useHingeStatus();
  const snapshot = useMemo(
    () =>
      derivePostureSnapshot({
        nativeModuleLinked: Boolean(NativeObserver),
        regions,
        hingeAvailable: hingeAvailable(),
        hinge,
      }),
    [hinge, regions],
  );
  return (
    <PostureContext.Provider value={snapshot}>
      <View style={styles.root}>
        {NativeObserver ? (
          <NativeObserver
            onRegionsChange={(event) => {
              const next = parseRegionsEvent(event.nativeEvent);
              if (next) setRegions(next);
            }}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        {children}
      </View>
    </PostureContext.Provider>
  );
}

/** The current posture, fold and occlusion regions; never throws. */
export function useDevicePosture(): PostureSnapshot {
  return useContext(PostureContext);
}

const styles = StyleSheet.create({ root: { flex: 1 } });
