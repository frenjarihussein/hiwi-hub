// @vitest-environment node
import { describe, expect, it } from "vitest";
import { b64u, encodePayload, formatKey, parseKey, verifyLicense, type LicensePayload } from "./desktop-license";

describe("offline signed licenses", () => {
  const now = 1_800_000_000_000;
  const device = "YS-1234-5678-ABCD-EF90";
  async function fixture(expiry: number | null = now + 1000) {
    const pair = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    const publicKey = b64u.enc(new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey)));
    const payload: LicensePayload = { v: 1, id: "test", d: device, c: "customer", p: expiry === null ? "lifetime" : "year", e: expiry, i: now - 1000 };
    const body = encodePayload(payload);
    const sig = b64u.enc(new Uint8Array(await crypto.subtle.sign("Ed25519", pair.privateKey, new TextEncoder().encode(body))));
    return { key: formatKey(`${body}.${sig}`), publicKey };
  }
  it("activates without a network call using the public key", async () => {
    const f = await fixture();
    expect((await verifyLicense(f.key, device, now, 0, f.publicKey)).ok).toBe(true);
  });
  it("rejects a key copied to a different device", async () => {
    const f = await fixture();
    expect(await verifyLicense(f.key, "YS-0000-0000-0000-0000", now, 0, f.publicKey)).toMatchObject({ ok: false, reason: "device" });
  });
  it("rejects tampering with a signed customer name", async () => {
    const f = await fixture();
    const parsed = parseKey(f.key);
    if (!parsed) throw new Error("fixture invalid");
    const key = formatKey(`${encodePayload({ ...parsed.payload, c: "changed" })}.${parsed.sig}`);
    expect(await verifyLicense(key, device, now, 0, f.publicKey)).toEqual({ ok: false, reason: "invalid" });
  });
  it("expires a running timed license", async () => {
    const f = await fixture();
    expect(await verifyLicense(f.key, device, now + 2000, 0, f.publicKey)).toMatchObject({ ok: false, reason: "expired" });
  });
  it("allows a perpetual signed license", async () => {
    const f = await fixture(null);
    expect((await verifyLicense(f.key, device, now + 100_000_000_000, 0, f.publicKey)).ok).toBe(true);
  });
  it("rejects clock rollback against persisted maximum time", async () => {
    const f = await fixture(null);
    expect(await verifyLicense(f.key, device, now, now + 2 * 86_400_000, f.publicKey)).toMatchObject({ ok: false, reason: "clock" });
  });
  it("rejects extra key segments and incomplete payloads", () => {
    expect(parseKey("YSL1.e30.sig.extra")).toBeNull();
    expect(parseKey(`YSL1.${b64u.enc(new TextEncoder().encode('{"v":1,"d":"anything"}'))}.sig`)).toBeNull();
  });
});