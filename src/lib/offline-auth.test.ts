import { describe, expect, it } from "vitest";
import { isAuthEndpoint, jwtSub, usableSaved, OFFLINE_AUTH_MAX_AGE } from "./offline-auth";

const tok = (sub: string) => `x.${btoa(JSON.stringify({ sub })).replace(/=+$/, "")}.y`;

describe("offline sign-in", () => {
  it("reads the user id from the token", () => expect(jwtSub(tok("u1"))).toBe("u1"));
  it("keeps the same verified user signed in offline", () => {
    expect(usableSaved({ user: { id: "u1" }, savedAt: 1000 }, "u1", 2000)).toEqual({ id: "u1" });
  });
  it("never signs in a different user", () => {
    expect(usableSaved({ user: { id: "u1" }, savedAt: 1000 }, "u2", 2000)).toBeNull();
  });
  it("requires going online again after 24 hours", () => {
    expect(usableSaved({ user: { id: "u1" }, savedAt: 0 }, "u1", OFFLINE_AUTH_MAX_AGE + 1)).toBeNull();
  });
  it("never intercepts matching auth paths on another service", () => {
    expect(isAuthEndpoint("https://external.test/auth/v1/user", "https://app.test")).toBe(false);
    expect(isAuthEndpoint("https://app.test/auth/v1/user", "https://app.test")).toBe(true);
  });
});
