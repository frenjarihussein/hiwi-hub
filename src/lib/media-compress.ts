/** Client-side media shrinking before upload, to keep stored attachments small. */
export const IMAGE_MAX_EDGE = 1600;
export const IMAGE_QUALITY = 0.78;
export const VIDEO_MAX_BYTES = 40 * 1024 * 1024;

/** Target size keeping aspect ratio; never upscales. */
export function fitWithin(w: number, h: number, max = IMAGE_MAX_EDGE): { w: number; h: number } {
  const edge = Math.max(w, h);
  if (edge <= max) return { w, h };
  const k = max / edge;
  return { w: Math.round(w * k), h: Math.round(h * k) };
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Images → JPEG ≤1600px (smaller result only). Videos over the limit are rejected with a clear message. */
export async function compressMedia(file: File): Promise<File> {
  if (file.type.startsWith("video/")) {
    if (file.size > VIDEO_MAX_BYTES) throw new Error(`الفيديو «${file.name}» أكبر من 40 ميغابايت — صوّره بدقة أقل (720p) أو قصّره`);
    return file;
  }
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  try {
    const img = await loadImage(file);
    const { w, h } = fitWithin(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", IMAGE_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
