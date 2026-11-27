import * as SplashScreen from "expo-splash-screen";
import { useState } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ProLaunchExperience } from "./launch-experience";
import { ProRuntimeProvider } from "./runtime";
import { useSatoshiFonts } from "./satoshi-text";
import { ProApp } from "./src/app/ProApp";

// Keep the native poster in place until the first React frame contains the
// bundled launch film. This prevents a white bridge frame on cold starts.
void SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useSatoshiFonts();
  const [showLaunchExperience, setShowLaunchExperience] = useState(true);

  if (fontError) throw fontError;
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <View onLayout={() => void SplashScreen.hideAsync()} style={{ flex: 1 }}>
        <ProRuntimeProvider>
          <ProApp />
        </ProRuntimeProvider>
        {showLaunchExperience && (
          <ProLaunchExperience
            onComplete={() => setShowLaunchExperience(false)}
          />
        )}
      </View>
    </SafeAreaProvider>
  );
}
