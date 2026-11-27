import * as WebBrowser from "expo-web-browser";
import { dunaWebUrl } from "../../../mobile-api";
import { selectionHaptic } from "../../shared/haptics";

export function mobilePredictionPercent(priceBps: number) {
  return `${Math.round(priceBps / 100)}%`;
}

export function formatPredictionCredits(value: number, signed = false) {
  const prefix = signed && value > 0 ? "+" : "";
  return `${prefix}${value.toLocaleString("en-US", {
    maximumFractionDigits: 1,
  })}`;
}

export function openPredictionMarket(marketPath: string) {
  selectionHaptic();
  void WebBrowser.openBrowserAsync(`${dunaWebUrl}${marketPath}`);
}
