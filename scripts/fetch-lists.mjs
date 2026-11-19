// Downloads the two public lists Scammeter checks against and writes them as
// plain text, one hostname per line, for the web page and the extension:
//
//   phishing.txt  PhishDestroy's curated list (exact hostnames), sorted
//   popular.txt   Tranco's 100,000 most visited registrable domains as
//                 "domain,rank", sorted by domain
//   meta.json     when they were downloaded, and how many entries each has
//
// Sorted so the page and the extension can binary-search the text in place
// (core's SortedLines) instead of building a 40 MB Set.
//
// Runs before every build and once a day in CI, so neither the page nor the
// extension needs a server of ours. Nothing a person checks is ever sent to
// these providers: the whole list comes down and the lookup happens locally.
//
// Usage: node scripts/fetch-lists.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { domainToASCII } from "node:url";
import { isIP } from "node:net";
import { inflateRawSync } from "node:zlib";

const PHISHING_URL = "https://raw.githubusercontent.com/phishdestroy/destroylist/main/list.txt";
const TRANCO_URL = "https://tranco-list.eu/top-1m.csv.zip";
const TOP_N = 100_000;
const OUT_DIRS = ["packages/web/public/data", "packages/extension/public/data"];

const UA = "Scammeter list builder (+https://github.com/lucianookdp/scammeter)";

async function download(url, maxBytes) {
  const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`${url}: ${buf.length} bytes, over the ${maxBytes} limit`);
  return buf;
}

function hostname(value) {
  if (!value || /[\s/\\:@?#%[\]]/.test(value)) return null;
  const host = domainToASCII(value.toLowerCase().replace(/\.$/, ""));
  if (!host || host.length > 253 || isIP(host)) return null;
  const labels = host.split(".");
  if (labels.length < 2 || !/[a-z]/.test(labels.at(-1))) return null;
  return labels.every((l) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l)) ? host : null;
}

/** First file of a zip, read through the central directory (streamed zips have zero sizes in the local header). */
function unzipFirstEntry(zip) {
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("zip: no end of central directory");
  const cd = zip.readUInt32LE(eocd + 16);
  if (zip.readUInt32LE(cd) !== 0x02014b50) throw new Error("zip: bad central directory");
  const method = zip.readUInt16LE(cd + 10);
  const size = zip.readUInt32LE(cd + 20);
  const local = zip.readUInt32LE(cd + 42);
  const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  const data = zip.subarray(start, start + size);
  if (method === 0) return data;
  if (method === 8) return inflateRawSync(data, { maxOutputLength: 64 * 1024 * 1024 });
  throw new Error(`zip: unsupported method ${method}`);
}

async function phishingList() {
  const text = (await download(PHISHING_URL, 16 * 1024 * 1024)).toString("utf8");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  const hosts = [...new Set(lines.map(hostname).filter(Boolean))];
  // An empty, truncated or HTML error page must never ship as a clean list.
  if (hosts.length < 10_000 || hosts.length < lines.length * 0.9) throw new Error(`phishing list looks wrong: ${hosts.length} of ${lines.length}`);
  return hosts;
}

async function popularList() {
  const csv = unzipFirstEntry(await download(TRANCO_URL, 32 * 1024 * 1024)).toString("utf8");
  const domains = [];
  const seen = new Set();
  for (const line of csv.split("\n")) {
    if (domains.length >= TOP_N) break;
    const domain = line.slice(line.indexOf(",") + 1).trim().toLowerCase();
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain) && !seen.has(domain)) { seen.add(domain); domains.push(domain); }
  }
  // A short list would quietly stop vouching for real sites.
  if (domains.length < TOP_N * 0.9) throw new Error(`popularity list looks wrong: ${domains.length}`);
  return domains;
}

const [phishing, popular] = await Promise.all([phishingList(), popularList()]);
const meta = { generatedAt: new Date().toISOString(), phishing: phishing.length, popular: popular.length };
for (const dir of OUT_DIRS) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/phishing.txt`, [...phishing].sort().join("\n") + "\n");
  writeFileSync(`${dir}/popular.txt`, popular.map((d, i) => `${d},${i + 1}`).sort().join("\n") + "\n");
  writeFileSync(`${dir}/meta.json`, JSON.stringify(meta) + "\n");
}
console.log(`lists: ${phishing.length} phishing hostnames, ${popular.length} popular domains`);
