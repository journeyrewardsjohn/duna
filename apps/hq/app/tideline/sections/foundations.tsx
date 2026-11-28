import {
  glyphFamilies,
  Icon,
  type IconName,
  type IconSize,
  iconSizes,
} from "@duna/ui/icons";
import { Button, Chip, Tideline } from "@duna/ui/tideline";
import {
  type TidelineColorRole,
  tidelineColors,
  tidelineTokens,
} from "@duna/ui/tideline/tokens";
import { MotionVerbs } from "../foundations-motion";
import type { GalleryExample, GalleryGroup } from "../gallery";
import styles from "../gallery.module.css";

/** The brand in one place: palette by role, type roles, icon scale, motion. */
const foundations: GalleryGroup = {
  id: "foundations",
  title: "Foundations",
  order: 10,
};

const brand: Array<{
  role: TidelineColorRole;
  name: string;
  use: string;
}> = [
  {
    role: "brand-night-court",
    name: "Night Court",
    use: "Ink, actions, the dark ground",
  },
  { role: "brand-salt", name: "Salt", use: "The player ground; text on dark" },
  { role: "brand-dune", name: "Dune", use: "The warm signal" },
  { role: "brand-hardwood", name: "Hardwood", use: "Golden hour" },
  { role: "brand-solar", name: "Solar", use: "Live states only" },
];

const grounds: Array<[TidelineColorRole, string]> = [
  ["ground", "Ground"],
  ["surface", "Surface"],
  ["surface-sunken", "Sunken"],
  ["line-strong", "Line strong"],
];

const inks: Array<[TidelineColorRole, string]> = [
  ["text", "Text"],
  ["text-2", "Text 2"],
  ["text-3", "Text 3"],
  ["link", "Link"],
  ["positive", "Positive"],
  ["warning", "Warning"],
  ["danger", "Danger"],
  ["attention", "Attention"],
  ["energy-ink", "Energy ink"],
  ["live-ink", "Live ink"],
];

const scopes = [
  { id: "light", title: "Light", note: "Player zone: Salt ground" },
  {
    id: "hq",
    title: "HQ",
    note: 'data-zone="hq": white / cool neutral',
    zone: "hq",
  },
  { id: "dark", title: "Dark", note: 'data-theme="dark"', theme: "dark" },
  {
    id: "live",
    title: "Live zone",
    note: 'data-zone="live": play in progress',
    zone: "live",
  },
] as const;

function hex(theme: "light" | "dark" | "live", zone: string | undefined) {
  const colors = tidelineColors(theme, zone);
  return (role: TidelineColorRole) => colors[role].toUpperCase();
}

function PaletteColumn({ scope }: { scope: (typeof scopes)[number] }) {
  const theme =
    "theme" in scope ? scope.theme : scope.id === "live" ? "live" : "light";
  const zone = "zone" in scope ? scope.zone : undefined;
  const value = hex(theme, zone);
  return (
    <Tideline
      aria-label={`${scope.title} palette`}
      className={styles.paletteScope}
      ground
      role="group"
      theme={"theme" in scope ? scope.theme : undefined}
      zone={zone}
    >
      <div className={styles.paletteHead}>
        <span className="td-title">{scope.title}</span>
        <span className="td-meta">{scope.note}</span>
      </div>
      <div className={styles.paletteGrounds}>
        {grounds.map(([role, label]) => (
          <div className={styles.groundSwatch} key={role}>
            <span
              className={styles.groundFill}
              style={{ background: `var(--td-${role})` }}
            />
            <span className={styles.swatchText}>
              <span className={styles.swatchName}>{label}</span>
              <span className="td-code">{value(role)}</span>
            </span>
          </div>
        ))}
      </div>
      <div className={styles.paletteCard}>
        <div className={styles.row}>
          <Button size="sm" variant="primary">
            Book court
          </Button>
          <Button size="sm" variant="secondary">
            Details
          </Button>
        </div>
        <ul className={styles.inkList}>
          {inks.map(([role, label]) => (
            <li className={styles.inkRow} key={role}>
              <span
                aria-hidden="true"
                className={styles.inkDot}
                style={{ background: `var(--td-${role})` }}
              />
              <span style={{ color: `var(--td-${role})` }}>{label}</span>
              <span className="td-code">{value(role)}</span>
            </li>
          ))}
        </ul>
        <div className={styles.row}>
          <Chip tone="positive">Paid</Chip>
          <Chip tone="attention">Needs you</Chip>
          {scope.id === "live" ? <Chip tone="live">Live</Chip> : null}
        </div>
        <p className="td-meta">
          Action <span className="td-code">{value("action")}</span>, label{" "}
          <span className="td-code">{value("on-action")}</span>
        </p>
      </div>
    </Tideline>
  );
}

