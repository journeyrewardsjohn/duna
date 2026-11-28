import { type GalleryExample, type GalleryGroup } from "../gallery";
import {
  ConditionsLines,
  ConditionsPanels,
  LightMarks,
  ScheduleHeader,
  SunArcs,
  WindDemo,
} from "../time-and-light/examples";

/** Light and weather. Every state is on /tideline/time-and-light. */
const conditions: GalleryGroup = {
  id: "conditions",
  title: "Light and weather",
  order: 450,
};

const examples: GalleryExample[] = [
  {
    group: conditions,
    order: 10,
    title: "Schedule header with ConditionsLine",
    content: <ScheduleHeader />,
  },
  {
    group: conditions,
    order: 20,
    title: "ConditionsLine",
    wide: true,
    content: <ConditionsLines />,
  },
  { group: conditions, order: 30, title: "LightMark", content: <LightMarks /> },
  { group: conditions, order: 40, title: "WindOnCourt", content: <WindDemo /> },
  {
    group: conditions,
    order: 50,
    title: "SunArc",
    wide: true,
    content: <SunArcs />,
  },
  {
    group: conditions,
    order: 60,
    title: "Conditions",
    wide: true,
    content: <ConditionsPanels />,
  },
];

export default examples;
