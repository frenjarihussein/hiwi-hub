import { describe, it, expect } from "vitest";
import { savePinVault, unlockWithPin, readVault, MAX_PIN_ATTEMPTS, type VaultKV } from "./pin-vault";

function memKV(): VaultKV { const m = new Map<string, unknown>(); return { get: async (k) => m.get(k), put: async (k, v) => { m.set(k, v); }, del: async (k) => { m.delete(k); } }; }
const session = { access_token: "a", refresh_token: "r", user: { id: "u1", email: "x@y.com" } };

describe("offline PIN vault", () => {
  it("unlocks with the right PIN and never stores the session in plain text", async () => {
    const kv = memKV();
    await savePinVault("1234", session, kv, 1000);
    expect(JSON.stringify(await readVault(kv))).not.toContain("refresh_token");
    const r = await unlockWithPin("1234", kv, 1000);
    expect(r.ok && r.session.user.id).toBe("u1");
  });
  it("locks and wipes the vault after 5 wrong attempts", async () => {
    const kv = memKV();
    await savePinVault("1234", session, kv, 1000);
    for (let i = 1; i < MAX_PIN_ATTEMPTS; i++) expect((await unlockWithPin("0000", kv, 1000)).ok).toBe(false);
    const last = await unlockWithPin("0000", kv, 1000);
    expect(last).toEqual({ ok: false, reason: "locked", left: 0 });
    expect(await readVault(kv)).toBeNull();
    expect((await unlockWithPin("1234", kv, 1000)).ok).toBe(false);
  });
  it("a correct PIN resets the wrong-attempt counter", async () => {
    const kv = memKV();
    await savePinVault("4321", session, kv, 1000);
    await unlockWithPin("1111", kv, 1000);
    await unlockWithPin("4321", kv, 1000);
    expect((await readVault(kv))!.attempts).toBe(0);
  });
});
