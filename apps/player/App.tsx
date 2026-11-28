import * as SplashScreen from "expo-splash-screen";
import { AppRoot } from "./src/app/AppRoot";

// Keep the native poster until the saved theme is read and the first frame
// (the first-open sequence over the first screen) is laid out. Brand fonts
// are embedded by the expo-font config plugin, so nothing waits on them.
void SplashScreen.preventAutoHideAsync();

export default function App() {
  return <AppRoot />;
}
