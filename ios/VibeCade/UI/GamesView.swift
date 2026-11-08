import SwiftUI

/// The shelf: featured games up top, then every game. Tapping one opens its page.
struct GamesView: View {
    private let catalog = Catalog.shared
    @State private var search = ""
    @State private var path: [Route] = []

    enum Route: Hashable {
        case game(Game)
        case play(Game)
        case site(URL)
    }

    var body: some View {
        NavigationStack(path: $path) {
            GeometryReader { geo in
                let wide = geo.size.width >= 600
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

    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(spacing: 10) {
                Image("Mark").resizable().scaledToFit().frame(width: 34, height: 34)
                Text("VibeCade").font(.system(size: 28, weight: .black, design: .rounded))
                    .foregroundStyle(Brand.gradient)
                Spacer()
            }
            .padding(.top, 8)
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
        ZStack {
            game.gradient.opacity(0.85)
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
