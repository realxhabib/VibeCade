import SwiftUI
import UIKit

/// A game on VibeCade, as the site's catalog describes it
/// (apps/web/src/platform/catalog.ts, exported by ios/scripts/export-catalog.mjs).
struct Game: Codable, Identifiable, Hashable {
    struct Achievement: Codable, Hashable, Identifiable {
        var id: String
        var name: String
        var description: String
        var icon: String
        var xp: Int
    }

    var slug: String
    var name: String
    var tagline: String
    var description: String
    var category: String
    var icon: String
    var iconImage: String?
    var coverImage: String?
    var accent: [String]
    var modes: [String]
    var minPlayers: Int
    var maxPlayers: Int
    var teams: Int
    var turnBased: Bool
    var durationLabel: String?
    var howTo: [String]
    var tags: [String]
    var official: Bool
    var developer: String?
    var achievements: [Achievement]

    var id: String { slug }

    var colors: [Color] {
        let list = accent.map(Color.init(hex:))
        return list.isEmpty ? [Brand.cyan, Brand.magenta] : list
    }

    var gradient: LinearGradient {
        LinearGradient(colors: colors, startPoint: .topLeading, endPoint: .bottomTrailing)
    }

    var canPractice: Bool { modes.contains("practice") }
    var canPlayAsync: Bool { modes.contains("async") }

    /// "2 players", "2–8 players", "Solo".
    var playersLabel: String {
        if maxPlayers <= 1 { return "Solo" }
        return minPlayers == maxPlayers ? "\(maxPlayers) players" : "\(minPlayers)–\(maxPlayers) players"
    }

    var totalXP: Int { achievements.reduce(0) { $0 + $1.xp } }

    var cover: UIImage? { coverImage.flatMap(Catalog.image(named:)) }
    var iconArt: UIImage? { iconImage.flatMap(Catalog.image(named:)) }
}

struct Catalog: Decodable {
    var featured: [String]
    var games: [Game]

    static let shared: Catalog = load()

    static func load(bundle: Bundle = .main) -> Catalog {
        guard let url = bundle.url(forResource: "catalog", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let catalog = try? JSONDecoder().decode(Catalog.self, from: data) else {
            return Catalog(featured: [], games: [])
        }
        return catalog
    }

    /// Featured games first (the site's home page order), then the rest as listed.
    var featuredGames: [Game] {
        let bySlug = Dictionary(uniqueKeysWithValues: games.map { ($0.slug, $0) })
        let picked = featured.compactMap { bySlug[$0] }
        return Array(picked.prefix(2))
    }

    func game(_ slug: String) -> Game? { games.first { $0.slug == slug } }

    func search(_ text: String) -> [Game] {
        let q = text.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return games }
        return games.filter {
            $0.name.lowercased().contains(q) || $0.tagline.lowercased().contains(q) || $0.tags.contains { $0.lowercased().contains(q) }
        }
    }

    private static var cache: [String: UIImage] = [:]

    static func image(named file: String) -> UIImage? {
        if let hit = cache[file] { return hit }
        let name = (file as NSString).deletingPathExtension
        let ext = (file as NSString).pathExtension
        guard let url = Bundle.main.url(forResource: name, withExtension: ext),
              let image = UIImage(contentsOfFile: url.path) else { return nil }
        cache[file] = image
        return image
    }
}

enum Brand {
    static let void = Color(hex: "#05060a")
    static let panel = Color(hex: "#0d1018")
    static let raised = Color(hex: "#171b27")
    static let line = Color(hex: "#2a3044")
    static let dim = Color(hex: "#8d96ad")
    static let cyan = Color(hex: "#01bdfd")
    static let magenta = Color(hex: "#fc02fa")
    static let nova = Color(hex: "#5b74ff")
    static let gradient = LinearGradient(colors: [cyan, nova, magenta], startPoint: .leading, endPoint: .trailing)
}

extension Color {
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
        let v = UInt64(s, radix: 16) ?? 0x888888
        self.init(.sRGB, red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }
}

enum Haptics {
    static func tap(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .light) {
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }
}
