import { describe, expect, it } from "vitest";
import {
  classifyPixKey,
  crc16ccitt,
  findPixPayloadInText,
  parsePixPayload,
  validatePixCRC,
} from "../src/pix.js";

// BR Code built per the BCB Pix manual layout, CRC computed with CRC-16/CCITT-FALSE
// (poly 0x1021, init 0xFFFF) over the payload up to and including the "6304" prefix.
const SAMPLE_PIX =
  "00020126580014BR.GOV.BCB.PIX0136123e4567-e12b-12d1-a456-42665544000052040000530398654040.005802BR5913Fulano de Tal6008BRASILIA62070503***6304CDDF";

describe("crc16ccitt / validatePixCRC", () => {
  it("validates a correctly-signed payload", () => {
    expect(validatePixCRC(SAMPLE_PIX)).toBe(true);
  });

  it("rejects a tampered payload", () => {
    const tampered = SAMPLE_PIX.replace("Fulano de Tal", "Outra Pessoa");
    expect(validatePixCRC(tampered)).toBe(false);
  });

  it("is deterministic", () => {
    expect(crc16ccitt("abc")).toBe(crc16ccitt("abc"));
  });
});

describe("parsePixPayload", () => {
  it("extracts merchant name, city, key and validates CRC", () => {
    const parsed = parsePixPayload(SAMPLE_PIX);
    expect(parsed).not.toBeNull();
    expect(parsed?.merchantName).toBe("Fulano de Tal");
    expect(parsed?.merchantCity).toBe("BRASILIA");
    expect(parsed?.crcValid).toBe(true);
    expect(parsed?.merchantAccount?.key).toBe("123e4567-e12b-12d1-a456-426655440000");
    expect(parsed?.keyType).toBe("random");
  });

  it("returns null for non-Pix input", () => {
    expect(parsePixPayload("not a pix code")).toBeNull();
  });
});

describe("classifyPixKey", () => {
  it("classifies each key shape", () => {
    expect(classifyPixKey("12345678900")).toBe("cpf");
    expect(classifyPixKey("11222333000181")).toBe("cnpj");
    expect(classifyPixKey("+5511999999999")).toBe("phone");
    expect(classifyPixKey("loja@example.com")).toBe("email");
    expect(classifyPixKey("123e4567-e12b-12d1-a456-426655440000")).toBe("random");
  });
});

describe("findPixPayloadInText", () => {
  it("locates the payload inside surrounding page text", () => {
    const html = `<div class="qr-copy-paste">${SAMPLE_PIX}</div>`;
    expect(findPixPayloadInText(html)).toBe(SAMPLE_PIX);
  });

  it("returns null when there's no Pix code", () => {
    expect(findPixPayloadInText("<div>Sem pagamento aqui</div>")).toBeNull();
  });
});
