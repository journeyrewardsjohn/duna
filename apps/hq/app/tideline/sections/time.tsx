import { DayStripExample } from "../examples";
import { type GalleryExample, galleryGroups } from "../gallery";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.dates,
    order: 50,
    title: "DayStrip",
    wide: true,
    content: <DayStripExample />,
  },
];

export default examples;
