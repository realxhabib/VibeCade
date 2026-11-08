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

    /// A match is on screen in the tab on show: no tab bar at all.
    private var playing: Bool {
        switch tab {
        case .games: chrome.playing
        case .challenges: challenges.playing
        case .arena: arena.playing
        case .ranks: ranks.playing
        }
    }

    /// The app draws its own tab bar (not TabView's): the system one turns into a
    /// side pill on the Duo's inner screen that can't be hidden for a match.
    var body: some View {
        let barRoom = !playing && !hinge.halfOpen
        ZStack {
            Brand.void.ignoresSafeArea()
            page(.games) { GamesView() }
            page(.challenges) { NavigationStack { SiteScreen(page: challenges) } }
            page(.arena) { NavigationStack { SiteScreen(page: arena) } }
            page(.ranks) { NavigationStack { SiteScreen(page: ranks) } }
        }
        // Screens keep their bottom controls clear of the tab bar by this much.
        .environment(\.tabBarRoom, barRoom ? FoldTabBarHeight.value + 8 : 0)
        .overlay { tabBar }
        .background(HingeReader().allowsHitTesting(false))
        .animation(.easeInOut(duration: 0.25), value: playing)
        .onOpenURL(perform: open)
    }

    /// Every tab stays alive (and keeps its place); only the selected one shows.
    private func page<Content: View>(_ which: Tab, @ViewBuilder content: () -> Content) -> some View {
        content()
            .opacity(tab == which ? 1 : 0)
            .allowsHitTesting(tab == which)
            .accessibilityHidden(tab != which)
    }

    /// The tab bar: centered at the foot of the screen, or of the lower (right) half
    /// when the Duo is half folded. Hidden in a match.
    @ViewBuilder private var tabBar: some View {
        if !playing {
            GeometryReader { geo in
                // This reader ignores the safe area: its size is the whole screen.
                let insets = WindowInsets.current
                let full = geo.size.width
                let sideways = hinge.halfOpen && geo.size.width > geo.size.height
                VStack {
                    Spacer()
                    FoldTabBar(tabs: tabs, selection: $tab)
                        .frame(maxWidth: 440)
                        .padding(.horizontal, 16)
                        .padding(.bottom, max(insets.bottom - 12, 8))
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
