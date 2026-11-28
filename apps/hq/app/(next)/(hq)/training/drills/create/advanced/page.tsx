import { hqHref } from "@duna/core/hq-routes";
import { redirect } from "next/navigation";

/** The old advanced drill editor address: opens New drill. */
export default function AdvancedDrillEditorPage(): never {
  redirect(hqHref("trainingDrillCreate"));
}
