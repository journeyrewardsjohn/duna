import { SegmentedExample } from "../examples";
import { type GalleryExample, galleryGroups } from "../gallery";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.controls,
    order: 60,
    title: "Segmented control",
    content: <SegmentedExample />,
  },
];

export default examples;
