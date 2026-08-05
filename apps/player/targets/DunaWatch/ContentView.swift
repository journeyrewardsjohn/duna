import SwiftUI

private let dunaGreen = Color(red: 0.24, green: 0.86, blue: 0.48)
private let dunaOrange = Color(red: 1.0, green: 0.63, blue: 0.12)

struct ContentView: View {
  @EnvironmentObject private var scoring: WatchScoringStore
  @State private var showCamera = false
  @State private var showControls = false
  @State private var actionLabel: String?

  var body: some View {
    GeometryReader { proxy in
      let compact = proxy.size.height < 205
      VStack(spacing: compact ? 1 : 3) {
        topBar(compact: compact)
        teamMarker(
          name: scoring.teamA,
          side: "A",
          color: dunaGreen,
          inverted: false,
          compact: compact
        )
        scoreBoard(compact: compact)
        teamMarker(
          name: scoring.teamB,
          side: "B",
          color: dunaOrange,
          inverted: true,
          compact: compact
        )
        bottomBar(compact: compact)
      }
      .padding(.horizontal, compact ? 3 : 5)
      .frame(width: proxy.size.width, height: proxy.size.height)
      .background(Color.black)
      .contentShape(Rectangle())
      .gesture(swipeGesture)
      .overlay(alignment: .center) {
        if let actionLabel {
          Text(actionLabel)
            .font(.system(size: compact ? 11 : 12, weight: .black, design: .rounded))
            .multilineTextAlignment(.center)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(.ultraThinMaterial, in: Capsule())
            .transition(.scale.combined(with: .opacity))
        }
      }
    }
    .ignoresSafeArea(edges: .bottom)
    .sheet(isPresented: $showCamera) {
      CameraPreviewView()
        .environmentObject(scoring)
    }
    .sheet(isPresented: $showControls) {
      MatchControlsView()
        .environmentObject(scoring)
    }
  }

  private func topBar(compact: Bool) -> some View {
    ZStack {
      TimelineView(.periodic(from: .now, by: 1)) { context in
        HStack(spacing: 4) {
          Image(systemName: scoring.isVisionActive ? "figure.run" : "stopwatch.fill")
            .font(.system(size: compact ? 10 : 11, weight: .bold))
            .foregroundStyle(scoring.isVisionActive ? dunaGreen : .secondary)
          Text(elapsedLabel(scoring.elapsedSeconds(at: context.date)))
            .font(.system(size: compact ? 14 : 16, weight: .bold, design: .rounded))
            .monospacedDigit()
        }
      }

      HStack {
        roundButton(
          symbol: "video.fill",
          label: "Check Duna Vision camera",
          compact: compact
        ) {
          showCamera = true
        }
        Spacer()
        roundButton(
          symbol: "gearshape.fill",
          label: "Match and set controls",
          compact: compact
        ) {
          showControls = true
        }
      }
    }
    .frame(height: compact ? 27 : 31)
  }

