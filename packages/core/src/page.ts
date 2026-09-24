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

/**
 * Every `<name …>` opening tag, found with index scans. The markup comes from
 * whoever runs the site: a regex such as /<input[^>]*password/ restarts at each
 * "<input" and runs to the end of the page, so 1 MB of "<input " held the
 * proxy for minutes. This reads each character a bounded number of times.
 */
function* openingTags(html: string, name: string): Generator<{ tag: string; end: number }> {
  const lower = html.toLowerCase();
  const open = `<${name}`;
  let from = 0;
  while (true) {
    const start = lower.indexOf(open, from);
    if (start === -1) return;
    from = start + open.length;
    if (!/[\s/>]/.test(lower.charAt(from))) continue; // "<inputs", "<titled"
    const end = lower.indexOf(">", from);
    if (end === -1) return; // no tag after this one can close either
    yield { tag: html.slice(start, end + 1), end };
    // Resume after this tag: a "<input" inside it is attribute text, and
    // rescanning it is what would make overlapping tags quadratic.
    from = end + 1;
  }
}

/** The page's <title>, decoded and trimmed; null when it has none. */
export function pageTitle(html: string): string | null {
  for (const { end } of openingTags(html, "title")) {
    const close = html.toLowerCase().indexOf("</title", end);
    if (close === -1) return null;
    // Cap before decoding: only the first words are ever compared.
    const title = decodeEntities(html.slice(end + 1, Math.min(close, end + 1 + 1000))).replace(/\s+/g, " ").trim().slice(0, 200);
    return title || null;
  }
  return null;
}

const PASSWORD_FIELD = /\btype\s*=\s*["']?password\b/i;
const CARD_FIELD =
  /\b(?:autocomplete\s*=\s*["']?cc-(?:number|csc)\b|(?:name|id)\s*=\s*["']?[\w-]*(?:card_?number|cardnumber|cc_?num|numero_?(?:do_?)?cartao|cvv|cvc)\b)/i;

/** A password, card number or card code field in the markup. */
export function pageAsksCredentials(html: string): boolean {
  for (const { tag } of openingTags(html, "input")) {
    if (PASSWORD_FIELD.test(tag) || CARD_FIELD.test(tag)) return true;
  }
  return false;
}
