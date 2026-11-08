import { InboxWatcher } from "@/components/chrome/inbox-watcher";
import { LobbyAlerts } from "@/components/chrome/lobby-alerts";
import { Toaster } from "@/components/chrome/toasts";
import { ConfettiLayer } from "@/components/motion/confetti";
import { AchievementLayer } from "@/components/play/achievement-moment";
import { PlatformProvider } from "@/platform/client";

export default function PlayLayout({ children }: LayoutProps<"/play">) {
  return (
    <PlatformProvider>
      <div data-app-host className="contents">
        {children}
      </div>
      {/* In game too: invites, your turn elsewhere, and friends waiting in a lobby. */}
      <InboxWatcher />
      <LobbyAlerts />
      <Toaster />
      <ConfettiLayer />
      <AchievementLayer />
    </PlatformProvider>
  );
}
