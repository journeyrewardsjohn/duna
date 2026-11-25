import "@duna/ui/tideline/tideline.css";
import "@duna/ui/tideline/legacy-bridge.css";

import {
  Avatar,
  AvatarLevel,
  AvatarStack,
  Badge,
  Button,
  buttonClassName,
  Card,
  Checkbox,
  Chip,
  EmptyState,
  Field,
  HorizonSweep,
  Icon,
  IconButton,
  Input,
  Kbd,
  Notice,
  NumberInput,
  PageLoader,
  PlayerSlot,
  Progress,
  RadioGroup,
  RadioOption,
  Skeleton,
  Spinner,
  Stepper,
  Surface,
  Textarea,
  Tideline,
  TidelineFonts,
} from "@duna/ui/tideline";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  CalendarExample,
  CalendarRangeExample,
  ComboboxExample,
  DatePickerExample,
  DayStripExample,
  DialogExample,
  FilterChipsExample,
  PopoverMenuExample,
  SegmentedExample,
  SelectExample,
  SheetExample,
  SwitchExample,
  TabsExample,
  TimeExample,
  ToastExample,
} from "./examples";
import styles from "./gallery.module.css";
import {
  AsyncSearchDemo,
  ButtonLoadingDemo,
  CommandPaletteDemo,
  DebouncedValueDemo,
  DelayedLoadingDemo,
  InteractionsLab,
  OptimisticPlayersDemo,
  OptimisticSwitchDemo,
  ToolbarDemo,
} from "./interactions";
import { GalleryShell } from "./shell";

// Read the flag per request, so one build serves both answers.
export const dynamic = "force-dynamic";

const enabled = () => process.env.TIDELINE_GALLERY === "1";

// Without the flag the route says nothing about itself, not even a title.
export function generateMetadata(): Metadata {
  return {
    title: enabled() ? "Tideline gallery" : "Not found",
    robots: { index: false, follow: false },
  };
}

const themes = ["light", "dark", "live"] as const;
type GalleryTheme = (typeof themes)[number];
const themeNames: Record<GalleryTheme, string> = {
  light: "Light",
  dark: "Dark",
  live: "Live zone",
};

function Example({
  title,
  wide = false,
  children,
}: {
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <Card
      className={wide ? `${styles.example} ${styles.wide}` : styles.example}
    >
      <h3 className={styles.exampleTitle}>{title}</h3>
      {children}
    </Card>
  );
}

