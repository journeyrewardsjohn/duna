import SwiftUI

@main
struct DunaWatchApp: App {
  @StateObject private var scoring = WatchScoringStore()

  var body: some Scene {
    WindowGroup {
      ContentView()
        .environmentObject(scoring)
    }
  }
}
