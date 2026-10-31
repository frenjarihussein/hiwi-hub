import { describe, it, expect } from "vitest";
import { buildSessions, fmtDuration, changedFields } from "./audit-describe";

const ev = (id: string, user_id: string, event: string, created_at: string) => ({ id, user_id, event, created_at, ip: null, device: null, user_agent: null });

describe("buildSessions", () => {
  it("pairs sign-in with the next sign-out of the same user", () => {
    const s = buildSessions([ev("1", "u", "sign_in", "2026-01-01T08:00:00Z"), ev("2", "u", "sign_out", "2026-01-01T10:30:00Z")]);
    expect(s).toHaveLength(1);
    expect(s[0]?.end).toBe("2026-01-01T10:30:00Z");
  });
  it("leaves a session open when there is no sign-out", () => {
    const s = buildSessions([ev("1", "u", "sign_in", "2026-01-01T08:00:00Z")]);
    expect(s[0]?.end).toBeNull();
  });
  it("does not pair one user's sign-out with another user's sign-in", () => {
    const s = buildSessions([ev("1", "a", "sign_in", "2026-01-01T08:00:00Z"), ev("2", "b", "sign_out", "2026-01-01T09:00:00Z")]);
    expect(s.find((x) => x.user_id === "a")?.end).toBeNull();
  });
});

it("formats 2h35m duration", () => expect(fmtDuration(155 * 60000)).toBe("2 ساعة و35 دقيقة"));
it("lists only changed fields on update", () => {
  const f = changedFields({ name: "a", price: 1 }, { name: "a", price: 2 });
  expect(f.map((x) => x.key)).toEqual(["price"]);
});
