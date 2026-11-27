import { ToastExample } from "../examples";
import { type GalleryExample, galleryGroups } from "../gallery";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.overlays,
    order: 40,
    title: "Toast",
    content: <ToastExample />,
  },
];

export default examples;