  private func roundButton(
    symbol: String,
    label: String,
    compact: Bool,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Image(systemName: symbol)
        .font(.system(size: compact ? 11 : 13, weight: .bold))
        .frame(width: compact ? 27 : 31, height: compact ? 27 : 31)
    }
    .buttonStyle(.plain)
    .background(Color.white.opacity(0.11), in: Circle())
    .accessibilityLabel(label)
  }

  private func teamMarker(
    name: String,
    side: String,
    color: Color,
    inverted: Bool,
    compact: Bool
  ) -> some View {
    VStack(spacing: compact ? -1 : 0) {
      if inverted {
        TeamChevron(inverted: true)
          .stroke(color, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
          .frame(width: compact ? 62 : 72, height: 8)
      }
      HStack(spacing: 4) {
        ZStack {
          Circle()
            .fill(Color(white: 0.16))
            .overlay(Circle().stroke(color, lineWidth: 2))
          Text(initials(name))
            .font(.system(size: compact ? 8 : 9, weight: .black, design: .rounded))
        }
        .frame(width: compact ? 20 : 23, height: compact ? 20 : 23)

        Text(name)
          .font(.system(size: compact ? 9 : 10, weight: .bold, design: .rounded))
          .lineLimit(1)
          .minimumScaleFactor(0.72)
          .frame(maxWidth: compact ? 94 : 112)

        Circle()
          .fill(scoring.serving == side ? color : Color.white.opacity(0.12))
          .frame(width: 6, height: 6)
          .accessibilityLabel(scoring.serving == side ? "Serving" : "Not serving")
      }
      if !inverted {
        TeamChevron(inverted: false)
          .stroke(color, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
          .frame(width: compact ? 62 : 72, height: 8)
      }
    }
    .frame(height: compact ? 25 : 30)
  }

  private func scoreBoard(compact: Bool) -> some View {
    HStack(spacing: compact ? 1 : 3) {
      Text("A  ↑")
        .font(.system(size: compact ? 7 : 8, weight: .black, design: .rounded))
        .tracking(0.6)
        .foregroundStyle(dunaGreen)
        .rotationEffect(.degrees(-90))
        .frame(width: compact ? 19 : 22)

      VStack(spacing: compact ? -5 : -3) {
        scoreRow(
          sets: scoring.setsWonA,
          points: scoring.current.a,
          color: dunaGreen,
          compact: compact
        )
        scoreRow(
          sets: scoring.setsWonB,
          points: scoring.current.b,
          color: dunaOrange,
          compact: compact
        )
      }
      .frame(maxWidth: .infinity)

      Text("↓  B")
        .font(.system(size: compact ? 7 : 8, weight: .black, design: .rounded))
        .tracking(0.6)
        .foregroundStyle(dunaOrange)
        .rotationEffect(.degrees(90))
        .frame(width: compact ? 19 : 22)
    }
    .frame(maxHeight: .infinity)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(
      "Set \(scoring.currentSetIndex + 1). \(scoring.teamA), \(scoring.current.a). \(scoring.teamB), \(scoring.current.b)."
    )
  }

  private func scoreRow(
    sets: Int,
    points: Int,
    color: Color,
    compact: Bool
  ) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: compact ? 12 : 15) {
      Text("\(sets)")
        .font(.system(size: compact ? 22 : 25, weight: .medium, design: .rounded))
        .foregroundStyle(color)
        .frame(width: compact ? 24 : 28, alignment: .trailing)
      Text("\(points)")
        .font(.system(size: compact ? 43 : 50, weight: .medium, design: .rounded))
        .foregroundStyle(.white)
        .monospacedDigit()
        .contentTransition(.numericText())
        .frame(width: compact ? 65 : 76, alignment: .trailing)
    }
    .minimumScaleFactor(0.75)
  }

  private func bottomBar(compact: Bool) -> some View {
    HStack {
      Button {
        scoring.favoriteMoment()
        showAction("★ MOMENT SAVED")
      } label: {
        Image(systemName: "star.fill")
          .font(.system(size: compact ? 14 : 16, weight: .bold))
          .foregroundStyle(.white)
          .frame(width: compact ? 31 : 36, height: compact ? 31 : 36)
      }
      .buttonStyle(.plain)
      .background(Color.white.opacity(0.12), in: Circle())
      .disabled(!scoring.isVisionActive)
      .accessibilityLabel("Favorite this moment")

      Spacer()

      if scoring.sideChangeDue {
        Button {
          scoring.confirmSideChange()
          showAction("SIDES CHANGED")
        } label: {
          Label("SWITCH", systemImage: "arrow.left.arrow.right")
            .font(.system(size: compact ? 8 : 9, weight: .black, design: .rounded))
            .padding(.horizontal, 8)
            .frame(height: compact ? 27 : 31)
        }
        .buttonStyle(.plain)
        .background(Color.yellow.opacity(0.24), in: Capsule())
        .tint(.yellow)
      } else {
        VStack(spacing: 0) {
          Text("SET \(scoring.currentSetIndex + 1)")
            .font(.system(size: compact ? 9 : 10, weight: .black, design: .rounded))
          Text(scoring.isVisionActive ? "DUNA VISION" : "QUICK SCORE")
            .font(.system(size: compact ? 6 : 7, weight: .bold, design: .rounded))
            .tracking(0.7)
            .foregroundStyle(scoring.isVisionActive ? dunaGreen : .secondary)
        }
      }

      Spacer()

      Button {
        scoring.undoLastPoint()
        showAction("← POINT UNDONE")
      } label: {
        Image(systemName: "arrow.uturn.backward")
          .font(.system(size: compact ? 14 : 16, weight: .bold))
          .foregroundStyle(.white)
          .frame(width: compact ? 31 : 36, height: compact ? 31 : 36)
      }
      .buttonStyle(.plain)
      .background(Color.white.opacity(0.12), in: Circle())
      .accessibilityLabel("Undo the last point")
    }
    .frame(height: compact ? 32 : 38)
  }

  private var swipeGesture: some Gesture {
    DragGesture(minimumDistance: 22)
      .onEnded { value in
        let horizontal = value.translation.width
        let vertical = value.translation.height
        if abs(vertical) > abs(horizontal) {
          let side = vertical < 0 ? "A" : "B"
          scoring.addPoint(to: side)
          showAction(
            side == "A"
              ? "↑ \(scoring.teamA.uppercased())"
              : "↓ \(scoring.teamB.uppercased())"
          )
        } else if horizontal > 0 {
          scoring.favoriteMoment()
          showAction("★ MOMENT SAVED")
        } else {
          scoring.undoLastPoint()
          showAction("← POINT UNDONE")
        }
      }
  }

  private func showAction(_ label: String) {
    withAnimation(.spring(response: 0.24, dampingFraction: 0.78)) {
      actionLabel = label
    }
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) {
      withAnimation(.easeOut(duration: 0.2)) {
        actionLabel = nil
      }
    }
  }

  private func elapsedLabel(_ seconds: Int) -> String {
    String(format: "%02d:%02d", seconds / 60, seconds % 60)
  }

  private func initials(_ name: String) -> String {
    let parts = name.split(separator: " ")
    if parts.count > 1 {
      return parts.prefix(2).compactMap(\.first).map(String.init).joined()
    }
    return String(name.prefix(2)).uppercased()
  }
}

