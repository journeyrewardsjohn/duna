import type { Metadata } from "next";
import { loadHome } from "@/components/app-shell/home/home-data";
import { HomeView } from "@/components/app-shell/home/home-view";

export const metadata: Metadata = { title: "Home" };

/** Player web Home: the Play root (`/app`). */
export default async function PlayerHomePage() {
  const data = await loadHome();
  return <HomeView data={data} />;
}
