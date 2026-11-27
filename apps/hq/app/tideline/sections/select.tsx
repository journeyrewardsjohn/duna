import { ComboboxExample, SelectExample } from "../examples";
import { type GalleryExample, galleryGroups } from "../gallery";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.controls,
    order: 100,
    title: "Select",
    content: <SelectExample />,
  },
  {
    group: galleryGroups.controls,
    order: 110,
    title: "Combobox",
    content: <ComboboxExample />,
  },
];

export default examples;
