import { describe, expect, it } from "vitest";
import { isPrivateIp } from "../src/ssrf.js";

describe("isPrivateIp", () => {
  it("blocks loopback, link-local and RFC1918 ranges", () => {
    expect(isPrivateIp("127.0.0.1")).toBe(true);
    expect(isPrivateIp("10.0.0.5")).toBe(true);
    expect(isPrivateIp("172.16.0.1")).toBe(true);
    expect(isPrivateIp("172.31.255.255")).toBe(true);
    expect(isPrivateIp("192.168.1.1")).toBe(true);
    expect(isPrivateIp("169.254.169.254")).toBe(true); // cloud metadata endpoint
    expect(isPrivateIp("::1")).toBe(true);
    expect(isPrivateIp("fe80::1")).toBe(true);
  });

  it("allows public IPs", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("172.15.0.1")).toBe(false);
    expect(isPrivateIp("172.32.0.1")).toBe(false);
    expect(isPrivateIp("1.1.1.1")).toBe(false);
  });

  it("treats unparseable input as unsafe", () => {
    expect(isPrivateIp("not-an-ip")).toBe(true);
  });
});
