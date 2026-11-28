import { PopoverMenuExample } from "../examples";
import { type GalleryExample, galleryGroups } from "../gallery";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.overlays,
    order: 30,
    title: "Popover, Menu and Tooltip",
    content: <PopoverMenuExample />,
  },
];

export default examples;
