/**
 * The Tideline guard: checks that protect code already on the Duna Design
 * System (Tideline 4.1.1). They run only on `packages/ui/src/tideline/**` and
 * the paths a surface contract lists as `migrated`, so they cannot fail on
 * legacy code. Pure functions; `selfTest()` runs on every verifier run.
 */
import type { TidelineRule } from "./types";

export interface GuardFinding {
  readonly rule: TidelineRule;
  readonly line: number;
  readonly message: string;
}

/** Orange that Tideline 4.0 retired (old flare, Tideline 3.x flare and sunburst, the old sun ramp). */
export const retiredOrange = [
  "#e8683a",
  "#b84a20",
  "#f28a64",
  "#f4794c",
  "#e0602f",
  "#a8431c",
  "#e5532d",
  "#a8321a",
  "#ff6a3d",
  "#ff8a5c",
  "#f5a443",
  "#ea8f1f",
  "#8c4d06",
  "#fff4e3",
  "#f6c27e",
  "#fed9a6",
  "#fff1dc",
  "#e8b188",
  "#da9461",
  "#c27538",
  "#9a5420",
  "#6e3a14",
  "#f0bf98",
  "#f6d3b6",
  "#fcebdd",
] as const;

const retiredOrangePattern = new RegExp(
  `(?:${retiredOrange.join("|")})(?![0-9a-f])|rgba?\\(\\s*232\\s*,\\s*104\\s*,\\s*58\\b`,
  "i",
);

/** Solar (#F2542D) and references to it. */
const solarValuePattern =
  /#f2542d(?![0-9a-f])|brand-solar|brandSolar|var\(--(?:td-)?live(?:-ink|-wash)?\)/i;
/** Selectors or lines that are a live state (plus the rating ring's goal tick, the brand book's named exception). */
const liveContextPattern = /live|solar|tick|record/i;

/** Infrastructure vendors product copy never names (contract R17). */
const vendorPattern =
  /\b(?:Vercel|Neon|Upstash|Inngest|Cloudflare|Axiom|Sentry|Supabase|AWS)\b/;
/** "Stripe" is allowed only where Duna Pay explains verification. */
const stripePattern = /\bStripe\b/;
const stripeAllowedPath = /(?:^|[/_-])(?:pay|money|payout|stripe|billing)/i;

/** Token sources define Solar and the published tracking values. */
export function isTokenSource(path: string) {
  return /(?:^|\/)(?:tokens?(?:\.[a-z]+)*\.(?:json|css|ts)|token-build\.ts|tokens\/)/i.test(
    path,
  );
}

function isTestFile(path: string) {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path);
}

function stripComments(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
    .join("\n");
}

