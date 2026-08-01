import { redirect } from "next/navigation";

export default function CreateLeaguePage() {
  redirect("/events/create?type=league");
}
