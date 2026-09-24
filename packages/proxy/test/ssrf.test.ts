import { describe, expect, it } from "vitest";
import { isPrivateIp, resolvesToPrivateIp } from "../src/ssrf.js";

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

describe("isPrivateIp — the ranges an SSRF probe actually reaches for", () => {
  it("blocks carrier-grade NAT, which is routable-looking but internal", () => {
    expect(isPrivateIp("100.64.0.1")).toBe(true);
    expect(isPrivateIp("100.127.255.255")).toBe(true);
    // The edges of the block are public and must stay reachable.
    expect(isPrivateIp("100.63.255.255")).toBe(false);
    expect(isPrivateIp("100.128.0.1")).toBe(false);
  });

  it("blocks 0.0.0.0/8, multicast and the reserved top of the space", () => {
    expect(isPrivateIp("0.0.0.0")).toBe(true);
    expect(isPrivateIp("224.0.0.1")).toBe(true);
    expect(isPrivateIp("255.255.255.255")).toBe(true);
    expect(isPrivateIp("240.0.0.1")).toBe(true);
  });

  it("blocks benchmarking space", () => {
    expect(isPrivateIp("198.18.0.1")).toBe(true);
    expect(isPrivateIp("198.19.255.255")).toBe(true);
    expect(isPrivateIp("198.20.0.1")).toBe(false);
  });

  it("sees through an IPv4-mapped IPv6 address", () => {
    // ::ffff:169.254.169.254 reaches cloud metadata just as well as the bare form.
    expect(isPrivateIp("::ffff:169.254.169.254")).toBe(true);
    expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:10.0.0.1")).toBe(true);
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
  });

  it("sees through the hex spelling the URL parser actually produces", () => {
    // new URL("http://[::ffff:169.254.169.254]/").hostname is "[::ffff:a9fe:a9fe]":
    // matching only the dotted form let these straight through to the fetch.
    for (const raw of [
      "http://[::ffff:127.0.0.1]/",
      "http://[::ffff:169.254.169.254]/",
      "http://[::ffff:10.0.0.1]/",
      "http://[0:0:0:0:0:ffff:7f00:1]/",
      "http://[::127.0.0.1]/",
      "http://[64:ff9b::a9fe:a9fe]/",
      "http://[fe90::1]/",
    ]) {
      expect(isPrivateIp(new URL(raw).hostname.slice(1, -1)), raw).toBe(true);
    }
    expect(isPrivateIp(new URL("http://[::ffff:8.8.8.8]/").hostname.slice(1, -1))).toBe(false);
  });

  it("blocks the unspecified address and IPv6 unique-local and multicast", () => {
    expect(isPrivateIp("::")).toBe(true);
    expect(isPrivateIp("fd00::1")).toBe(true);
    expect(isPrivateIp("fc00::1")).toBe(true);
    expect(isPrivateIp("ff02::1")).toBe(true);
  });

  it("still allows ordinary public IPv6", () => {
    expect(isPrivateIp("2001:4860:4860::8888")).toBe(false);
  });

  it("treats every shape of garbage as unsafe rather than guessing", () => {
    for (const junk of ["", " ", "999.999.999.999", "127.0.0.1.evil.com", "0x7f000001", "127.1", "::1%eth0"]) {
      expect(isPrivateIp(junk)).toBe(true);
    }
  });
});

describe("resolvesToPrivateIp", () => {
  it("blocks a literal private IP without going near the resolver", async () => {
    await expect(resolvesToPrivateIp("127.0.0.1")).resolves.toBe(true);
    await expect(resolvesToPrivateIp("169.254.169.254")).resolves.toBe(true);
  });

  it("unwraps the brackets URL parsing puts around IPv6 hosts", async () => {
    // `new URL("http://[::1]/").hostname` is "[::1]", which is not a parseable
    // IP — without unwrapping it fell through to a DNS lookup by accident.
    await expect(resolvesToPrivateIp("[::1]")).resolves.toBe(true);
    await expect(resolvesToPrivateIp(new URL("http://[::ffff:127.0.0.1]/").hostname)).resolves.toBe(true);
  });

  it("blocks a hostname that cannot be resolved at all", async () => {
    await expect(resolvesToPrivateIp("no-such-host.invalid")).resolves.toBe(true);
  });
});
