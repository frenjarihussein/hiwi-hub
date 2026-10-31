/** Short human label for a browser user-agent, e.g. "Windows · Chrome". */
export function describeDevice(ua: string | null | undefined): string {
  if (!ua) return "غير معروف";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) ? "iOS" : /Windows/i.test(ua) ? "Windows" : /Mac OS X|Macintosh/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "جهاز آخر";
  const br = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "متصفح";
  const kind = /Mobile|Android|iPhone/i.test(ua) ? "جوال" : /iPad|Tablet/i.test(ua) ? "لوحي" : "حاسوب";
  return `${kind} · ${os} · ${br}`;
}

export type DeviceInfo = { name?: string; os: string; browser: string; screen: string; cores?: number; memoryGb?: number; lang: string; tz: string; touch: boolean; at: string };

/** Hardware/software fingerprint the browser exposes (MAC addresses are never available to web pages). */
export function collectDeviceInfo(): DeviceInfo {
  const ua = navigator.userAgent;
  const os = /Windows NT 10/.test(ua) ? "Windows 10/11" : /Windows/.test(ua) ? "Windows" : /Android ([\d.]+)/.test(ua) ? `Android ${RegExp.$1}` : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS X ([\d_]+)/.test(ua) ? `macOS ${RegExp.$1.replace(/_/g, ".")}` : /Linux/.test(ua) ? "Linux" : "غير معروف";
  const m = ua.match(/(Edg|OPR|Firefox|Chrome|Version)\/(\d+)/);
  const bn = m ? ({ Edg: "Edge", OPR: "Opera", Firefox: "Firefox", Chrome: "Chrome", Version: "Safari" } as Record<string, string>)[m[1]!] : "متصفح";
  const nav = navigator as Navigator & { deviceMemory?: number };
  const name = localStorage.getItem("device_name") || undefined;
  return {
    ...(name ? { name } : {}), os, browser: m ? `${bn} ${m[2]}` : bn ?? "متصفح",
    screen: `${screen.width}×${screen.height}`,
    ...(nav.hardwareConcurrency ? { cores: nav.hardwareConcurrency } : {}),
    ...(nav.deviceMemory ? { memoryGb: nav.deviceMemory } : {}),
    lang: navigator.language, tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
    touch: navigator.maxTouchPoints > 0, at: new Date().toISOString(),
  };
}

/** One-line Arabic summary of stored device info. */
export function formatDeviceInfo(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "لا توجد بيانات";
  const i = raw as Partial<DeviceInfo>;
  return [i.name && `«${i.name}»`, i.os, i.browser, i.screen && `شاشة ${i.screen}`, i.cores && `${i.cores} نواة`, i.memoryGb && `ذاكرة ≈${i.memoryGb}GB`, i.tz].filter(Boolean).join(" · ");
}
