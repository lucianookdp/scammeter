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
    // A zone id ("::1%eth0") is a valid IPv6 address that the checks below
    // would otherwise sail straight past.
    const g = ipv6Groups(ip.toLowerCase().split("%")[0]);
    if (!g) return true;
    // IPv4 wearing an IPv6 address: mapped (::ffff:0:0/96), compatible (::/96,
    // which also covers :: and ::1) and NAT64 (64:ff9b::/96). The URL parser
    // writes the IPv4 part in hex — [::ffff:127.0.0.1] becomes ::ffff:7f00:1 —
    // so match on the numbers, never on the dotted spelling.
    const zeros = (from: number, to: number) => g.slice(from, to).every((x) => x === 0);
    if ((zeros(0, 5) && (g[5] === 0xffff || g[5] === 0)) || (g[0] === 0x64 && g[1] === 0xff9b && zeros(2, 6))) {
      return isPrivateIp(`${g[6] >> 8}.${g[6] & 255}.${g[7] >> 8}.${g[7] & 255}`);
    }
    return (
      (g[0] & 0xffc0) === 0xfe80 || // link-local
      (g[0] & 0xffc0) === 0xfec0 || // site-local (deprecated, still routed internally)
      (g[0] & 0xfe00) === 0xfc00 || // unique local
      g[0] >> 8 === 0xff // multicast
    );
  }
  return true; // not a parseable IP — treat as unsafe rather than guess
}

/** The eight 16-bit groups of a valid IPv6 address, dotted IPv4 tail included. */
function ipv6Groups(ip: string): number[] | null {
  let text = ip;
  const dotted = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(text);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    text = `${text.slice(0, dotted.index)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const [head, tail] = text.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  return groups.length === 8 ? groups.map((x) => parseInt(x, 16)) : null;
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
