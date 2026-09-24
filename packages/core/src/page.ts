// Signals read off the page itself. The proxy runs these on fetched HTML and
// the extension on the live document, so both reach the same verdict.

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function decodeEntities(text: string): string {
  return text
    // Accented letters ("Ita&uacute;") only need their base letter: titles are compared accent-folded.
    .replace(/&([a-z])(?:acute|grave|circ|tilde|cedil|uml);/gi, "$1")
    .replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]+);/gi, (entity, body: string) => {
      if (body[0] !== "#") return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
      const code = body[1] === "x" || body[1] === "X" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    });
}

/** The page's <title>, decoded and trimmed; null when it has none. */
export function pageTitle(html: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return null;
  const title = decodeEntities(match[1]).replace(/\s+/g, " ").trim().slice(0, 200);
  return title || null;
}

const PASSWORD_FIELD = /<input\b[^>]*\btype\s*=\s*["']?password\b/i;
const CARD_FIELD =
  /<input\b[^>]*\b(?:autocomplete\s*=\s*["']?cc-(?:number|csc)\b|(?:name|id)\s*=\s*["']?[\w-]*(?:card_?number|cardnumber|cc_?num|numero_?(?:do_?)?cartao|cvv|cvc)\b)/i;

/** A password, card number or card code field in the markup. */
export function pageAsksCredentials(html: string): boolean {
  return PASSWORD_FIELD.test(html) || CARD_FIELD.test(html);
}
