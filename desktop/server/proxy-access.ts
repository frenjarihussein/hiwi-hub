export function requiresMainPc(path: string, method: string) {
  return path === "/__activate" || (path === "/__license" && method !== "GET");
}