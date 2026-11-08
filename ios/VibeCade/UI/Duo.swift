import Observation
import SwiftUI
import UIKit

/// The iPhone Duo's hinge. Half folded (`UIHingeInteraction`, iOS 27.1), the screen
/// splits across its longer side: the game on one half, VibeCade's controls on the other.
/// `-forceHalfOpen YES` fakes it in the Simulator, which can't fold.
@MainActor
@Observable
final class Hinge {
    static let shared = Hinge()
    private(set) var halfOpen = UserDefaults.standard.bool(forKey: "forceHalfOpen")
    @ObservationIgnored private var generation = 0

    func report(_ halfOpen: Bool) {
        generation += 1
        let gen = generation
        let value = halfOpen || UserDefaults.standard.bool(forKey: "forceHalfOpen")
        // The hinge reports a few times while it moves; settle before relaying out.
        Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(250))
            guard gen == self.generation, value != self.halfOpen else { return }
            withAnimation(.spring(response: 0.45, dampingFraction: 0.88)) { self.halfOpen = value }
            Haptics.tap(.soft)
        }
    }
}

/// An invisible view that listens to the hinge.
struct HingeReader: UIViewRepresentable {
    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isUserInteractionEnabled = false
        if #available(iOS 27.1, *) {
            view.addInteraction(UIHingeInteraction { _, update in
                Hinge.shared.report(update.hinge?.status == .partiallyOpen)
            })
        }
        return view
    }

    func updateUIView(_ uiView: UIView, context: Context) {}
}

/// How a screen lays itself out on the current display and fold.
enum ScreenLayout: Equatable {
    /// A phone screen (the Duo's outer screen too).
    case compact
    /// The unfolded inner screen, an iPad, or a phone sideways with room to spare.
    case wide
    /// Half folded upright: game on the top half, controls on the bottom.
    case foldedStacked
    /// Half folded sideways: game on the left, controls on the right.
    case foldedSideBySide

    static func of(_ size: CGSize, halfOpen: Bool) -> ScreenLayout {
        if halfOpen { return size.height >= size.width ? .foldedStacked : .foldedSideBySide }
        return size.width >= 600 ? .wide : .compact
    }

    var folded: Bool { self == .foldedStacked || self == .foldedSideBySide }

    /// The game's and the controls' rectangles when folded, either side of the crease.
    /// `crease` points either side of the fold stay clear: the panel bends there.
    static func halves(of size: CGSize, layout: ScreenLayout, crease: CGFloat = 6) -> (game: CGRect, controls: CGRect) {
        if layout == .foldedSideBySide {
            let w = size.width / 2 - crease
            return (CGRect(x: 0, y: 0, width: w, height: size.height),
                    CGRect(x: size.width / 2 + crease, y: 0, width: w, height: size.height))
        }
        let h = size.height / 2 - crease
        return (CGRect(x: 0, y: 0, width: size.width, height: h),
                CGRect(x: 0, y: size.height / 2 + crease, width: size.width, height: h))
    }
}

/// The window's safe-area insets (status bar, Dynamic Island or the Duo's camera band,
/// home indicator).
@MainActor
enum WindowInsets {
    static var current: EdgeInsets {
        let window = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first { $0.isKeyWindow }
        let i = window?.safeAreaInsets ?? .zero
        return EdgeInsets(top: i.top, leading: i.left, bottom: i.bottom, trailing: i.right)
    }
}
