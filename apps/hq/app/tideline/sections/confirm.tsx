import { type GalleryExample, type GalleryGroup } from "../gallery";
import { InteractionsLab } from "../interactions";
import {
  ConfirmTierDemo,
  InlineConfirmDemo,
  ProposalDemo,
  StrongTierDemo,
  UndoTierDemo,
} from "./kit/confirm-demos";

const confirmations: GalleryGroup = {
  id: "confirmations",
  title: "Confirmations",
  order: 350,
  wrap: InteractionsLab,
};

const examples: GalleryExample[] = [
  {
    group: confirmations,
    order: 10,
    title: "Tier 0: act, then Undo",
    content: <UndoTierDemo />,
  },
  {
    group: confirmations,
    order: 20,
    title: "Tier 1: confirm",
    content: <ConfirmTierDemo />,
  },
  {
    group: confirmations,
    order: 30,
    title: "Tier 2: strong confirm",
    wide: true,
    content: <StrongTierDemo />,
  },
  {
    group: confirmations,
    order: 40,
    title: "Inside a dialog: the question replaces its content",
    content: <InlineConfirmDemo />,
  },
  {
    group: confirmations,
    order: 50,
    title: "ProposalCard",
    content: <ProposalDemo />,
  },
];

export default examples;
