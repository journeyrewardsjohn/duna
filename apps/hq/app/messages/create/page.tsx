import { redirect } from "next/navigation";

export default function CreateMessagePage() {
  redirect("/messages?compose=new");
}
