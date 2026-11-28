import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { render } from "../test-support/render";
import { afterEach, describe, expect, it } from "vitest";
import { testEnvironment } from "../test-support/react-native";
import { nativeColors } from "../tokens";
import {
  nextThemePreference,
  parseThemePreference,
  resolveTheme,
  themePreferenceLabels,
} from "./resolve";
import {
  ThemeProvider,
  ZoneProvider,
  useTheme,
  type ThemeStorage,
} from "./ThemeProvider";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  testEnvironment.colorScheme = "light";
});

describe("resolveTheme", () => {
  it("offers Light, Dark and Match device", () => {
    expect(Object.values(themePreferenceLabels)).toEqual([
      "Light",
      "Dark",
      "Match device",
    ]);
    expect(nextThemePreference("light")).toBe("dark");
    expect(nextThemePreference("dark")).toBe("system");
    expect(nextThemePreference("system")).toBe("light");
  });

  it("reads only the three stored values", () => {
    expect(parseThemePreference("dark")).toBe("dark");
    expect(parseThemePreference("system")).toBe("system");
    expect(parseThemePreference("sepia")).toBeNull();
    expect(parseThemePreference(null)).toBeNull();
  });

  it.each([
    ["light", "dark", null, "light"],
    ["dark", "light", null, "dark"],
    ["system", "dark", null, "dark"],
    ["system", "light", null, "light"],
    ["system", null, null, "light"],
    ["light", "light", "live", "live"],
    ["dark", "dark", "hq", "dark"],
  ] as const)(
    "%s on a %s device in zone %s is %s",
    (preference, device, zone, theme) => {
      const resolved = resolveTheme({ preference, deviceScheme: device, zone });
      expect(resolved.theme).toBe(theme);
      expect(resolved.colors).toEqual(nativeColors(theme, zone));
      expect(resolved.statusBar).toBe(theme === "light" ? "dark" : "light");
    },
  );

  it("HQ keeps a white ground in light, never Salt", () => {
    expect(
      resolveTheme({ preference: "light", deviceScheme: null, zone: "hq" })
        .colors.ground,
    ).toBe("#ffffff");
  });
});

function Probe({
  onValue,
}: {
  readonly onValue: (value: ReturnType<typeof useTheme>) => void;
}) {
  onValue(useTheme());
  return null;
}

describe("ThemeProvider", () => {
  it("holds the first frame until the saved choice is read, then applies it", async () => {
    let resolveStored: (value: string | null) => void = () => undefined;
    const saved: string[] = [];
    const storage: ThemeStorage = {
      get: () => new Promise((resolve) => (resolveStored = resolve)),
      set: async (value) => {
        saved.push(value);
      },
    };
    let seen: ReturnType<typeof useTheme> | undefined;
    const renderer = render(
      createElement(
        ThemeProvider,
        { storage },
        createElement(Probe, { onValue: (value) => (seen = value) }),
      ),
    );
    expect(seen).toBeUndefined();
    expect(renderer.toJSON()).toBeNull();
    await act(async () => {
      resolveStored("dark");
      for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
    });
    expect(seen?.theme).toBe("dark");
    expect(seen?.preference).toBe("dark");
    await act(async () => seen?.setPreference("system"));
    expect(saved).toEqual(["system"]);
    expect(seen?.theme).toBe("light");
  });

  it("follows the device under Match device", async () => {
    testEnvironment.colorScheme = "dark";
    let seen: ReturnType<typeof useTheme> | undefined;
    await act(async () => {
      create(
        createElement(
          ThemeProvider,
          { defaultPreference: "system" },
          createElement(Probe, { onValue: (value) => (seen = value) }),
        ),
      );
    });
    expect(seen?.theme).toBe("dark");
  });

  it("a live subtree wins over a light preference", async () => {
    let seen: ReturnType<typeof useTheme> | undefined;
    await act(async () => {
      create(
        createElement(
          ThemeProvider,
          { defaultPreference: "light" },
          createElement(
            ZoneProvider,
            { zone: "live" },
            createElement(Probe, { onValue: (value) => (seen = value) }),
          ),
        ),
      );
    });
    expect(seen?.theme).toBe("live");
    expect(seen?.colors.ground).toBe("#0e1a22");
  });

  it("is light outside a provider", () => {
    let seen: ReturnType<typeof useTheme> | undefined;
    render(createElement(Probe, { onValue: (value) => (seen = value) }));
    expect(seen?.theme).toBe("light");
  });
});
