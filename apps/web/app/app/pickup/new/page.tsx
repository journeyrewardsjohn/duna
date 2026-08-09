import { PickupForm } from "@/components/pickup-form";
import { getServerCaller } from "@/lib/api";

export const metadata = { title: "Host pickup" };

export default async function NewPickupPage() {
  const caller = await getServerCaller();
  const [dashboard, players] = await Promise.all([
    caller.player.dashboard(),
    caller.public.players({ limit: 50 }),
  ]);
  return (
    <main className="standard-page">
      <PickupForm
        hostPersonId={dashboard.player.id}
        initialPlayers={players.filter(
          (player) => player.id !== dashboard.player.id,
        )}
      />
    </main>
  );
}
