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
    @State private var hinge = Hinge.shared
    @State private var chrome = Chrome.shared

    private let tabs: [(tab: Tab, title: String, icon: String)] = [
        (.games, "Games", "gamecontroller.fill"),
        (.challenges, "Challenges", "bolt.fill"),
        (.arena, "Arena", "hammer.fill"),
        (.ranks, "Ranks", "trophy.fill"),
    ]

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
        .overlay { foldTabBar }
        .background(HingeReader().allowsHitTesting(false))
        .onOpenURL(perform: open)
    }

    /// Half folded: the tab strip at the foot of the lower (or right) half.
    @ViewBuilder private var foldTabBar: some View {
        if hinge.halfOpen, !chrome.playing {
            GeometryReader { geo in
                let sideways = geo.size.width > geo.size.height
                // This reader ignores the safe area: its size is the whole screen.
                let insets = WindowInsets.current
                let full = geo.size.width
                VStack {
                    Spacer()
                    FoldTabBar(tabs: tabs, selection: $tab)
                        .frame(maxWidth: 420)
                        .padding(.horizontal, 16)
                        .padding(.bottom, max(insets.bottom - 14, 6))
                }
                .frame(width: sideways ? full / 2 - 6 : full)
                .offset(x: sideways ? full / 2 + 6 : 0)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
            }
            .ignoresSafeArea()
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
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
