import { Checkbox, RadioGroup, RadioOption } from "@duna/ui/tideline";
import { SwitchExample } from "../examples";
import { type GalleryExample, galleryGroups } from "../gallery";
import { OptimisticSwitchDemo } from "../interactions";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.interactions,
    order: 50,
    title: "useOptimisticAction: Switch",
    content: <OptimisticSwitchDemo />,
  },
  {
    group: galleryGroups.controls,
    order: 30,
    title: "Switch",
    content: <SwitchExample />,
  },
  {
    group: galleryGroups.controls,
    order: 40,
    title: "Checkbox",
    content: (
      <>
        <Checkbox defaultChecked label="Email me the result" />
        <Checkbox label="Share with my club" />
        <Checkbox
          checked="indeterminate"
          description="Some players are selected."
          label="All players"
        />
        <Checkbox defaultChecked disabled label="Disabled" />
      </>
    ),
  },
  {
    group: galleryGroups.controls,
    order: 50,
    title: "Radio group",
    content: (
      <RadioGroup aria-label="Format" defaultValue="doubles">
        <RadioOption
          description="Two against two."
          label="Doubles"
          value="doubles"
        />
        <RadioOption label="King of the court" value="king" />
        <RadioOption disabled label="Fours (coming soon)" value="fours" />
      </RadioGroup>
    ),
  },
];

export default examples;
