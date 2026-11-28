import { Easing } from "react-native";
import { nativeTokens, type NativeEasing } from "../tokens";

/** A token easing as a React Native easing function. */
export function tokenEasing(name: NativeEasing): (value: number) => number {
  const [x1, y1, x2, y2] = nativeTokens.motion.easing[name];
  return Easing.bezier(x1, y1, x2, y2);
}
