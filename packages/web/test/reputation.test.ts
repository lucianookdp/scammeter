import { describe, expect, it } from "vitest";
import type { ReputationResult } from "@scammeter/core";
import { reputationCheck } from "../src/reputation";
const result: ReputationResult = {
  blocklisted: true, top100k: null, source: "PhishDestroy", sourceUrl: "https://github.com/phishdestroy/destroylist",
  fetchedAt: "2026-09-22T00:00:00Z", status: "available", match: "exact_hostname",
};
describe("reputation presentation", () => {
  it("shows a listed address as an alert with attribution", () => {
    expect(reputationCheck(result, null)).toMatchObject({ state: "alert" });
    expect(reputationCheck(result, null).value).toContain("PhishDestroy");
    expect(reputationCheck(result, null).value).toContain("cópia obtida");
  });
  it("does not label absence as safe", () => {
    const check = reputationCheck({ ...result, blocklisted: false, match: null }, null);
    expect(check.state).toBe("unverified");
    expect(check.value).toContain("não garante segurança");
  });
  it("does not reuse stale positives", () => {
    expect(reputationCheck({ ...result, status: "stale" }, null).state).toBe("unverified");
    expect(reputationCheck({ ...result, status: "stale" }, null).value).toContain("venceu");
  });
  it("shows rate limits and provider failure separately", () => {
    expect(reputationCheck(null, "rate_limited").value).toContain("muitas consultas");
    expect(reputationCheck(null, null).value).toContain("Não foi possível");
  });
});
