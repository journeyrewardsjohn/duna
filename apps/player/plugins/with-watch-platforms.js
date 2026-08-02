const {
  withXcodeProjectBeta,
} = require("@bacons/apple-targets/build/with-bacons-xcode");

/**
 * @bacons/apple-targets generates a valid watchOS target, but Xcode can inherit
 * the parent iPhone simulator platform while building the embedded Watch app.
 * Pinning the target's supported platforms keeps local and EAS archive builds
 * on the watchOS SDK.
 */
module.exports = function withWatchPlatforms(config) {
  return withXcodeProjectBeta(config, (modConfig) => {
    const watchTarget = modConfig.modResults.rootObject.props.targets.find(
      (target) => target.props.productName === "DunaWatch",
    );

    if (watchTarget) {
      watchTarget.setBuildSetting(
        "SUPPORTED_PLATFORMS",
        "watchos watchsimulator",
      );
    }

    return modConfig;
  });
};
