import { type GalleryExample, galleryGroups } from "../gallery";
import { DebouncedValueDemo } from "../interactions";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.interactions,
    order: 70,
    title: "useDebouncedValue",
    content: <DebouncedValueDemo />,
  },
];

export default examples;
