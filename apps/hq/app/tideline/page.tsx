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
  Icon,
  IconButton,
  Input,
  Notice,
  NumberInput,
  PageLoader,
  PlayerSlot,
  Progress,
  RadioGroup,
  RadioOption,
  Ripple,
  Skeleton,
  Stepper,
  Sunrise,
  Sunspot,
  Surface,
  Textarea,
  Tideline,
  TidelineFonts,
} from "@duna/ui/tideline";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  AddPlayersExample,
  CalendarExample,
  CalendarRangeExample,
  ComboboxExample,
  DatePickerExample,
  DayStripExample,
  DebouncedValueExample,
  DialogExample,
  FilterChipsExample,
  LoadingButtonExample,
  PopoverMenuExample,
  SearchExample,
  SearchStatesExample,
  SegmentedExample,
  SelectExample,
  SheetExample,
  SwitchExample,
  TabsExample,
  TimeExample,
  ToastExample,
} from "./examples";
import styles from "./gallery.module.css";

// Read the flag per request, so one build serves both answers.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Tideline gallery",
  robots: { index: false, follow: false },
};

const themes = ["light", "dark", "live"] as const;
type GalleryTheme = (typeof themes)[number];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className="td-headline">{title}</h2>
      <div className={styles.grid}>{children}</div>
    </section>
  );
}

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
      <h3 className="td-title">{title}</h3>
      {children}
    </Card>
  );
}

export default async function TidelineGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ theme?: string }>;
}) {
  if (process.env.TIDELINE_GALLERY !== "1") notFound();

  const requested = (await searchParams).theme;
  const theme: GalleryTheme = themes.includes(requested as GalleryTheme)
    ? (requested as GalleryTheme)
    : "light";

  return (
    <Tideline
      className={styles.page}
      ground
      theme={theme === "dark" ? "dark" : undefined}
      zone={theme === "live" ? "live" : undefined}
    >
      <TidelineFonts />
      <div className={styles.inner}>
        <header className={styles.intro}>
          <h1 className="td-display">Tideline gallery</h1>
          <p className="td-lead">
            Every component in <code>@duna/ui/tideline</code>, with its states.
            Development only.
          </p>
          <nav aria-label="Theme" className={styles.themes}>
            {themes.map((name) => (
              <a
                aria-current={name === theme ? "page" : undefined}
                className={buttonClassName({
                  size: "sm",
                  variant: name === theme ? "primary" : "secondary",
                })}
                href={`/tideline?theme=${name}`}
                key={name}
              >
                {name === "live"
                  ? "Live zone"
                  : name === "dark"
                    ? "Dark"
                    : "Light"}
              </a>
            ))}
          </nav>
        </header>

        <Section title="Core controls">
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
              <Button loading>Loading</Button>
              <Button disabled variant="primary">
                Disabled
              </Button>
              <Button disabled>Disabled</Button>
              <LoadingButtonExample />
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
              <IconButton label="Saving" loading variant="tonal">
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
            <Field
              error="Enter a name of at least two letters."
              label="First name"
            >
              <Input defaultValue="S" />
            </Field>
            <Field disabled label="Disabled">
              <Input defaultValue="Locked value" />
            </Field>
            <Field label="Search with clear">
              <Input
                clearable
                defaultValue="Sand"
                icon={<Icon name="search" />}
              />
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
                format={{ style: "currency", currency: "EUR" }}
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
        </Section>

        <Section title="Overlays">
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
        </Section>

        <Section title="Dates">
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
        </Section>

        <Section title="People">
          <Example title="Avatar">
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
              <AvatarLevel
                caption="Sam"
                level="4.2"
                name="Sam Rivera"
                size="sm"
              />
              <AvatarLevel caption="Noor" level="3.8" name="Noor Haddad" />
              <AvatarLevel
                caption="Jo"
                level="4.5"
                name="Jo Lindqvist"
                size="lg"
              />
              <AvatarLevel caption="Kai" name="Kai Tanaka" />
            </div>
            <p className="td-meta">
              A pending level shows no chip, never a zero.
            </p>
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
                price="€6.00"
              />
              <PlayerSlot />
            </div>
          </Example>
          <Example title="AddPlayers" wide>
            <AddPlayersExample />
          </Example>
        </Section>

        <Section title="Debounce and search">
          <Example title="SearchField, live">
            <SearchExample />
          </Example>
          <Example title="useDebouncedValue">
            <DebouncedValueExample />
          </Example>
          <Example title="SearchField states" wide>
            <SearchStatesExample />
          </Example>
        </Section>

        <Section title="Loading">
          <Example title="Sunspot">
            <div className={styles.row}>
              <Sunspot label="Loading" />
              <Button loading variant="primary">
                Booking
              </Button>
              <Button loading>Refreshing</Button>
            </div>
          </Example>
          <Example title="Sunrise">
            <div className={styles.row}>
              <Sunrise label={false} size="sm" />
              <Sunrise label="Loading courts" />
              <Sunrise label="Loading" size="lg" />
            </div>
          </Example>
          <Example title="Sand ripple">
            <Ripple label="Loading chart" />
          </Example>
          <Example title="Tide shimmer (Skeleton)">
            <Skeleton label="Loading players" />
            <Skeleton kind="row" />
            <div className={styles.row}>
              <Skeleton kind="avatar" />
              <Skeleton kind="avatar" />
            </div>
            <Skeleton kind="card" />
          </Example>
          <Example title="PageLoader" wide>
            <PageLoader
              description="Getting this week's matches."
              label="Loading your club"
            />
          </Example>
        </Section>

        <Section title="Feedback and layout">
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
            <Progress label="Onboarding" showValue tone="sun" value={80} />
            <Progress aria-label="Uploading" value={null} />
          </Example>
          <Example title="Stepper">
            <Stepper
              aria-label="Club setup"
              current={2}
              steps={[
                { title: "Name your club" },
                {
                  title: "Add your courts",
                  description: "Three courts added.",
                },
                { title: "Set prices", description: "Members and guests." },
                { title: "Go live" },
              ]}
            />
          </Example>
          <Example title="Surfaces" wide>
            <div className={styles.grid}>
              <Surface className={styles.mesh} mesh="tidewater" radius="xl">
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
              <Surface className={styles.mesh} mesh="golden-hour" radius="xl">
                <p className="td-title">Golden Hour</p>
                <p className="td-body">For celebration only.</p>
                <Button variant="primary">Share result</Button>
              </Surface>
              <Surface className={styles.mesh} mesh="night-court" radius="xl">
                <p className="td-title">Night Court</p>
                <p className="td-body">The live zone.</p>
                <Chip tone="live">Live</Chip>
              </Surface>
            </div>
          </Example>
        </Section>
      </div>
    </Tideline>
  );
}
