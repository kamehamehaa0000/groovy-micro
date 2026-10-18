/**
 * Generates and persists a stable client device identifier and human-readable device name.
 */
function getBrowserAndOs(): string {
  if (typeof window === "undefined" || !navigator.userAgent) {
    return "Web Client";
  }

  const ua = navigator.userAgent;
  let browser = "Browser";
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Safari/")) browser = "Safari";

  let os = "Desktop";
  if (ua.includes("Win")) os = "Windows";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  return `${browser} on ${os}`;
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
}

const DEVICE_ID_KEY = "groovy:device:id";
const DEVICE_NAME_KEY = "groovy:device:name";
/** Per-tab identity. sessionStorage, so a second tab is a distinct instance. */
const INSTANCE_ID_KEY = "groovy:player:instance_id";
/** Per-tab "has audio ever started here?" flag, gating push transfers. */
const AUDIO_UNLOCKED_KEY = "groovy:player:audio_unlocked";

export function getDeviceInfo(): DeviceInfo {
  if (typeof window === "undefined") {
    return { deviceId: "server", deviceName: "Server Environment" };
  }

  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }

  let deviceName = localStorage.getItem(DEVICE_NAME_KEY);
  if (!deviceName) {
    deviceName = getBrowserAndOs();
    localStorage.setItem(DEVICE_NAME_KEY, deviceName);
  }

  return { deviceId, deviceName };
}

/**
 * The identity of *this tab*. Same `deviceId` across tabs of one browser (rule
 * R10: one row per browser), but a distinct `instanceId` per tab, so the
 * Speaker role is per-tab and two tabs can never both play audio.
 */
export function getInstanceId(): string {
  if (typeof window === "undefined") return "server_tab";

  let instanceId = sessionStorage.getItem(INSTANCE_ID_KEY);
  if (!instanceId) {
    instanceId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem(INSTANCE_ID_KEY, instanceId);
  }
  return instanceId;
}

/**
 * Whether audio has already started at least once in this tab. Browsers block
 * autoplay without a user gesture, so a push transfer to an unlocked tab plays
 * silently while an unlocked-false tab must show "Tap to play here".
 */
export function isAudioUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(AUDIO_UNLOCKED_KEY) === "1";
}

export function markAudioUnlocked(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(AUDIO_UNLOCKED_KEY, "1");
}
