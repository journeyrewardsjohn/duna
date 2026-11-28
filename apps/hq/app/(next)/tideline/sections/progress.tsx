import { Progress, Stepper } from "@duna/ui/tideline";
import { type GalleryExample, galleryGroups } from "../gallery";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.feedback,
    order: 50,
    title: "Progress",
    content: (
      <>
        <Progress label="Profile" showValue value={60} />
        <Progress aria-label="Uploading" value={null} />
      </>
    ),
  },
  {
    group: galleryGroups.feedback,
    order: 60,
    title: "Stepper",
    content: (
      <Stepper
        aria-label="Club setup"
        current={2}
        steps={[
          { title: "Name your club" },
          { title: "Add your courts", description: "Three courts added." },
          { title: "Set prices", description: "Members and guests." },
          { title: "Go live" },
        ]}
      />
    ),
  },
];

export default examples;
