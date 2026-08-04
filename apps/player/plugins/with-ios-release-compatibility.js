const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod } = require("expo/config-plugins");

const requireStatement =
  "require File.join(__dir__, '..', 'scripts', 'patch-haishinkit-audio-node')";
const beginMarker = "    # duna-ios-release-compatibility";
const endMarker = "    # /duna-ios-release-compatibility";
const reactNativeBundleCommand =
  "`\\\"$NODE_BINARY\\\" --print \\\"require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'\\\"`\\n";
const safeReactNativeBundleCommand =
  'REACT_NATIVE_XCODE_SCRIPT=\\"$(\\"$NODE_BINARY\\" --print \\"require(\'path\').dirname(require.resolve(\'react-native/package.json\')) + \'/scripts/react-native-xcode.sh\'\\")\\"\\n\\"$REACT_NATIVE_XCODE_SCRIPT\\"\\n';

/**
 * HaishinKit 1.9.9 predates an upstream AudioNode initializer correction
 * required by optimized builds on current Xcode releases. Apply that exact
 * upstream correction after CocoaPods installs the pinned dependency. Also
 * preserve quoted script paths so local Release builds work from directories
 * containing spaces.
 */
module.exports = function withIosReleaseCompatibility(config) {
  return withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const podfilePath = path.join(
        modConfig.modRequest.platformProjectRoot,
        "Podfile",
      );
      let podfile = await fs.promises.readFile(podfilePath, "utf8");

      if (!podfile.includes(requireStatement)) {
        const requireAnchor = "require 'json'\n";
        if (!podfile.includes(requireAnchor)) {
          throw new Error(
            "Duna video capture could not locate the Podfile require block.",
          );
        }
        podfile = podfile.replace(
          requireAnchor,
          `${requireAnchor}${requireStatement}\n`,
        );
      }

      if (podfile.includes(beginMarker)) {
        await fs.promises.writeFile(podfilePath, podfile);
        return modConfig;
      }

      const anchor = "    expo_widgets_post_install(installer)\n";
      if (!podfile.includes(anchor)) {
        throw new Error(
          "Duna video capture could not locate the iOS post-install hook.",
        );
      }

      const releaseCompatibility = [
        beginMarker,
        "    DunaHaishinKitAudioNodePatch.apply!(File.join(__dir__, 'Pods'))",
        "",
        "    installer.pods_project.targets.each do |target|",
        "      target.shell_script_build_phases.each do |build_phase|",
        "        next unless build_phase.shell_script",
        "",
        "        build_phase.shell_script = build_phase.shell_script.gsub(",
        "          'bash -l -c \"$PODS_TARGET_SRCROOT',",
        "          'bash -l \"$PODS_TARGET_SRCROOT'",
        "        )",
        "      end",
        "    end",
        endMarker,
      ].join("\n");

      podfile = podfile.replace(anchor, `${anchor}\n${releaseCompatibility}\n`);
      await fs.promises.writeFile(podfilePath, podfile);

      const projectPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        "Duna.xcodeproj",
        "project.pbxproj",
      );
      let project = await fs.promises.readFile(projectPath, "utf8");
      if (project.includes(reactNativeBundleCommand)) {
        project = project.replace(
          reactNativeBundleCommand,
          safeReactNativeBundleCommand,
        );
      } else if (!project.includes(safeReactNativeBundleCommand)) {
        throw new Error(
          "Duna video capture could not locate the React Native bundle script.",
        );
      }
      project = project.replaceAll(
        'bash -l -c \\"./Pods/Target\\\\ Support',
        'bash -l \\"./Pods/Target\\\\ Support',
      );
      await fs.promises.writeFile(projectPath, project);
      return modConfig;
    },
  ]);
};
