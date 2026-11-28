import { ErrorBoundary } from "@duna/observability/react";
import type { ReactNode } from "react";
import { View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { ErrorState } from "./states";

function Fallback({
  reference,
  reset,
  fullScreen,
}: {
  readonly reference: string;
  readonly reset: () => void;
  readonly fullScreen: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={
        fullScreen
          ? {
              flex: 1,
              justifyContent: "center",
              backgroundColor: colors.ground,
            }
          : undefined
      }
    >
      <ErrorState
        onRetry={reset}
        reference={reference}
        text="This part of Duna stopped working. Try again; if it keeps happening, send us the reference below."
      />
    </View>
  );
}

/**
 * An error boundary wired to `@duna/observability`: the failure is reported
 * once (`ui.boundary.caught`, tagged with `name`), and the person sees the
 * error state with the reference and Try again. Use one at the app root
 * (`fullScreen`) and one per independent pane.
 */
export function AppErrorBoundary({
  name,
  children,
  fullScreen = false,
  resetKeys,
}: {
  /** Low-cardinality name: "player.root", "pro.today.agenda". */
  readonly name: string;
  readonly children?: ReactNode;
  readonly fullScreen?: boolean;
  readonly resetKeys?: readonly unknown[];
}) {
  return (
    <ErrorBoundary
      fallback={({ reference, reset }) => (
        <Fallback fullScreen={fullScreen} reference={reference} reset={reset} />
      )}
      name={name}
      resetKeys={resetKeys}
    >
      {children}
    </ErrorBoundary>
  );
}
