import { describe, expect, it } from "vitest";
import { registrableDomain } from "../src/routes/domain.js";

describe("registrableDomain", () => {
  it("strips subdomains so RDAP gets a domain it actually knows", () => {
    expect(registrableDomain("www.facebook.com")).toBe("facebook.com");
    expect(registrableDomain("shop.loja.example.com")).toBe("example.com");
  });

  it("keeps the second level for Brazilian multi-label suffixes", () => {
    expect(registrableDomain("www.magazineluiza.com.br")).toBe("magazineluiza.com.br");
    expect(registrableDomain("magazineluiza.com.br")).toBe("magazineluiza.com.br");
    expect(registrableDomain("www.gov.br")).toBe("gov.br");
  });

  it("leaves an already-bare domain alone", () => {
    expect(registrableDomain("facebook.com")).toBe("facebook.com");
  });
});
