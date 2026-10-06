import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Pixelify_Sans, Press_Start_2P } from "next/font/google";
import Script from "next/script";
import { HostLinkGuard } from "@/components/chrome/host-link-guard";
import { MotionProvider } from "@/components/chrome/motion-provider";
import "./globals.css";

// Arcade type: Pixelify Sans for headings, Press Start 2P for the wordmark and coin-op labels.
const display = Pixelify_Sans({ variable: "--font-pixelify", subsets: ["latin"] });
const arcade = Press_Start_2P({ variable: "--font-press-start", subsets: ["latin"], weight: "400" });

const sans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

/**
 * iOS WebKit (Safari and every iOS browser, Chrome included) could leave a
 * navigation frozen on the old page mid view transition: the URL changed but
 * nothing rendered until a refresh. Without `startViewTransition` React applies
 * the update directly (its fallback path), so iOS gets plain, instant
 * navigations; other browsers keep the page transitions.
 */
const NO_IOS_VIEW_TRANSITIONS = `(function(){try{var n=navigator,ios=/iP(hone|ad|od)/.test(n.userAgent)||(n.platform==="MacIntel"&&n.maxTouchPoints>1);if(ios&&"startViewTransition" in Document.prototype)Object.defineProperty(Document.prototype,"startViewTransition",{value:undefined,configurable:true,writable:true});}catch(e){}})();`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Vibecade — the arcade where you challenge anyone on X",
    template: "%s · Vibecade",
  },
  description:
    "An online arcade: sign in with X and go head-to-head in reflex duels, meme battles, robot brawls, pool, darts and more. Build your own game with the Vibecade SDK.",
  applicationName: "Vibecade",
  // Added to the home screen, Vibecade opens without Safari's bars (see app/manifest.ts).
  appleWebApp: { capable: true, title: "Vibecade", statusBarStyle: "black" },
  openGraph: {
    type: "website",
    siteName: "Vibecade",
    title: "Vibecade — the arcade where you challenge anyone on X",
    description: "Insert coin: arcade games and meme duels against anyone on X.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vibecade — the arcade where you challenge anyone on X",
    description: "Insert coin: arcade games and meme duels against anyone on X.",
  },
};

export const viewport: Viewport = {
  themeColor: "#07040f",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${arcade.variable} ${sans.variable} ${mono.variable} antialiased`}>
      <body className="min-h-dvh">
        <Script id="no-ios-view-transitions" strategy="beforeInteractive">
          {NO_IOS_VIEW_TRANSITIONS}
        </Script>
        <HostLinkGuard />
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
