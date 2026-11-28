import { HorizonSweep, PageLoader, Skeleton, Spinner } from "@duna/ui/tideline";
import { type GalleryExample, galleryGroups } from "../gallery";
import styles from "../gallery.module.css";
import { DelayedLoadingDemo } from "../interactions";

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
];

export default examples;
