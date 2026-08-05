import { realpathSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly version?: string;
}

interface ExpoAppManifest {
  readonly expo?: {
    readonly ios?: {
      readonly entitlements?: Readonly<Record<string, unknown>>;
      readonly infoPlist?: Readonly<Record<string, unknown>>;
    };
  };
}

interface RuntimeResolution {
  readonly app: string;
  readonly reactVersion: string;
  readonly reactDomVersion: string;
  readonly mobileAuthUsesAppReact: boolean;
  readonly authSessionUsesAppReact: boolean;
  readonly reactNativeUsesAppReact: boolean;
}

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function packageVersion(
  requireFromApp: ReturnType<typeof createRequire>,
  packageName: string,
): string {
  const manifest = requireFromApp(
    `${packageName}/package.json`,
  ) as PackageManifest;
  assert(manifest.version, `${packageName} did not expose a package version`);
  return manifest.version;
}

function resolvedEntry(
  requireFrom: ReturnType<typeof createRequire>,
  packageName: string,
): string {
  return realpathSync(requireFrom.resolve(packageName));
}

function verifyApp(
  appDirectory: "apps/player" | "apps/pro",
): RuntimeResolution {
  const packagePath = resolve(workspaceRoot, appDirectory, "package.json");
  const manifest = JSON.parse(
    readFileSync(packagePath, "utf8"),
  ) as PackageManifest;
  const requireFromApp = createRequire(packagePath);
  const reactVersion = packageVersion(requireFromApp, "react");
  const reactDomVersion = packageVersion(requireFromApp, "react-dom");
  const declaredReact = manifest.dependencies?.react;
  const declaredReactDom = manifest.dependencies?.["react-dom"];

  assert(declaredReact, `${appDirectory} must declare react`);
  assert(declaredReactDom, `${appDirectory} must declare react-dom`);
  assert(
    declaredReact === declaredReactDom,
    `${appDirectory} must pin react and react-dom to the same version`,
  );
  assert(
    reactVersion === reactDomVersion,
    `${appDirectory} resolved React ${reactVersion} with React DOM ${reactDomVersion}`,
  );

  const appReact = resolvedEntry(requireFromApp, "react");
  const mobileAuthRequire = createRequire(
    resolvedEntry(requireFromApp, "@duna/mobile-auth"),
  );
  const authSessionRequire = createRequire(
    resolvedEntry(mobileAuthRequire, "expo-auth-session"),
  );
  const reactNativeRequire = createRequire(
    resolvedEntry(requireFromApp, "react-native"),
  );
  const resolution: RuntimeResolution = {
    app: appDirectory,
    reactVersion,
    reactDomVersion,
    mobileAuthUsesAppReact:
      resolvedEntry(mobileAuthRequire, "react") === appReact,
    authSessionUsesAppReact:
      resolvedEntry(authSessionRequire, "react") === appReact,
    reactNativeUsesAppReact:
      resolvedEntry(reactNativeRequire, "react") === appReact,
  };

  for (const [check, passed] of Object.entries(resolution)) {
    if (check === "app" || check.endsWith("Version")) continue;
    assert(
      passed,
      `${appDirectory} failed the ${check} single-runtime assertion`,
    );
  }

  return resolution;
}

function verifyPlayerHealthPrivacy(): {
  readonly healthKitEnabled: boolean;
  readonly readPurposeConfigured: boolean;
  readonly updatePurposeConfigured: boolean;
} {
  const appManifest = JSON.parse(
    readFileSync(resolve(workspaceRoot, "apps/player/app.json"), "utf8"),
  ) as ExpoAppManifest;
  const entitlements = appManifest.expo?.ios?.entitlements;
  const infoPlist = appManifest.expo?.ios?.infoPlist;
  const readPurpose = infoPlist?.NSHealthShareUsageDescription;
  const updatePurpose = infoPlist?.NSHealthUpdateUsageDescription;

  assert(
    entitlements?.["com.apple.developer.healthkit"] === true,
    "apps/player must enable the HealthKit entitlement",
  );
  assert(
    typeof readPurpose === "string" && readPurpose.length >= 40,
    "apps/player must explain why it reads Apple Health data",
  );
  assert(
    typeof updatePurpose === "string" &&
      updatePurpose.length >= 40 &&
      updatePurpose.includes("does not write"),
    "apps/player must include an honest HealthKit update purpose string for App Store validation",
  );

  return {
    healthKitEnabled: true,
    readPurposeConfigured: true,
    updatePurposeConfigured: true,
  };
}

console.log(
  JSON.stringify(
    {
      status: "ok",
      runtimes: [verifyApp("apps/player"), verifyApp("apps/pro")],
      healthPrivacy: verifyPlayerHealthPrivacy(),
    },
    null,
    2,
  ),
);
