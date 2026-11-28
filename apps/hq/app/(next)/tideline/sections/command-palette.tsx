import { Kbd } from "@duna/ui/tideline";
import { type GalleryExample, galleryGroups } from "../gallery";
import { CommandPaletteDemo } from "../interactions";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.interactions,
    order: 60,
    title: "CommandPalette (Cmd/Ctrl K)",
    content: (
      <>
        <CommandPaletteDemo />
        <p className="td-meta">
          Press <Kbd>⌘</Kbd> <Kbd>K</Kbd> or <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>{" "}
          anywhere.
        </p>
      </>
    ),
  },
];

export default examples;
