import { type GalleryExample, galleryGroups } from "../gallery";
import { OptimisticPlayersDemo } from "../interactions";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.interactions,
    order: 40,
    title: "useOptimisticAction: add and remove players, with Undo",
    wide: true,
    content: <OptimisticPlayersDemo />,
  },
];

export default examples;
