import Observation
import SwiftUI
import WebKit

/// One web view onto vibecade.si. Every page shares the site's cookies, so signing
/// in with X once signs in every tab.
@MainActor
@Observable
final class SitePage: NSObject, WKNavigationDelegate, WKUIDelegate {
    let webView: WKWebView
    let home: URL
    private(set) var url: URL?
    private(set) var loading = true
    private(set) var failed: String?
    private(set) var canGoBack = false
    private(set) var title = ""
    @ObservationIgnored private var watches: [NSKeyValueObservation] = []
    @ObservationIgnored private let refresher = UIRefreshControl()

    /// A match or game is on screen: the app gets out of the way.
    var playing: Bool { Site.isPlaying(url) }
    var game: Game? { Site.gameSlug(url).flatMap { Catalog.shared.game($0) } }

    init(home: URL) {
        self.home = home
        webView = WKWebView(frame: .zero, configuration: SitePage.configuration())
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = UIColor(Brand.void)
        webView.scrollView.backgroundColor = UIColor(Brand.void)
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
        webView.isInspectable = true
        #endif
        refresher.tintColor = .white
        refresher.addAction(UIAction { [weak self] _ in
            self?.webView.reload()
            self?.refresher.endRefreshing()
        }, for: .valueChanged)
        webView.scrollView.refreshControl = refresher
        // The site moves between pages client-side (history.pushState), which the
        // navigation delegate never sees; the URL and back list do.
        watches = [
            webView.observe(\.url, options: [.new]) { [weak self] web, _ in
                MainActor.assumeIsolated { self?.sync(web) }
            },
            webView.observe(\.canGoBack, options: [.new]) { [weak self] web, _ in
                MainActor.assumeIsolated { self?.canGoBack = web.canGoBack }
            },
            webView.observe(\.title, options: [.new]) { [weak self] web, _ in
                MainActor.assumeIsolated { self?.title = web.title ?? "" }
            },
        ]
        load(home)
    }

    private static func configuration() -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.applicationNameForUserAgent = "VibeCadeApp/1"
        let scripts = config.userContentController
        scripts.addUserScript(WKUserScript(source: Site.earlyScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        scripts.addUserScript(WKUserScript(source: Site.lateScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        return config
    }

    private func sync(_ web: WKWebView) {
        guard let now = web.url else { return }
        let wasPlaying = playing
        url = now
        canGoBack = web.canGoBack
        if playing != wasPlaying {
            Haptics.tap(.soft)
            // Pulling down to refresh would fight a game's own drags.
            webView.scrollView.refreshControl = playing ? nil : refresher
        }
    }

    func load(_ target: URL) {
        failed = nil
        loading = true
        webView.load(URLRequest(url: target))
    }

    func goHome() {
        if let first = webView.backForwardList.backList.first, Site.isSite(first.url), first.url.path == home.path {
            webView.go(to: first)
        } else {
            load(home)
        }
    }

    func back() {
        if webView.canGoBack { webView.goBack() } else { load(home) }
    }

    /// Leaves a match: back to where it was opened from, or to the game's page.
    func leaveGame() {
        if webView.canGoBack, let previous = webView.backForwardList.backItem?.url, !Site.isPlaying(previous) {
            webView.goBack()
        } else if let game {
            load(Site.game(game.slug))
        } else {
            load(home)
        }
    }

    func reload() {
        failed = nil
        if webView.url == nil { load(home) } else { webView.reload() }
    }

    // MARK: WKNavigationDelegate

    nonisolated func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void) {
        MainActor.assumeIsolated {
            // Games from other developers run in their own frames: leave those alone.
            guard action.targetFrame?.isMainFrame ?? true, let target = action.request.url else { return decisionHandler(.allow) }
            if action.targetFrame == nil {
                // window.open / target=_blank: site pages open here, the rest outside.
                if Site.route(target, tapped: true) == .stay, Site.isSite(target) || Site.isSignIn(target) {
                    webView.load(action.request)
                } else {
                    UIApplication.shared.open(target)
                }
                return decisionHandler(.cancel)
            }
            switch Site.route(target, tapped: action.navigationType == .linkActivated) {
            case .stay: decisionHandler(.allow)
            case .safari:
                UIApplication.shared.open(target)
                decisionHandler(.cancel)
            }
        }
    }

    nonisolated func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        MainActor.assumeIsolated { loading = true }
    }

    nonisolated func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        MainActor.assumeIsolated {
            loading = false
            failed = nil
        }
    }

    nonisolated func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        MainActor.assumeIsolated { fail(error) }
    }

    nonisolated func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        MainActor.assumeIsolated { fail(error) }
    }

    nonisolated func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // A heavy 3D game can run the page out of memory: start it again.
        MainActor.assumeIsolated { reload() }
    }

    private func fail(_ error: Error) {
        loading = false
        let code = (error as NSError).code
        // Cancelled loads and "frame load interrupted" (a link we sent elsewhere) aren't failures.
        guard code != NSURLErrorCancelled, code != 102 else { return }
        if webView.url == nil || code == NSURLErrorNotConnectedToInternet || code == NSURLErrorTimedOut || code == NSURLErrorCannotFindHost {
            failed = error.localizedDescription
        }
    }

    // MARK: WKUIDelegate

    nonisolated func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        MainActor.assumeIsolated {
            if let target = action.request.url {
                if Site.isSite(target) || Site.isSignIn(target) { webView.load(action.request) } else { UIApplication.shared.open(target) }
            }
        }
        return nil
    }

    nonisolated func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping @MainActor (WKPermissionDecision) -> Void) {
        MainActor.assumeIsolated { decisionHandler(.prompt) }
    }

    nonisolated func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor () -> Void) {
        MainActor.assumeIsolated { Alerts.show(message, cancel: nil) { _ in completionHandler() } }
    }

    nonisolated func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor (Bool) -> Void) {
        MainActor.assumeIsolated { Alerts.show(message, cancel: "Cancel") { completionHandler($0) } }
    }
}

/// The site's alert() and confirm() as system alerts.
@MainActor
enum Alerts {
    static func show(_ message: String, cancel: String?, done: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        if let cancel { alert.addAction(UIAlertAction(title: cancel, style: .cancel) { _ in done(false) }) }
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in done(true) })
        guard let root = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).flatMap(\.windows).first(where: \.isKeyWindow)?.rootViewController else {
            return done(cancel == nil)
        }
        var top = root
        while let next = top.presentedViewController { top = next }
        top.present(alert, animated: true)
    }
}

struct SiteWebHost: UIViewRepresentable {
    let page: SitePage
    func makeUIView(context: Context) -> WKWebView { page.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
