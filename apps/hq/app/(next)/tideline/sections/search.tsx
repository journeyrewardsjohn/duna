import { type GalleryExample, galleryGroups } from "../gallery";
import { AsyncSearchDemo } from "../interactions";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.interactions,
    order: 10,
    title: "useAsyncSearch + SearchField",
    content: <AsyncSearchDemo />,
  },
];

export default examples;
