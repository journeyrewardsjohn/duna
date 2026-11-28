import { TabsExample } from "../examples";
import { type GalleryExample, galleryGroups } from "../gallery";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.controls,
    order: 70,
    title: "Tabs",
    content: <TabsExample />,
  },
];

export default examples;
