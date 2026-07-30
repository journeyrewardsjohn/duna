import { realpathSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly version?: string;
}

interface RuntimeResolution {
  readonly app: string;
  readonly reactVersion: string;
  readonly reactDomVersion: string;
  readonly clerkExpoUsesAppReact: boolean;
  readonly clerkExpoUsesAppReactDom: boolean;
  readonly clerkReactUsesAppReact: boolean;
  readonly clerkReactUsesAppReactDom: boolean;
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
  const appReactDom = resolvedEntry(requireFromApp, "react-dom");
  const clerkExpoRequire = createRequire(
    resolvedEntry(requireFromApp, "@clerk/expo"),
  );
  const clerkReactRequire = createRequire(
    resolvedEntry(clerkExpoRequire, "@clerk/react"),
  );
  const reactNativeRequire = createRequire(
    resolvedEntry(requireFromApp, "react-native"),
  );
  const resolution: RuntimeResolution = {
    app: appDirectory,
    reactVersion,
    reactDomVersion,
    clerkExpoUsesAppReact:
      resolvedEntry(clerkExpoRequire, "react") === appReact,
    clerkExpoUsesAppReactDom:
      resolvedEntry(clerkExpoRequire, "react-dom") === appReactDom,
    clerkReactUsesAppReact:
      resolvedEntry(clerkReactRequire, "react") === appReact,
    clerkReactUsesAppReactDom:
      resolvedEntry(clerkReactRequire, "react-dom") === appReactDom,
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

console.log(
  JSON.stringify(
    {
      status: "ok",
      runtimes: [verifyApp("apps/player"), verifyApp("apps/pro")],
    },
    null,
    2,
  ),
);
