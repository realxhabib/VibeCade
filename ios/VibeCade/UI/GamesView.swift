import SwiftUI

/// The shelf: featured games up top, then every game. Tapping one opens its page.
struct GamesView: View {
    private let catalog = Catalog.shared
    @State private var search = ""
    @State private var path: [Route] = []
    /// The game on show on the top half when the Duo is half folded.
    @State private var picked: Game? = Catalog.shared.featuredGames.first ?? Catalog.shared.games.first

    enum Route: Hashable {
        case game(Game)
        case play(Game)
        case site(URL)
    }

    var body: some View {
        NavigationStack(path: $path) {
            FoldAware { layout in
                if layout.folded {
                    FoldSplit(layout: layout) {
                        if let picked { FoldShowcase(game: picked, open: { path.append(.game(picked)) }, play: { path.append(.play(picked)) }) }
                    } second: {
                        foldedList(layout: layout)
                    }
                } else {
                    shelf(wide: layout == .wide)
                }
            }
            .background(Brand.void)
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: Route.self) { route in
                switch route {
                case .game(let game):
                    GameDetailView(game: game) { path.append(.play(game)) }
                case .play(let game):
                    PushedSite(url: Site.game(game.slug))
                case .site(let url):
                    PushedSite(url: url)
                }
            }
        }
    }

    /// Half folded: search and every game on the bottom half; a tap shows it up top.
    private func foldedList(layout: ScreenLayout) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                searchField
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 84), spacing: 10)], spacing: 12) {
                    ForEach(catalog.search(search)) { game in
                        Button {
                            Haptics.tap()
                            withAnimation(.spring(response: 0.35, dampingFraction: 0.85)) { picked = game }
                        } label: {
                            VStack(spacing: 6) {
                                GameBadge(game: game, size: 56)
                                    .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .strokeBorder(.white, lineWidth: picked == game ? 2.5 : 0))
                                Text(game.name).font(.caption2.bold()).lineLimit(1).foregroundStyle(picked == game ? .white : Brand.dim)
                            }
                        }
                        .buttonStyle(PressStyle())
                        .accessibilityLabel(game.name)
                    }
                }
            }
            .padding(.horizontal, 14)
            .padding(.top, 12)
        }
        .scrollDismissesKeyboard(.immediately)
        .contentMargins(.bottom, FoldTabBar.height + 16, for: .scrollContent)
    }

    private func shelf(wide: Bool) -> some View {
                ScrollView {
                    VStack(alignment: .leading, spacing: 22) {
                        header
                        if search.isEmpty, !catalog.featuredGames.isEmpty {
                            featured(wide: wide)
                        }
                        Text(search.isEmpty ? "All games" : "Results")
                            .font(.title3.bold())
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: wide ? 200 : 150), spacing: 14)], spacing: 14) {
                            ForEach(catalog.search(search)) { game in
                                NavigationLink(value: Route.game(game)) { GameCard(game: game) }
                                    .buttonStyle(PressStyle())
                            }
                        }
                        NavigationLink(value: Route.site(Site.allApps)) {
                            HStack {
                                Image(systemName: "square.grid.2x2.fill").foregroundStyle(Brand.cyan)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("Community games").font(.headline)
                                    Text("Everything people have built with the VibeCade SDK").font(.caption).foregroundStyle(Brand.dim)
                                }
                                Spacer()
                                Image(systemName: "chevron.right").foregroundStyle(Brand.dim)
                            }
                            .padding(16)
                            .background(Brand.panel, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                        }
                        .buttonStyle(PressStyle())
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 24)
                    .frame(maxWidth: 1100)
                    .frame(maxWidth: .infinity)
                }
                .scrollDismissesKeyboard(.immediately)
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image("Mark").resizable().scaledToFit().frame(width: 34, height: 34)
                Text("VibeCade").font(.system(size: 28, weight: .black, design: .rounded))
                    .foregroundStyle(Brand.gradient)
                Spacer()
            }
            .padding(.top, 8)
            searchField
        }
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(Brand.dim)
            TextField("Search games", text: $search)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            if !search.isEmpty {
                Button { search = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(Brand.dim) }
            }
        }
        .padding(12)
        .background(Brand.panel, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func featured(wide: Bool) -> some View {
        let games = catalog.featuredGames
        return Group {
            if wide {
                HStack(spacing: 14) {
                    ForEach(games) { game in
                        NavigationLink(value: Route.game(game)) { FeaturedCard(game: game) }.buttonStyle(PressStyle())
                    }
                }
            } else {
                ScrollView(.horizontal) {
                    HStack(spacing: 14) {
                        ForEach(games) { game in
                            NavigationLink(value: Route.game(game)) { FeaturedCard(game: game) }
                                .buttonStyle(PressStyle())
                                .containerRelativeFrame(.horizontal) { w, _ in w * 0.86 }
                        }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.viewAligned)
                .scrollIndicators(.hidden)
                .padding(.horizontal, -16)
                .contentMargins(.horizontal, 16, for: .scrollContent)
            }
        }
    }
}

/// Half folded: the picked game fills the top half, with ways in.
struct FoldShowcase: View {
    let game: Game
    let open: () -> Void
    let play: () -> Void

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            GameArt(game: game, emojiSize: 80)
            LinearGradient(colors: [.clear, .black.opacity(0.9)], startPoint: .top, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 8) {
                Text(game.name).font(.title.weight(.heavy))
                Text(game.tagline).font(.subheadline).foregroundStyle(.white.opacity(0.85)).lineLimit(2)
                Label(game.playersLabel, systemImage: "person.2.fill").font(.caption.bold())
                    .foregroundStyle(game.colors.first ?? Brand.cyan)
                HStack(spacing: 10) {
                    Button(action: play) {
                        Label("Play", systemImage: "play.fill").font(.headline).foregroundStyle(.black)
                            .lineLimit(1).fixedSize()
                            .padding(.horizontal, 20).frame(height: 44).background(game.gradient, in: Capsule())
                    }
                    Button(action: open) {
                        Label("Details", systemImage: "info.circle").font(.headline)
                            .lineLimit(1).fixedSize()
                            .padding(.horizontal, 16).frame(height: 44).background(.ultraThinMaterial, in: Capsule())
                    }
                }
                .buttonStyle(PressStyle())
            }
            .padding(16)
        }
        .foregroundStyle(.white)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .padding(.horizontal, 10)
        .padding(.top, 6)
        .id(game.slug)
        .transition(.opacity)
    }
}

