import { hqHref } from "@duna/core/hq-routes";
import { redirect } from "next/navigation";

/** The old Programs & camps address: programs live in Training › Programs. */
export default function ProgramsPage(): never {
  redirect(hqHref("training"));
}
