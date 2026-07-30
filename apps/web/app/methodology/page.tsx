import { EditorialPage } from "@/components/editorial-page";

export const metadata = { title: "Sand Rating methodology" };

export default function MethodologyPage() {
  return (
    <EditorialPage
      eyebrow="Sand Rating"
      introduction="A doubles-native measure of current playing strength, built to explain itself."
      title="One number. Every movement accountable."
    >
      <h2>What the number means.</h2>
      <p>
        Sand Rating runs from 1.00 to 8.00: Novice, B, BB, A, AA, Open, and Pro.
        Underneath is a three-part rating state—strength, uncertainty, and
        volatility—maintained separately by discipline.
      </p>
      <h2>Doubles is not two singles ratings.</h2>
      <p>
        Team strength weights the weaker partner more heavily, because that
        better matches how sideout pressure and targeting shape beach
        volleyball. Stable partnership chemistry appears only after enough
        shared matches to separate signal from luck.
      </p>
      <h2>Evidence changes the weight, never the story.</h2>
      <p>
        Assigned live scoring and desk-officiated results carry full weight.
        Both-team confirmation, silent acceptance, self-report, imports, and
        group-confirmed pickup carry transparent lower weights. Forfeits affect
        standings and never ratings.
      </p>
      <h2>Anti-gaming is conservative.</h2>
      <p>
        Repeat opponents decay, weekly display gains are capped, and disputed
        matches freeze. Integrity detectors create human-review cases; they do
        not punish players automatically.
      </p>
    </EditorialPage>
  );
}
