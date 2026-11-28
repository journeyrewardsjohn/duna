import { EditorialPage } from "@/components/editorial-page";

export const metadata = {
  title: "About",
  alternates: {
    canonical: "/about",
    types: { "text/markdown": "/about.md" },
  },
};

export default function AboutPage() {
  return (
    <EditorialPage
      eyebrow="About Duna"
      introduction="Beach volleyball has always had the community, the ritual, and the ambition. Duna gives all of it a home."
      title="The network belongs on the same sand as the game."
    >
      <h2>One graph, two sides.</h2>
      <p>
        Clubs, coaches, facilities, leagues, and tournament directors run their
        businesses in Duna. Players and parents use Duna to learn, find, book,
        compete, connect, and carry their history. Every verified match makes
        the network more useful; every player makes the operators stronger.
      </p>
      <h2>Built for the shape of this sport.</h2>
      <p>
        Doubles ratings, partner claims, work teams, weather holds, purse
        payouts, public-court pickup, minors safety, and offline scoring are not
        add-ons. They are the architecture.
      </p>
      <blockquote>
        The operating system for sand. The network for everyone who plays on it.
      </blockquote>
    </EditorialPage>
  );
}
