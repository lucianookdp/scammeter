import { describe, expect, it } from "vitest";
import {
  lookupCnpj,
  lookupDomainAge,
  parseHostnameList,
  parseRankList,
  popularityFromList,
  rdapUrlFor,
  SortedLines,
  sortLines,
  reputationFromList,
  type FetchLike,
} from "../src/lookups.js";

const json = (body: unknown, status = 200): FetchLike => async () => new Response(JSON.stringify(body), { status });

describe("lookupCnpj", () => {
  it("maps BrasilAPI's answer to a CnpjRecord", async () => {
    const res = await lookupCnpj(
      "11.222.333/0001-81",
      json({ descricao_situacao_cadastral: "ATIVA", razao_social: "EMPRESA LTDA", nome_fantasia: "", data_inicio_atividade: "2010-05-01" }),
    );
    expect(res).toEqual({
      data: { status: "ativa", razaoSocial: "EMPRESA LTDA", nomeFantasia: undefined, abertura: "2010-05-01", cnae: undefined, municipio: undefined },
      failure: null,
    });
  });

  it("never asks about an invalid CNPJ", async () => {
    let called = false;
    const res = await lookupCnpj("11111111111111", async () => ((called = true), new Response("{}")));
    expect(called).toBe(false);
    expect(res.failure).toBe("not_found");
  });

  it("tells a rate limit and a network error apart", async () => {
    expect((await lookupCnpj("11222333000181", json({}, 429))).failure).toBe("rate_limited");
    expect((await lookupCnpj("11222333000181", async () => { throw new TypeError("Failed to fetch"); })).failure).toBe("upstream");
  });
});

describe("lookupDomainAge", () => {
  const now = Date.UTC(2026, 10, 19);

  it("asks the registry for the registrable domain, not the subdomain", async () => {
    let asked = "";
    await lookupDomainAge("www.loja.com.br", async (url) => ((asked = url), new Response("{}")), now);
    expect(asked).toBe("https://rdap.registro.br/domain/loja.com.br");
    expect(rdapUrlFor("example.com")).toBe("https://rdap.org/domain/example.com");
  });

  it("counts days since the registration event", async () => {
    const res = await lookupDomainAge("loja.com", json({ events: [{ eventAction: "registration", eventDate: "2026-11-09T00:00:00Z" }] }), now);
    expect(res).toEqual({ data: { ageDays: 10 }, failure: null });
  });

  it("treats a TLD without RDAP as unknown, not as a failure", async () => {
    expect(await lookupDomainAge("loja.xyz", json({}, 404), now)).toEqual({ data: { ageDays: null }, failure: null });
  });
});

describe("SortedLines", () => {
  it("finds every line of a large list by binary search, sorted or not", () => {
    const hosts = Array.from({ length: 5000 }, (_, i) => `site${(i * 7919) % 5000}.com`);
    const list = new SortedLines(hosts.join("\n"));
    expect(hosts.every((h) => list.has(h))).toBe(true);
    expect(list.has("site5000.com")).toBe(false);
    expect(list.has("")).toBe(false);
  });

  it("keys 'domain,rank' lines by the domain, a prefix before its longer neighbours", () => {
    const ranks = parseRankList(sortLines("a.com-x.com,3\na.com,5\nb.com,1"));
    expect([ranks.get("a.com"), ranks.get("a.com-x.com"), ranks.get("b.com"), ranks.get("c.com")]).toEqual([5, 3, 1, undefined]);
  });
});

describe("lists", () => {
  it("parses one hostname per line, skipping comments and blanks", () => {
    const list = parseHostnameList("# header\ngolpe.com\n\n  outro.net \n");
    expect([list.has("golpe.com"), list.has("outro.net"), list.has("# header"), list.size]).toEqual([true, true, false, 2]);
    expect(parseRankList("youtube.com,2\ngoogle.com,1\n").get("youtube.com")).toBe(2);
  });

  it("matches the exact hostname only", () => {
    const meta = { generatedAt: new Date().toISOString(), phishing: 1, popular: 0 };
    const list = parseHostnameList("golpe.vercel.app");
    expect(reputationFromList("golpe.vercel.app", list, meta).blocklisted).toBe(true);
    expect(reputationFromList("loja.vercel.app", list, meta).blocklisted).toBe(false);
  });

  it("stops vouching when the list is days old", () => {
    const old = { generatedAt: "2026-01-01T00:00:00Z", phishing: 1, popular: 0 };
    const res = reputationFromList("loja.com", parseHostnameList(""), old, Date.UTC(2026, 10, 19));
    expect(res).toMatchObject({ status: "stale", blocklisted: null });
  });

  it("ranks by registrable domain", () => {
    const ranks = parseRankList("google.com,1\nmercadolivre.com.br,2\n");
    expect(popularityFromList("www.mercadolivre.com.br", ranks, null)).toMatchObject({ top100k: true, rank: 2 });
    expect(popularityFromList("loja-nova.com", ranks, null).top100k).toBe(false);
    expect(popularityFromList("loja-nova.com", null, null).top100k).toBeNull();
  });
});
