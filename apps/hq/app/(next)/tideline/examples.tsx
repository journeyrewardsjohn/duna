"use client";

import {
  Button,
  Calendar,
  Checkbox,
  Combobox,
  DatePicker,
  DateRangePicker,
  type DateRange,
  DayStrip,
  Dialog,
  DialogActions,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Field,
  FilterChip,
  Icon,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  type PlayerSummary,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
  Segmented,
  Select,
  Sheet,
  SheetClose,
  SheetContent,
  SheetTrigger,
  Switch,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  TimePicker,
  TimeSlotGrid,
  toast,
  Toaster,
  Tooltip,
  IconButton,
} from "@duna/ui/tideline";
import { useState } from "react";
import styles from "./gallery.module.css";

/** The gallery's fixed "today", so server and browser render the same page. */
export const GALLERY_TODAY = "2026-11-25";

export const people: PlayerSummary[] = [
  { id: "p1", name: "Sam Rivera", level: "4.2", detail: "Demo Beach Club" },
  {
    id: "p2",
    name: "Noor Haddad",
    level: "3.8",
    detail: "Played together 3 times",
  },
  { id: "p3", name: "Jo Lindqvist", level: "4.5", detail: "Demo Beach Club" },
  { id: "p4", name: "Kai Tanaka", detail: "Level pending" },
  { id: "p5", name: "Mika Okafor", level: "3.1", detail: "Sunday open play" },
  { id: "p6", name: "Ana Duarte", level: "4.0", detail: "Demo Beach Club" },
  { id: "p7", name: "Tom Becker", level: "2.9", detail: "New to Duna" },
];
export const me: PlayerSummary = { id: "me", name: "Lee Novak", level: "3.9" };

export function SwitchExample() {
  const [on, setOn] = useState(true);
  return (
    <div className={styles.stack}>
      <Switch
        checked={on}
        description="Players get a reminder two hours before."
        label="Match reminders"
        onCheckedChange={setOn}
      />
      <p className="td-meta" data-testid="switch-output">
        Reminders are {on ? "on" : "off"}.
      </p>
      <Switch defaultChecked disabled label="Disabled, on" />
    </div>
  );
}

export function TabsExample() {
  return (
    <Tabs defaultValue="upcoming">
      <TabList aria-label="Matches">
        <Tab value="upcoming">Upcoming</Tab>
        <Tab count={3} value="results">
          Results
        </Tab>
        <Tab value="invites">Invites</Tab>
        <Tab disabled value="archive">
          Archive
        </Tab>
      </TabList>
      <TabPanel value="upcoming">
        <p className="td-body">Two matches this week.</p>
      </TabPanel>
      <TabPanel value="results">
        <p className="td-body">Three results wait for confirmation.</p>
      </TabPanel>
      <TabPanel value="invites">
        <p className="td-body">No open invites.</p>
      </TabPanel>
      <TabPanel value="archive">
        <p className="td-body">Archive.</p>
      </TabPanel>
    </Tabs>
  );
}

export function SegmentedExample() {
  const [view, setView] = useState<string | null>("list");
  return (
    <div className={styles.stack}>
      <Segmented
        aria-label="View"
        onValueChange={setView}
        options={[
          { value: "list", label: "List" },
          { value: "calendar", label: "Calendar" },
          { value: "map", label: "Map" },
        ]}
        value={view}
      />
      <Segmented
        aria-label="Match type"
        block
        defaultValue="competitive"
        options={[
          { value: "competitive", label: "Competitive" },
          { value: "casual", label: "Casual" },
        ]}
      />
    </div>
  );
}

export function SelectExample() {
  const [level, setLevel] = useState<string | null>(null);
  return (
    <div className={styles.stack}>
      <Field hint="Typing a letter jumps to a level." label="Level">
        <Select
          onValueChange={setLevel}
          options={[
            "Beginner",
            "Intermediate",
            "Advanced",
            { value: "open", label: "Open" },
            { value: "pro", label: "Pro (invite only)", disabled: true },
          ]}
          placeholder="Choose a level"
          value={level}
        />
      </Field>
      <p className="td-meta" data-testid="select-output">
        Level: {level ?? "none"}
      </p>
    </div>
  );
}

export function ComboboxExample() {
  const [court, setCourt] = useState<string | null>(null);
  return (
    <div className={styles.stack}>
      <Field label="Court">
        <Combobox
          onValueChange={setCourt}
          options={[
            { value: "court-1", label: "Court 1, Centre" },
            { value: "court-2", label: "Court 2, North" },
            { value: "court-3", label: "Court 3, South" },
            { value: "court-4", label: "Court 4, Training" },
          ]}
          placeholder="Search courts"
          value={court}
        />
      </Field>
      <p className="td-meta" data-testid="combobox-output">
        Court: {court ?? "none"}
      </p>
    </div>
  );
}

export function DialogExample() {
  return (
    <Dialog>
      <div className={styles.row}>
        <DialogTrigger data-testid="dialog-trigger" variant="primary">
          Edit match
        </DialogTrigger>
      </div>
      <DialogContent
        description="Players are told when the time changes."
        title="Edit match"
      >
        <Field label="Match name">
          <Input defaultValue="Thursday doubles" />
        </Field>
        <Checkbox defaultChecked label="Tell players about the change" />
        <DialogActions>
          <DialogClose>Cancel</DialogClose>
          <DialogClose value="confirm" variant="primary">
            Save match
          </DialogClose>
        </DialogActions>
      </DialogContent>
    </Dialog>
  );
}

