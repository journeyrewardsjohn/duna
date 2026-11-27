import { DialogExample, SheetExample } from "../examples";
import { type GalleryExample, galleryGroups } from "../gallery";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.overlays,
    order: 10,
    title: "Dialog",
    content: <DialogExample />,
  },
  {
    group: galleryGroups.overlays,
    order: 20,
    title: "Sheet and drawer",
    content: <SheetExample />,
  },
];

export default examples;
