import type { CnpjRecord } from "@scammeter/core";

// TODO: replace with the real Railway URL after the first `railway up` deploy.
const PROXY_URL = "https://scammeter-production.up.railway.app";

async function getJson<T>(path: string, timeoutMs = 5000): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${PROXY_URL}${path}`, { signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function fetchCnpjRecord(cnpj: string): Promise<CnpjRecord | null> {
  return getJson<CnpjRecord>(`/cnpj/${cnpj}`);
}

export function fetchDomainInfo(domain: string): Promise<{ ageDays: number | null } | null> {
  return getJson(`/domain/${domain}`);
}

export function fetchReputation(
  domain: string,
): Promise<{ blocklisted: boolean | null; top100k: boolean | null } | null> {
  return getJson(`/reputation/${domain}`);
}
