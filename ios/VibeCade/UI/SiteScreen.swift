import SwiftUI

/// A vibecade.si page. Browsing, it sits between the status bar and the tab bar;
/// in a match it takes the whole screen. Half folded on the Duo, the match takes one
/// half and VibeCade's match controls the other.
struct SiteScreen: View {
    let page: SitePage
    /// Shows a native back button (a game page pushed from the shelf).
    var pushed = false
    @Environment(\.dismiss) private var dismiss
    @State private var hinge = Hinge.shared
    @State private var wholeScreen = false

    var body: some View {
        GeometryReader { geo in
            let insets = geo.safeAreaInsets
            // The ZStack below ignores the safe area: its size is the proxy's plus the insets.
            let full = CGSize(width: geo.size.width + insets.leading + insets.trailing,
                              height: geo.size.height + insets.top + insets.bottom)
            let layout = ScreenLayout.of(full, halfOpen: hinge.halfOpen)
            let split = layout.folded && !(page.playing && wholeScreen)
            let halves = ScreenLayout.halves(of: full, layout: layout)
            // Browsing: inside the safe area. Playing: edge to edge (the site pads its
            // HUD by the web view's own safe area).
            let web = split ? (page.playing ? halves.game : halves.game.inset(by: UIEdgeInsets(top: insets.top, left: insets.leading, bottom: layout == .foldedSideBySide ? insets.bottom : 0, right: 0)))
                : page.playing ? CGRect(origin: .zero, size: full)
                : CGRect(x: insets.leading, y: insets.top, width: geo.size.width, height: geo.size.height)

            ZStack(alignment: .topLeading) {
                Brand.void
                SiteWebHost(page: page)
                    .frame(width: web.width, height: web.height)
                    .offset(x: web.minX, y: web.minY)
                if split {
                    Group {
                        if page.playing {
                            MatchControls(page: page, layout: layout, wholeScreen: $wholeScreen)
                        } else {
                            BrowseControls(page: page)
                        }
                    }
                        .padding(EdgeInsets(
                            top: layout == .foldedSideBySide ? max(insets.top, 10) : 10,
                            leading: layout == .foldedSideBySide ? 10 : max(insets.leading, 12),
                            bottom: max(insets.bottom, 10),
                            trailing: max(insets.trailing, 12)))
                        .frame(width: halves.controls.width, height: halves.controls.height)
                        .offset(x: halves.controls.minX, y: halves.controls.minY)
                        .transition(.opacity.combined(with: .move(edge: layout == .foldedSideBySide ? .trailing : .bottom)))
                }
                if page.url == nil, page.loading {
                    Loading()
                        .frame(width: full.width, height: full.height)
                }
                if let failed = page.failed {
                    Offline(message: failed) { page.reload() }
                        .frame(width: full.width, height: full.height)
                }
                if pushed, !page.playing {
                    BackButton { dismiss() }
                        .padding(.leading, max(insets.leading, 12))
                        .offset(y: insets.top + 10)
                }
                if page.playing, !split, layout.folded, wholeScreen {
                    // Whole screen while folded: a way back to the split.
                    Button { withAnimation { wholeScreen = false } } label: {
                        Image(systemName: "rectangle.split.1x2").font(.system(size: 14, weight: .bold))
                            .frame(width: 34, height: 34).background(.ultraThinMaterial, in: Circle())
                    }
                    .padding(.leading, full.width - 34 - max(insets.trailing, 12))
                    .offset(y: full.height / 2 + 12)
                }
            }
            .ignoresSafeArea()
            .animation(.spring(response: 0.45, dampingFraction: 0.88), value: split)
            .animation(.easeInOut(duration: 0.25), value: page.playing)
        }
        .background(HingeReader().allowsHitTesting(false))
        .toolbar(.hidden, for: .navigationBar)
        // Half folded, the app's own tab strip sits on the lower half instead (RootView).
        .toolbar(page.playing || hinge.halfOpen ? .hidden : .visible, for: .tabBar)
        .statusBarHidden(page.playing)
        .persistentSystemOverlays(page.playing ? .hidden : .automatic)
        .onChange(of: page.playing) { _, now in
            if !now { wholeScreen = false }
            Chrome.shared.playing = now
        }
        .onAppear { Chrome.shared.playing = page.playing }
        .onDisappear { Chrome.shared.playing = false }
    }
}

