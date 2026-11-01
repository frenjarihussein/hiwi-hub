export function serverUrl(value) {
  let input = String(value || "").trim();
  if (!input) throw new Error("أدخل عنوان جهاز الشركة");
  if (!/^https?:\/\//i.test(input)) input = "http://" + input;
  const url = new URL(input);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || !["/", ""].includes(url.pathname)) throw new Error("أدخل عنوان الجهاز فقط دون مسار أو كلمة مرور");
  const host = url.hostname;
  const local = host === "localhost" || host.endsWith(".local") || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (url.protocol === "http:" && !local) throw new Error("الاتصال غير المشفر مسموح داخل شبكة الشركة فقط");
  if (!url.port && url.protocol === "http:") url.port = "3001";
  return url.origin + "/auth";
}