import { MembershipCard, MembershipPass } from "@duna/ui/tideline";
import { DUNA_ART_SET } from "@duna/tideline-core";
import { type GalleryExample, type GalleryGroup } from "../gallery";
import styles from "../gallery.module.css";
import { GALLERY_CARDS } from "./kit/wallet-cards";
import {
  ArrivalDemo,
  ArtPickerDemo,
  FlipDemo,
  WalletDemo,
} from "./kit/wallet-demo";

const group: GalleryGroup = {
  id: "wallet",
  title: "Wallet and membership card",
  order: 545,
};

const card = (id: string) => GALLERY_CARDS.find((c) => c.id === id)!;

const examples: GalleryExample[] = [
  {
    group,
    order: 10,
    title:
      "MembershipCard · active, paused, pending, ended (the art never fades)",
    wide: true,
    content: (
      <div className={styles.grid} data-wallet-states="">
        <MembershipCard {...card("saltline")} />
        <MembershipCard {...card("kelp")} />
        <MembershipCard {...card("pier9")} />
        <MembershipCard {...card("driftwood")} />
      </div>
    ),
  },
  {
    group,
    order: 20,
    title:
      "MembershipCard · junior held by a guardian, family, staff, day pass, credit pack",
    wide: true,
    content: (
      <div className={styles.grid}>
        <MembershipCard {...card("lantern")} />
        <MembershipCard {...card("kelp")} status="active" />
        <MembershipCard {...card("cove")} />
        <MembershipCard {...card("marram")} />
        <MembershipCard {...card("northshore")} />
        <MembershipCard
          {...card("saltline")}
          club={{
            name: "Montgomery-Clarke Beach Volleyball Association",
            color: "#5B3A8C",
          }}
          member="Bartholomew Featherstonehaugh-Montgomery"
          number="000412"
        />
      </div>
    ),
  },
  {
    group,
    order: 30,
    title: "Art set · every piece with its measured scrim (type at 5:1)",
    wide: true,
    content: (
      <div className={styles.grid} data-wallet-artset="">
        {DUNA_ART_SET.map((piece) => (
          <MembershipCard
            {...card("saltline")}
            art={{ source: "set", key: piece.key }}
            chip={piece.name}
            key={piece.key}
            motion="still"
          />
        ))}
        <MembershipCard
          {...card("dunehouse")}
          chip="Club colour"
          motion="still"
        />
        <MembershipCard
          {...card("pier9")}
          chip="Club colour"
          motion="still"
          status="active"
        />
      </div>
    ),
  },
  {
    group,
    order: 40,
    title: "Wallet · 1 card",
    content: <WalletDemo count={1} />,
  },
  {
    group,
    order: 41,
    title: "Wallet · 2 cards (carousel only)",
    content: <WalletDemo count={2} />,
  },
  {
    group,
    order: 42,
    title: "Wallet · 5 cards (carousel: swipe, drag, arrows)",
    content: (
      <div data-wallet-demo="5">
        <WalletDemo count={5} />
      </div>
    ),
  },
  {
    group,
    order: 43,
    title: "Wallet · 12 cards (stack: draw one out)",
    content: (
      <div data-wallet-demo="12">
        <WalletDemo count={12} />
      </div>
    ),
  },
  {
    group,
    order: 50,
    title: "The pass · tap the card to turn it over",
    content: (
      <div data-wallet-flip="">
        <FlipDemo card={card("saltline")} />
      </div>
    ),
  },
  {
    group,
    order: 51,
    title:
      "The pass · static Duna credential, paused, pending, ended, the longest names",
    wide: true,
    content: (
      <div className={styles.grid} data-wallet-passes="">
        {(["saltline", "kelp", "pier9", "driftwood"] as const).map((id) => (
          <MembershipCard {...card(id)} flipped key={id} motion="still" />
        ))}
        <MembershipCard
          {...card("harbor")}
          flipped
          motion="still"
          pass={null}
        />
        <MembershipCard
          {...card("kelp")}
          club={{
            name: "Montgomery-Clarke Beach Volleyball Association",
            color: "#5B3A8C",
          }}
          flipped
          heldBy="Rae Castillo-Featherstonehaugh"
          member="Bartholomew Featherstonehaugh-Montgomery"
          motion="still"
          number="000412"
          plan="Family plan · 3 people · Saturday juniors"
          validThrough="Nov 30, 2027"
        />
      </div>
    ),
  },
  {
    group,
    order: 52,
    title: "MembershipPass · on its own",
    content: (
      <div
        style={{
          position: "relative",
          maxWidth: 372,
          containerType: "inline-size",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        <MembershipPass {...card("lantern")} />
      </div>
    ),
  },
  {
    group,
    order: 60,
    title:
      "Stills · motion off (reduced motion, data saver and the strip show posters)",
    content: (
      <div className={styles.stack}>
        <MembershipCard {...card("harbor")} motion="still" />
        <MembershipCard {...card("harbor")} size="strip" />
        <MembershipCard {...card("lantern")} size="strip" />
      </div>
    ),
  },
  {
    group,
    order: 70,
    title: "Card designer · art picker",
    content: <ArtPickerDemo />,
  },
  {
    group,
    order: 80,
    title: "CardArrival · the purchase moment",
    content: <ArrivalDemo />,
  },
];

export default examples;
