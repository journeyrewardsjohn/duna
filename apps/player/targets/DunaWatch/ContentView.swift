import SwiftUI

struct ContentView: View {
  @EnvironmentObject private var scoring: WatchScoringStore

  var body: some View {
    ScrollView {
      VStack(spacing: 10) {
        HStack {
          VStack(alignment: .leading, spacing: 1) {
            Text("DUNA")
              .font(.caption2.weight(.black))
              .tracking(1.8)
              .foregroundStyle(Color.accentColor)
            Text("Set \(scoring.currentSetIndex + 1)")
              .font(.caption)
              .foregroundStyle(.secondary)
          }
          Spacer()
          Text(scoring.matchComplete ? "FINAL" : "LIVE")
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 7)
            .padding(.vertical, 4)
            .background(
              scoring.matchComplete
                ? Color.green.opacity(0.2)
                : Color.orange.opacity(0.2)
            )
            .clipShape(Capsule())
        }

        teamScore(
          label: scoring.teamA,
          score: scoring.current.a,
          side: "A"
        )
        teamScore(
          label: scoring.teamB,
          score: scoring.current.b,
          side: "B"
        )

        if scoring.canAddSet {
          Button("Next set") {
            scoring.addNextSet()
          }
          .buttonStyle(.borderedProminent)
          .tint(Color.accentColor)
        } else if scoring.currentSetComplete || scoring.matchComplete {
          Button(scoring.matchComplete ? "Finalize match" : "Send set") {
            scoring.sendForReview()
          }
          .buttonStyle(.borderedProminent)
          .tint(scoring.matchComplete ? .green : Color.accentColor)
        }

        if let notice = scoring.sentNotice {
          Text(notice)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        }

        Button("New quick match", role: .destructive) {
          scoring.reset()
        }
        .font(.caption2)
      }
      .padding(.horizontal, 2)
    }
  }

  private func teamScore(label: String, score: Int, side: String) -> some View {
    HStack(spacing: 8) {
      VStack(alignment: .leading, spacing: 2) {
        Text(label)
          .font(.footnote.weight(.semibold))
          .lineLimit(1)
        Button {
          scoring.undoPoint(from: side)
        } label: {
          Label("Undo", systemImage: "arrow.uturn.backward")
            .font(.caption2)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.secondary)
      }
      Spacer()
      Button {
        scoring.addPoint(to: side)
      } label: {
        Text("\(score)")
          .font(.system(size: 34, weight: .black, design: .rounded))
          .frame(minWidth: 62, minHeight: 54)
      }
      .buttonStyle(.bordered)
      .tint(Color.accentColor)
      .disabled(scoring.currentSetComplete)
      .accessibilityLabel("\(label) \(score), add point")
    }
    .padding(8)
    .background(Color.white.opacity(0.07))
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
  }
}