/// The folded half beside a site page: getting around, and a quick way into any game.
struct BrowseControls: View {
    let page: SitePage

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                PanelButton(title: "Back", icon: "chevron.left", tint: .white) { page.back() }
                PanelButton(title: "Top", icon: "house.fill", tint: Brand.cyan) { page.goHome() }
                PanelButton(title: "Reload", icon: "arrow.clockwise", tint: Brand.dim) { page.reload() }
            }
            Text("Jump into a game").font(.subheadline.bold()).foregroundStyle(Brand.dim)
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 72), spacing: 10)], spacing: 12) {
                    ForEach(Catalog.shared.games) { game in
                        Button {
                            Haptics.tap()
                            page.load(Site.game(game.slug))
                        } label: {
                            VStack(spacing: 5) {
                                GameBadge(game: game, size: 48)
                                Text(game.name).font(.caption2.bold()).lineLimit(1).foregroundStyle(Brand.dim)
                            }
                        }
                        .buttonStyle(PressStyle())
                        .accessibilityLabel("Open \(game.name)")
                    }
                }
            }
            .scrollIndicators(.hidden)
            .contentMargins(.bottom, 8, for: .scrollContent)
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Brand.panel, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Brand.line.opacity(0.6)))
        .padding(.bottom, FoldTabBar.height + 6)
    }
}

/// The folded half beside a match: which game it is, how to play, and the way out.
struct MatchControls: View {
    let page: SitePage
    let layout: ScreenLayout
    @Binding var wholeScreen: Bool

    var body: some View {
        let game = page.game
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                GameBadge(game: game, size: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(game?.name ?? "Match").font(.headline)
                    Text(game?.tagline ?? (page.title.isEmpty ? "VibeCade" : page.title))
                        .font(.caption).foregroundStyle(Brand.dim).lineLimit(1)
                }
                Spacer(minLength: 0)
            }
            if let howTo = game?.howTo, !howTo.isEmpty {
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(howTo.enumerated()), id: \.offset) { index, step in
                            HStack(alignment: .firstTextBaseline, spacing: 8) {
                                Text("\(index + 1)").font(.caption.monospacedDigit().bold()).foregroundStyle(game?.colors.first ?? Brand.cyan)
                                Text(step).font(.subheadline).foregroundStyle(.white.opacity(0.85))
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .scrollIndicators(.hidden)
            } else {
                Spacer(minLength: 0)
            }
            HStack(spacing: 10) {
                PanelButton(title: "Leave", icon: "xmark", tint: Color(hex: "#ff4f6d")) { page.leaveGame() }
                PanelButton(title: "Reload", icon: "arrow.clockwise", tint: Brand.dim) { page.reload() }
                PanelButton(title: "Whole screen", icon: "arrow.up.left.and.arrow.down.right", tint: Brand.cyan) {
                    withAnimation { wholeScreen = true }
                }
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(Brand.panel, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 24, style: .continuous).strokeBorder(Brand.line.opacity(0.6)))
    }
}

struct PanelButton: View {
    let title: String
    let icon: String
    let tint: Color
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.tap()
            action()
        } label: {
            VStack(spacing: 4) {
                Image(systemName: icon).font(.system(size: 16, weight: .bold))
                Text(title).font(.caption2.bold()).lineLimit(1).minimumScaleFactor(0.8)
            }
            .foregroundStyle(tint)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

struct BackButton: View {
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            Image(systemName: "chevron.left").font(.system(size: 15, weight: .bold))
                .frame(width: 38, height: 38)
                .background(.ultraThinMaterial, in: Circle())
                .overlay(Circle().strokeBorder(.white.opacity(0.12)))
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Back")
    }
}

struct Loading: View {
    var body: some View {
        VStack(spacing: 14) {
            Image("Mark").resizable().scaledToFit().frame(width: 72, height: 72)
                .symbolEffect(.pulse)
            ProgressView().tint(.white)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.void)
    }
}

struct Offline: View {
    let message: String
    let retry: () -> Void
    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "wifi.exclamationmark").font(.system(size: 40)).foregroundStyle(Brand.dim)
            Text("Can't reach VibeCade").font(.headline)
            Text(message).font(.footnote).foregroundStyle(Brand.dim).multilineTextAlignment(.center)
            Button("Try again", action: retry).buttonStyle(.borderedProminent).tint(Brand.nova)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Brand.void)
    }
}
