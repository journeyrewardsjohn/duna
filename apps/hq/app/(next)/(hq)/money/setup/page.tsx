import { hqHref } from "@duna/core/hq-routes";
import { redirect } from "next/navigation";

/** The old "Configure money" address: Duna Pay setup replaced it (H10). */
export default function MoneySetupPage() {
  redirect(hqHref("moneyDunaPay"));
}
