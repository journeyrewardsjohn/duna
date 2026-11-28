import { type GalleryExample, galleryGroups } from "../gallery";
import { DebouncedValueDemo } from "../interactions";
import {
  AutosaveDemo,
  LatestSearchDemo,
  OfflineDemo,
  PendingNavigationDemo,
  SingleSubmitDemo,
  ThrottleDemo,
} from "./kit/action-demos";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.interactions,
    order: 70,
    title: "useDebouncedValue",
    content: <DebouncedValueDemo />,
  },
  {
    group: galleryGroups.interactions,
    order: 80,
    title: "useAction: single flight and idempotency keys",
    content: <SingleSubmitDemo />,
  },
  {
    group: galleryGroups.interactions,
    order: 90,
    title: "useDebouncedCallback and useLatest",
    content: <LatestSearchDemo />,
  },
  {
    group: galleryGroups.interactions,
    order: 100,
    title: "useThrottledCallback",
    content: <ThrottleDemo />,
  },
  {
    group: galleryGroups.interactions,
    order: 110,
    title: "useAutosave and AutosaveStatus",
    content: <AutosaveDemo />,
  },
  {
    group: galleryGroups.interactions,
    order: 120,
    title: "usePendingNavigation",
    content: <PendingNavigationDemo />,
  },
  {
    group: galleryGroups.interactions,
    order: 130,
    title: "useOnline and OfflineBanner",
    content: <OfflineDemo />,
  },
];

export default examples;
