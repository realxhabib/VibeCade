import Foundation

/// Where vibecade.si's pages are, and which links stay in the app.
enum Site {
    static let base = URL(string: "https://vibecade.si")!

    static func url(_ path: String) -> URL {
        URL(string: path, relativeTo: base)?.absoluteURL ?? base
    }

    static func game(_ slug: String) -> URL { url("/apps/\(slug)") }
    static var challenges: URL { url("/challenges") }
    static var arena: URL { url("/arena") }
    static var leaderboard: URL { url("/leaderboard") }
    static var allApps: URL { url("/apps") }
    static var login: URL { url("/login") }

    static func isSite(_ url: URL) -> Bool {
        guard let host = url.host()?.lowercased() else { return false }
        return host == "vibecade.si" || host == "www.vibecade.si"
    }

    /// Hosts the "Sign in with X" round trip goes through: Supabase, then X.
    static func isSignIn(_ url: URL) -> Bool {
        guard let host = url.host()?.lowercased() else { return false }
        let x = ["x.com", "twitter.com"].contains { host == $0 || host.hasSuffix(".\($0)") }
        if x { return !isPost(url) }
        return host.hasSuffix(".supabase.co")
    }

    /// "Post to X" links: those belong in the X app, not in VibeCade.
    static func isPost(_ url: URL) -> Bool {
        guard let host = url.host()?.lowercased(), ["x.com", "twitter.com", "www.x.com", "www.twitter.com"].contains(host) else { return false }
        return url.path.hasPrefix("/intent") || url.path.hasPrefix("/compose") || url.path.hasPrefix("/share")
    }

    /// A match or a game running full screen: the play room (`/play/<id>`),
    /// a solo app (`/apps/<slug>/open`), or a bare frame.
    static func isPlaying(_ url: URL?) -> Bool {
        guard let url, isSite(url) else { return false }
        let parts = url.path.split(separator: "/")
        if parts.first == "play", parts.count >= 2 { return true }
        if parts.first == "embed" { return true }
        if parts.count == 3, parts[0] == "apps", parts[2] == "open" { return true }
        return false
    }

    /// The game a page belongs to, if any (`/apps/<slug>…`, `/embed/<slug>`).
    static func gameSlug(_ url: URL?) -> String? {
        guard let url, isSite(url) else { return nil }
        let parts = url.path.split(separator: "/")
        if parts.count >= 2, parts[0] == "apps" || parts[0] == "embed" { return String(parts[1]) }
        return nil
    }

    enum Route: Equatable { case stay, safari }

    /// What happens to a top-level navigation. Pages, redirects and sign-in stay;
    /// a tapped link off the site opens in Safari (or the X app for posts).
    static func route(_ url: URL, tapped: Bool) -> Route {
        guard let scheme = url.scheme?.lowercased() else { return .stay }
        if scheme == "about" || scheme == "blob" || scheme == "data" { return .stay }
        guard scheme == "https" || scheme == "http" else { return .safari }
        if isSite(url) { return .stay }
        if isPost(url) { return .safari }
        if isSignIn(url) { return .stay }
        return tapped ? .safari : .stay
    }

    /// Runs before the site's own scripts on every page.
    static let earlyScript = """
    // The first build forced the site's full-screen mode, which hides the match's top
    // bar (players, reactions, leave). Clear that once; the site's own toggle decides now.
    try {
      if (!localStorage.getItem('vibecade-ios:immersive-reset')) {
        localStorage.removeItem('xapps:immersive');
        localStorage.setItem('vibecade-ios:immersive-reset', '1');
      }
    } catch (e) {}
    window.vibecadeApp = { platform: 'ios', version: 1 };
    """

    /// The app's tab bar replaces the site's bottom dock.
    static let lateScript = """
    (function () {
      if (document.getElementById('vibecade-ios')) return;
      var s = document.createElement('style');
      s.id = 'vibecade-ios';
      s.textContent = 'nav[aria-label="Main"]{display:none!important} main{padding-bottom:2.5rem!important} body{-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none}';
      (document.head || document.documentElement).appendChild(s);
    })();
    """
}
