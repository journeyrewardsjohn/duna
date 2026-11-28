// swift-tools-version: 5.10
// Lets the capture engine build and run its tests without React Native. Keep
// build output outside the repository (it is not ignored by the formatter):
//   swift test --scratch-path "$TMPDIR/duna-capture-build"
//   xcodebuild build -scheme DunaCaptureEngine \
//     -destination 'generic/platform=iOS' \
//     -derivedDataPath "$TMPDIR/duna-capture-xcode"
// The app itself compiles the same sources through DunaCapture.podspec.
import PackageDescription

let package = Package(
  name: "DunaCaptureEngine",
  platforms: [.iOS("26.0"), .macOS(.v13)],
  products: [
    .library(name: "DunaCaptureEngine", targets: ["DunaCaptureEngine"])
  ],
  targets: [
    .target(name: "DunaCaptureEngine", path: "Engine"),
    // Developer tool: runs the court finder on a photo or a video frame on
    // the Mac and writes the result drawn over the picture.
    //   swift run -c release -Xswiftc -enable-testing \
    //     --scratch-path "$TMPDIR/duna-capture-build-rel" \
    //     duna-court-probe clip.mov --time 4 --out result.png
    .executableTarget(
      name: "duna-court-probe",
      dependencies: ["DunaCaptureEngine"],
      path: "Tools/CourtProbe"
    ),
    .testTarget(
      name: "DunaCaptureEngineTests",
      dependencies: ["DunaCaptureEngine"],
      path: "Tests"
    )
  ]
)
