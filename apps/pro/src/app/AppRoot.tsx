import { installReactNativeErrorHandler } from "@duna/observability";
import {
  AppErrorBoundary,
  HapticsProvider,
  LaunchSequence,
  ThemeProvider,
  themeStorage,
} from "@duna/ui/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SplashScreen from "expo-splash-screen";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ProRuntimeProvider } from "../../runtime";
import { hapticsAdapter } from "./haptics-adapter";
import { ProApp } from "./ProApp";

// Uncaught JavaScript errors are reported once, then handed to React Native.
installReactNativeErrorHandler();
// The person's saved choice: "duna-theme" = light, dark or system.
const savedTheme = themeStorage(AsyncStorage);

/**
 * The app root's providers, in order: safe areas, the Tideline theme (holds
 * the first frame until the saved choice is read), haptics, the root error
 * boundary (reported through @duna/observability) and the first-open
 * sequence over the first screen. Mounted by App.tsx.
 */
export function AppRoot() {
  const [launching, setLaunching] = useState(true);
  return (
    <SafeAreaProvider>
      <ThemeProvider defaultPreference="light" storage={savedTheme}>
        <HapticsProvider adapter={hapticsAdapter}>
          <View
            onLayout={() => void SplashScreen.hideAsync()}
            style={{ flex: 1 }}
          >
            <AppErrorBoundary fullScreen name="pro.root">
              <ProRuntimeProvider>
                <ProApp />
              </ProRuntimeProvider>
            </AppErrorBoundary>
            {launching ? (
              <LaunchSequence
                label="Opening Duna Pro"
                onComplete={() => setLaunching(false)}
              />
            ) : null}
          </View>
        </HapticsProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
