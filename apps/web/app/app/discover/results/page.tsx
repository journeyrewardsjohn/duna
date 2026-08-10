import { redirect } from "next/navigation";

export default async function LegacyDiscoveryResultsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const incoming = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value === "string") query.set(key, value);
    else for (const item of value ?? []) query.append(key, item);
  }
  redirect(`/discover/results${query.size > 0 ? `?${query}` : ""}`);
}
