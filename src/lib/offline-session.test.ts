import { describe, expect, it } from "vitest";
import { connectivityFailure, OFFLINE_SESSION_MAX_AGE, usableSnapshot } from "./offline-session";
describe("offline session snapshots", () => {
  const snapshot = { me: { userId: "a" }, savedAt: 1000 };
  it("restores only the same still-signed-in identity", () => {
    expect(usableSnapshot("a", snapshot, 2000)).toEqual({ userId: "a" });
    expect(usableSnapshot("b", snapshot, 2000)).toBeNull();
    expect(usableSnapshot(undefined, snapshot, 2000)).toBeNull();
  });
  it("does not keep expired snapshots", () => expect(usableSnapshot("a", snapshot, 1001 + OFFLINE_SESSION_MAX_AGE)).toBeNull());
  it("never treats rejected credentials as a connectivity outage", () => {
    expect(connectivityFailure({ name: "AuthApiError", status: 401 })).toBe(false);
    expect(connectivityFailure({ name: "AuthRetryableFetchError" })).toBe(true);
  });
});