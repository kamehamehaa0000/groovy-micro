import { usePlayerStore } from "../../stores/player.store";
import { QueueContent } from "./QueueDrawer";
import { DesktopNowPlayingSidebar } from "./DesktopNowPlayingSidebar";

export function DesktopRightSidebar() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const sidebarView = usePlayerStore((s) => s.desktopRightSidebarView);
  const setSidebarView = usePlayerStore((s) => s.setDesktopRightSidebarView);

  const isOpen = sidebarView !== "none";

  return (
    <aside
      aria-label="Desktop Right Sidebar (Now Playing & Queue)"
      style={{
        height: currentTrack
          ? "calc(100vh - 3.5rem - 5rem)"
          : "calc(100vh - 3.5rem)",
      }}
      className={`hidden md:flex flex-col shrink-0 sticky top-14 z-30 bg-panel border-l border-line transition-[width,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden ${
        isOpen
          ? "w-95 lg:w-100 opacity-100"
          : "w-0 opacity-0 border-l-0 pointer-events-none"
      }`}
    >
      <div className="w-95 lg:w-100 h-full flex flex-col min-h-0">
        {sidebarView === "now-playing" && (
          <DesktopNowPlayingSidebar
            onClose={() => setSidebarView("none")}
            onSwitchToQueue={() => setSidebarView("queue")}
          />
        )}

        {sidebarView === "queue" && (
          <QueueContent
            mode="desktop"
            onClose={() => setSidebarView("none")}
          />
        )}
      </div>
    </aside>
  );
}