export default async function TidelineGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string }>;
}) {
  if (!enabled()) notFound();

  const requested = (await searchParams).theme;
  const theme: GalleryTheme = themes.includes(requested as GalleryTheme)
    ? (requested as GalleryTheme)
    : "light";

  const interactions = (
    <InteractionsLab>
      <Example title="useAsyncSearch + SearchField">
        <AsyncSearchDemo />
      </Example>
      <Example title="useDelayedLoading, LoadingBoundary, TopProgress">
        <DelayedLoadingDemo />
      </Example>
      <Example title="Button loading">
        <ButtonLoadingDemo />
      </Example>
      <Example
        title="useOptimisticAction: add and remove players, with Undo"
        wide
      >
        <OptimisticPlayersDemo />
      </Example>
      <Example title="useOptimisticAction: Switch">
        <OptimisticSwitchDemo />
      </Example>
      <Example title="CommandPalette (Cmd/Ctrl K)">
        <CommandPaletteDemo />
        <p className="td-meta">
          Press <Kbd>⌘</Kbd> <Kbd>K</Kbd> or <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>{" "}
          anywhere.
        </p>
      </Example>
      <Example title="useDebouncedValue">
        <DebouncedValueDemo />
      </Example>
      <Example title="Toolbar: search, filter chips, sort" wide>
        <ToolbarDemo />
      </Example>
    </InteractionsLab>
  );

  const controls = (
    <>
      <Example title="Button">
        <div className={styles.row}>
          <Button variant="primary">Save result</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Cancel match</Button>
        </div>
        <div className={styles.row}>
          <Button size="sm">Small</Button>
          <Button size="lg" variant="primary">
            Large
          </Button>
          <Button icon={<Icon name="plus" />}>With icon</Button>
          <Button iconEnd={<Icon name="chevron-right" />} variant="ghost">
            Next
          </Button>
        </div>
        <div className={styles.row}>
          <Button loading variant="primary">
            Saving
          </Button>
          <Button icon={<Icon name="plus" />} loading>
            Creating
          </Button>
          <Button disabled variant="primary">
            Disabled
          </Button>
          <Button disabled>Disabled</Button>
        </div>
        <div className={styles.row}>
          <Button href="/tideline" variant="primary">
            Primary link
          </Button>
          <Button href="/tideline">Link button</Button>
        </div>
        <Button block variant="primary">
          Full width
        </Button>
      </Example>
      <Example title="IconButton">
        <div className={styles.row}>
          <IconButton label="Search">
            <Icon name="search" />
          </IconButton>
          <IconButton label="Add player" variant="tonal">
            <Icon name="user-plus" />
          </IconButton>
          <IconButton label="More" variant="outline">
            <Icon name="more" />
          </IconButton>
          <IconButton label="Close" size="sm">
            <Icon name="close" />
          </IconButton>
          <IconButton label="Saving" loading variant="outline">
            <Icon name="check" />
          </IconButton>
          <IconButton disabled label="Unavailable">
            <Icon name="calendar" />
          </IconButton>
        </div>
      </Example>
      <Example title="Switch">
        <SwitchExample />
      </Example>
      <Example title="Checkbox">
        <Checkbox defaultChecked label="Email me the result" />
        <Checkbox label="Share with my club" />
        <Checkbox
          checked="indeterminate"
          description="Some players are selected."
          label="All players"
        />
        <Checkbox defaultChecked disabled label="Disabled" />
      </Example>
      <Example title="Radio group">
        <RadioGroup aria-label="Format" defaultValue="doubles">
          <RadioOption
            description="Two against two."
            label="Doubles"
            value="doubles"
          />
          <RadioOption label="King of the court" value="king" />
          <RadioOption disabled label="Fours (coming soon)" value="fours" />
        </RadioGroup>
      </Example>
      <Example title="Segmented control">
        <SegmentedExample />
      </Example>
      <Example title="Tabs">
        <TabsExample />
      </Example>
      <Example title="Field, Input and Textarea">
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
      </Example>
      <Example title="NumberInput">
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
      </Example>
      <Example title="Select">
        <SelectExample />
      </Example>
      <Example title="Combobox">
        <ComboboxExample />
      </Example>
    </>
  );

  const overlays = (
    <>
      <Example title="Dialog">
        <DialogExample />
      </Example>
      <Example title="Sheet and drawer">
        <SheetExample />
      </Example>
      <Example title="Popover, Menu and Tooltip">
        <PopoverMenuExample />
      </Example>
      <Example title="Toast">
        <ToastExample />
      </Example>
    </>
  );

  const dates = (
    <>
      <Example title="Calendar">
        <CalendarExample />
      </Example>
      <Example title="Calendar, range">
        <CalendarRangeExample />
      </Example>
      <Example title="DatePicker and DateRangePicker">
        <DatePickerExample />
      </Example>
      <Example title="TimePicker and TimeSlotGrid">
        <TimeExample />
      </Example>
      <Example title="DayStrip" wide>
        <DayStripExample />
      </Example>
    </>
  );

  const peopleSection = (
    <>
      <Example title="Avatar and AvatarStack">
        <div className={styles.row}>
          <Avatar name="Sam Rivera" size="xs" />
          <Avatar name="Noor Haddad" size="sm" />
          <Avatar name="Jo Lindqvist" />
          <Avatar name="Kai Tanaka" size="lg" />
          <Avatar kind="club" name="Demo Beach Club" />
        </div>
        <AvatarStack
          label="6 players joined"
          max={4}
          people={[
            { name: "Sam Rivera" },
            { name: "Noor Haddad" },
            { name: "Jo Lindqvist" },
            { name: "Kai Tanaka" },
            { name: "Mika Okafor" },
            { name: "Ana Duarte" },
          ]}
        />
      </Example>
      <Example title="AvatarLevel">
        <div className={styles.row}>
          <AvatarLevel caption="Sam" level="4.2" name="Sam Rivera" size="sm" />
          <AvatarLevel caption="Noor" level="3.8" name="Noor Haddad" />
          <AvatarLevel caption="Jo" level="4.5" name="Jo Lindqvist" size="lg" />
          <AvatarLevel caption="Kai" name="Kai Tanaka" />
        </div>
        <p className="td-meta">A pending level shows no chip, never a zero.</p>
      </Example>
      <Example title="PlayerSlot">
        <div className={styles.row}>
          <PlayerSlot player={{ id: "a", name: "Lee", level: "3.9" }} you />
          <PlayerSlot
            payment="paid"
            player={{ id: "b", name: "Sam", level: "4.2" }}
          />
          <PlayerSlot
            payment="unpaid"
            player={{ id: "c", name: "Noor", level: "3.8" }}
            price="$6.00"
          />
          <PlayerSlot />
        </div>
      </Example>
    </>
  );

  const loading = (
    <>
      <Example title="Spinner">
        <div className={styles.row}>
          <Spinner label="Loading" size="sm" />
          <Spinner label="Loading" />
          <Spinner label="Loading" size="lg" />
        </div>
      </Example>
      <Example title="Skeleton">
        <Skeleton label="Loading players" />
        <Skeleton kind="row" />
        <Skeleton kind="card" />
      </Example>
      <Example title="HorizonSweep">
        <HorizonSweep label="Loading chart" />
      </Example>
      <Example title="PageLoader with Sunrise" wide>
        <PageLoader
          description="Getting this week's matches."
          label="Loading your club"
        />
      </Example>
    </>
  );

  const feedback = (
    <>
      <Example title="Card">
        <Card variant="flat">Flat card</Card>
        <Card variant="sunken">Sunken card</Card>
        <Card compact href="/tideline">
          Compact link card
        </Card>
      </Example>
      <Example title="Chip and Badge">
        <div className={styles.row}>
          <Chip>Draft</Chip>
          <Chip tone="positive">Confirmed</Chip>
          <Chip tone="warning">Awaiting confirmation</Chip>
          <Chip tone="danger">Disputed</Chip>
          <Chip tone="info">Open</Chip>
          <Chip tone="attention">Needs you</Chip>
          <Chip tone="live">Live</Chip>
        </div>
        <div className={styles.row}>
          <Chip kind="taxonomy">Doubles</Chip>
          <Chip
            avatar={<Avatar decorative name="Sam Rivera" size="xs" />}
            kind="identity"
          >
            Sam Rivera
          </Chip>
          <Chip kind="metric" value="12">
            Matches
          </Chip>
          <Chip kind="metric" sun value="4.2">
            Sand Rating
          </Chip>
          <Badge label="unread messages">3</Badge>
          <Badge dot label="New activity" tone="live" />
        </div>
        <FilterChipsExample />
      </Example>
      <Example title="Notice">
        <Notice title="Rating updates overnight">
          Results confirmed today count tomorrow.
        </Notice>
        <Notice title="Result saved" tone="positive" />
        <Notice
          action={<Button size="sm">Review</Button>}
          title="Two players have not paid"
          tone="attention"
        />
        <Notice title="Rain is forecast at 18:00" tone="warning" />
        <Notice title="Payment failed" tone="danger">
          The card was declined. Try another card.
        </Notice>
      </Example>
      <Example title="EmptyState">
        <EmptyState
          actions={<Button variant="primary">Create a match</Button>}
          description="Matches you create or join show up here."
          icon="calendar"
          title="No matches yet"
        />
      </Example>
      <Example title="Progress">
        <Progress label="Profile" showValue value={60} />
        <Progress aria-label="Uploading" value={null} />
      </Example>
      <Example title="Stepper">
        <Stepper
          aria-label="Club setup"
          current={2}
          steps={[
            { title: "Name your club" },
            { title: "Add your courts", description: "Three courts added." },
            { title: "Set prices", description: "Members and guests." },
            { title: "Go live" },
          ]}
        />
      </Example>
      <Example title="Surface" wide>
        <div className={styles.grid}>
          <Surface className={styles.mesh} mesh="tidewater" radius="lg">
            <p className="td-title">Tidewater</p>
            <p className="td-body">Text on the mesh takes the mesh ink.</p>
            <Card>
              <p className="td-title">A card on the mesh</p>
              <p className="td-body">It keeps its own text colours.</p>
            </Card>
            <div className={styles.row}>
              <Button variant="light">Start free</Button>
              <Button variant="ghost">Learn more</Button>
            </div>
          </Surface>
          <Surface className={styles.mesh} mesh="night-court" radius="lg">
            <p className="td-title">Night Court</p>
            <p className="td-body">The live zone.</p>
            <Chip tone="live">Live</Chip>
          </Surface>
        </div>
      </Example>
    </>
  );

  return (
    <Tideline
      className={styles.page}
      ground
      theme={theme === "dark" ? "dark" : undefined}
      zone={theme === "live" ? "live" : undefined}
    >
      <TidelineFonts />
      <header className={styles.top}>
        <div className={styles.brand}>
          <span className="td-title">Tideline</span>
          <span className="td-meta">Component gallery · development only</span>
        </div>
        <a
          className={buttonClassName({ size: "sm", variant: "ghost" })}
          href={`/tideline/book-lesson?theme=${theme}`}
        >
          Book a lesson page
        </a>
        <nav aria-label="Theme" className={styles.themes}>
          {themes.map((name) => (
            <a
              aria-current={name === theme ? "page" : undefined}
              className={buttonClassName({
                size: "sm",
                variant: name === theme ? "secondary" : "ghost",
              })}
              href={`/tideline?theme=${name}`}
              key={name}
            >
              {themeNames[name]}
            </a>
          ))}
        </nav>
      </header>
      <div className={styles.intro}>
        <h1 className="td-display">Tideline gallery</h1>
        <p className="td-lead">
          Every component in <code className="td-code">@duna/ui/tideline</code>,
          with its states, on Vercel&apos;s UI SDK.
        </p>
      </div>
      <GalleryShell
        sections={[
          { id: "interactions", title: "Interactions", content: interactions },
          { id: "controls", title: "Core controls", content: controls },
          { id: "overlays", title: "Overlays", content: overlays },
          { id: "dates", title: "Dates", content: dates },
          { id: "people", title: "People", content: peopleSection },
          { id: "loading", title: "Loading", content: loading },
          { id: "feedback", title: "Feedback and layout", content: feedback },
        ]}
      />
    </Tideline>
  );
}
