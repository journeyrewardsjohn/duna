import {
  Button,
  CrossingLoader,
  HorizonSweep,
  MicroRally,
  PageLoader,
  RallyLoader,
  Serve,
  Skeleton,
  Spinner,
} from "@duna/ui/tideline";
import { type GalleryExample, galleryGroups } from "../gallery";
import styles from "../gallery.module.css";
import { DelayedLoadingDemo } from "../interactions";
import { PullToRefreshDemo, SetBySetDemo } from "./kit/loader-demos";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.interactions,
    order: 20,
    title: "useDelayedLoading, LoadingBoundary, TopProgress",
    content: <DelayedLoadingDemo />,
  },
  {
    group: galleryGroups.loading,
    order: 10,
    title: "Spinner",
    content: (
      <div className={styles.row}>
        <Spinner label="Loading" size="sm" />
        <Spinner label="Loading" />
        <Spinner label="Loading" size="lg" />
      </div>
    ),
  },
  {
    group: galleryGroups.loading,
    order: 20,
    title: "Skeleton",
    content: (
      <>
        <Skeleton label="Loading players" />
        <Skeleton kind="row" />
        <Skeleton kind="card" />
      </>
    ),
  },
  {
    group: galleryGroups.loading,
    order: 30,
    title: "HorizonSweep",
    content: <HorizonSweep label="Loading chart" />,
  },
  {
    group: galleryGroups.loading,
    order: 40,
    title: "PageLoader with Sunrise",
    wide: true,
    content: (
      <PageLoader
        description="Getting this week's matches."
        label="Loading your club"
      />
    ),
  },
  {
    group: galleryGroups.loading,
    order: 5,
    title: "RallyLoader (the default wait)",
    content: (
      <div className={styles.row}>
        <RallyLoader label="Loading" size="sm" />
        <RallyLoader label="Loading" />
        <RallyLoader label="Loading members" size="lg" />
      </div>
    ),
  },
  {
    group: galleryGroups.loading,
    order: 6,
    title: "MicroRally in a pressed button",
    content: (
      <div className={styles.row}>
        <Button loading variant="primary">
          Saving result
        </Button>
        <Button loading>Sending</Button>
        <MicroRally label="Saving" />
      </div>
    ),
  },
  {
    group: galleryGroups.loading,
    order: 7,
    title: "CrossingLoader (searching and matching)",
    content: <CrossingLoader label="Finding players near you" />,
  },
  {
    group: galleryGroups.loading,
    order: 8,
    title: "SetBySet (known steps)",
    content: <SetBySetDemo />,
  },
  {
    group: galleryGroups.loading,
    order: 50,
    title: "Serve (sign-in and long syncs)",
    content: <Serve label="Syncing your club" />,
  },
  {
    group: galleryGroups.interactions,
    order: 25,
    title: "PullToRefresh",
    content: <PullToRefreshDemo />,
  },
];

export default examples;
