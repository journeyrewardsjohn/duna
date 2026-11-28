import { ToastExample } from "../examples";
import { type GalleryExample, galleryGroups } from "../gallery";
import { ToastKitDemo } from "./kit/toast-demos";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.overlays,
    order: 40,
    title: "Toast",
    content: <ToastExample />,
  },
  {
    group: galleryGroups.overlays,
    order: 41,
    title: "Toast: success, error with reference, Undo, stacking",
    content: <ToastKitDemo />,
  },
];

export default examples;
