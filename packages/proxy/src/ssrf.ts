import dns from "node:dns/promises";
import net from "node:net";

/** True for loopback, link-local and private (RFC1918/ULA) ranges. */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd") || lower.startsWith("::ffff:127.");
  }
  return true; // not a parseable IP — treat as unsafe rather than guess
}

/**
 * ponytail: resolves and checks once per hop, not pinned to the socket that
 * actually connects — a DNS-rebinding attacker could still swap the record
 * between this check and the real fetch. Upgrade path: a custom `lookup`
 * passed to the fetch dispatcher that reuses this resolved address.
 */
export async function resolvesToPrivateIp(hostname: string): Promise<boolean> {
  try {
    const { address } = await dns.lookup(hostname);
    return isPrivateIp(address);
  } catch {
    return true; // can't resolve — don't fetch it
  }
}
