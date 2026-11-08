import SwiftUI

/// One game: what it is, how to play, what you can earn, and the way into a match.
struct GameDetailView: View {
    let game: Game
    let play: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        FoldAware { layout in
            if layout.folded {
                FoldSplit(layout: layout) { foldedTop } second: {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 22) { howTo; achievements; about }
                            .padding(16)
                    }
                    .contentMargins(.bottom, 20, for: .scrollContent)
                }
            } else {
                unfolded
            }
        }
        .background(Brand.void)
        .toolbar(.hidden, for: .navigationBar)
    }

    /// Half folded: the game and the way in on the top half, the reading below.
    private var foldedTop: some View {
        ZStack(alignment: .bottomLeading) {
            GameArt(game: game, emojiSize: 80)
            LinearGradient(colors: [.clear, .black.opacity(0.9)], startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    GameBadge(game: game, size: 48)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(game.name).font(.title2.weight(.heavy))
                        Text(game.tagline).font(.subheadline).foregroundStyle(.white.opacity(0.85)).lineLimit(2)
                    }
                }
                FlowChips(chips: chips, tint: game.colors.first ?? Brand.cyan)
                playBar(wide: true).padding(.horizontal, -16).padding(.bottom, -10)
            }
            .padding(16)
        }
        .foregroundStyle(.white)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(alignment: .topLeading) { BackButton { dismiss() }.padding(10) }
        .padding(.horizontal, 10)
        .padding(.top, 6)
    }

    private var unfolded: some View {
        GeometryReader { geo in
            let wide = geo.size.width >= 600
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    hero(height: wide ? 300 : 260)
                    if wide {
                        HStack(alignment: .top, spacing: 24) {
                            VStack(alignment: .leading, spacing: 22) { intro; howTo; about }
                                .frame(maxWidth: .infinity, alignment: .leading)
                            achievements.frame(width: min(360, geo.size.width * 0.4))
                        }
                        .padding(20)
                    } else {
                        VStack(alignment: .leading, spacing: 22) { intro; howTo; achievements; about }
                            .padding(16)
                    }
                }
                .padding(.bottom, 100)
            }
            .ignoresSafeArea(edges: .top)
            .overlay(alignment: .bottom) { playBar(wide: wide) }
            .overlay(alignment: .topLeading) {
                BackButton { dismiss() }.padding(.leading, 12).padding(.top, 6)
            }
        }
    }

    private func hero(height: CGFloat) -> some View {
        ZStack(alignment: .bottomLeading) {
            GameArt(game: game, emojiSize: 110)
            LinearGradient(colors: [.clear, Brand.void], startPoint: .center, endPoint: .bottom)
        }
        .frame(height: height)
        .frame(maxWidth: .infinity)
        .clipped()
    }

    private var intro: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                GameBadge(game: game, size: 56)
                VStack(alignment: .leading, spacing: 3) {
                    Text(game.name).font(.title.weight(.heavy))
                    Text(game.developer ?? "VibeCade").font(.caption).foregroundStyle(Brand.dim)
                }
            }
            Text(game.tagline).font(.title3).foregroundStyle(.white.opacity(0.9))
            FlowChips(chips: chips, tint: game.colors.first ?? Brand.cyan)
        }
    }

    private var chips: [(String, String)] {
        var list: [(String, String)] = [(game.playersLabel, "person.2.fill")]
        if let d = game.durationLabel { list.append((d, "timer")) }
        if game.teams > 0 { list.append(("Teams", "person.3.fill")) }
        if game.canPlayAsync || game.turnBased { list.append(("Play anytime", "envelope.fill")) }
        if game.canPractice { list.append(("Practice vs bots", "cpu")) }
        return list
    }

    @ViewBuilder private var howTo: some View {
        if !game.howTo.isEmpty {
            DetailSection(title: "How to play") {
                VStack(alignment: .leading, spacing: 10) {
                    ForEach(Array(game.howTo.enumerated()), id: \.offset) { index, step in
                        HStack(alignment: .top, spacing: 12) {
                            Text("\(index + 1)")
                                .font(.caption.bold().monospacedDigit())
                                .frame(width: 24, height: 24)
                                .background(game.gradient, in: Circle())
                            Text(step).font(.body).foregroundStyle(.white.opacity(0.88))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                }
            }
        }
    }

    private var about: some View {
        DetailSection(title: "About") {
            Text(game.description).font(.body).foregroundStyle(.white.opacity(0.75))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    @ViewBuilder private var achievements: some View {
        if !game.achievements.isEmpty {
            DetailSection(title: "Achievements", trailing: "\(game.totalXP) XP") {
                VStack(spacing: 8) {
                    ForEach(game.achievements) { a in
                        HStack(spacing: 12) {
                            Text(a.icon).font(.title2).frame(width: 40, height: 40)
                                .background(Brand.raised, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                            VStack(alignment: .leading, spacing: 2) {
                                Text(a.name).font(.subheadline.bold())
                                Text(a.description).font(.caption).foregroundStyle(Brand.dim)
                            }
                            Spacer(minLength: 4)
                            Text("+\(a.xp)").font(.caption.bold().monospacedDigit()).foregroundStyle(game.colors.first ?? Brand.cyan)
                        }
                        .padding(10)
                        .background(Brand.panel, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    }
                }
            }
        }
    }

    private func playBar(wide: Bool) -> some View {
        Button {
            Haptics.tap(.medium)
            play()
        } label: {
            HStack(spacing: 10) {
                Image(systemName: "play.fill")
                Text("Play \(game.name)").lineLimit(1)
            }
            .font(.headline)
            .foregroundStyle(.black)
            .frame(maxWidth: wide ? 420 : .infinity, minHeight: 54)
            .background(game.gradient, in: Capsule())
            .shadow(color: (game.colors.first ?? Brand.cyan).opacity(0.45), radius: 18, y: 6)
        }
        .buttonStyle(PressStyle())
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
        .background(LinearGradient(colors: [.clear, Brand.void.opacity(0.95)], startPoint: .top, endPoint: .center).allowsHitTesting(false))
    }
}

private struct DetailSection<Content: View>: View {
    let title: String
    var trailing: String?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(title).font(.title3.bold())
                Spacer()
                if let trailing { Text(trailing).font(.caption.bold()).foregroundStyle(Brand.dim) }
            }
            content
        }
    }
}

/// Little labelled pills that wrap onto as many lines as they need.
struct FlowChips: View {
    let chips: [(String, String)]
    let tint: Color

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(chips, id: \.0) { chip in
                Label(chip.0, systemImage: chip.1)
                    .font(.caption.bold())
                    .foregroundStyle(tint)
                    .padding(.horizontal, 10).padding(.vertical, 6)
                    .background(tint.opacity(0.12), in: Capsule())
            }
        }
    }
}

struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, line: CGFloat = 0, widest: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > 0, x + size.width > width { x = 0; y += line + spacing; line = 0 }
            x += size.width + spacing
            line = max(line, size.height)
            widest = max(widest, x - spacing)
        }
        return CGSize(width: min(widest, width), height: y + line)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, line: CGFloat = 0
        for view in subviews {
            let size = view.sizeThatFits(.unspecified)
            if x > bounds.minX, x + size.width > bounds.maxX { x = bounds.minX; y += line + spacing; line = 0 }
            view.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            line = max(line, size.height)
        }
    }
}
