import { type GalleryExample, type GalleryGroup } from "../gallery";
import { InteractionsLab } from "../interactions";
import { FormBehaviourDemo } from "./kit/form-demos";

const forms: GalleryGroup = {
  id: "forms",
  title: "Forms",
  order: 250,
  wrap: InteractionsLab,
};

const examples: GalleryExample[] = [
  {
    group: forms,
    order: 10,
    title: "useFormBehaviour, MoneyInput, CharacterCounter, SubmitBar",
    wide: true,
    content: <FormBehaviourDemo />,
  },
];

export default examples;
