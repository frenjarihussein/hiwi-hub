import { b64u, encodePayload, formatKey, type LicensePayload } from "@/lib/desktop-license";

/** Call only after verifying owner permissions or a valid activation code. */
export async function signLicense(p: LicensePayload) {
  const pk = process.env["DESKTOP_LICENSE_PRIVATE_KEY"];
  if (!pk) throw new Error("مفتاح التوقيع غير مضبوط على الخادم");
  const key = await crypto.subtle.importKey("pkcs8", b64u.dec(pk.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")), { name: "Ed25519" }, false, ["sign"]);
  const body = encodePayload(p);
  const sig = new Uint8Array(await crypto.subtle.sign("Ed25519", key, new TextEncoder().encode(body)));
  return formatKey(`${body}.${b64u.enc(sig)}`);
}