const typeRoles: Array<{
  className: string;
  role: string;
  spec: string;
  sample: string;
}> = [
  {
    className: "td-display",
    role: "Title (brand)",
    spec: "Jost Medium 500, −0.015em, one per screen, 22px and up, never on a numeral",
    sample: "Meet you at the net.",
  },
  {
    className: "td-headline",
    role: "Headline",
    spec: "Geist 600, heading-24",
    sample: "Open matches near you",
  },
  {
    className: "td-title",
    role: "Title",
    spec: "Geist 600, heading-18",
    sample: "This week",
  },
  {
    className: "td-lead",
    role: "Lead",
    spec: "Geist 400, 16/24",
    sample: "Bookings, members and payments in one place.",
  },
  {
    className: "td-body",
    role: "Body",
    spec: "Geist 400, 14/20 (16 on phones)",
    sample: "Players see this when they book.",
  },
  {
    className: "td-meta",
    role: "Meta",
    spec: "Geist 400, 13/18",
    sample: "Updated 2 min ago",
  },
  {
    className: `td-title td-num ${styles.figure}`,
    role: "Numerals",
    spec: "Geist 600, tabular figures; never Jost",
    sample: "21–18 · €24.00 · 10:30 PM",
  },
  {
    className: "td-code",
    role: "Code",
    spec: "Geist Mono 400, 13/18",
    sample: "DUNA-7Q4K-2M",
  },
];

const icons: Array<{ size: IconSize; use: string }> = [
  { size: "chip", use: "Chips and dense rows" },
  { size: "inline", use: "Inline with text" },
  { size: "control", use: "Buttons, rows and inputs" },
  { size: "nav", use: "Navigation" },
];

const iconSizeNames = Object.keys(iconSizes) as IconSize[];

/** Every custom glyph at the four sizes, grouped by family. */
function IconSheet({ theme }: { theme?: "dark" }) {
  return (
    <Tideline
      aria-label={`Icon sheet, ${theme ?? "light"}`}
      className={styles.iconSheet}
      ground
      role="group"
      theme={theme}
    >
      <span className="td-title">{theme === "dark" ? "Dark" : "Light"}</span>
      {Object.entries(glyphFamilies).map(([family, names]) => (
        <section className={styles.iconFamily} key={family}>
          <h3 className="td-meta">{family}</h3>
          <ul className={styles.iconGlyphs}>
            {names.map((name) => (
              <li className={styles.iconGlyph} data-glyph={name} key={name}>
                <span className={styles.iconSizesRow}>
                  {iconSizeNames.map((size) => (
                    <Icon key={size} name={name as IconName} size={size} />
                  ))}
                </span>
                <span className="td-code">{name}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Tideline>
  );
}

const examples: GalleryExample[] = [
  {
    group: foundations,
    order: 10,
    title: "Brand colours",
    wide: true,
    content: (
      <div className={styles.brandSwatches}>
        {brand.map(({ role, name, use }) => (
          <div className={styles.brandSwatch} data-swatch={role} key={role}>
            <span
              className={styles.brandFill}
              style={{ background: `var(--td-${role})` }}
            />
            <span className={styles.swatchName}>{name}</span>
            <span className="td-code">
              {tidelineTokens.color.light[role].toUpperCase()}
            </span>
            <span className="td-meta">{use}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    group: foundations,
    order: 20,
    title: "Colour by role: light, HQ, dark and live",
    wide: true,
    content: (
      <div className={styles.palette}>
        {scopes.map((scope) => (
          <PaletteColumn key={scope.id} scope={scope} />
        ))}
      </div>
    ),
  },
  {
    group: foundations,
    order: 30,
    title: "Type roles",
    wide: true,
    content: (
      <>
        <dl className={styles.typeRoles}>
          {typeRoles.map((type) => (
            <div className={styles.typeRole} key={type.role}>
              <dt>
                <span className={styles.swatchName}>{type.role}</span>
                <span className="td-meta">{type.spec}</span>
              </dt>
              <dd className={type.className}>{type.sample}</dd>
            </div>
          ))}
        </dl>
      </>
    ),
  },
  {
    group: foundations,
    order: 40,
    title: "Icon scale",
    content: (
      <ul className={styles.iconScale}>
        {icons.map((icon) => (
          <li className={styles.iconStep} key={icon.size}>
            <Icon name="schedule" size={icon.size} />
            <span className={styles.swatchName}>{iconSizes[icon.size]}px</span>
            <span className="td-meta">{icon.use}</span>
          </li>
        ))}
      </ul>
    ),
  },
  {
    group: foundations,
    order: 45,
    title: "Icon sheet: every custom glyph at 14, 16, 20 and 24",
    wide: true,
    content: (
      <div className={styles.iconSheets}>
        <IconSheet />
        <IconSheet theme="dark" />
      </div>
    ),
  },
  {
    group: foundations,
    order: 50,
    title: "Motion: Rise, Rally, Cross",
    content: <MotionVerbs />,
  },
];

export default examples;
