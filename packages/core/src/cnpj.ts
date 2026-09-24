/**
 * CNPJ check-digit validation, per the Receita Federal algorithm.
 * Works for both the classic all-numeric CNPJ and the alphanumeric format
 * (rollout since 2026): letters count as charCode - 48, same as digits do.
 */

const CNPJ_PATTERN = /\b[A-Z0-9]{2}\.?[A-Z0-9]{3}\.?[A-Z0-9]{3}\/?[A-Z0-9]{4}-?\d{2}\b/gi;
const WEIGHTS_12 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const WEIGHTS_13 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function charValue(ch: string): number {
  return ch.charCodeAt(0) - 48;
}

function calcDigit(base: string, weights: number[]): number {
  let sum = 0;
  for (let i = 0; i < base.length; i++) {
    sum += charValue(base[i]) * weights[i];
  }
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

export function normalizeCnpj(raw: string): string {
  return raw.replace(/[.\-/\s]/g, "").toUpperCase();
}

export function validateCnpj(raw: string): boolean {
  const cnpj = normalizeCnpj(raw);
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj)) return false;
  // All-identical-character CNPJs (00000000000000, 11111111111111, ...)
  // satisfy the checksum trivially but are never real registrations.
  if (/^(.)\1+$/.test(cnpj)) return false;
  const base12 = cnpj.slice(0, 12);
  const d1 = calcDigit(base12, WEIGHTS_12);
  const d2 = calcDigit(base12 + d1, WEIGHTS_13);
  return cnpj.slice(12) === `${d1}${d2}`;
}

export function formatCnpj(raw: string): string {
  const c = normalizeCnpj(raw);
  if (c.length !== 14) return raw;
  return `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;
}

/** All 14-char candidates found in page text, deduplicated, not yet checksum-validated. */
export function extractCnpjCandidates(text: string): string[] {
  const matches = text.match(CNPJ_PATTERN) ?? [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of matches) {
    const norm = normalizeCnpj(m);
    if (norm.length === 14 && !seen.has(norm)) {
      seen.add(norm);
      result.push(norm);
    }
  }
  return result;
}

const CNPJ_MASK = /^[A-Z0-9]{2}\.[A-Z0-9]{3}\.[A-Z0-9]{3}\/[A-Z0-9]{4}-\d{2}$/i;

/**
 * First checksum-valid CNPJ found in text, or null if none / none valid.
 * A bare 14-character run only counts right after the word "CNPJ": raw HTML is
 * full of product codes and IDs, and about 1 in 100 passes the check digits.
 */
export function findValidCnpjInText(text: string): string | null {
  for (const m of text.matchAll(CNPJ_PATTERN)) {
    const labelled = CNPJ_MASK.test(m[0]) || /cnpj/i.test(text.slice(Math.max(0, m.index - 30), m.index));
    if (labelled && validateCnpj(m[0])) return normalizeCnpj(m[0]);
  }
  return null;
}
