import { Field, Icon, Input, NumberInput, Textarea } from "@duna/ui/tideline";
import { type GalleryExample, galleryGroups } from "../gallery";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.controls,
    order: 80,
    title: "Field, Input and Textarea",
    content: (
      <>
        <Field hint="Shown on your club page." label="Club name">
          <Input defaultValue="Demo Beach Club" />
        </Field>
        <Field label="Contact email" optional>
          <Input placeholder="name@example.com" type="email" />
        </Field>
        <Field error="Enter a name of at least two letters." label="First name">
          <Input defaultValue="S" />
        </Field>
        <Field disabled label="Disabled">
          <Input defaultValue="Locked value" />
        </Field>
        <Field label="Search with clear">
          <Input clearable defaultValue="Sand" icon={<Icon name="search" />} />
        </Field>
        <Field label="Notes">
          <Textarea placeholder="Anything players should know" />
        </Field>
      </>
    ),
  },
  {
    group: galleryGroups.controls,
    order: 90,
    title: "NumberInput",
    content: (
      <>
        <Field hint="Between 2 and 12." label="Players">
          <NumberInput defaultValue={4} max={12} min={2} />
        </Field>
        <Field label="Price per player">
          <NumberInput
            defaultValue={12.5}
            format={{ style: "currency", currency: "USD" }}
            locale="en"
            min={0}
            step={0.5}
          />
        </Field>
      </>
    ),
  },
];

export default examples;
