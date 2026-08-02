/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "watch",
  name: "DunaWatch",
  displayName: "Duna",
  bundleIdentifier: ".watch",
  deploymentTarget: "10.0",
  frameworks: ["SwiftUI", "WatchKit", "WatchConnectivity"],
  colors: {
    $accent: "#2F6FB1",
  },
};
