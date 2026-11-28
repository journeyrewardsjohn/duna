import { DayStripExample } from "../examples";
import { type GalleryExample, galleryGroups } from "../gallery";
import {
  DaypartsDemo,
  DayStripDemo,
  DurationDemo,
  TimeRailDemo,
  TimeSlotsDemo,
  TimeSlotsLongest,
} from "../time-and-light/examples";

/** Time. Every state (empty, loading, daylight-saving days) is on /tideline/time-and-light. */
const examples: GalleryExample[] = [
  {
    group: galleryGroups.dates,
    order: 50,
    title: "DayStrip",
    wide: true,
    content: <DayStripDemo />,
  },
  {
    group: galleryGroups.dates,
    order: 51,
    title: "DayStrip (start and count)",
    wide: true,
    content: <DayStripExample />,
  },
  {
    group: galleryGroups.dates,
    order: 60,
    title: "TimeSlots",
    wide: true,
    content: <TimeSlotsDemo />,
  },
  {
    group: galleryGroups.dates,
    order: 61,
    title: "TimeSlots, longest labels",
    content: <TimeSlotsLongest />,
  },
  {
    group: galleryGroups.dates,
    order: 70,
    title: "DurationCrests",
    content: <DurationDemo />,
  },
  {
    group: galleryGroups.dates,
    order: 80,
    title: "Dayparts",
    content: <DaypartsDemo />,
  },
  {
    group: galleryGroups.dates,
    order: 90,
    title: "TimeRail",
    content: <TimeRailDemo />,
  },
];

export default examples;
