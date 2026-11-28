import { hqHref } from "@duna/core/hq-routes";
import { redirect } from "next/navigation";

/** The old advanced editor address: opens the classic court editor. */
export default function AdvancedDrillEditorPage(): never {
  redirect(hqHref("trainingDrillClassicAdvanced"));
}
