import { usePlayerStore } from "../../stores/player.store";
import { QueueContent } from "./QueueDrawer";
import { DevicesContent } from "./DevicePanel";
import { DesktopNowPlayingSidebar } from "./DesktopNowPlayingSidebar";
import { cn } from "../ui/cn";

/**
 * Now Playing / Queue panel.
 *
 * It is an overlay, not a column: it slides over the page instead of pushing
 * it. When it used to be a flex sibling whose width animated from 0, every
 * open and close re-laid out the entire page behind it.
 */
export function DesktopRightSidebar() {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const sidebarView = usePlayerStore((s) => s.desktopRightSidebarView);
  const setSidebarView = usePlayerStore((s) => s.setDesktopRightSidebarView);

  const isOpen = sidebarView !== "none";

  return (
    <>
      {/* Clicking the page closes the panel. */}
      <div
        aria-hidden={!isOpen}
        onClick={() => setSidebarView("none")}
        className={cn(
          "hidden md:block fixed inset-x-0 top-14 bottom-0 z-30 bg-scrim/50 transition-opacity duration-200 motion-reduce:transition-none",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      <aside
        aria-label="Now Playing & Queue"
        style={{
          bottom: currentTrack ? "var(--player-chrome-desktop)" : 0,
        }}
        className={cn(
          "hidden md:flex flex-col fixed right-0 top-14 z-40 w-95 lg:w-100 bg-card border-l border-border shadow-floating transition-transform duration-300 ease-out motion-reduce:transition-none",
          isOpen
            ? "translate-x-0"
            : "translate-x-full pointer-events-none",
        )}
      >
        <div className="h-full flex flex-col min-h-0">
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

          {sidebarView === "devices" && (
            <DevicesContent
              mode="desktop"
              onClose={() => setSidebarView("none")}
            />
          )}
        </div>
      </aside>
    </>
  );
}
