import { type GalleryExample, type GalleryGroup } from "../gallery";
import {
  AnimatedListDemo,
  FirstOpenDemo,
  NumberChangeDemo,
  PaneTransitionDemo,
  RallyDemo,
  RallyOnChangeDemo,
  RiseDemo,
  ViewTransitionDemo,
} from "./kit/motion-demos";

/** The three verbs as parts, after Foundations shows them as tokens. */
const motion: GalleryGroup = { id: "motion", title: "Motion", order: 150 };

const examples: GalleryExample[] = [
  { group: motion, order: 10, title: "Rise", content: <RiseDemo /> },
  { group: motion, order: 20, title: "Rally", content: <RallyDemo /> },
  {
    group: motion,
    order: 30,
    title: "RallyOnChange: a change in place",
    content: <RallyOnChangeDemo />,
  },
  {
    group: motion,
    order: 40,
    title: "Cross: PaneTransition and PageTransition",
    content: <PaneTransitionDemo />,
  },
  {
    group: motion,
    order: 50,
    title: "crossViewTransition (View Transitions API)",
    content: <ViewTransitionDemo />,
  },
  {
    group: motion,
    order: 60,
    title: "AnimatedList: insert, remove, reorder",
    content: <AnimatedListDemo />,
  },
  {
    group: motion,
    order: 70,
    title: "NumberChange: scores and ratings",
    content: <NumberChangeDemo />,
  },
  {
    group: motion,
    order: 80,
    title: "FirstOpen",
    wide: true,
    content: <FirstOpenDemo />,
  },
];

export default examples;
