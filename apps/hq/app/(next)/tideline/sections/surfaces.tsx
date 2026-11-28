import {
  Avatar,
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  Notice,
  Surface,
} from "@duna/ui/tideline";
import { FilterChipsExample } from "../examples";
import { type GalleryExample, galleryGroups } from "../gallery";
import styles from "../gallery.module.css";
import { ToolbarDemo } from "../interactions";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.interactions,
    order: 80,
    title: "Toolbar: search, filter chips, sort",
    wide: true,
    content: <ToolbarDemo />,
  },
  {
    group: galleryGroups.feedback,
    order: 10,
    title: "Card",
    content: (
      <>
        <Card variant="flat">Flat card</Card>
        <Card variant="sunken">Sunken card</Card>
        <Card compact href="/tideline">
          Compact link card
        </Card>
      </>
    ),
  },
  {
    group: galleryGroups.feedback,
    order: 20,
    title: "Chip and Badge",
    content: (
      <>
        <div className={styles.row}>
          <Chip>Draft</Chip>
          <Chip tone="positive">Confirmed</Chip>
          <Chip tone="warning">Awaiting confirmation</Chip>
          <Chip tone="danger">Disputed</Chip>
          <Chip tone="info">Open</Chip>
          <Chip tone="attention">Needs you</Chip>
          <Chip tone="live">Live</Chip>
        </div>
        <div className={styles.row}>
          <Chip kind="taxonomy">Doubles</Chip>
          <Chip
            avatar={<Avatar decorative name="Sam Rivera" size="xs" />}
            kind="identity"
          >
            Sam Rivera
          </Chip>
          <Chip kind="metric" value="12">
            Matches
          </Chip>
          <Chip kind="metric" sun value="4.2">
            Sand Rating
          </Chip>
          <Badge label="unread messages">3</Badge>
          <Badge dot label="New activity" tone="live" />
        </div>
        <FilterChipsExample />
      </>
    ),
  },
  {
    group: galleryGroups.feedback,
    order: 30,
    title: "Notice",
    content: (
      <>
        <Notice title="Rating updates overnight">
          Results confirmed today count tomorrow.
        </Notice>
        <Notice title="Result saved" tone="positive" />
        <Notice
          action={<Button size="sm">Review</Button>}
          title="Two players have not paid"
          tone="attention"
        />
        <Notice title="Rain is forecast at 18:00" tone="warning" />
        <Notice title="Payment failed" tone="danger">
          The card was declined. Try another card.
        </Notice>
      </>
    ),
  },
  {
    group: galleryGroups.feedback,
    order: 40,
    title: "EmptyState",
    content: (
      <EmptyState
        actions={<Button variant="primary">Create a match</Button>}
        description="Matches you create or join show up here."
        icon="calendar"
        title="No matches yet"
      />
    ),
  },
  {
    group: galleryGroups.feedback,
    order: 70,
    title: "Surface",
    wide: true,
    content: (
      <div className={styles.grid}>
        <Surface className={styles.mesh} mesh="tidewater" radius="lg">
          <p className="td-title">Tidewater</p>
          <p className="td-body">Text on the mesh takes the mesh ink.</p>
          <Card>
            <p className="td-title">A card on the mesh</p>
            <p className="td-body">It keeps its own text colours.</p>
          </Card>
          <div className={styles.row}>
            <Button variant="light">Start free</Button>
            <Button variant="ghost">Learn more</Button>
          </div>
        </Surface>
        <Surface className={styles.mesh} mesh="night-court" radius="lg">
          <p className="td-title">Night Court</p>
          <p className="td-body">The live zone.</p>
          <Chip tone="live">Live</Chip>
        </Surface>
      </div>
    ),
  },
];

export default examples;