private struct TeamChevron: Shape {
  let inverted: Bool

  func path(in rect: CGRect) -> Path {
    var path = Path()
    if inverted {
      path.move(to: CGPoint(x: rect.minX, y: rect.minY))
      path.addLine(to: CGPoint(x: rect.midX, y: rect.maxY))
      path.addLine(to: CGPoint(x: rect.maxX, y: rect.minY))
    } else {
      path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
      path.addLine(to: CGPoint(x: rect.midX, y: rect.minY))
      path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
    }
    return path
  }
}

private struct CameraPreviewView: View {
  @Environment(\.dismiss) private var dismiss
  @EnvironmentObject private var scoring: WatchScoringStore

  var body: some View {
    VStack(spacing: 7) {
      HStack {
        Button("Done") { dismiss() }
          .font(.caption2.weight(.bold))
          .buttonStyle(.plain)
          .foregroundStyle(Color.accentColor)
        Spacer()
        Text("CAMERA CHECK")
          .font(.system(size: 8, weight: .black, design: .rounded))
          .tracking(0.8)
      }

      ZStack {
        RoundedRectangle(cornerRadius: 13, style: .continuous)
          .fill(Color.white.opacity(0.06))
        if let image = scoring.previewImage {
          Image(uiImage: image)
            .resizable()
            .scaledToFill()
            .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
        } else {
          VStack(spacing: 5) {
            Image(systemName: "video.slash")
              .font(.title3)
            Text("Open Duna Vision on iPhone")
              .font(.caption2.weight(.semibold))
              .multilineTextAlignment(.center)
          }
          .foregroundStyle(.secondary)
        }
        RoundedRectangle(cornerRadius: 13, style: .continuous)
          .stroke(
            scoring.previewAcceptable ? Color.green : Color.yellow,
            lineWidth: 2
          )
        VStack {
          Spacer()
          HStack {
            Text("\(scoring.previewScore)/100")
              .font(.system(size: 10, weight: .black, design: .rounded))
            Spacer()
            Image(
              systemName: scoring.previewAcceptable
                ? "checkmark.circle.fill"
                : "exclamationmark.triangle.fill"
            )
          }
          .padding(6)
          .background(.ultraThinMaterial)
        }
      }
      .frame(maxHeight: .infinity)

      Text(scoring.previewQuality)
        .font(.system(size: 9, weight: .semibold))
        .foregroundStyle(scoring.previewAcceptable ? .green : .yellow)
        .lineLimit(2)
        .multilineTextAlignment(.center)
    }
    .padding(.horizontal, 4)
  }
}

private struct MatchControlsView: View {
  @Environment(\.dismiss) private var dismiss
  @EnvironmentObject private var scoring: WatchScoringStore

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 10) {
        HStack {
          Text("Match controls")
            .font(.headline)
          Spacer()
          Button("Done") { dismiss() }
            .buttonStyle(.plain)
            .foregroundStyle(Color.accentColor)
        }

        Button {
          if scoring.endCurrentSet() { dismiss() }
        } label: {
          Label(
            scoring.canAddSet
              ? "End set \(scoring.currentSetIndex + 1)"
              : "Set \(scoring.currentSetIndex + 1) is still live",
            systemImage: "flag.checkered"
          )
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.borderedProminent)
        .tint(dunaGreen)
        .disabled(!scoring.canAddSet)

        Text(
          scoring.canAddSet
            ? "The completed score is saved and the next set opens at 0–0."
            : "The set can end when its configured target and win-by rule are met."
        )
        .font(.caption2)
        .foregroundStyle(.secondary)

        if scoring.matchComplete {
          Button {
            scoring.sendForReview()
            dismiss()
          } label: {
            Label("End match and send", systemImage: "checkmark.seal.fill")
              .frame(maxWidth: .infinity, alignment: .leading)
          }
          .buttonStyle(.borderedProminent)
          .tint(dunaOrange)
        }

        Divider()
        guide("arrow.up", "Point for \(scoring.teamA)")
        guide("arrow.down", "Point for \(scoring.teamB)")
        guide("arrow.right", "Save a favorite moment")
        guide("arrow.left", "Undo the last point")

        Divider()
        Button("New quick score", role: .destructive) {
          scoring.reset()
          dismiss()
        }
        .font(.caption)
      }
    }
  }

  private func guide(_ symbol: String, _ label: String) -> some View {
    Label(label, systemImage: symbol)
      .font(.caption.weight(.semibold))
  }
}
