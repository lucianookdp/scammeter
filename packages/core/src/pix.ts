/**
 * Pix BR Code (EMV QR Code) parser — TLV format, no backtracking regex
 * (a malformed/huge payload must not hang the parser, per the project's ReDoS concern).
 */

export interface PixField {
  id: string;
  length: number;
  value: string;
}

export type PixKeyType = "cpf" | "cnpj" | "phone" | "email" | "random" | "unknown";

export interface PixMerchantAccountInfo {
  gui?: string;
  key?: string;
  description?: string;
}

export interface ParsedPix {
  merchantAccount?: PixMerchantAccountInfo;
  merchantName?: string;
  merchantCity?: string;
  amount?: number;
  crcValid: boolean;
  keyType: PixKeyType;
}

const MAX_PAYLOAD_LENGTH = 512;

export function parseTLV(payload: string): PixField[] {
  const fields: PixField[] = [];
  let i = 0;
  while (i + 4 <= payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!Number.isInteger(len) || len < 0) break;
    const value = payload.slice(i + 4, i + 4 + len);
    if (value.length !== len) break;
    fields.push({ id, length: len, value });
    i += 4 + len;
  }
  return fields;
}

export function crc16ccitt(payload: string): string {
  let crc = 0xffff;
  for (let c = 0; c < payload.length; c++) {
    crc ^= payload.charCodeAt(c) << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function validatePixCRC(payload: string): boolean {
  const idx = payload.lastIndexOf("6304");
  if (idx === -1 || idx !== payload.length - 8) return false;
  const dataToCheck = payload.slice(0, idx + 4);
  const expected = payload.slice(idx + 4);
  return crc16ccitt(dataToCheck) === expected.toUpperCase();
}

export function classifyPixKey(key: string): PixKeyType {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return "random";
  if (key.includes("@")) return "email";
  if (key.startsWith("+")) return "phone";
  const digits = key.replace(/\D/g, "");
  if (digits.length === 11) return "cpf";
  if (digits.length === 14) return "cnpj";
  return "unknown";
}

function parseMerchantAccountInfo(value: string): PixMerchantAccountInfo {
  const info: PixMerchantAccountInfo = {};
  for (const f of parseTLV(value)) {
    if (f.id === "00") info.gui = f.value;
    else if (f.id === "01") info.key = f.value;
    else if (f.id === "02") info.description = f.value;
  }
  return info;
}

/** Parses a Pix "copia e cola" payload. Returns null if it isn't a Pix BR Code at all. */
export function parsePixPayload(payload: string): ParsedPix | null {
  const clean = payload.trim().slice(0, MAX_PAYLOAD_LENGTH);
  if (!clean.startsWith("000201") || !/br\.gov\.bcb\.pix/i.test(clean)) return null;

  const fields = parseTLV(clean);
  const merchantField = fields.find((f) => f.id === "26");
  const merchantAccount = merchantField ? parseMerchantAccountInfo(merchantField.value) : undefined;
  const amountField = fields.find((f) => f.id === "54");

  return {
    merchantAccount,
    merchantName: fields.find((f) => f.id === "59")?.value,
    merchantCity: fields.find((f) => f.id === "60")?.value,
    amount: amountField ? Number(amountField.value) : undefined,
    crcValid: validatePixCRC(clean),
    keyType: merchantAccount?.key ? classifyPixKey(merchantAccount.key) : "unknown",
  };
}

/** Finds a "copia e cola" Pix code inside arbitrary page text (bounded scan, no catastrophic regex). */
export function findPixPayloadInText(text: string): string | null {
  const startIdx = text.indexOf("000201");
  if (startIdx === -1) return null;
  const window = text.slice(startIdx, startIdx + MAX_PAYLOAD_LENGTH);
  const crcMatch = window.match(/6304[0-9A-Fa-f]{4}/);
  if (!crcMatch || crcMatch.index === undefined) return null;
  const candidate = window.slice(0, crcMatch.index + crcMatch[0].length);
  return /br\.gov\.bcb\.pix/i.test(candidate) ? candidate : null;
}
