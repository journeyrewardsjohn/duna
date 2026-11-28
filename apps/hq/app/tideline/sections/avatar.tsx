import {
  Avatar,
  AvatarLevel,
  AvatarStack,
  PlayerSlot,
} from "@duna/ui/tideline";
import { type GalleryExample, galleryGroups } from "../gallery";
import styles from "../gallery.module.css";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.people,
    order: 10,
    title: "Avatar and AvatarStack",
    content: (
      <>
        <div className={styles.row}>
          <Avatar name="Sam Rivera" size="xs" />
          <Avatar name="Noor Haddad" size="sm" />
          <Avatar name="Jo Lindqvist" />
          <Avatar name="Kai Tanaka" size="lg" />
          <Avatar kind="club" name="Demo Beach Club" />
        </div>
        <AvatarStack
          label="6 players joined"
          max={4}
          people={[
            { name: "Sam Rivera" },
            { name: "Noor Haddad" },
            { name: "Jo Lindqvist" },
            { name: "Kai Tanaka" },
            { name: "Mika Okafor" },
            { name: "Ana Duarte" },
          ]}
        />
      </>
    ),
  },
  {
    group: galleryGroups.people,
    order: 20,
    title: "AvatarLevel",
    content: (
      <>
        <div className={styles.row}>
          <AvatarLevel caption="Sam" level="4.2" name="Sam Rivera" size="sm" />
          <AvatarLevel caption="Noor" level="3.8" name="Noor Haddad" />
          <AvatarLevel caption="Jo" level="4.5" name="Jo Lindqvist" size="lg" />
          <AvatarLevel caption="Kai" name="Kai Tanaka" />
        </div>
        <p className="td-meta">A pending level shows no chip, never a zero.</p>
      </>
    ),
  },
  {
    group: galleryGroups.people,
    order: 30,
    title: "PlayerSlot",
    content: (
      <div className={styles.row}>
        <PlayerSlot player={{ id: "a", name: "Lee", level: "3.9" }} you />
        <PlayerSlot
          payment="paid"
          player={{ id: "b", name: "Sam", level: "4.2" }}
        />
        <PlayerSlot
          payment="unpaid"
          player={{ id: "c", name: "Noor", level: "3.8" }}
          price="$6.00"
        />
        <PlayerSlot />
      </div>
    ),
  },
];

export default examples;
