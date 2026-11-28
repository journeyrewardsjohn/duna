import { type GalleryExample, type GalleryGroup } from "../gallery";
import { InteractionsLab } from "../interactions";
import {
  AsyncBoundaryDemo,
  ErrorStateDemo,
  HonestStatesDemo,
  LoadingLayoutsDemo,
} from "./kit/state-demos";

const states: GalleryGroup = {
  id: "states",
  title: "States",
  order: 650,
  wrap: InteractionsLab,
};

const examples: GalleryExample[] = [
  {
    group: states,
    order: 10,
    title: "AsyncBoundary",
    wide: true,
    content: <AsyncBoundaryDemo />,
  },
  {
    group: states,
    order: 20,
    title: "LoadingState: skeletons shaped like the layout",
    content: <LoadingLayoutsDemo />,
  },
  {
    group: states,
    order: 30,
    title: "ErrorState with a reference",
    content: <ErrorStateDemo />,
  },
  {
    group: states,
    order: 40,
    title: "Not configured, switched off, no access, partial, no results",
    wide: true,
    content: <HonestStatesDemo />,
  },
];

export default examples;