/// A site page pushed onto the shelf's stack, with its own web view.
struct PushedSite: View {
    @State private var page: SitePage
    init(url: URL) { _page = State(initialValue: SitePage(home: url)) }
    var body: some View { SiteScreen(page: page, pushed: true) }
}

struct GameBadge: View {
    let game: Game?
    var size: CGFloat = 48

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
                .fill(game?.gradient ?? LinearGradient(colors: [Brand.cyan, Brand.magenta], startPoint: .topLeading, endPoint: .bottomTrailing))
            if let art = game?.iconArt {
                Image(uiImage: art).resizable().scaledToFill()
                    .clipShape(RoundedRectangle(cornerRadius: size * 0.28, style: .continuous))
            } else {
                Text(game?.icon ?? "🕹️").font(.system(size: size * 0.5))
            }
        }
        .frame(width: size, height: size)
    }
}

/// The art behind a card: the cover if the game has one, else its colors and emoji.
struct GameArt: View {
    let game: Game
    var emojiSize: CGFloat = 54

    var body: some View {
        // The art is an overlay so a wide cover never makes the view wider than its slot.
        Rectangle()
            .fill(game.gradient.opacity(0.85))
            .overlay {
                if let cover = game.cover {
                    Image(uiImage: cover).resizable().scaledToFill()
                } else {
                    Text(game.icon).font(.system(size: emojiSize))
                        .shadow(color: .black.opacity(0.35), radius: 12, y: 6)
                }
            }
            .clipped()
    }
}

struct GameCard: View {
    let game: Game

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            GameArt(game: game)
                .frame(height: 104)
                .frame(maxWidth: .infinity)
                .clipped()
            VStack(alignment: .leading, spacing: 4) {
                Text(game.name).font(.subheadline.bold()).lineLimit(1)
                Text(game.tagline).font(.caption).foregroundStyle(Brand.dim).lineLimit(2, reservesSpace: true)
                HStack(spacing: 6) {
                    Label(game.playersLabel, systemImage: "person.2.fill")
                    if let d = game.durationLabel { Text("·"); Text(d) }
                }
                .font(.caption2).foregroundStyle(game.colors.first ?? Brand.cyan)
                .lineLimit(1)
            }
            .padding(12)
        }
        .foregroundStyle(.white)
        .background(Brand.panel)
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Brand.line.opacity(0.5)))
        .accessibilityElement(children: .combine)
    }
}

struct FeaturedCard: View {
    let game: Game

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            GameArt(game: game, emojiSize: 90)
            LinearGradient(colors: [.clear, .black.opacity(0.85)], startPoint: .center, endPoint: .bottom)
            VStack(alignment: .leading, spacing: 4) {
                Text("FEATURED").font(.caption2.bold()).tracking(1.5).foregroundStyle(game.colors.first ?? Brand.cyan)
                Text(game.name).font(.title2.weight(.heavy))
                Text(game.tagline).font(.subheadline).foregroundStyle(.white.opacity(0.8)).lineLimit(2)
            }
            .padding(16)
        }
        .foregroundStyle(.white)
        .frame(height: 210)
        .frame(maxWidth: .infinity)
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(.white.opacity(0.08)))
    }
}

struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}
