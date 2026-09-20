import dns from "node:dns/promises";
import net from "node:net";

/**
 * True for every address range that must never be reachable from a
 * user-supplied URL: loopback, link-local (which is where cloud metadata
 * lives, at 169.254.169.254), RFC1918, carrier-grade NAT, and the
 * unspecified/multicast/reserved blocks.
 */
export function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || // "this network"
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local, incl. cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && b >= 18 && b <= 19) || // benchmarking
      a >= 224 // multicast and reserved
    );
  }
  if (net.isIPv6(ip)) {
    // A zone id ("::1%eth0") is a valid IPv6 address that the equality checks
    // below would otherwise sail straight past.
    const lower = ip.toLowerCase().split("%")[0];
    // An IPv4-mapped address is just that IPv4 address wearing a hat.
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateIp(mapped[1]);
    return (
      lower === "::" ||
      lower === "::1" ||
      lower.startsWith("fe80:") || // link-local
      lower.startsWith("fc") || // unique local
      lower.startsWith("fd") ||
      lower.startsWith("ff") // multicast
    );
  }
  return true; // not a parseable IP — treat as unsafe rather than guess
}

/**
 * True if ANY address the hostname resolves to is private. Checking only the
 * first one leaves the obvious hole: a host with both a public and a private
 * record passes the check and then the fetch connects to whichever the
 * resolver hands it.
 *
 * ponytail: resolves and checks once per hop, not pinned to the socket that
 * actually connects — a DNS-rebinding attacker could still swap the record
 * between this check and the real fetch. Upgrade path: a custom `lookup`
 * passed to the fetch dispatcher that reuses this resolved address.
 */
export async function resolvesToPrivateIp(hostname: string): Promise<boolean> {
  // `url.hostname` hands back IPv6 in brackets, and a literal IP never reaches
  // the resolver, so unwrap and check it directly first.
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(bare)) return isPrivateIp(bare);
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (addresses.length === 0) return true;
    return addresses.some(({ address }) => isPrivateIp(address));
  } catch {
    return true; // can't resolve — don't fetch it
  }
}
