import SwiftUI

@main
struct VibeCadeApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
                .tint(Brand.cyan)
        }
    }
}

struct RootView: View {
    enum Tab: Hashable { case games, challenges, arena, ranks }

    @State private var tab: Tab = .games
    // Each site tab keeps its page (and its place in it) while you switch around.
    @State private var challenges = SitePage(home: Site.challenges)
    @State private var arena = SitePage(home: Site.arena)
    @State private var ranks = SitePage(home: Site.leaderboard)

    var body: some View {
        TabView(selection: $tab) {
            SwiftUI.Tab("Games", systemImage: "gamecontroller.fill", value: Tab.games) { GamesView() }
            SwiftUI.Tab("Challenges", systemImage: "bolt.fill", value: Tab.challenges) {
                NavigationStack { SiteScreen(page: challenges) }
            }
            SwiftUI.Tab("Arena", systemImage: "hammer.fill", value: Tab.arena) {
                NavigationStack { SiteScreen(page: arena) }
            }
            SwiftUI.Tab("Ranks", systemImage: "trophy.fill", value: Tab.ranks) {
                NavigationStack { SiteScreen(page: ranks) }
            }
        }
        .background(Brand.void)
        .onOpenURL(perform: open)
    }

    /// `vibecade://play/<id>` or a vibecade.si link: open it in the Challenges tab.
    private func open(_ link: URL) {
        var target: URL?
        if Site.isSite(link) {
            target = link
        } else if link.scheme == "vibecade" {
            let path = "/" + [link.host() ?? "", link.path].joined().trimmingCharacters(in: CharacterSet(charactersIn: "/"))
            target = Site.url(path)
        }
        guard let target else { return }
        tab = .challenges
        challenges.load(target)
    }
}