export function SheetExample() {
  return (
    <div className={styles.row}>
      <Sheet>
        <SheetTrigger>Open sheet</SheetTrigger>
        <SheetContent
          description="Pick how you will pay for your share."
          title="Payment"
        >
          <Switch defaultChecked label="Use my club pass" />
          <SheetClose block variant="primary">
            Done
          </SheetClose>
        </SheetContent>
      </Sheet>
      <Sheet side="right">
        <SheetTrigger>Open drawer</SheetTrigger>
        <SheetContent description="Narrow the list of matches." title="Filters">
          <Checkbox defaultChecked label="Competitive" />
          <Checkbox label="Casual" />
          <SheetClose block variant="primary">
            Show matches
          </SheetClose>
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function PopoverMenuExample() {
  const [last, setLast] = useState("none");
  return (
    <div className={styles.stack}>
      <div className={styles.row}>
        <Popover>
          <PopoverTrigger>Share</PopoverTrigger>
          <PopoverContent
            description="Anyone with the link can ask to join."
            title="Share this match"
          >
            <Input
              aria-label="Match link"
              defaultValue="duna.coach/m/demo"
              readOnly
            />
            <PopoverClose variant="primary">Done</PopoverClose>
          </PopoverContent>
        </Popover>
        <Menu onAction={(value) => setLast(value)}>
          <MenuTrigger>Actions</MenuTrigger>
          <MenuContent>
            <MenuItem value="rename">Rename</MenuItem>
            <MenuItem value="duplicate">Duplicate</MenuItem>
            <MenuItem disabled value="export">
              Export
            </MenuItem>
            <MenuSeparator />
            <MenuItem destructive value="cancel">
              Cancel match
            </MenuItem>
          </MenuContent>
        </Menu>
        <Tooltip content="Add a player">
          <IconButton label="Add a player" variant="outline">
            <Icon name="user-plus" />
          </IconButton>
        </Tooltip>
      </div>
      <p className="td-meta" data-testid="menu-output">
        Last action: {last}
      </p>
    </div>
  );
}

export function ToastExample() {
  return (
    <div className={styles.row}>
      <Button onClick={() => toast.success("Result saved")}>Success</Button>
      <Button
        onClick={() =>
          toast("Player removed", {
            description: "Kai Tanaka left the match.",
            action: { label: "Undo", onAction: () => undefined },
          })
        }
      >
        With action
      </Button>
      <Button onClick={() => toast.error("Could not save. Try again.")}>
        Error
      </Button>
      <Toaster />
    </div>
  );
}

export function CalendarExample() {
  const [day, setDay] = useState<string | null>(GALLERY_TODAY);
  return (
    <div className={styles.stack}>
      <Calendar
        aria-label="Match date"
        mode="single"
        onValueChange={(value) =>
          setDay(typeof value === "string" ? value : null)
        }
        today={GALLERY_TODAY}
        unavailable={["2026-11-28", "2026-11-29"]}
        value={day}
      />
      <p className="td-meta">Selected: {day ?? "none"}</p>
    </div>
  );
}

export function CalendarRangeExample() {
  return (
    <Calendar
      aria-label="Camp dates"
      defaultValue={["2026-11-10", "2026-11-14"]}
      mode="range"
      today={GALLERY_TODAY}
    />
  );
}

export function DatePickerExample() {
  const [date, setDate] = useState<string | null>(GALLERY_TODAY);
  const [range, setRange] = useState<DateRange | null>(null);
  return (
    <div className={styles.stack}>
      <Field label="Match date">
        <DatePicker
          onValueChange={setDate}
          today={GALLERY_TODAY}
          value={date}
        />
      </Field>
      <p className="td-meta" data-testid="datepicker-output">
        Date: {date ?? "none"}
      </p>
      <Field label="Camp dates">
        <DateRangePicker
          onValueChange={setRange}
          today={GALLERY_TODAY}
          value={range}
        />
      </Field>
      <p className="td-meta">
        Range: {range ? `${range[0]} to ${range[1]}` : "none"}
      </p>
    </div>
  );
}

export function TimeExample() {
  const [slot, setSlot] = useState<string | null>("18:00");
  return (
    <div className={styles.stack}>
      <Field hint="Arrow keys step each part." label="Start time">
        <TimePicker defaultValue="18:30" hourCycle={24} />
      </Field>
      <TimeSlotGrid
        aria-label="Start time"
        hourCycle={24}
        onValueChange={setSlot}
        slots={[
          "16:00",
          { time: "16:30", state: "unavailable" },
          "17:00",
          { time: "17:30", state: "member" },
          "18:00",
          "18:30",
          { time: "19:00", state: "unavailable" },
          "19:30",
        ]}
        value={slot}
      />
      <p className="td-meta">Slot: {slot ?? "none"}</p>
    </div>
  );
}

export function DayStripExample() {
  const [day, setDay] = useState<string | null>(GALLERY_TODAY);
  return (
    <div className={styles.stack}>
      <DayStrip
        aria-label="Day"
        count={10}
        onValueChange={setDay}
        start={GALLERY_TODAY}
        today={GALLERY_TODAY}
        unavailable={["2026-11-27"]}
        value={day}
      />
      <p className="td-meta">Day: {day ?? "none"}</p>
    </div>
  );
}

export function FilterChipsExample() {
  return (
    <div className={styles.row}>
      <FilterChip defaultPressed>Doubles</FilterChip>
      <FilterChip>Mixed</FilterChip>
      <FilterChip>Evenings</FilterChip>
    </div>
  );
}
