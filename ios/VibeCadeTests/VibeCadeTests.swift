import XCTest
@testable import VibeCade

final class VibeCadeTests: XCTestCase {
    func testCatalogShipsWithTheApp() {
        let catalog = Catalog.load(bundle: Bundle(for: SitePage.self))
        XCTAssertGreaterThanOrEqual(catalog.games.count, 10)
        XCTAssertNotNil(catalog.game("wedge-wars"))
        XCTAssertEqual(Set(catalog.games.map(\.slug)).count, catalog.games.count)
        XCTAssertFalse(catalog.featuredGames.isEmpty)
    }

    func testPlayingPages() {
        XCTAssertTrue(Site.isPlaying(URL(string: "https://vibecade.si/play/abc123")))
        XCTAssertTrue(Site.isPlaying(URL(string: "https://vibecade.si/apps/perfect-circle/open")))
        XCTAssertFalse(Site.isPlaying(URL(string: "https://vibecade.si/apps/perfect-circle")))
        XCTAssertFalse(Site.isPlaying(URL(string: "https://vibecade.si/challenges")))
        XCTAssertFalse(Site.isPlaying(URL(string: "https://example.com/play/abc")))
        XCTAssertEqual(Site.gameSlug(URL(string: "https://vibecade.si/apps/frontline/open")), "frontline")
    }

    func testLinksThatLeaveTheApp() {
        let u = { (s: String) in URL(string: s)! }
        XCTAssertEqual(Site.route(u("https://vibecade.si/arena"), tapped: true), .stay)
        XCTAssertEqual(Site.route(u("https://abcd.supabase.co/auth/v1/authorize?provider=x"), tapped: false), .stay)
        XCTAssertEqual(Site.route(u("https://x.com/i/oauth2/authorize?client_id=1"), tapped: false), .stay)
        XCTAssertEqual(Site.route(u("https://x.com/intent/post?text=hi"), tapped: true), .safari)
        XCTAssertEqual(Site.route(u("https://github.com/realxhabib"), tapped: true), .safari)
        XCTAssertEqual(Site.route(u("mailto:hi@vibecade.si"), tapped: true), .safari)
    }

    func testFoldHalves() {
        let size = CGSize(width: 400, height: 800)
        let stacked = ScreenLayout.halves(of: size, layout: .foldedStacked)
        XCTAssertEqual(stacked.game.maxY, 394)
        XCTAssertEqual(stacked.controls.minY, 406)
        XCTAssertEqual(ScreenLayout.of(size, halfOpen: true), .foldedStacked)
        XCTAssertEqual(ScreenLayout.of(CGSize(width: 800, height: 400), halfOpen: true), .foldedSideBySide)
        XCTAssertEqual(ScreenLayout.of(CGSize(width: 700, height: 800), halfOpen: false), .wide)
    }
}
