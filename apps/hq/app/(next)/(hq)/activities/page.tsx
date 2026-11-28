import { hqHref } from "@duna/core/hq-routes";
import { redirect } from "next/navigation";

/**
 * The old Activities hub, retired by the IA: each of its cards has a home
 * (programs in Training, lessons, memberships and products in Offerings,
 * tournaments and leagues in Events). It opens Offerings.
 */
export default function ActivitiesPage(): never {
  redirect(hqHref("offerings"));
}
