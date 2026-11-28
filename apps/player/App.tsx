import * as SplashScreen from "expo-splash-screen";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PlayerRuntimeProvider } from "./runtime";
import { useSatoshiFonts } from "./satoshi-text";
import { DunaApp } from "./src/app/DunaApp";

// Keep the short native poster in place until the first usable React frame.
// The prior full-screen launch film is intentionally no longer in the path.
void SplashScreen.preventAutoHideAsync();

export default function App() {
  const [fontsLoaded, fontError] = useSatoshiFonts();

  if (fontError) throw fontError;
  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <View onLayout={() => void SplashScreen.hideAsync()} style={{ flex: 1 }}>
        <PlayerRuntimeProvider>
          <DunaApp />
        </PlayerRuntimeProvider>
      </View>
    </SafeAreaProvider>
  );
}
