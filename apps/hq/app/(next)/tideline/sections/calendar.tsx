import {
  CalendarExample,
  CalendarRangeExample,
  DatePickerExample,
  TimeExample,
} from "../examples";
import { type GalleryExample, galleryGroups } from "../gallery";

const examples: GalleryExample[] = [
  {
    group: galleryGroups.dates,
    order: 10,
    title: "Calendar",
    content: <CalendarExample />,
  },
  {
    group: galleryGroups.dates,
    order: 20,
    title: "Calendar, range",
    content: <CalendarRangeExample />,
  },
  {
    group: galleryGroups.dates,
    order: 30,
    title: "DatePicker and DateRangePicker",
    content: <DatePickerExample />,
  },
  {
    group: galleryGroups.dates,
    order: 40,
    title: "TimePicker and TimeSlotGrid",
    content: <TimeExample />,
  },
];

export default examples;
