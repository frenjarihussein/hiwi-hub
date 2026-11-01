// @vitest-environment node
import { describe, it, expect } from "vitest";
// @ts-expect-error The packaged Android picker is a standalone browser JS module.
import { serverUrl } from "../../desktop/mobile/server-url.js";
describe("Android cloud and LAN selection", () => {
  it("connects to the company PC LAN proxy port", () => expect(serverUrl("192.168.1.10")).toBe("http://192.168.1.10:3001/auth"));
  it("preserves an explicitly selected secure server", () => expect(serverUrl("https://company.example")).toBe("https://company.example/auth"));
  it("never accepts credentials in the server address", () => expect(() => serverUrl("http://user:pass@192.168.1.10")).toThrow());
  it("rejects unencrypted internet servers", () => expect(() => serverUrl("http://example.com")).toThrow());
  it("rejects paths masquerading as server addresses", () => expect(() => serverUrl("192.168.1.10/private")).toThrow());
  it("rejects an invalid TCP port", () => expect(() => serverUrl("192.168.1.10:99999")).toThrow());
});