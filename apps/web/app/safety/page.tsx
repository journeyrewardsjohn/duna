import { EditorialPage } from "@/components/editorial-page";

export const metadata = { title: "Safety" };

export default function SafetyPage() {
  return (
    <EditorialPage
      eyebrow="Trust + safety"
      introduction="Safety is server-enforced product behavior, not a policy page people have to remember."
      title="Protected by structure."
    >
      <h2>Minors are private by default.</h2>
      <p>
        Guardianship is a verified relationship. Guardians sign, pay, see the
        right activity, and receive a copy of every coach-to-minor message.
        Under-13 profiles are never public.
      </p>
      <h2>Coaches earn trust in layers.</h2>
      <p>
        Identity, annual background checks, certification status, verified
        playing history, and attended-session reviews all stay distinct so a
        badge means exactly what it says.
      </p>
      <h2>Human review where context matters.</h2>
      <p>
        Rating integrity, content reports, match disputes, and money-movement
        risk produce evidence-rich queues. Duna never turns a model signal into
        automatic punishment.
      </p>
    </EditorialPage>
  );
}
