import { Button, Icon, IconButton } from "@duna/ui/tideline";
import { type GalleryExample, galleryGroups } from "../gallery";
import styles from "../gallery.module.css";
import { ButtonLoadingDemo } from "../interactions";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.interactions,
    order: 30,
    title: "Button loading",
    content: <ButtonLoadingDemo />,
  },
  {
    group: galleryGroups.controls,
    order: 10,
    title: "Button",
    content: (
      <>
        <div className={styles.row}>
          <Button variant="primary">Save result</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Cancel match</Button>
        </div>
        <div className={styles.row}>
          <Button size="sm">Small</Button>
          <Button size="lg" variant="primary">
            Large
          </Button>
          <Button icon={<Icon name="plus" />}>With icon</Button>
          <Button iconEnd={<Icon name="chevron-right" />} variant="ghost">
            Next
          </Button>
        </div>
        <div className={styles.row}>
          <Button loading variant="primary">
            Saving
          </Button>
          <Button icon={<Icon name="plus" />} loading>
            Creating
          </Button>
          <Button disabled variant="primary">
            Disabled
          </Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className={styles.row}>
          <Button href="/tideline" variant="primary">
            Primary link
          </Button>
          <Button href="/tideline">Link button</Button>
        </div>
        <Button block variant="primary">
          Full width
        </Button>
      </>
    ),
  },
  {
    group: galleryGroups.controls,
    order: 20,
    title: "IconButton",
    content: (
      <div className={styles.row}>
        <IconButton label="Search">
          <Icon name="search" />
        </IconButton>
        <IconButton label="Add player" variant="tonal">
          <Icon name="user-plus" />
        </IconButton>
        <IconButton label="More" variant="outline">
          <Icon name="more" />
        </IconButton>
        <IconButton label="Close" size="sm">
          <Icon name="close" />
        </IconButton>
        <IconButton label="Saving" loading variant="outline">
          <Icon name="check" />
        </IconButton>
        <IconButton disabled label="Unavailable">
          <Icon name="calendar" />
        </IconButton>
      </div>
    ),
  },
];

export default examples;
