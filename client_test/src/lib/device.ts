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
