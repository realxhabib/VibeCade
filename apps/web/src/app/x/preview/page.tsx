import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/components/chrome/logo";
import { PLAYER_SIZE, playsInPost, xPlayerPath, xSharePath } from "@/lib/x-player";
import { getOfficialApp } from "@/platform/catalog";
import { officialCatalogApps } from "@/platform/official-apps";

export const metadata: Metadata = {
  title: { absolute: "Post preview · XApps" },
  robots: { index: false },
  openGraph: null,
  twitter: null,
};

/**
 * `/x/preview` (`?app=<slug>` for one app): the player in a 480×480 frame
 * inside a mock post, the way X shows a playable post on desktop web. For
 * trying the player in a browser; the real link to post is `/x` or `/x/<slug>`.
 */
export default async function XPreviewPage({ searchParams }: PageProps<"/x/preview">) {
  const { app: slug } = await searchParams;
  const app = typeof slug === "string" ? getOfficialApp(slug) : undefined;
  const games = officialCatalogApps().filter(playsInPost);
  return (
    <main className="flex min-h-dvh flex-col items-center gap-6 bg-ink-950 px-4 py-8">
      <article className="w-full max-w-[530px] rounded-2xl border border-white/10 bg-black p-4">
        <header className="mb-2 flex items-center gap-2.5">
          <LogoMark size={36} />
          <div className="text-[15px] leading-tight">
            <p className="font-bold text-ink-50">XApps</p>
            <p className="text-ink-400">Post preview</p>
          </div>
        </header>
        <p className="mb-3 text-[15px] text-ink-50">{app ? `Bet you can't beat me at ${app.name} 👇` : "Play right here in the post 👇"}</p>
        {/* The size X gives a player card; `key` reloads the frame when switching apps. */}
        <div className="overflow-hidden rounded-2xl border border-white/15" style={{ maxWidth: PLAYER_SIZE.width }}>
          <iframe
            key={app?.slug ?? "hub"}
            src={xPlayerPath(app?.slug)}
            width={PLAYER_SIZE.width}
            height={PLAYER_SIZE.height}
            className="block max-w-full"
            style={{ aspectRatio: `${PLAYER_SIZE.width} / ${PLAYER_SIZE.height}`, height: "auto" }}
            allow="autoplay; fullscreen; clipboard-write"
            title="XApps player"
          />
        </div>
        <p className="mt-2 text-[13px] text-ink-400">Link to post: {xSharePath(app?.slug)}</p>
      </article>
      <nav className="flex max-w-[530px] flex-wrap justify-center gap-2 text-[13px]">
        <Link href="/x/preview" className={`rounded-full px-3 py-1.5 ${app ? "glass text-ink-200" : "bg-ink-50 font-semibold text-ink-950"}`}>
          All games
        </Link>
        {games.map((g) => (
          <Link
            key={g.slug}
            href={`/x/preview?app=${g.slug}`}
            className={`rounded-full px-3 py-1.5 ${app?.slug === g.slug ? "bg-ink-50 font-semibold text-ink-950" : "glass text-ink-200"}`}
          >
            {g.icon} {g.name}
          </Link>
        ))}
      </nav>
    </main>
  );
}
