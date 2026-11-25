/**
 * Tideline, Duna's component library, on Vercel's UI SDK.
 *
 *   import "@duna/ui/tideline/tideline.css";
 *   import { Button, Tideline } from "@duna/ui/tideline";
 *
 * Every component must render inside a `Tideline` scope. Guide:
 * docs/design/tideline-components.md.
 */
export {
  Tideline,
  TidelineFonts,
  TIDELINE_FONT_HREF,
  type TidelineProps,
  type TidelineThemeName,
} from "./tideline-root";
export { Icon, type IconName, type IconProps } from "./icons";

// Core controls
export {
  Button,
  buttonClassName,
  IconButton,
  type ButtonProps,
  type ButtonSize,
  type ButtonStyleOptions,
  type ButtonVariant,
  type IconButtonProps,
} from "./button";
export {
  Checkbox,
  RadioGroup,
  RadioOption,
  Switch,
  type CheckboxProps,
  type RadioGroupProps,
  type RadioOptionProps,
  type SwitchProps,
} from "./toggles";
export {
  Segmented,
  type SegmentedOption,
  type SegmentedProps,
} from "./segmented";
export {
  Tab,
  TabList,
  TabPanel,
  Tabs,
  type TabListProps,
  type TabPanelProps,
  type TabProps,
  type TabsProps,
} from "./tabs";
export {
  Field,
  Input,
  NumberInput,
  Textarea,
  type FieldProps,
  type InputProps,
  type NumberInputProps,
  type TextareaProps,
} from "./field";
export {
  Combobox,
  Select,
  type ComboboxProps,
  type SelectOption,
  type SelectProps,
} from "./select";

// Overlays
export {
  Dialog,
  DialogActions,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
  type DialogCloseProps,
  type DialogContentProps,
  type DialogProps,
  type DialogTriggerProps,
  type SheetCloseProps,
  type SheetContentProps,
  type SheetProps,
  type SheetTriggerProps,
} from "./dialog";
export {
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  type MenuContentProps,
  type MenuItemProps,
  type MenuProps,
  type MenuTriggerProps,
  type PopoverCloseProps,
  type PopoverContentProps,
  type PopoverProps,
  type PopoverTriggerProps,
  type TooltipProps,
} from "./popover";
export { toast, Toaster, type ToasterProps } from "./toast";

// Dates
export {
  Calendar,
  DatePicker,
  DateRangePicker,
  TimePicker,
  type CalendarProps,
  type DatePickerProps,
  type DateRange,
  type DateRangePickerProps,
  type TimePickerProps,
} from "./calendar";
export {
  DayStrip,
  TimeSlotGrid,
  type DayStripProps,
  type TimeSlot,
  type TimeSlotGridProps,
} from "./day-strip";
export {
  addDays,
  addMonths,
  compareDates,
  dayRange,
  daysBetween,
  daysInMonth,
  formatIsoDate,
  formatTime,
  formatTimeLabel,
  isIsoDate,
  isoDateOf,
  parseIsoDate,
  parseTime,
  timeSlots,
  toIsoDate,
  weekdayOf,
  type DateParts,
  type IsoDate,
  type IsoTime,
  type TimeSlotRange,
} from "./date-utils";

// People
export {
  Avatar,
  AvatarLevel,
  AvatarStack,
  initialsOf,
  PlayerSlot,
  type AvatarLevelProps,
  type AvatarPerson,
  type AvatarProps,
  type AvatarSize,
  type AvatarStackProps,
  type PlayerSlotProps,
  type PlayerSummary,
} from "./avatar";
export {
  AddPlayers,
  type AddPlayersChange,
  type AddPlayersLabels,
  type AddPlayersProps,
} from "./add-players";
export {
  addPlayer,
  filterPlayers,
  isPlayerSelected,
  openSpots,
  playerSlots,
  removePlayer,
  type AddPlayerResult,
  type RemovePlayerResult,
} from "./add-players-logic";

// Debounce and search
export { createDebouncer, type Debouncer } from "./debouncer";
export {
  useDebouncedCallback,
  useDebouncedValue,
  type DebouncedCallback,
} from "./debounce";
export {
  SearchField,
  type SearchFieldMessages,
  type SearchFieldProps,
} from "./search-field";
export {
  resolveSearchState,
  type SearchFieldState,
  type SearchStateInput,
  type SearchStatus,
} from "./search-state";

// Loading: the sand and sun family
export {
  PageLoader,
  Ripple,
  Skeleton,
  Sunrise,
  Sunspot,
  type LoaderSize,
  type PageLoaderProps,
  type RippleProps,
  type SkeletonProps,
  type SunriseProps,
  type SunspotProps,
} from "./loaders";

// Feedback and layout
export {
  Badge,
  Card,
  Chip,
  EmptyState,
  FilterChip,
  Notice,
  Surface,
  type BadgeProps,
  type CardProps,
  type ChipProps,
  type EmptyStateProps,
  type FilterChipProps,
  type MeshName,
  type NoticeProps,
  type SurfaceProps,
  type TidelineTone,
} from "./surfaces";
export {
  Progress,
  Stepper,
  type ProgressProps,
  type StepperProps,
  type StepperStep,
} from "./progress";
