const MAX_URL_LENGTH = 2048;

/**
 * Most people paste a bare domain ("mercadolivre.com.br") or a WhatsApp link
 * with no scheme — treat that as https instead of rejecting it outright.
 *
 * Throws with a message that names the problem, so the page can tell the
 * person what to fix rather than saying "invalid" to everything.
 */
export function parseSiteUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("empty_url");
  if (trimmed.length > MAX_URL_LENGTH) throw new Error("url_too_long");

  // A scheme we don't speak must be rejected, not silently prefixed: gluing
  // "https://" onto "javascript:alert(1)" would only hide what was pasted.
  const scheme = trimmed.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (scheme && scheme !== "http" && scheme !== "https") throw new Error("unsupported_scheme");

  const url = new URL(scheme ? trimmed : `https://${trimmed}`);

  // `new URL("https://golpe")` doesn't throw — a single-label hostname is
  // technically valid — but it's never a real site to check, just garbage
  // someone typed. Require a dot (a TLD) so that fails clearly up front
  // instead of quietly running the whole pipeline against nothing.
  if (!url.hostname.includes(".")) throw new Error("no_tld");

  // Credentials in a pasted link are either a phishing trick (the real host is
  // after the @) or a secret the person didn't mean to share with us.
  if (url.username || url.password) throw new Error("url_has_credentials");

  return url;
}
