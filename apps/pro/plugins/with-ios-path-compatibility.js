const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod } = require("expo/config-plugins");

const beginMarker = "    # duna-pro-ios-path-compatibility";
const endMarker = "    # /duna-pro-ios-path-compatibility";
const reactNativeBundleCommand =
  "`\\\"$NODE_BINARY\\\" --print \\\"require('path').dirname(require.resolve('react-native/package.json')) + '/scripts/react-native-xcode.sh'\\\"`\\n";
const safeReactNativeBundleCommand =
  'REACT_NATIVE_XCODE_SCRIPT=\\"$(\\"$NODE_BINARY\\" --print \\"require(\'path\').dirname(require.resolve(\'react-native/package.json\')) + \'/scripts/react-native-xcode.sh\'\\")\\"\\n\\"$REACT_NATIVE_XCODE_SCRIPT\\"\\n';

/**
 * Preserve quoted native build-script paths so local and CI Release builds
 * also work when the checkout directory contains spaces.
 */
module.exports = function withIosPathCompatibility(config) {
  return withDangerousMod(config, [
    "ios",
    async (modConfig) => {
      const platformRoot = modConfig.modRequest.platformProjectRoot;
      const podfilePath = path.join(platformRoot, "Podfile");
      let podfile = await fs.promises.readFile(podfilePath, "utf8");

      if (!podfile.includes(beginMarker)) {
        const anchor = "    expo_widgets_post_install(installer)\n";
        if (!podfile.includes(anchor)) {
          throw new Error(
            "Duna Pro could not locate the Expo Widgets post-install hook.",
          );
        }

        const pathCompatibility = [
          beginMarker,
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

        podfile = podfile.replace(anchor, `${anchor}\n${pathCompatibility}\n`);
        await fs.promises.writeFile(podfilePath, podfile);
      }

      const projectPath = path.join(
        platformRoot,
        "DunaPro.xcodeproj",
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
          "Duna Pro could not locate the React Native bundle script.",
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
