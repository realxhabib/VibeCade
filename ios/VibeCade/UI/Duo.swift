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

/// Two views either side of the Duo's crease: `first` on the top (or left) half,
/// `second` on the bottom (or right) half, each padded clear of the screen's edges.
struct FoldSplit<First: View, Second: View>: View {
    let layout: ScreenLayout
    @ViewBuilder var first: First
    @ViewBuilder var second: Second

    var body: some View {
        GeometryReader { geo in
            let insets = geo.safeAreaInsets
            let full = CGSize(width: geo.size.width + insets.leading + insets.trailing,
                              height: geo.size.height + insets.top + insets.bottom)
            let halves = ScreenLayout.halves(of: full, layout: layout)
            let sideways = layout == .foldedSideBySide
            ZStack(alignment: .topLeading) {
                Brand.void
                first
                    .padding(EdgeInsets(top: insets.top, leading: insets.leading, bottom: sideways ? insets.bottom : 0, trailing: 0))
                    .frame(width: halves.game.width, height: halves.game.height)
                    .offset(x: halves.game.minX, y: halves.game.minY)
                second
                    .padding(EdgeInsets(top: sideways ? insets.top : 0, leading: sideways ? 0 : insets.leading, bottom: insets.bottom, trailing: insets.trailing))
                    .frame(width: halves.controls.width, height: halves.controls.height)
                    .offset(x: halves.controls.minX, y: halves.controls.minY)
            }
            .ignoresSafeArea()
        }
    }
}

/// The current fold layout for a view's size, read from the hinge.
struct FoldAware<Content: View>: View {
    @State private var hinge = Hinge.shared
    @ViewBuilder var content: (ScreenLayout) -> Content

    var body: some View {
        GeometryReader { geo in
            let size = CGSize(width: geo.size.width + geo.safeAreaInsets.leading + geo.safeAreaInsets.trailing,
                              height: geo.size.height + geo.safeAreaInsets.top + geo.safeAreaInsets.bottom)
            content(ScreenLayout.of(size, halfOpen: hinge.halfOpen))
        }
        .background(HingeReader().allowsHitTesting(false))
        // Half folded, the app's own tab strip sits on the lower half instead (RootView).
        .toolbar(hinge.halfOpen ? .hidden : .visible, for: .tabBar)
    }
}

/// What the whole app needs to know about the screen on show.
@MainActor
@Observable
final class Chrome {
    static let shared = Chrome()
    /// A match is on screen: no tab bar of any kind.
    var playing = false
}

/// Half folded, the system tab bar would straddle the crease (sideways) or crowd the
/// controls half. This strip takes its place at the bottom of the lower (or right) half.
struct FoldTabBar<Tab: Hashable>: View {
    static var height: CGFloat { 56 }
    let tabs: [(tab: Tab, title: String, icon: String)]
    @Binding var selection: Tab

    var body: some View {
        HStack(spacing: 4) {
            ForEach(tabs, id: \.tab) { item in
                Button {
                    Haptics.tap()
                    selection = item.tab
                } label: {
                    VStack(spacing: 3) {
                        Image(systemName: item.icon).font(.system(size: 17, weight: .semibold))
                        Text(item.title).font(.system(size: 10, weight: .semibold)).lineLimit(1)
                    }
                    .foregroundStyle(selection == item.tab ? Brand.cyan : Brand.dim)
                    .frame(maxWidth: .infinity, minHeight: Self.height - 8)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(selection == item.tab ? .isSelected : [])
            }
        }
        .padding(.horizontal, 6)
        .frame(height: Self.height)
        .background(.ultraThinMaterial, in: Capsule())
        .overlay(Capsule().strokeBorder(.white.opacity(0.08)))
    }
}
