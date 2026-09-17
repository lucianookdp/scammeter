/**
 * Most people paste a bare domain ("mercadolivre.com.br") or a WhatsApp link
 * with no scheme — treat that as https instead of rejecting it outright.
 * Throws (same as `new URL`) when the result still isn't a valid URL.
 */
export function parseSiteUrl(raw: string): URL {
  const trimmed = raw.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  // `new URL("https://golpe")` doesn't throw — a single-label hostname is
  // technically valid — but it's never a real site to check, just garbage
  // someone typed. Require a dot (a TLD) so that fails clearly up front
  // instead of quietly running the whole pipeline against nothing.
  if (!url.hostname.includes(".")) {
    throw new Error("hostname has no TLD");
  }
  return url;
}
