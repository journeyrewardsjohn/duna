import { requireNativeView } from "expo";
import type { ComponentType } from "react";
import type { DunaCaptureViewProps } from "./DunaCapture.types";

export const DunaCaptureView = requireNativeView<DunaCaptureViewProps>(
  "DunaCapture",
) as ComponentType<DunaCaptureViewProps>;
