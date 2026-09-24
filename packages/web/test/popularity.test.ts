import { describe, expect, it } from "vitest";
import { popularityCheck } from "../src/popularity";
import type { PopularityResult } from "../src/proxyClient";

const result: PopularityResult = {
  top100k: true, rank: 1234, domain: "example.com", source: "Tranco", sourceUrl: "https://tranco-list.eu/",
  fetchedAt: "2026-09-22T00:00:00Z", status: "available",
};

describe("popularity presentation", () => {
  it("shows a ranked site as a positive check with its rank", () => {
    const check = popularityCheck(result, null, false);
    expect(check.state).toBe("ok");
    expect(check.value).toContain("Tranco");
    expect(check.value).toContain("#1.234");
  });
  it("does not treat an unranked site as a warning", () => {
    const check = popularityCheck({ ...result, top100k: false, rank: null }, null, false);
    expect(check.state).toBe("unverified");
    expect(check.value).toContain("não indica risco");
  });
  it("never credits a page with its hosting platform's ranking", () => {
    expect(popularityCheck(result, null, true).state).toBe("unverified");
  });
  it("separates an unloaded list from a failed request", () => {
    expect(popularityCheck({ ...result, top100k: null }, null, false).value).toContain("Não foi possível");
    expect(popularityCheck(null, "rate_limited", false).value).toContain("muitas consultas");
  });
  it("reads a proxy without the popularity route as the list being unavailable", () => {
    expect(popularityCheck(null, "not_found", false).value).toContain("Não foi possível consultar a lista Tranco");
  });
});
