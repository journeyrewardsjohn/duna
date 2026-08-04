import { requireNativeView } from "expo";
import type { ComponentType } from "react";
import type { DunaVideoCaptureViewProps } from "./DunaVideoCapture.types";

export const DunaVideoCaptureView =
  requireNativeView<DunaVideoCaptureViewProps>(
    "DunaVideoCapture",
  ) as ComponentType<DunaVideoCaptureViewProps>;