function userFacingText(line: string) {
  if (/^\s*(?:import|export\s+[^=]*\bfrom\b)|\brequire\(/.test(line)) return [];
  const texts: string[] = [];
  for (const match of line.matchAll(/(["'`])((?:\\.|(?!\1).)*)\1/g)) {
    texts.push(match[2] ?? "");
  }
  for (const match of line.matchAll(/>([^<>{}]+)</g)) {
    texts.push(match[1] ?? "");
  }
  return texts;
}

/** Walks CSS and yields each declaration line with the selector chain that encloses it. */
function cssDeclarations(source: string) {
  const out: { line: number; selector: string; text: string }[] = [];
  const stack: string[] = [];
  let buffer = "";
  let line = 1;
  let startLine = 1;
  for (const char of source) {
    if (char === "{") {
      stack.push(buffer.trim());
      buffer = "";
      startLine = line;
    } else if (char === "}") {
      if (buffer.trim()) {
        out.push({ line: startLine, selector: stack.join(" "), text: buffer });
      }
      stack.pop();
      buffer = "";
      startLine = line;
    } else if (char === ";") {
      out.push({ line: startLine, selector: stack.join(" "), text: buffer });
      buffer = "";
      startLine = line;
    } else {
      if (!buffer.trim() && char === "\n") startLine = line + 1;
      buffer += char;
    }
    if (char === "\n") line += 1;
  }
  return out;
}

export function checkTidelineSource(
  path: string,
  source: string,
  skip: ReadonlySet<TidelineRule> = new Set(),
): GuardFinding[] {
  const findings: GuardFinding[] = [];
  const add = (rule: TidelineRule, line: number, message: string) => {
    if (!skip.has(rule)) findings.push({ rule, line, message });
  };
  const tokenSource = isTokenSource(path);
  const isCss = path.endsWith(".css");
  const isScript = /\.[cm]?[jt]sx?$/.test(path);
  const lines = source.split("\n");

  lines.forEach((text, index) => {
    if (retiredOrangePattern.test(text)) {
      add(
        "retired-orange",
        index + 1,
        "uses a retired orange; use Dune (sun/energy) or, for live only, Solar tokens",
      );
    }
    if ((isCss || isScript) && /!important/.test(text)) {
      add(
        "important",
        index + 1,
        "uses !important; fix the cascade layer instead",
      );
    }
    if (isCss && !tokenSource) {
      const tracking = text.match(/letter-spacing:\s*(-?\d*\.?\d+)em/);
      if (tracking?.[1] && Number(tracking[1]) < -0.03) {
        add("tracking", index + 1, "tracks tighter than -0.030em");
      }
    }
  });

  if (!tokenSource && isCss) {
    for (const declaration of cssDeclarations(source)) {
      if (
        solarValuePattern.test(declaration.text) &&
        !liveContextPattern.test(declaration.selector)
      ) {
        add(
          "solar-outside-live",
          declaration.line,
          `uses Solar outside a live-state selector (${declaration.selector || "top level"})`,
        );
      }
    }
  }

  if (isScript && !isTestFile(path)) {
    stripComments(source)
      .split("\n")
      .forEach((text, index) => {
        if (
          !tokenSource &&
          solarValuePattern.test(text) &&
          !liveContextPattern.test(text)
        ) {
          add(
            "solar-outside-live",
            index + 1,
            "uses Solar outside a live state; Solar is for live only",
          );
        }
        for (const copy of userFacingText(text)) {
          const vendor = copy.match(vendorPattern)?.[0];
          if (vendor) {
            add(
              "vendor-name",
              index + 1,
              `names the infrastructure vendor "${vendor}" in user-facing text; say Duna Hosting / Duna Database`,
            );
          }
          if (stripePattern.test(copy) && !stripeAllowedPath.test(path)) {
            add(
              "vendor-name",
              index + 1,
              'names "Stripe" outside Duna Pay verification copy',
            );
          }
        }
      });
  }
  return findings;
}

/** Guards the guard: fixtures that must and must not trip each rule. */
export function selfTest(): string[] {
  const failures: string[] = [];
  const expect = (
    label: string,
    path: string,
    source: string,
    rules: readonly TidelineRule[],
  ) => {
    const found = [
      ...new Set(checkTidelineSource(path, source).map((f) => f.rule)),
    ].sort();
    const wanted = [...rules].sort();
    if (found.join() !== wanted.join()) {
      failures.push(
        `Tideline guard self-test "${label}": expected [${wanted.join(", ")}], got [${found.join(", ")}]`,
      );
    }
  };
  expect("orange", "packages/ui/src/tideline/a.css", ".x { color: #E0602F; }", [
    "retired-orange",
  ]);
  expect(
    "solar in live",
    "packages/ui/src/tideline/a.css",
    '[data-zone="live"] .chip { background: var(--live); }\n.td-ring4__tick { stroke: #f2542d; }',
    [],
  );
  expect(
    "solar elsewhere",
    "packages/ui/src/tideline/a.css",
    ".td-slot small { color: var(--live-ink); }",
    ["solar-outside-live"],
  );
  expect(
    "solar token source",
    "packages/ui/src/tideline/tokens.css",
    ":root { --live: #f2542d; --brand-solar: #f2542d; }",
    [],
  );
  expect(
    "important",
    "packages/ui/src/tideline/a.css",
    ".x { display: none !important; }",
    ["important"],
  );
  expect(
    "vendor in copy",
    "apps/hq/app/setup/page.tsx",
    'const label = "Hosted on Vercel";\n// Vercel in a comment is fine\nimport x from "@vercel/analytics";',
    ["vendor-name"],
  );
  expect(
    "stripe in pay",
    "apps/hq/app/money/duna-pay.tsx",
    "<p>Stripe verifies your identity.</p>",
    [],
  );
  expect(
    "stripe elsewhere",
    "apps/hq/app/today/page.tsx",
    "<p>Paid with Stripe</p>",
    ["vendor-name"],
  );
  expect(
    "clean",
    "packages/ui/src/tideline/button.tsx",
    'export const Button = () => <button className="td-btn">Book a court</button>;',
    [],
  );
  return failures;
}
